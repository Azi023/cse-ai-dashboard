import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyFinancial, Stock } from '../../entities';
import { CseApiService } from '../cse-data/cse-api.service';

const VALID_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'ANNUAL'];

interface CreateFinancialDto {
  symbol: string;
  fiscal_year: string;
  quarter: string;
  total_revenue?: number | null;
  interest_income?: number | null;
  non_compliant_income?: number | null;
  net_profit?: number | null;
  earnings_per_share?: number | null;
  total_assets?: number | null;
  total_liabilities?: number | null;
  shareholders_equity?: number | null;
  interest_bearing_debt?: number | null;
  interest_bearing_deposits?: number | null;
  receivables?: number | null;
  prepayments?: number | null;
  cash_and_equivalents?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  debt_to_equity?: number | null;
  return_on_equity?: number | null;
  dividend_yield?: number | null;
  source?: string;
  report_date?: string | null;
}

type UpdateFinancialDto = Partial<Omit<CreateFinancialDto, 'symbol'>>;

@Injectable()
export class CompanyFinancialsService {
  private readonly logger = new Logger(CompanyFinancialsService.name);

  constructor(
    @InjectRepository(CompanyFinancial)
    private readonly financialRepository: Repository<CompanyFinancial>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    private readonly cseApiService: CseApiService,
  ) {}

  /**
   * POST /api/financials — Create a new financial record.
   */
  async create(dto: CreateFinancialDto): Promise<CompanyFinancial> {
    if (!dto.symbol || !dto.fiscal_year || !dto.quarter) {
      throw new BadRequestException(
        'symbol, fiscal_year, and quarter are required',
      );
    }

    const quarter = dto.quarter.toUpperCase();
    if (!VALID_QUARTERS.includes(quarter)) {
      throw new BadRequestException(
        `quarter must be one of: ${VALID_QUARTERS.join(', ')}`,
      );
    }

    const symbol = dto.symbol.toUpperCase();

    // Check for duplicates
    const existing = await this.financialRepository.findOne({
      where: { symbol, fiscal_year: dto.fiscal_year, quarter },
    });
    if (existing) {
      throw new ConflictException(
        `Financial record already exists for ${symbol} ${dto.fiscal_year} ${quarter}. Use PUT to update.`,
      );
    }

    const record = this.financialRepository.create({
      symbol,
      fiscal_year: dto.fiscal_year,
      quarter,
      total_revenue: dto.total_revenue ?? null,
      interest_income: dto.interest_income ?? null,
      non_compliant_income: dto.non_compliant_income ?? null,
      net_profit: dto.net_profit ?? null,
      earnings_per_share: dto.earnings_per_share ?? null,
      total_assets: dto.total_assets ?? null,
      total_liabilities: dto.total_liabilities ?? null,
      shareholders_equity: dto.shareholders_equity ?? null,
      interest_bearing_debt: dto.interest_bearing_debt ?? null,
      interest_bearing_deposits: dto.interest_bearing_deposits ?? null,
      receivables: dto.receivables ?? null,
      prepayments: dto.prepayments ?? null,
      cash_and_equivalents: dto.cash_and_equivalents ?? null,
      pe_ratio: dto.pe_ratio ?? null,
      pb_ratio: dto.pb_ratio ?? null,
      debt_to_equity: dto.debt_to_equity ?? null,
      return_on_equity: dto.return_on_equity ?? null,
      dividend_yield: dto.dividend_yield ?? null,
      source: dto.source ?? 'MANUAL',
      report_date: dto.report_date ? new Date(dto.report_date) : null,
    });

    // Auto-calculate derived ratios
    await this.calculateDerivedRatios(record);

    const saved = await this.financialRepository.save(record);
    this.logger.log(
      `Created financial record for ${symbol} ${dto.fiscal_year} ${quarter}`,
    );
    return saved;
  }

  /**
   * GET /api/financials/:symbol — All financial records for a symbol.
   */
  async getBySymbol(symbol: string): Promise<CompanyFinancial[]> {
    return this.financialRepository.find({
      where: { symbol: symbol.toUpperCase() },
      order: { fiscal_year: 'DESC', quarter: 'ASC' },
    });
  }

  /**
   * GET /api/financials/:symbol/latest — Most recent financial record.
   */
  async getLatest(symbol: string): Promise<CompanyFinancial> {
    const record = await this.financialRepository.findOne({
      where: { symbol: symbol.toUpperCase() },
      order: { fiscal_year: 'DESC', quarter: 'DESC' },
    });

    if (!record) {
      throw new NotFoundException(
        `No financial records found for ${symbol.toUpperCase()}`,
      );
    }

    return record;
  }

  /**
   * PUT /api/financials/:id — Update an existing financial record.
   */
  async update(id: number, dto: UpdateFinancialDto): Promise<CompanyFinancial> {
    const record = await this.financialRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Financial record with id ${id} not found`);
    }

    if (dto.fiscal_year !== undefined) record.fiscal_year = dto.fiscal_year;
    if (dto.quarter !== undefined) {
      const quarter = dto.quarter.toUpperCase();
      if (!VALID_QUARTERS.includes(quarter)) {
        throw new BadRequestException(
          `quarter must be one of: ${VALID_QUARTERS.join(', ')}`,
        );
      }
      record.quarter = quarter;
    }

    // Income Statement fields
    if (dto.total_revenue !== undefined)
      record.total_revenue = dto.total_revenue;
    if (dto.interest_income !== undefined)
      record.interest_income = dto.interest_income;
    if (dto.non_compliant_income !== undefined)
      record.non_compliant_income = dto.non_compliant_income;
    if (dto.net_profit !== undefined) record.net_profit = dto.net_profit;
    if (dto.earnings_per_share !== undefined)
      record.earnings_per_share = dto.earnings_per_share;

    // Balance Sheet fields
    if (dto.total_assets !== undefined) record.total_assets = dto.total_assets;
    if (dto.total_liabilities !== undefined)
      record.total_liabilities = dto.total_liabilities;
    if (dto.shareholders_equity !== undefined)
      record.shareholders_equity = dto.shareholders_equity;
    if (dto.interest_bearing_debt !== undefined)
      record.interest_bearing_debt = dto.interest_bearing_debt;
    if (dto.interest_bearing_deposits !== undefined)
      record.interest_bearing_deposits = dto.interest_bearing_deposits;
    if (dto.receivables !== undefined) record.receivables = dto.receivables;
    if (dto.prepayments !== undefined) record.prepayments = dto.prepayments;
    if (dto.cash_and_equivalents !== undefined)
      record.cash_and_equivalents = dto.cash_and_equivalents;

    // Ratios (allow manual override)
    if (dto.pe_ratio !== undefined) record.pe_ratio = dto.pe_ratio;
    if (dto.pb_ratio !== undefined) record.pb_ratio = dto.pb_ratio;
    if (dto.debt_to_equity !== undefined)
      record.debt_to_equity = dto.debt_to_equity;
    if (dto.return_on_equity !== undefined)
      record.return_on_equity = dto.return_on_equity;
    if (dto.dividend_yield !== undefined)
      record.dividend_yield = dto.dividend_yield;

    // Metadata
    if (dto.source !== undefined) record.source = dto.source;
    if (dto.report_date !== undefined)
      record.report_date = dto.report_date ? new Date(dto.report_date) : null;

    // Recalculate derived ratios where not manually provided
    await this.calculateDerivedRatios(record);

    const saved = await this.financialRepository.save(record);
    this.logger.log(`Updated financial record id=${id}`);
    return saved;
  }

  /**
   * GET /api/financials/summary/coverage — Coverage stats.
   */
  async getCoverage(): Promise<{
    total_stocks: number;
    stocks_with_financials: number;
    coverage_percent: number;
    symbols_with_data: string[];
  }> {
    const totalStocks = await this.stockRepository.count({
      where: { is_active: true },
    });

    const result = await this.financialRepository
      .createQueryBuilder('cf')
      .select('DISTINCT cf.symbol', 'symbol')
      .getRawMany<{ symbol: string }>();

    const symbolsWithData = result.map((r) => r.symbol).sort();

    return {
      total_stocks: totalStocks,
      stocks_with_financials: symbolsWithData.length,
      coverage_percent:
        totalStocks > 0 ? (symbolsWithData.length / totalStocks) * 100 : 0,
      symbols_with_data: symbolsWithData,
    };
  }

  /**
   * GET /api/financials/status — Coverage stats scoped to compliant stocks.
   */
  async getStatus(): Promise<{
    compliant_stocks: number;
    with_financials: number;
    missing: number;
    coverage_percent: number;
    last_cse_fetch: string | null;
  }> {
    const compliantStocks = await this.stockRepository.find({
      where: { shariah_status: 'compliant', is_active: true },
    });
    const symbols = compliantStocks.map((s) => s.symbol);

    let withData = 0;
    if (symbols.length > 0) {
      const result = await this.financialRepository
        .createQueryBuilder('cf')
        .select('DISTINCT cf.symbol', 'symbol')
        .where('cf.symbol IN (:...symbols)', { symbols })
        .getRawMany<{ symbol: string }>();
      withData = result.length;
    }

    const cseFetch = await this.financialRepository.findOne({
      where: { source: 'CSE_API' },
      order: { updated_at: 'DESC' },
    });

    return {
      compliant_stocks: symbols.length,
      with_financials: withData,
      missing: symbols.length - withData,
      coverage_percent:
        symbols.length > 0 ? (withData / symbols.length) * 100 : 0,
      last_cse_fetch: cseFetch?.updated_at?.toISOString() ?? null,
    };
  }

  /**
   * POST /api/financials/fetch-cse — Auto-fetch market data from CSE API for all compliant stocks.
   */
  async fetchFromCse(): Promise<{
    total: number;
    fetched: number;
    failed: number;
    results: Array<{
      symbol: string;
      status: 'updated' | 'created' | 'no_data' | 'failed';
      message?: string;
    }>;
  }> {
    const compliantStocks = await this.stockRepository.find({
      where: { shariah_status: 'compliant', is_active: true },
    });

    const results: Array<{
      symbol: string;
      status: 'updated' | 'created' | 'no_data' | 'failed';
      message?: string;
    }> = [];
    let fetched = 0;
    let failed = 0;

    for (let i = 0; i < compliantStocks.length; i++) {
      const stock = compliantStocks[i];

      try {
        const cseData = (await this.cseApiService.getCompanyInfo(
          stock.symbol,
        )) as Record<string, unknown> | null;

        if (!cseData) {
          failed++;
          results.push({
            symbol: stock.symbol,
            status: 'no_data',
            message: 'CSE API returned empty response',
          });
          continue;
        }

        const info = cseData?.reqSymbolInfo as
          | Record<string, unknown>
          | undefined;
        const betaInfo = cseData?.reqSymbolBetaInfo as
          | Record<string, unknown>
          | undefined;

        if (info) {
          // Update stock entity with market data
          if (info.marketCap != null) stock.market_cap = Number(info.marketCap);
          if (info.p12HiPrice != null)
            stock.week52_high = Number(info.p12HiPrice);
          if (info.p12LowPrice != null)
            stock.week52_low = Number(info.p12LowPrice);
          if (info.lastTradedPrice != null)
            stock.last_price = Number(info.lastTradedPrice);
          if (betaInfo?.triASIBetaValue != null)
            stock.beta = Number(betaInfo.triASIBetaValue);
          await this.stockRepository.save(stock);
        }

        // Upsert a CSE_API financial record (for this fiscal year)
        const fiscalYear = String(new Date().getFullYear());
        const eps =
          info?.earningsPerShare != null ? Number(info.earningsPerShare) : null;
        const pe = info?.peRatio != null ? Number(info.peRatio) : null;

        const existing = await this.financialRepository.findOne({
          where: {
            symbol: stock.symbol,
            fiscal_year: fiscalYear,
            quarter: 'ANNUAL',
          },
        });

        if (existing) {
          // Only fill in null fields from CSE; don't overwrite manual data
          if (existing.earnings_per_share == null && eps != null)
            existing.earnings_per_share = eps;
          if (existing.pe_ratio == null && pe != null) existing.pe_ratio = pe;
          if (existing.source === 'CSE_API') {
            // Full update for CSE_API records
            existing.source = 'CSE_API';
            existing.report_date = new Date();
          }
          await this.financialRepository.save(existing);
          results.push({ symbol: stock.symbol, status: 'updated' });
        } else {
          const record = this.financialRepository.create({
            symbol: stock.symbol,
            fiscal_year: fiscalYear,
            quarter: 'ANNUAL',
            source: 'CSE_API',
            earnings_per_share: eps,
            pe_ratio: pe,
            report_date: new Date(),
          });
          await this.calculateDerivedRatios(record);
          await this.financialRepository.save(record);
          results.push({ symbol: stock.symbol, status: 'created' });
        }

        fetched++;
        this.logger.log(`Fetched CSE data for ${stock.symbol}`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ symbol: stock.symbol, status: 'failed', message: msg });
        this.logger.error(`Failed CSE fetch for ${stock.symbol}: ${msg}`);
      }

      // 1-second delay between requests
      if (i < compliantStocks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(
      `CSE fetch complete: ${fetched} fetched, ${failed} failed of ${compliantStocks.length} compliant stocks`,
    );
    return { total: compliantStocks.length, fetched, failed, results };
  }

  /**
   * POST /api/financials/import-csv — Parse CSV text and bulk-upsert financial records.
   * CSV columns: symbol, period, revenue, net_income, total_assets, total_liabilities,
   *              total_equity, eps, interest_bearing_debt
   */
  async importFromCsv(csvText: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV must have a header row and at least one data row',
      );
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const required = ['symbol', 'period'];
    for (const r of required) {
      if (!headers.includes(r)) {
        throw new BadRequestException(`CSV missing required column: ${r}`);
      }
    }

    const col = (row: string[], name: string): string => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? '').trim() : '';
    };
    const num = (v: string): number | null => {
      if (!v || v === '') return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const symbol = col(row, 'symbol').toUpperCase();
      const period = col(row, 'period'); // e.g. "FY-2025" or "2024/25"

      if (!symbol || !period) {
        errors.push(`Row ${i + 1}: missing symbol or period`);
        skipped++;
        continue;
      }

      // Parse period into fiscal_year + quarter
      let fiscal_year = period;
      let quarter = 'ANNUAL';
      const qMatch = period.match(/Q([1-4])/i);
      if (qMatch) {
        quarter = `Q${qMatch[1]}`;
        fiscal_year = period.replace(/[-_]?Q[1-4]/i, '').trim();
      }

      if (!VALID_QUARTERS.includes(quarter)) {
        errors.push(`Row ${i + 1}: invalid quarter in period "${period}"`);
        skipped++;
        continue;
      }

      try {
        const existing = await this.financialRepository.findOne({
          where: { symbol, fiscal_year, quarter },
        });

        const fields = {
          total_revenue: num(col(row, 'revenue')),
          net_profit: num(col(row, 'net_income')),
          total_assets: num(col(row, 'total_assets')),
          total_liabilities: num(col(row, 'total_liabilities')),
          shareholders_equity: num(col(row, 'total_equity')),
          earnings_per_share: num(col(row, 'eps')),
          interest_bearing_debt: num(col(row, 'interest_bearing_debt')),
          interest_income: num(col(row, 'interest_income')),
          non_compliant_income: num(col(row, 'non_compliant_income')),
        };

        if (existing) {
          Object.assign(existing, fields);
          await this.calculateDerivedRatios(existing);
          await this.financialRepository.save(existing);
        } else {
          const record = this.financialRepository.create({
            symbol,
            fiscal_year,
            quarter,
            source: 'MANUAL',
            ...fields,
          });
          await this.calculateDerivedRatios(record);
          await this.financialRepository.save(record);
        }
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 1} (${symbol}): ${msg}`);
        skipped++;
      }
    }

    this.logger.log(
      `CSV import complete: ${imported} imported, ${skipped} skipped`,
    );
    return { imported, skipped, errors };
  }

  /**
   * GET /api/financials/template-csv — Return CSV template for bulk import.
   */
  getTemplateCsv(): string {
    const header =
      'symbol,period,revenue,net_income,total_assets,total_liabilities,total_equity,eps,interest_bearing_debt,interest_income,non_compliant_income';
    const example =
      'AEL.N0000,FY-2025,12500,1200,45000,22000,23000,3.50,5000,0,0';
    return `${header}\n${example}\n`;
  }

  /**
   * Auto-calculate derived ratios from fundamental data + stock's last_price.
   * Only overwrites null values — manual entries are preserved.
   */
  private async calculateDerivedRatios(
    record: CompanyFinancial,
  ): Promise<void> {
    const stock = await this.stockRepository.findOne({
      where: { symbol: record.symbol },
    });

    const eps = record.earnings_per_share
      ? Number(record.earnings_per_share)
      : null;
    const equity = record.shareholders_equity
      ? Number(record.shareholders_equity)
      : null;
    const debt = record.interest_bearing_debt
      ? Number(record.interest_bearing_debt)
      : null;
    const netProfit = record.net_profit ? Number(record.net_profit) : null;
    const lastPrice = stock?.last_price ? Number(stock.last_price) : null;
    const sharesOutstanding = stock?.shares_outstanding
      ? Number(stock.shares_outstanding)
      : null;

    // P/E = last_price / EPS
    if (
      record.pe_ratio == null &&
      lastPrice != null &&
      eps != null &&
      eps !== 0
    ) {
      record.pe_ratio = Number((lastPrice / eps).toFixed(4));
    }

    // P/B = market_cap / shareholders_equity
    // or last_price / (equity / shares_outstanding)
    if (
      record.pb_ratio == null &&
      lastPrice != null &&
      equity != null &&
      equity !== 0 &&
      sharesOutstanding != null &&
      sharesOutstanding !== 0
    ) {
      const bookValuePerShare = equity / sharesOutstanding;
      if (bookValuePerShare !== 0) {
        record.pb_ratio = Number((lastPrice / bookValuePerShare).toFixed(4));
      }
    }

    // D/E = interest_bearing_debt / shareholders_equity
    if (
      record.debt_to_equity == null &&
      debt != null &&
      equity != null &&
      equity !== 0
    ) {
      record.debt_to_equity = Number((debt / equity).toFixed(4));
    }

    // ROE = net_profit / shareholders_equity
    if (
      record.return_on_equity == null &&
      netProfit != null &&
      equity != null &&
      equity !== 0
    ) {
      record.return_on_equity = Number((netProfit / equity).toFixed(4));
    }
  }
}
