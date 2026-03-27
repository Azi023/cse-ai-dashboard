import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Portfolio, Stock, CompanyFinancial } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

export interface HoldingZakat {
  symbol: string;
  name: string;
  quantity: number;
  current_price: number | null;
  current_value: number | null;
  shares_outstanding: number | null;
  /** Sum of cash + receivables + prepayments from latest financials, divided by shares */
  zakatable_per_share: number | null;
  zakatable_value: number | null;
  zakat_due: number | null;
  has_financial_data: boolean;
  /** 'AAOIFI_BALANCE_SHEET' | 'NO_DATA' */
  method: string;
  financial_period: string | null;
}

export interface ZakatResult {
  nisab_threshold: number;
  total_portfolio_value: number;
  total_zakatable_value: number;
  total_zakat_due: number;
  is_above_nisab: boolean;
  holdings: HoldingZakat[];
  holdings_without_data: string[];
  calculation_method: string;
  nisab_note: string;
}

const ZAKAT_RATE = 0.025; // 2.5%
const DEFAULT_NISAB_LKR = 1_638_000; // ~85g gold at USD 2000/oz × LKR 300

@Injectable()
export class ZakatService {
  private readonly logger = new Logger(ZakatService.name);

  constructor(
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(CompanyFinancial)
    private readonly financialRepo: Repository<CompanyFinancial>,
    private readonly redisService: RedisService,
  ) {}

  async calculateZakat(nisabLkr?: number): Promise<ZakatResult> {
    const nisab = nisabLkr ?? DEFAULT_NISAB_LKR;

    // 1. Get open holdings
    const holdings = await this.portfolioRepo.find({
      where: { is_open: true },
    });

    if (holdings.length === 0) {
      return this.emptyResult(nisab);
    }

    // 2. Batch-fetch stocks
    const symbols = holdings.map((h) => h.symbol);
    const stocks = await this.stockRepo.find({ where: { symbol: In(symbols) } });
    const stockMap = new Map(stocks.map((s) => [s.symbol, s]));

    // 3. Get live prices from Redis
    let tradeSummary: Record<string, { price?: number }> = {};
    try {
      const raw = await this.redisService.get('cse:trade_summary');
      if (raw) {
        const parsed: Array<{ symbol: string; price?: number }> = JSON.parse(raw);
        parsed.forEach((t) => { tradeSummary[t.symbol] = t; });
      }
    } catch {
      // Fall back to last_price from stock entity
    }

    // 4. Batch-fetch latest financial data per symbol
    const financialMap = await this.getLatestFinancials(symbols);

    // 5. Build per-holding Zakat breakdown
    const holdingResults: HoldingZakat[] = [];
    let totalZakatableValue = 0;
    let totalZakatDue = 0;
    let totalPortfolioValue = 0;
    const noDataSymbols: string[] = [];

    for (const holding of holdings) {
      const stock = stockMap.get(holding.symbol);
      const liveEntry = tradeSummary[holding.symbol];
      const currentPrice =
        liveEntry?.price ??
        (stock?.last_price != null ? Number(stock.last_price) : null);

      const quantity = Number(holding.quantity);
      const currentValue = currentPrice != null ? currentPrice * quantity : null;
      if (currentValue != null) totalPortfolioValue += currentValue;

      const financial = financialMap.get(holding.symbol);
      const sharesOutstanding =
        stock?.shares_outstanding != null ? Number(stock.shares_outstanding) : null;

      let zakatablePerShare: number | null = null;
      let zakatableValue: number | null = null;
      let zakatDue: number | null = null;
      let method = 'NO_DATA';
      let financialPeriod: string | null = null;

      if (financial && sharesOutstanding && sharesOutstanding > 0) {
        // AAOIFI formula: zakatable assets per share = (cash + receivables + prepayments) / shares
        const cash = Number(financial.cash_and_equivalents ?? 0);
        const receivables = Number(financial.receivables ?? 0);
        const prepayments = Number(financial.prepayments ?? 0);
        const zakatableAssets = cash + receivables + prepayments;

        if (zakatableAssets > 0) {
          zakatablePerShare = zakatableAssets / sharesOutstanding;
          zakatableValue = zakatablePerShare * quantity;
          zakatDue = zakatableValue * ZAKAT_RATE;
          method = 'AAOIFI_BALANCE_SHEET';
          financialPeriod = `${financial.fiscal_year} ${financial.quarter}`;
          totalZakatableValue += zakatableValue;
          totalZakatDue += zakatDue;
        } else {
          noDataSymbols.push(holding.symbol);
        }
      } else {
        noDataSymbols.push(holding.symbol);
      }

      holdingResults.push({
        symbol: holding.symbol,
        name: stock?.name ?? holding.symbol,
        quantity,
        current_price: currentPrice,
        current_value: currentValue,
        shares_outstanding: sharesOutstanding,
        zakatable_per_share: zakatablePerShare,
        zakatable_value: zakatableValue,
        zakat_due: zakatDue,
        has_financial_data: method === 'AAOIFI_BALANCE_SHEET',
        method,
        financial_period: financialPeriod,
      });
    }

    return {
      nisab_threshold: nisab,
      total_portfolio_value: totalPortfolioValue,
      total_zakatable_value: totalZakatableValue,
      total_zakat_due: totalZakatDue,
      is_above_nisab: totalZakatableValue >= nisab,
      holdings: holdingResults,
      holdings_without_data: noDataSymbols,
      calculation_method: 'AAOIFI',
      nisab_note:
        'Nisab = value of 85g of gold in LKR. Update the threshold with today\'s gold price for accuracy.',
    };
  }

  /** Fetch the most recent annual or quarterly financial record per symbol */
  private async getLatestFinancials(
    symbols: string[],
  ): Promise<Map<string, CompanyFinancial>> {
    const map = new Map<string, CompanyFinancial>();
    if (symbols.length === 0) return map;

    const records = await this.financialRepo.find({
      where: { symbol: In(symbols) },
      order: { report_date: 'DESC', fiscal_year: 'DESC' },
    });

    // Keep only the most recent record per symbol (already sorted desc)
    for (const r of records) {
      if (!map.has(r.symbol)) {
        map.set(r.symbol, r);
      }
    }
    return map;
  }

  private emptyResult(nisab: number): ZakatResult {
    return {
      nisab_threshold: nisab,
      total_portfolio_value: 0,
      total_zakatable_value: 0,
      total_zakat_due: 0,
      is_above_nisab: false,
      holdings: [],
      holdings_without_data: [],
      calculation_method: 'AAOIFI',
      nisab_note:
        'No open holdings found. Add holdings in the Portfolio page to calculate Zakat.',
    };
  }
}
