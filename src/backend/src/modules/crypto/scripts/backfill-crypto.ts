/**
 * Backfill historical crypto OHLCV data from Binance.
 *
 * Usage: cd src/backend && npx tsx src/modules/crypto/scripts/backfill-crypto.ts
 *
 * Fetches:
 * - BTC/USDT + ETH/USDT daily candles for 365 days
 * - BTC/USDT + ETH/USDT hourly candles for 90 days
 * - BTC/USDT + ETH/USDT 5-minute candles for 7 days
 *
 * Safe to re-run: all inserts use ON CONFLICT DO UPDATE (upsert).
 */

import * as ccxt from 'ccxt';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

// ── Load .env from project root ──────────────────────────────────────────────

function loadEnv(): void {
  // Try project root .env (handles both local and VPS paths)
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', '.env'), // src/backend/src/modules/crypto/scripts → root
    path.resolve(process.cwd(), '.env'), // cwd
    '/opt/cse-ai-dashboard/.env', // VPS absolute
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
    break;
  }
}

loadEnv();

// ── Constants ────────────────────────────────────────────────────────────────

const SYMBOLS = ['BTC/USDT', 'ETH/USDT'] as const;

interface TimeframeConfig {
  timeframe: string;
  lookbackMs: number;
  label: string;
}

const TIMEFRAME_CONFIGS: TimeframeConfig[] = [
  {
    timeframe: '1d',
    lookbackMs: 365 * 24 * 60 * 60 * 1000,
    label: '365 days',
  },
  {
    timeframe: '1h',
    lookbackMs: 90 * 24 * 60 * 60 * 1000,
    label: '90 days',
  },
  {
    timeframe: '5m',
    lookbackMs: 7 * 24 * 60 * 60 * 1000,
    label: '7 days',
  },
];

const BATCH_SIZE = 1000;
const SLEEP_MS = 1000;

// ── DB Connection ─────────────────────────────────────────────────────────────

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || process.env.DB_PORT) || 5432,
  username: process.env.DATABASE_USER || process.env.DB_USERNAME || 'cse_user',
  password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
  database:
    process.env.DATABASE_NAME || process.env.DB_DATABASE || 'cse_dashboard',
  synchronize: false,
  entities: [],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upsert a batch of raw CCXT candles into crypto_ohlcv using raw SQL.
 * ON CONFLICT ensures idempotency across re-runs.
 */
async function upsertCandles(
  symbol: string,
  timeframe: string,
  candles: ccxt.OHLCV[],
): Promise<void> {
  if (candles.length === 0) return;

  const paramSets: unknown[] = [];
  const valuePlaceholders: string[] = [];

  candles.forEach((c, i) => {
    const base = i * 8;
    valuePlaceholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
    );
    paramSets.push(
      symbol,
      timeframe,
      new Date(c[0] as number).toISOString(),
      c[1], // open
      c[2], // high
      c[3], // low
      c[4], // close
      c[5], // volume
    );
  });

  const sql = `
    INSERT INTO crypto_ohlcv (symbol, timeframe, timestamp, open, high, low, close, volume)
    VALUES ${valuePlaceholders.join(', ')}
    ON CONFLICT (symbol, timeframe, timestamp) DO UPDATE SET
      open   = EXCLUDED.open,
      high   = EXCLUDED.high,
      low    = EXCLUDED.low,
      close  = EXCLUDED.close,
      volume = EXCLUDED.volume
  `;

  await ds.query(sql, paramSets);
}

// ── Backfill Logic ────────────────────────────────────────────────────────────

async function backfillSymbolTimeframe(
  exchange: ccxt.binance,
  symbol: string,
  config: TimeframeConfig,
): Promise<number> {
  const { timeframe, lookbackMs, label } = config;
  let since = Date.now() - lookbackMs;
  let totalInserted = 0;

  console.log(`  Fetching ${symbol} ${timeframe} (${label})...`);

  while (true) {
    const candles = await exchange.fetchOHLCV(
      symbol,
      timeframe,
      since,
      BATCH_SIZE,
    );

    if (candles.length === 0) break;

    await upsertCandles(symbol, timeframe, candles);
    totalInserted += candles.length;

    const lastTs = candles[candles.length - 1][0] as number;
    const lastDate = new Date(lastTs).toISOString().slice(0, 16);
    console.log(
      `    Batch: ${candles.length} candles, up to ${lastDate} (total: ${totalInserted})`,
    );

    // Stop if the exchange returned fewer candles than the batch size —
    // that means we have reached the present.
    if (candles.length < BATCH_SIZE) break;

    // Advance since by 1 ms past the last candle to avoid re-fetching it.
    since = lastTs + 1;

    await sleep(SLEEP_MS);
  }

  return totalInserted;
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Connecting to PostgreSQL...');
  await ds.initialize();
  console.log(
    `Connected to ${process.env.DB_DATABASE || 'cse_dashboard'} at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5433}`,
  );

  const exchange = new ccxt.binance({ enableRateLimit: true });

  const summary: { symbol: string; timeframe: string; rows: number }[] = [];

  for (const symbol of SYMBOLS) {
    console.log(`\n=== ${symbol} ===`);
    for (const config of TIMEFRAME_CONFIGS) {
      const rows = await backfillSymbolTimeframe(exchange, symbol, config);
      summary.push({ symbol, timeframe: config.timeframe, rows });
      await sleep(SLEEP_MS);
    }
  }

  await ds.destroy();

  console.log('\n=== Backfill Summary ===');
  for (const entry of summary) {
    console.log(
      `  ${entry.symbol} ${entry.timeframe}: ${entry.rows} rows upserted`,
    );
  }
  console.log('\nDone.');
}

main().catch((err: unknown) => {
  console.error(
    'Backfill failed:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
