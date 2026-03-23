/**
 * backfill-history.ts — Historical price data backfill utility for CSE AI Dashboard
 *
 * Usage (from src/backend/ directory):
 *   npx tsx ../../scripts/backfill-history.ts [command]
 *
 * Commands:
 *   snapshot             - Fetch today's prices from CSE API and save to daily_prices (default)
 *   status               - Show daily_prices record count, date range, and per-date breakdown
 *   scrape [--symbols S] - Scrape historical prices from CSE website via Playwright
 *                          Probes for API endpoint first; falls back to HTML table scraping
 *                          --symbols  Comma-separated list (default: all stocks in DB)
 *                          --days N   How many trading days back to fetch (default: 30)
 *   import               - Import OHLCV data from CSV file: --file <path.csv>
 *   help                 - Show this help message
 *
 * Examples:
 *   npx tsx ../../scripts/backfill-history.ts snapshot
 *   npx tsx ../../scripts/backfill-history.ts status
 *   npx tsx ../../scripts/backfill-history.ts scrape --days 30
 *   npx tsx ../../scripts/backfill-history.ts scrape --symbols AEL.N0000,JKH.N0000 --days 30
 *   npx tsx ../../scripts/backfill-history.ts import --file ../../data/historical-prices.csv
 *
 * CSV format for import (header row required):
 *   date,symbol,open,high,low,close,volume
 *   2026-03-01,JKH.N0000,168.00,170.50,167.25,169.75,125000
 *   2026-03-01,COMB.N0000,98.50,99.00,97.80,98.25,45000
 *
 * NOTE ON HISTORICAL DATA:
 *   The CSE API endpoints `chartData` and `companyChartDataByStock` return HTTP 400
 *   errors regardless of parameters. They are NOT usable for historical backfill.
 *   The only reliable price endpoint is `todaySharePrice`, which returns the current
 *   trading day's OHLCV data for all stocks.
 *
 *   The `scrape` command uses Playwright to visit CSE company profile pages and
 *   intercept any XHR API calls made when the "Quotes" tab is loaded. If a historical
 *   price API is discovered, it is called directly for all stocks. Otherwise the
 *   command falls back to scraping the HTML table on each stock's profile page.
 */

import { Client } from 'pg';
import axios from 'axios';
import * as fs from 'fs';
import * as readline from 'readline';

// ─── Configuration ──────────────────────────────────────────────────────────

const DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'cse_user',
  password: 'cse_secure_2026',
  database: 'cse_dashboard',
};

const CSE_API_BASE = 'https://www.cse.lk/api/';
const CSE_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

// ─── Types ──────────────────────────────────────────────────────────────────

interface TodaySharePriceItem {
  id?: number;
  symbol?: string;
  open?: number;
  high?: number;
  low?: number;
  lastTradedPrice?: number;
  change?: number;
  changePercentage?: number;
  crossingVolume?: number;
  tradesTime?: string;
  quantity?: number;
}

interface TodaySharePriceResponse {
  reqTodaySharePrice?: TodaySharePriceItem[];
}

interface CsvRow {
  date: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Database helpers ───────────────────────────────────────────────────────

async function createClient(): Promise<Client> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

/**
 * Look up stock_id by symbol. Returns null if the stock doesn't exist.
 */
async function getStockId(
  client: Client,
  symbol: string,
): Promise<number | null> {
  const res = await client.query(
    'SELECT id FROM stocks WHERE symbol = $1',
    [symbol],
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

/**
 * Upsert a daily price record. Uses the unique index (stock_id, trade_date).
 */
async function upsertDailyPrice(
  client: Client,
  stockId: number,
  tradeDate: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  turnover: number = 0,
  tradesCount: number = 0,
): Promise<'inserted' | 'updated' | 'skipped'> {
  // Check if record exists
  const existing = await client.query(
    'SELECT id FROM daily_prices WHERE stock_id = $1 AND trade_date = $2',
    [stockId, tradeDate],
  );

  if (existing.rows.length > 0) {
    // Update existing — only overwrite if the new data has non-zero values.
    // Explicit type casts required: PostgreSQL cannot infer types for untyped
    // parameters in CASE WHEN expressions when the params list has unused slots.
    await client.query(
      `UPDATE daily_prices
       SET open = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE open END,
           high = CASE WHEN $4::numeric > 0 THEN $4::numeric ELSE high END,
           low  = CASE WHEN $5::numeric > 0 THEN $5::numeric ELSE low END,
           close = CASE WHEN $6::numeric > 0 THEN $6::numeric ELSE close END,
           volume = CASE WHEN $7::bigint > 0 THEN $7::bigint ELSE volume END,
           turnover = CASE WHEN $8::numeric > 0 THEN $8::numeric ELSE turnover END,
           trades_count = CASE WHEN $9::int > 0 THEN $9::int ELSE trades_count END
       WHERE stock_id = $1 AND trade_date = $2`,
      [stockId, tradeDate, open, high, low, close, volume, turnover, tradesCount],
    );
    return 'updated';
  }

  // Insert new record
  await client.query(
    `INSERT INTO daily_prices (stock_id, trade_date, open, high, low, close, volume, turnover, trades_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [stockId, tradeDate, open, high, low, close, volume, turnover, tradesCount],
  );
  return 'inserted';
}

// ─── Command: snapshot ──────────────────────────────────────────────────────

async function commandSnapshot(): Promise<void> {
  console.log('=== CSE Today Share Price Snapshot ===\n');

  // 1. Fetch today's prices from CSE API
  console.log('Fetching todaySharePrice from CSE API...');
  let items: TodaySharePriceItem[] = [];
  try {
    const response = await axios.post<TodaySharePriceResponse>(
      `${CSE_API_BASE}todaySharePrice`,
      '',
      { headers: CSE_HEADERS, timeout: 15000 },
    );
    items = response.data?.reqTodaySharePrice ?? [];
    console.log(`  Received ${items.length} stock records from API\n`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR fetching from CSE API: ${msg}`);
    console.error('  The API may be unavailable outside market hours.\n');
  }

  if (items.length === 0) {
    console.log('No data returned from todaySharePrice. Nothing to save.');
    console.log('This is normal outside market hours (Mon-Fri 9:30-14:30 SLT).\n');
    return;
  }

  // 2. Save to database
  const client = await createClient();
  const today = new Date().toISOString().split('T')[0];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const item of items) {
      if (!item.symbol) {
        skipped++;
        continue;
      }

      const stockId = await getStockId(client, item.symbol);
      if (stockId === null) {
        // Stock not in our database yet — skip (it will be synced by the trade summary cron)
        skipped++;
        continue;
      }

      const result = await upsertDailyPrice(
        client,
        stockId,
        today,
        item.open ?? 0,
        item.high ?? 0,
        item.low ?? 0,
        item.lastTradedPrice ?? 0,
        item.crossingVolume ?? item.quantity ?? 0,
      );

      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
    }

    console.log(`Results for ${today}:`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Skipped:  ${skipped} (no symbol or stock not in DB)\n`);
  } finally {
    await client.end();
  }
}

// ─── Command: status ────────────────────────────────────────────────────────

async function commandStatus(): Promise<void> {
  console.log('=== Daily Prices Database Status ===\n');

  const client = await createClient();

  try {
    // Total record count
    const countRes = await client.query('SELECT COUNT(*) as total FROM daily_prices');
    const total = parseInt(countRes.rows[0].total, 10);
    console.log(`Total daily_prices records: ${total}`);

    if (total === 0) {
      console.log('\nNo records found. Run `snapshot` to capture today\'s data,');
      console.log('or use `import` to load historical data from a CSV file.\n');
      return;
    }

    // Date range
    const rangeRes = await client.query(
      'SELECT MIN(trade_date) as min_date, MAX(trade_date) as max_date FROM daily_prices',
    );
    const minDate = rangeRes.rows[0].min_date;
    const maxDate = rangeRes.rows[0].max_date;
    const minStr = minDate instanceof Date ? minDate.toISOString().split('T')[0] : String(minDate);
    const maxStr = maxDate instanceof Date ? maxDate.toISOString().split('T')[0] : String(maxDate);
    console.log(`Date range: ${minStr} to ${maxStr}`);

    // Distinct stock count
    const stockCountRes = await client.query(
      'SELECT COUNT(DISTINCT stock_id) as count FROM daily_prices',
    );
    console.log(`Distinct stocks with price data: ${stockCountRes.rows[0].count}`);

    // Per-date breakdown
    const perDateRes = await client.query(
      `SELECT trade_date, COUNT(*) as records
       FROM daily_prices
       GROUP BY trade_date
       ORDER BY trade_date DESC
       LIMIT 30`,
    );

    console.log(`\nRecords per date (last 30 dates):`);
    console.log('  Date        | Records');
    console.log('  ------------|--------');
    for (const row of perDateRes.rows) {
      const dateStr =
        row.trade_date instanceof Date
          ? row.trade_date.toISOString().split('T')[0]
          : String(row.trade_date);
      console.log(`  ${dateStr} | ${String(row.records).padStart(6)}`);
    }

    // Show top 10 stocks by record count
    const topStocksRes = await client.query(
      `SELECT s.symbol, COUNT(*) as days
       FROM daily_prices dp
       JOIN stocks s ON s.id = dp.stock_id
       GROUP BY s.symbol
       ORDER BY days DESC
       LIMIT 10`,
    );

    console.log(`\nTop 10 stocks by data coverage:`);
    console.log('  Symbol          | Days');
    console.log('  ----------------|-----');
    for (const row of topStocksRes.rows) {
      console.log(`  ${String(row.symbol).padEnd(16)}| ${String(row.days).padStart(4)}`);
    }

    console.log('');
  } finally {
    await client.end();
  }
}

// ─── Command: import ────────────────────────────────────────────────────────

async function commandImport(filePath: string): Promise<void> {
  console.log('=== CSV Import to daily_prices ===\n');

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading: ${filePath}\n`);

  // Parse CSV
  const rows: CsvRow[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let headerMap: Record<string, number> = {};
  const errors: string[] = [];

  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const fields = trimmed.split(',').map((f) => f.trim());

    // Parse header row
    if (lineNum === 1 || Object.keys(headerMap).length === 0) {
      const lower = fields.map((f) => f.toLowerCase());
      if (lower.includes('date') && lower.includes('symbol')) {
        headerMap = {};
        lower.forEach((col, idx) => {
          headerMap[col] = idx;
        });
        continue;
      }
    }

    // Require header to be parsed
    if (Object.keys(headerMap).length === 0) {
      errors.push(`Line ${lineNum}: No header row found yet. Expected: date,symbol,open,high,low,close,volume`);
      continue;
    }

    // Parse data row
    const dateIdx = headerMap['date'];
    const symbolIdx = headerMap['symbol'];
    const openIdx = headerMap['open'];
    const highIdx = headerMap['high'];
    const lowIdx = headerMap['low'];
    const closeIdx = headerMap['close'];
    const volumeIdx = headerMap['volume'];

    if (dateIdx === undefined || symbolIdx === undefined || closeIdx === undefined) {
      errors.push(`Line ${lineNum}: Missing required columns (date, symbol, close)`);
      continue;
    }

    const dateVal = fields[dateIdx];
    const symbolVal = fields[symbolIdx];
    const closeVal = parseFloat(fields[closeIdx]);

    if (!dateVal || !symbolVal || isNaN(closeVal)) {
      errors.push(`Line ${lineNum}: Invalid data — date="${dateVal}", symbol="${symbolVal}", close="${fields[closeIdx]}"`);
      continue;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      errors.push(`Line ${lineNum}: Invalid date format "${dateVal}" — expected YYYY-MM-DD`);
      continue;
    }

    rows.push({
      date: dateVal,
      symbol: symbolVal,
      open: openIdx !== undefined ? parseFloat(fields[openIdx]) || 0 : 0,
      high: highIdx !== undefined ? parseFloat(fields[highIdx]) || 0 : 0,
      low: lowIdx !== undefined ? parseFloat(fields[lowIdx]) || 0 : 0,
      close: closeVal,
      volume: volumeIdx !== undefined ? parseInt(fields[volumeIdx], 10) || 0 : 0,
    });
  }

  if (errors.length > 0) {
    console.log(`Parse warnings (${errors.length}):`);
    for (const err of errors.slice(0, 20)) {
      console.log(`  ${err}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more\n`);
    }
    console.log('');
  }

  if (rows.length === 0) {
    console.log('No valid rows to import.');
    return;
  }

  // Deduplicate: group by date+symbol, keep last occurrence
  const uniqueKey = (r: CsvRow) => `${r.date}|${r.symbol}`;
  const deduped = new Map<string, CsvRow>();
  for (const row of rows) {
    deduped.set(uniqueKey(row), row);
  }
  const dedupedRows = Array.from(deduped.values());

  const dates = [...new Set(dedupedRows.map((r) => r.date))].sort();
  const symbols = [...new Set(dedupedRows.map((r) => r.symbol))];

  console.log(`Parsed ${dedupedRows.length} records (${rows.length - dedupedRows.length} duplicates removed)`);
  console.log(`  Dates:   ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} trading days)`);
  console.log(`  Symbols: ${symbols.length} unique stocks\n`);

  // Import to database
  const client = await createClient();
  let inserted = 0;
  let updated = 0;
  let skippedNoStock = 0;

  // Cache stock ID lookups
  const stockIdCache = new Map<string, number | null>();

  try {
    for (const row of dedupedRows) {
      // Look up stock_id with caching
      if (!stockIdCache.has(row.symbol)) {
        stockIdCache.set(row.symbol, await getStockId(client, row.symbol));
      }
      const stockId = stockIdCache.get(row.symbol)!;

      if (stockId === null) {
        skippedNoStock++;
        continue;
      }

      const result = await upsertDailyPrice(
        client,
        stockId,
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
      );

      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
    }

    console.log('Import results:');
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Skipped:  ${skippedNoStock} (symbol not found in stocks table)`);

    if (skippedNoStock > 0) {
      const missingSymbols = [...stockIdCache.entries()]
        .filter(([, v]) => v === null)
        .map(([k]) => k);
      console.log(`\n  Missing symbols (not in stocks table):`);
      for (const sym of missingSymbols.slice(0, 20)) {
        console.log(`    - ${sym}`);
      }
      if (missingSymbols.length > 20) {
        console.log(`    ... and ${missingSymbols.length - 20} more`);
      }
      console.log('\n  Tip: Start the NestJS backend first to sync stocks from trade summary.');
    }

    console.log('');
  } finally {
    await client.end();
  }
}

// ─── Command: scrape-api (fast direct API backfill) ─────────────────────────

interface ChartItem {
  h?: number | null;   // high
  l?: number | null;   // low
  o?: number | null;   // open (usually null for historical)
  p?: number | null;   // close/last price
  q?: number | null;   // volume
  t?: number | null;   // timestamp ms
  c?: number | null;   // change
  pc?: number | null;  // percent change
}

interface ChartDataResponse {
  chartData?: ChartItem[];
}

interface TradeSummaryItem {
  id?: number;
  symbol?: string;
  name?: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  sharevolume?: number;
  turnover?: number;
}

interface TradeSummaryResponse {
  reqTradeSummery?: TradeSummaryItem[];
}

/**
 * Fetch stock ID map from tradeSummary: symbol → stockId
 */
async function fetchStockIdMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await axios.post<TradeSummaryResponse>(
      `${CSE_API_BASE}tradeSummary`,
      '',
      { headers: CSE_HEADERS, timeout: 15000 },
    );
    for (const item of res.data?.reqTradeSummery ?? []) {
      if (item.symbol && item.id) map.set(item.symbol, item.id);
    }
    console.log(`  Fetched stockId map: ${map.size} stocks`);
  } catch (err) {
    console.error(`  ERROR fetching tradeSummary: ${String(err)}`);
  }
  return map;
}

/**
 * Fetch historical OHLCV for a single stock via companyChartDataByStock (period=5 = 1 year daily bars).
 */
async function fetchChartData(stockId: number): Promise<OhlcvRow[]> {
  const res = await axios.post<ChartDataResponse>(
    `${CSE_API_BASE}companyChartDataByStock`,
    `stockId=${stockId}&period=5`,
    {
      headers: {
        ...CSE_HEADERS,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.cse.lk/',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
      timeout: 15000,
    },
  );

  const rows: OhlcvRow[] = [];
  for (const item of res.data?.chartData ?? []) {
    if (!item.t || !item.p) continue;
    const ts = item.t / 1000;
    const dt = new Date(ts * 1000);
    // Shift from UTC to SLT (UTC+5:30) to get the correct trade date
    dt.setMinutes(dt.getMinutes() + 330);
    const tradeDate = dt.toISOString().split('T')[0];

    const close = item.p;
    rows.push({
      date: tradeDate,
      open: item.o ?? close,  // open is null for historical — use close
      high: item.h ?? close,
      low: item.l ?? close,
      close,
      volume: Math.round(item.q ?? 0),  // API returns float; volume is bigint
      turnover: 0,
    });
  }

  // Deduplicate by date (keep last — the post-close candle)
  const dateMap = new Map<string, OhlcvRow>();
  for (const row of rows) dateMap.set(row.date, row);

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fast historical backfill using companyChartDataByStock (period=5 = 1yr daily bars).
 * No Playwright needed — direct API calls only.
 */
async function commandScrapeApi(symbolFilter: string[]): Promise<void> {
  console.log('=== CSE Historical Price Backfill (Direct API) ===');
  console.log('Endpoint: companyChartDataByStock (period=5 = 1-year daily bars)\n');

  // Get all stocks from DB
  const client = await createClient();
  let dbStocks: { id: number; symbol: string }[] = [];
  try {
    const res = await client.query<{ id: number; symbol: string }>(
      'SELECT id, symbol FROM stocks WHERE is_active = true ORDER BY symbol',
    );
    dbStocks = res.rows;
  } finally {
    // keep client open for upserts
  }

  const stocks =
    symbolFilter.length > 0
      ? dbStocks.filter((s) => symbolFilter.includes(s.symbol))
      : dbStocks;

  console.log(`Stocks to backfill: ${stocks.length}`);

  // Build stockId map from CSE tradeSummary
  console.log('\nFetching stockId map from CSE tradeSummary...');
  const stockIdMap = await fetchStockIdMap();

  let totalInserted = 0;
  let totalUpdated = 0;
  let stocksOk = 0;
  let stocksSkipped = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    const stockId = stockIdMap.get(stock.symbol);

    if (!stockId) {
      console.log(`[${i + 1}/${stocks.length}] ${stock.symbol} — no stockId, skipping`);
      stocksSkipped++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${stocks.length}] ${stock.symbol} (stockId=${stockId})... `);

    let rows: OhlcvRow[] = [];
    try {
      rows = await fetchChartData(stockId);
    } catch (err) {
      console.log(`ERROR: ${String(err)}`);
      stocksSkipped++;
      continue;
    }

    if (rows.length === 0) {
      console.log('0 rows');
      stocksSkipped++;
      continue;
    }

    let ins = 0;
    let upd = 0;
    for (const row of rows) {
      const result = await upsertDailyPrice(
        client,
        stock.id,
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        row.volume,
        row.turnover,
      );
      if (result === 'inserted') ins++;
      else if (result === 'updated') upd++;
    }

    console.log(`${rows.length} rows (${ins} inserted, ${upd} updated)`);
    totalInserted += ins;
    totalUpdated += upd;
    stocksOk++;

    // Small delay to avoid rate-limiting
    if (i < stocks.length - 1) await new Promise((r) => setTimeout(r, 200));
  }

  await client.end();

  console.log('\n=== Backfill Complete ===');
  console.log(`Stocks backfilled: ${stocksOk}/${stocks.length}`);
  console.log(`Stocks skipped:    ${stocksSkipped}`);
  console.log(`Rows inserted:     ${totalInserted}`);
  console.log(`Rows updated:      ${totalUpdated}`);
  console.log('');

  await commandStatus();
}

// ─── Command: scrape (Playwright) ───────────────────────────────────────────

interface OhlcvRow {
  date: string;  // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

interface DiscoveredApi {
  endpoint: string;          // full URL like https://www.cse.lk/api/someEndpoint
  symbolParam: string;       // query param name for symbol
  fromParam?: string;        // query param name for start date
  toParam?: string;          // query param name for end date
  sampleResponse: string;    // raw JSON for debugging
}

/**
 * Parse numeric string (handles commas, hyphens for zero).
 */
function parseNum(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = s.replace(/,/g, '').trim();
  if (cleaned === '-' || cleaned === '' || cleaned === 'N/A') return 0;
  return parseFloat(cleaned) || 0;
}

/**
 * Convert a CSE date string (e.g. "03 Feb 2026" or "2026-02-03") to YYYY-MM-DD.
 */
function toIsoDate(raw: string): string | null {
  const trimmed = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // "03 Feb 2026" format
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = months[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${day}`;
  }

  // "2026/02/03" format
  const m2 = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  return null;
}

/**
 * Use Playwright to visit the CSE company profile for one symbol and intercept
 * any XHR requests that return historical OHLCV data.
 *
 * Returns DiscoveredApi if a usable endpoint was found, null otherwise.
 */
async function probeForHistoricalApi(
  symbol: string,
  headless: boolean,
): Promise<DiscoveredApi | null> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  const captured: { url: string; body: string; response: string }[] = [];

  // Intercept all POST requests to cse.lk/api/*
  page.on('request', (req) => {
    if (req.url().includes('cse.lk/api/') && req.method() === 'POST') {
      captured.push({ url: req.url(), body: req.postData() ?? '', response: '' });
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('cse.lk/api/') && res.status() === 200) {
      const text = await res.text().catch(() => '');
      const entry = captured.find((c) => c.url === res.url() && c.response === '');
      if (entry) entry.response = text;
    }
  });

  const profileUrl = `https://www.cse.lk/company-profile?symbol=${encodeURIComponent(symbol)}`;
  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Try to click "Quotes" or "Historical" related tabs
    const tabTexts = ['Quotes', 'Historical Trades', 'Historical', 'History', 'Price History'];
    for (const text of tabTexts) {
      const clicked = await page
        .locator(`text="${text}"`)
        .first()
        .click({ timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        console.log(`  Clicked tab: "${text}"`);
        await page.waitForTimeout(3000);
        break;
      }
    }

    // Also try sub-tabs
    const subTabTexts = ['Historical Trades', 'Historical', 'History'];
    for (const text of subTabTexts) {
      await page
        .locator(`text="${text}"`)
        .first()
        .click({ timeout: 2000 })
        .catch(() => null);
    }
    await page.waitForTimeout(3000);
  } catch (err) {
    console.warn(`  Probe navigation failed: ${String(err)}`);
  }

  await browser.close();

  // Analyze captured responses to find historical OHLCV data
  for (const entry of captured) {
    if (!entry.response || entry.response.length < 50) continue;

    try {
      const data = JSON.parse(entry.response);
      // Look for an array of objects with date+price fields
      const arr: unknown[] = Array.isArray(data) ? data
        : Object.values(data).find((v) => Array.isArray(v)) as unknown[] ?? [];

      if (arr.length < 5) continue;

      const first = arr[0] as Record<string, unknown>;
      const keys = Object.keys(first).map((k) => k.toLowerCase());
      const hasDate = keys.some((k) => k.includes('date') || k === 'dt');
      const hasPrice = keys.some((k) =>
        k.includes('price') || k.includes('close') || k.includes('last') || k.includes('trade'),
      );

      if (hasDate && hasPrice) {
        console.log(`  Found historical API: ${entry.url}`);
        console.log(`  Array length: ${arr.length}, keys: ${Object.keys(first).join(', ')}`);

        // Try to parse symbol and date params from the captured request body
        const bodyParams = new URLSearchParams(entry.body);
        const symbolParam = [...bodyParams.keys()].find((k) =>
          k.toLowerCase().includes('symbol') || k === 's' || k === 'sec',
        ) ?? 'symbol';

        return {
          endpoint: entry.url,
          symbolParam,
          sampleResponse: entry.response.slice(0, 500),
        };
      }
    } catch {
      // Not JSON — skip
    }
  }

  console.log('  No historical API found in intercepted requests.');
  if (captured.length > 0) {
    console.log(`  Intercepted ${captured.length} API calls:`);
    for (const c of captured) {
      console.log(`    ${c.url} (${c.response.length}B)`);
    }
  }

  return null;
}

/**
 * Use Playwright to scrape the historical trades HTML table from the CSE
 * company profile page for a single stock.
 *
 * Returns an array of OhlcvRow objects (may be empty if no data found).
 */
async function scrapeHistoricalTable(
  symbol: string,
  daysBack: number,
  headless: boolean,
): Promise<OhlcvRow[]> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  const rows: OhlcvRow[] = [];

  try {
    const profileUrl = `https://www.cse.lk/company-profile?symbol=${encodeURIComponent(symbol)}`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Try clicking "Quotes" tab
    for (const text of ['Quotes', 'Historical Trades', 'Historical', 'History']) {
      const clicked = await page
        .locator(`text="${text}"`)
        .first()
        .click({ timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        await page.waitForTimeout(2500);
        break;
      }
    }

    // Try clicking "Historical Trades" sub-tab
    for (const text of ['Historical Trades', 'Historical', 'History']) {
      await page.locator(`text="${text}"`).first().click({ timeout: 2000 }).catch(() => null);
    }
    await page.waitForTimeout(3000);

    // Try to set date range if date picker is visible
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack * 1.5); // buffer for weekends/holidays
    const fromDateStr = fromDate.toISOString().split('T')[0];

    // Try common date input selectors
    for (const sel of ['input[placeholder*="From"]', 'input[name*="from"]', 'input[type="date"]:first-child']) {
      const dateInput = page.locator(sel).first();
      if (await dateInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dateInput.fill(fromDateStr).catch(() => null);
        break;
      }
    }

    // Try to click any "View" or "Search" button
    for (const text of ['View', 'Search', 'Show', 'Apply', 'Go']) {
      await page.locator(`button:has-text("${text}")`).first().click({ timeout: 1000 }).catch(() => null);
    }
    await page.waitForTimeout(3000);

    // Extract from all tables on the page
    const tableData = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      const results: { headers: string[]; rows: string[][] }[] = [];

      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll('th')).map(
          (th) => th.textContent?.trim() ?? '',
        );
        if (headers.length === 0) continue;

        const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
        );

        if (rows.length > 0) results.push({ headers, rows });
      }
      return results;
    });

    // Find the table that has date + price columns
    for (const table of tableData) {
      const hdrs = table.headers.map((h) => h.toLowerCase());
      const dateIdx = hdrs.findIndex((h) => h.includes('date') || h.includes('dt'));
      const highIdx = hdrs.findIndex((h) => h.includes('high') || h.includes('highest'));
      const lowIdx = hdrs.findIndex((h) => h.includes('low') || h.includes('lowest'));
      const closeIdx = hdrs.findIndex(
        (h) => h.includes('last') || h.includes('close') || h.includes('price'),
      );
      const volIdx = hdrs.findIndex((h) => h.includes('volume') || h.includes('shares') || h.includes('qty'));

      if (dateIdx === -1 || closeIdx === -1) continue;

      for (const row of table.rows) {
        if (row.length === 0) continue;
        const dateStr = toIsoDate(row[dateIdx] ?? '');
        if (!dateStr) continue;

        const close = parseNum(row[closeIdx]);
        if (close <= 0) continue;

        const high = highIdx >= 0 ? parseNum(row[highIdx]) : close;
        const low = lowIdx >= 0 ? parseNum(row[lowIdx]) : close;
        const vol = volIdx >= 0 ? parseNum(row[volIdx]) : 0;

        rows.push({
          date: dateStr,
          open: close, // CSE historical table typically doesn't have open; use close
          high: high > 0 ? high : close,
          low: low > 0 ? low : close,
          close,
          volume: vol,
          turnover: 0,
        });
      }

      if (rows.length > 0) {
        console.log(`  ${symbol}: Scraped ${rows.length} rows (headers: ${table.headers.join(', ')})`);
        break;
      }
    }

    if (rows.length === 0) {
      // Debug: log all text on page to understand structure
      const bodyText = await page.evaluate(() =>
        document.body.textContent?.slice(0, 2000).replace(/\s+/g, ' '),
      );
      console.warn(`  ${symbol}: No table data found. Page text snippet: ${bodyText?.slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`  ${symbol}: Scrape error: ${String(err)}`);
  } finally {
    await browser.close();
  }

  return rows;
}

/**
 * Main scrape command: probe for historical API, then backfill all (or specified) stocks.
 */
async function commandScrape(symbolFilter: string[], daysBack: number): Promise<void> {
  console.log(`=== CSE Historical Price Scraper ===`);
  console.log(`Target: ${daysBack} trading days of history\n`);

  // Get all active stocks from DB
  const client = await createClient();
  let allStocks: { id: number; symbol: string }[] = [];
  try {
    const res = await client.query<{ id: number; symbol: string }>(
      'SELECT id, symbol FROM stocks WHERE is_active = true ORDER BY symbol',
    );
    allStocks = res.rows;
  } finally {
    await client.end();
  }

  const stocks =
    symbolFilter.length > 0
      ? allStocks.filter((s) => symbolFilter.includes(s.symbol))
      : allStocks;

  console.log(`Stocks to process: ${stocks.length}\n`);

  if (stocks.length === 0) {
    console.log('No stocks found. Run the backend first to sync stocks from the CSE trade summary.');
    return;
  }

  // ── Step 1: Probe with first stock to discover API endpoint ────────────────
  const probeSymbol = stocks[0].symbol;
  console.log(`Probing CSE website for historical API (using ${probeSymbol})...`);
  const apiInfo = await probeForHistoricalApi(probeSymbol, true);

  // ── Step 2: Backfill — fast path if API found, slow path (Playwright) otherwise
  const db = await createClient();
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let stocksProcessed = 0;
  let stocksFailed = 0;

  try {
    for (const stock of stocks) {
      console.log(`\n[${++stocksProcessed}/${stocks.length}] ${stock.symbol}`);
      let rows: OhlcvRow[] = [];

      if (apiInfo) {
        // Fast path: call discovered API directly
        try {
          const body = new URLSearchParams({ [apiInfo.symbolParam]: stock.symbol }).toString();
          const res = await axios.post<unknown>(apiInfo.endpoint, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15_000,
          });
          const data = res.data;
          const arr: unknown[] = Array.isArray(data)
            ? data
            : (Object.values(data as object).find((v) => Array.isArray(v)) as unknown[] ?? []);

          rows = (arr as Record<string, unknown>[]).flatMap((item): OhlcvRow[] => {
            // Try to extract date + OHLCV from the item
            const keys = Object.keys(item);
            const dateKey = keys.find((k) =>
              k.toLowerCase().includes('date') || k.toLowerCase() === 'dt',
            );
            const closeKey = keys.find((k) =>
              k.toLowerCase().includes('close') ||
              k.toLowerCase().includes('last') ||
              k.toLowerCase().includes('price'),
            );
            if (!dateKey || !closeKey) return [];

            const dateStr = toIsoDate(String(item[dateKey] ?? ''));
            if (!dateStr) return [];

            const close = parseNum(String(item[closeKey] ?? ''));
            if (close <= 0) return [];

            const highKey = keys.find((k) => k.toLowerCase().includes('high'));
            const lowKey = keys.find((k) => k.toLowerCase().includes('low'));
            const volKey = keys.find((k) =>
              k.toLowerCase().includes('volume') || k.toLowerCase().includes('shares'),
            );
            const turnKey = keys.find((k) => k.toLowerCase().includes('turnover'));

            return [{
              date: dateStr,
              open: close,
              high: highKey ? parseNum(String(item[highKey] ?? '')) || close : close,
              low: lowKey ? parseNum(String(item[lowKey] ?? '')) || close : close,
              close,
              volume: volKey ? parseNum(String(item[volKey] ?? '')) : 0,
              turnover: turnKey ? parseNum(String(item[turnKey] ?? '')) : 0,
            }];
          });
          console.log(`  API returned ${rows.length} rows`);
        } catch (err) {
          console.warn(`  API call failed for ${stock.symbol}: ${String(err)}`);
          stocksFailed++;
          continue;
        }
      } else {
        // Slow path: Playwright HTML scraping
        rows = await scrapeHistoricalTable(stock.symbol, daysBack, true);
      }

      if (rows.length === 0) {
        console.log(`  No data — skipping`);
        stocksFailed++;
        continue;
      }

      // Filter to only the requested date range
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Math.ceil(daysBack * 1.5));
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const filtered = rows.filter((r) => r.date >= cutoffStr);
      console.log(`  ${filtered.length} rows within date range (from ${cutoffStr})`);

      // Upsert into daily_prices
      for (const row of filtered) {
        const result = await upsertDailyPrice(
          db,
          stock.id,
          row.date,
          row.open,
          row.high,
          row.low,
          row.close,
          row.volume,
          row.turnover,
        );
        if (result === 'inserted') totalInserted++;
        else if (result === 'updated') totalUpdated++;
      }
    }
  } finally {
    await db.end();
  }

  console.log('\n=== Scrape Complete ===');
  console.log(`Stocks processed: ${stocksProcessed - stocksFailed}/${stocks.length}`);
  console.log(`Rows inserted:    ${totalInserted}`);
  console.log(`Rows updated:     ${totalUpdated}`);
  console.log(`Rows skipped:     ${totalSkipped}`);
  console.log(`Stocks failed:    ${stocksFailed}\n`);

  await commandStatus();
}

// ─── Command: help ──────────────────────────────────────────────────────────

function commandHelp(): void {
  console.log(`
CSE AI Dashboard — Historical Price Data Backfill Utility

IMPORTANT: The CSE API chart endpoints (chartData, companyChartDataByStock)
return HTTP 400 errors and are NOT usable for historical data retrieval.
The only working price endpoint is todaySharePrice (current trading day only).

To build a historical price database, you need:
  1. Let the daily crons accumulate data over time (12:00 + 15:00 SLT snapshots)
  2. Import historical data from CSV files using this script
  3. Optionally scrape CSE company profile pages for past prices

Usage:
  npx tsx ../../scripts/backfill-history.ts <command> [options]

Commands:
  snapshot          Fetch today's prices from CSE todaySharePrice API and
                    save/update them in the daily_prices table. Safe to run
                    multiple times (upserts by stock_id + trade_date).

  status            Show database statistics: total records, date range,
                    per-date breakdown, and top stocks by coverage.

  import --file F   Import OHLCV data from a CSV file into daily_prices.
                    CSV must have a header row with at minimum: date, symbol, close
                    Optional columns: open, high, low, volume

  help              Show this help message.

CSV Format:
  date,symbol,open,high,low,close,volume
  2026-03-01,JKH.N0000,168.00,170.50,167.25,169.75,125000
  2026-03-01,COMB.N0000,98.50,99.00,97.80,98.25,45000

Notes:
  - Symbols must match exactly what's in the stocks table (e.g., JKH.N0000)
  - Dates must be in YYYY-MM-DD format
  - The import command uses upserts: existing records are updated, new ones inserted
  - Stocks must already exist in the stocks table (run the backend first to sync)
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || 'snapshot';

  try {
    switch (command) {
      case 'snapshot':
        await commandSnapshot();
        await commandStatus();
        break;

      case 'status':
        await commandStatus();
        break;

      case 'scrape-api': {
        const symbolsArg = args.indexOf('--symbols');
        const symbolFilter =
          symbolsArg !== -1 && args[symbolsArg + 1]
            ? args[symbolsArg + 1].split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        await commandScrapeApi(symbolFilter);
        break;
      }

      case 'scrape': {
        const daysArg = args.indexOf('--days');
        const days = daysArg !== -1 && args[daysArg + 1] ? parseInt(args[daysArg + 1], 10) : 30;
        const symbolsArg = args.indexOf('--symbols');
        const symbolFilter =
          symbolsArg !== -1 && args[symbolsArg + 1]
            ? args[symbolsArg + 1].split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        await commandScrape(symbolFilter, days);
        break;
      }

      case 'import': {
        const fileIdx = args.indexOf('--file');
        if (fileIdx === -1 || !args[fileIdx + 1]) {
          console.error('ERROR: import command requires --file <path>');
          console.error('Example: npx tsx ../../scripts/backfill-history.ts import --file ../../data/prices.csv');
          process.exit(1);
        }
        await commandImport(args[fileIdx + 1]);
        break;
      }

      case 'help':
      case '--help':
      case '-h':
        commandHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        commandHelp();
        process.exit(1);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nFATAL ERROR: ${msg}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
