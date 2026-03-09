/**
 * backfill-history.ts — Historical price data backfill utility for CSE AI Dashboard
 *
 * Usage (from src/backend/ directory):
 *   npx tsx ../../scripts/backfill-history.ts [command]
 *
 * Commands:
 *   snapshot   - Fetch today's prices from CSE API and save to daily_prices (default)
 *   status     - Show daily_prices record count, date range, and per-date breakdown
 *   import     - Import OHLCV data from CSV file: --file <path.csv>
 *   help       - Show this help message
 *
 * Examples:
 *   npx tsx ../../scripts/backfill-history.ts snapshot
 *   npx tsx ../../scripts/backfill-history.ts status
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
 *   To build historical data, you must use alternative sources:
 *   1. Daily cron accumulation (saveDailyPrices runs at 12:00 and 15:00 SLT)
 *   2. Manual CSV import using this script's `import` command
 *   3. Web scraping from CSE company pages (https://www.cse.lk/pages/company-profile/...)
 *   4. Third-party data providers or financial data APIs
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
    // Update existing — only overwrite if the new data has non-zero values
    await client.query(
      `UPDATE daily_prices
       SET open = CASE WHEN $3 > 0 THEN $3 ELSE open END,
           high = CASE WHEN $4 > 0 THEN $4 ELSE high END,
           low  = CASE WHEN $5 > 0 THEN $5 ELSE low END,
           close = CASE WHEN $6 > 0 THEN $6 ELSE close END,
           volume = CASE WHEN $7 > 0 THEN $7 ELSE volume END,
           turnover = CASE WHEN $8 > 0 THEN $8 ELSE turnover END,
           trades_count = CASE WHEN $9 > 0 THEN $9 ELSE trades_count END
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
