import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock, ShariahScreening } from '../../entities';
import { getBlacklistedSymbols, isBlacklisted, getBlacklistEntries } from './blacklist';

export enum ShariahStatus {
  COMPLIANT = 'COMPLIANT',
  NON_COMPLIANT = 'NON_COMPLIANT',
  PENDING_REVIEW = 'PENDING_REVIEW',
}

// Tier 2 financial ratio thresholds
const TIER2_THRESHOLDS = {
  interestIncomeRatio: 0.05,   // < 5%
  debtRatio: 0.30,             // < 30%
  interestDepositRatio: 0.30,  // < 30%
  receivablesRatio: 0.50,      // < 50%
};

@Injectable()
export class ShariahScreeningService implements OnModuleInit {
  private readonly logger = new Logger(ShariahScreeningService.name);

  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(ShariahScreening)
    private readonly screeningRepository: Repository<ShariahScreening>,
  ) {}

  async onModuleInit() {
    // Run initial screening on startup to update stock shariah_status fields
    await this.runScreening();
  }

  /**
   * Run Shariah screening for all stocks and update their shariah_status.
   */
  async runScreening(): Promise<void> {
    const stocks = await this.stockRepository.find({ where: { is_active: true } });
    if (stocks.length === 0) {
      this.logger.log('No stocks found, skipping Shariah screening');
      return;
    }

    const blacklistedSymbols = getBlacklistedSymbols();
    let compliant = 0;
    let nonCompliant = 0;
    let pending = 0;

    for (const stock of stocks) {
      const blacklistResult = isBlacklisted(stock.symbol);

      if (blacklistResult.blacklisted) {
        // Tier 1 FAIL — blacklisted
        stock.shariah_status = 'non_compliant';
        nonCompliant++;

        // Persist screening record
        await this.saveScreeningRecord(stock.symbol, 'non_compliant', {
          tier1_result: `fail_${blacklistResult.category}`,
          notes: blacklistResult.reason ?? null,
        });
      } else {
        // Tier 1 PASS — check if we have financial data for Tier 2
        const latestScreening = await this.screeningRepository.findOne({
          where: { symbol: stock.symbol },
          order: { screened_at: 'DESC' },
        });

        const hasFinancialData =
          latestScreening &&
          latestScreening.interest_income_ratio !== null &&
          latestScreening.debt_ratio !== null &&
          latestScreening.interest_deposit_ratio !== null &&
          latestScreening.receivables_ratio !== null;

        if (hasFinancialData) {
          // Run Tier 2 screening with actual financial data
          const tier2Result = this.runTier2Screen(latestScreening);
          if (tier2Result.pass) {
            stock.shariah_status = 'compliant';
            compliant++;
          } else {
            stock.shariah_status = 'non_compliant';
            nonCompliant++;
          }

          await this.saveScreeningRecord(stock.symbol, stock.shariah_status, {
            tier1_result: 'pass',
            tier2_pass: tier2Result.pass,
            interest_income_ratio: latestScreening.interest_income_ratio,
            debt_ratio: latestScreening.debt_ratio,
            interest_deposit_ratio: latestScreening.interest_deposit_ratio,
            receivables_ratio: latestScreening.receivables_ratio,
            notes: tier2Result.pass ? null : `Failed: ${tier2Result.failedRatios.join(', ')}`,
          });
        } else {
          // No financial data — mark as pending review
          stock.shariah_status = 'pending_review';
          pending++;

          await this.saveScreeningRecord(stock.symbol, 'needs_review', {
            tier1_result: 'pass',
            notes: 'Awaiting financial data for Tier 2 screening',
          });
        }
      }
    }

    // Batch update all stock statuses
    await this.stockRepository.save(stocks);
    this.logger.log(
      `Shariah screening complete: ${compliant} compliant, ${nonCompliant} non-compliant, ${pending} pending review`,
    );
  }

  /**
   * Tier 2: Financial ratio screening.
   */
  private runTier2Screen(screening: ShariahScreening): {
    pass: boolean;
    failedRatios: string[];
  } {
    const failedRatios: string[] = [];

    if (
      screening.interest_income_ratio !== null &&
      Number(screening.interest_income_ratio) >= TIER2_THRESHOLDS.interestIncomeRatio
    ) {
      failedRatios.push('Interest Income Ratio');
    }
    if (
      screening.debt_ratio !== null &&
      Number(screening.debt_ratio) >= TIER2_THRESHOLDS.debtRatio
    ) {
      failedRatios.push('Debt Ratio');
    }
    if (
      screening.interest_deposit_ratio !== null &&
      Number(screening.interest_deposit_ratio) >= TIER2_THRESHOLDS.interestDepositRatio
    ) {
      failedRatios.push('Interest Deposit Ratio');
    }
    if (
      screening.receivables_ratio !== null &&
      Number(screening.receivables_ratio) >= TIER2_THRESHOLDS.receivablesRatio
    ) {
      failedRatios.push('Receivables Ratio');
    }

    return { pass: failedRatios.length === 0, failedRatios };
  }

  /**
   * Persist a screening record to the shariah_screenings table.
   */
  private async saveScreeningRecord(
    symbol: string,
    status: string,
    data: Partial<ShariahScreening>,
  ): Promise<void> {
    const record = this.screeningRepository.create({
      symbol,
      status,
      screened_at: new Date(),
      ...data,
    });
    await this.screeningRepository.save(record);
  }

  /**
   * GET /api/shariah/compliant — All stocks that pass both tiers.
   */
  async getCompliantStocks(): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { shariah_status: 'compliant', is_active: true },
      order: { symbol: 'ASC' },
    });
  }

  /**
   * GET /api/shariah/non-compliant — All stocks that fail Tier 1 or Tier 2.
   */
  async getNonCompliantStocks(): Promise<
    Array<Stock & { blacklist_reason?: string; blacklist_category?: string }>
  > {
    const stocks = await this.stockRepository.find({
      where: { shariah_status: 'non_compliant', is_active: true },
      order: { symbol: 'ASC' },
    });

    // Enrich with blacklist reasons
    const blacklistEntries = getBlacklistEntries();
    return stocks.map((stock) => {
      const entry = blacklistEntries.find((e) => e.symbol === stock.symbol);
      return {
        ...stock,
        blacklist_reason: entry?.reason,
        blacklist_category: entry?.category,
      };
    });
  }

  /**
   * GET /api/shariah/pending — Stocks awaiting Tier 2 review.
   */
  async getPendingStocks(): Promise<Stock[]> {
    return this.stockRepository.find({
      where: { shariah_status: 'pending_review', is_active: true },
      order: { symbol: 'ASC' },
    });
  }

  /**
   * GET /api/shariah/status/:symbol — Shariah status for one stock.
   */
  async getStockShariahStatus(symbol: string): Promise<{
    symbol: string;
    status: ShariahStatus;
    tier1: { pass: boolean; reason?: string; category?: string };
    tier2: {
      pass: boolean | null;
      ratios: {
        interest_income_ratio: number | null;
        debt_ratio: number | null;
        interest_deposit_ratio: number | null;
        receivables_ratio: number | null;
      } | null;
      failed_ratios?: string[];
    };
    screened_at: Date | null;
  }> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!stock) {
      return {
        symbol: symbol.toUpperCase(),
        status: ShariahStatus.PENDING_REVIEW,
        tier1: { pass: true },
        tier2: { pass: null, ratios: null },
        screened_at: null,
      };
    }

    const blacklistResult = isBlacklisted(stock.symbol);

    if (blacklistResult.blacklisted) {
      return {
        symbol: stock.symbol,
        status: ShariahStatus.NON_COMPLIANT,
        tier1: {
          pass: false,
          reason: blacklistResult.reason,
          category: blacklistResult.category,
        },
        tier2: { pass: null, ratios: null },
        screened_at: new Date(),
      };
    }

    // Get latest screening record for Tier 2 details
    const latestScreening = await this.screeningRepository.findOne({
      where: { symbol: stock.symbol },
      order: { screened_at: 'DESC' },
    });

    const hasFinancialData =
      latestScreening &&
      latestScreening.interest_income_ratio !== null &&
      latestScreening.debt_ratio !== null;

    if (hasFinancialData) {
      const tier2Result = this.runTier2Screen(latestScreening);
      const status = tier2Result.pass
        ? ShariahStatus.COMPLIANT
        : ShariahStatus.NON_COMPLIANT;

      return {
        symbol: stock.symbol,
        status,
        tier1: { pass: true },
        tier2: {
          pass: tier2Result.pass,
          ratios: {
            interest_income_ratio: latestScreening.interest_income_ratio,
            debt_ratio: latestScreening.debt_ratio,
            interest_deposit_ratio: latestScreening.interest_deposit_ratio,
            receivables_ratio: latestScreening.receivables_ratio,
          },
          failed_ratios: tier2Result.failedRatios,
        },
        screened_at: latestScreening.screened_at,
      };
    }

    return {
      symbol: stock.symbol,
      status: ShariahStatus.PENDING_REVIEW,
      tier1: { pass: true },
      tier2: { pass: null, ratios: null },
      screened_at: latestScreening?.screened_at ?? null,
    };
  }

  /**
   * GET /api/shariah/stats — Summary counts.
   */
  async getStats(): Promise<{
    compliant: number;
    non_compliant: number;
    pending_review: number;
    total: number;
    blacklisted_count: number;
  }> {
    const [compliant, nonCompliant, pendingReview, total] = await Promise.all([
      this.stockRepository.count({
        where: { shariah_status: 'compliant', is_active: true },
      }),
      this.stockRepository.count({
        where: { shariah_status: 'non_compliant', is_active: true },
      }),
      this.stockRepository.count({
        where: { shariah_status: 'pending_review', is_active: true },
      }),
      this.stockRepository.count({ where: { is_active: true } }),
    ]);

    return {
      compliant,
      non_compliant: nonCompliant,
      pending_review: pendingReview,
      total,
      blacklisted_count: getBlacklistedSymbols().length,
    };
  }
}
