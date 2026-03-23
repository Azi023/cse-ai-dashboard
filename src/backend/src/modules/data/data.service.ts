import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Stock, DailyPrice } from '../../entities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackfillOptions {
  /** Symbols to process. Empty = all active stocks. */
  symbols?: string[];
  /** How many trading days of history to fetch (default 30). */
  days?: number;
}

export interface BackfillResult {
  started_at: string;
  finished_at: string;
  stocks_requested: number;
  stocks_processed: number;
  stocks_failed: number;
  rows_inserted: number;
  rows_updated: number;
  api_used: 'companyChartDataByStock' | 'none';
  message: string;
}

interface OhlcvRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartItem {
  h?: number | null;   // high
  l?: number | null;   // low
  o?: number | null;   // open (null for historical)
  p?: number | null;   // close/last price
  q?: number | null;   // volume
  t?: number | null;   // timestamp ms
}

interface ChartDataResponse {
  chartData?: ChartItem[];
}

interface TradeSummaryItem {
  id?: number;
  symbol?: string;
}

interface TradeSummaryResponse {
  reqTradeSummery?: TradeSummaryItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CSE_API_BASE = 'https://www.cse.lk/api/';
const CSE_CHART_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.cse.lk/',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ---------------------------------------------------------------------------

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Backfill historical daily prices from the CSE companyChartDataByStock API.
   * Uses period=5 which returns ~1 year of daily OHLCV bars.
   *
   * The API requires a numeric stockId (from tradeSummary's `id` field),
   * not the symbol string.
   */
  async backfillHistory(options: BackfillOptions = {}): Promise<BackfillResult> {
    const startedAt = new Date().toISOString();
    this.logger.log('Starting historical price backfill via companyChartDataByStock');

    const allStocks = await this.stockRepo.find({
      where: { is_active: true },
      order: { symbol: 'ASC' },
    });

    const stocks =
      options.symbols && options.symbols.length > 0
        ? allStocks.filter((s) => options.symbols!.includes(s.symbol))
        : allStocks;

    this.logger.log(`Stocks to process: ${stocks.length}`);

    // Build stockId map from tradeSummary
    const stockIdMap = await this.fetchStockIdMap();
    if (stockIdMap.size === 0) {
      return {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        stocks_requested: stocks.length,
        stocks_processed: 0,
        stocks_failed: stocks.length,
        rows_inserted: 0,
        rows_updated: 0,
        api_used: 'none',
        message: 'Could not fetch stockId map from tradeSummary. CSE API may be unavailable.',
      };
    }

    // Date cutoff: filter to only requested number of days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (options.days ?? 30) * 2); // 2x buffer for weekends
    const cutoffStr = cutoff.toISOString().split('T')[0];

    let stocksProcessed = 0;
    let stocksFailed = 0;
    let rowsInserted = 0;
    let rowsUpdated = 0;

    for (const stock of stocks) {
      const stockId = stockIdMap.get(stock.symbol);
      if (!stockId) {
        this.logger.debug(`${stock.symbol}: no stockId in tradeSummary, skipping`);
        stocksFailed++;
        continue;
      }

      let rows: OhlcvRow[] = [];
      try {
        rows = await this.fetchChartData(stockId);
      } catch (err) {
        this.logger.warn(`${stock.symbol}: API fetch failed: ${String(err)}`);
        stocksFailed++;
        continue;
      }

      const filtered = rows.filter((r) => r.date >= cutoffStr);
      this.logger.debug(`${stock.symbol}: ${filtered.length} rows to upsert`);

      for (const row of filtered) {
        const result = await this.upsertDailyPrice(stock, row);
        if (result === 'inserted') rowsInserted++;
        else if (result === 'updated') rowsUpdated++;
      }

      stocksProcessed++;

      // Brief rate-limit pause
      await new Promise((r) => setTimeout(r, 150));
    }

    const result: BackfillResult = {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      stocks_requested: stocks.length,
      stocks_processed: stocksProcessed,
      stocks_failed: stocksFailed,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      api_used: 'companyChartDataByStock',
      message: `Backfill complete: ${stocksProcessed} stocks, ${rowsInserted} inserted, ${rowsUpdated} updated`,
    };

    this.logger.log(result.message);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Fetch symbol → stockId map from CSE tradeSummary endpoint. */
  private async fetchStockIdMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const res = await axios.post<TradeSummaryResponse>(
        `${CSE_API_BASE}tradeSummary`,
        '',
        { headers: CSE_CHART_HEADERS, timeout: 15_000 },
      );
      for (const item of res.data?.reqTradeSummery ?? []) {
        if (item.symbol && item.id) map.set(item.symbol, item.id);
      }
      this.logger.log(`Fetched stockId map: ${map.size} stocks`);
    } catch (err) {
      this.logger.error(`Failed to fetch tradeSummary: ${String(err)}`);
    }
    return map;
  }

  /**
   * Fetch 1 year of daily OHLCV bars from companyChartDataByStock (period=5).
   * Returns deduplicated rows sorted by date ascending.
   */
  private async fetchChartData(stockId: number): Promise<OhlcvRow[]> {
    const res = await axios.post<ChartDataResponse>(
      `${CSE_API_BASE}companyChartDataByStock`,
      `stockId=${stockId}&period=5`,
      { headers: CSE_CHART_HEADERS, timeout: 15_000 },
    );

    const rows: OhlcvRow[] = [];
    for (const item of res.data?.chartData ?? []) {
      if (!item.t || !item.p) continue;

      // Convert UTC timestamp to SLT (UTC+5:30) for the correct trade date
      const dt = new Date(item.t);
      dt.setMinutes(dt.getMinutes() + 330);
      const tradeDate = dt.toISOString().split('T')[0];

      const close = item.p;
      rows.push({
        date: tradeDate,
        open: item.o ?? close,
        high: item.h ?? close,
        low: item.l ?? close,
        close,
        volume: item.q ?? 0,
      });
    }

    // Deduplicate by date (keep last — post-close candle has accumulated volume)
    const dateMap = new Map<string, OhlcvRow>();
    for (const row of rows) dateMap.set(row.date, row);

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  private async upsertDailyPrice(
    stock: Stock,
    row: OhlcvRow,
  ): Promise<'inserted' | 'updated' | 'skipped'> {
    const existing = await this.dailyPriceRepo
      .createQueryBuilder('dp')
      .where('dp.stock_id = :id', { id: stock.id })
      .andWhere('dp.trade_date = :date', { date: row.date })
      .getOne();

    if (existing) {
      // Only update if new values are more informative
      let changed = false;
      if (row.high > 0 && row.high !== Number(existing.high)) { existing.high = row.high; changed = true; }
      if (row.low > 0 && row.low !== Number(existing.low)) { existing.low = row.low; changed = true; }
      if (row.close > 0 && row.close !== Number(existing.close)) { existing.close = row.close; changed = true; }
      if (row.volume > 0 && row.volume !== Number(existing.volume)) { existing.volume = row.volume; changed = true; }
      if (changed) await this.dailyPriceRepo.save(existing);
      return changed ? 'updated' : 'skipped';
    }

    const dp = new DailyPrice();
    dp.stock_id = stock.id;
    dp.trade_date = new Date(row.date);
    dp.open = row.open;
    dp.high = row.high;
    dp.low = row.low;
    dp.close = row.close;
    dp.previous_close = null;
    dp.volume = row.volume;
    dp.turnover = 0;
    dp.trades_count = 0;
    await this.dailyPriceRepo.save(dp);
    return 'inserted';
  }
}
