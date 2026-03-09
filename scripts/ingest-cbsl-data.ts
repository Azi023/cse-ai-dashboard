/**
 * ingest-cbsl-data.ts
 *
 * Standalone script to ingest CBSL macro data into the PostgreSQL database.
 * Downloads interest rate Excel from CBSL, fetches USD/LKR from a free API,
 * and stores everything in the macro_data table.
 *
 * Falls back to sensible default values if CBSL downloads fail, so the
 * dashboard always has something to display.
 *
 * Usage:  npx tsx scripts/ingest-cbsl-data.ts
 */

import { Client } from 'pg';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ──────────────────────────────────────────────────────

const PG_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'cse_user',
  password: 'cse_secure_2026',
  database: 'cse_dashboard',
};

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'cbsl-macro');

// ── Fallback values (approximate as of early 2026) ──────────────

const FALLBACK_INDICATORS: Array<{
  indicator: string;
  value: number;
  source: string;
}> = [
  { indicator: 'sdfr', value: 8.25, source: 'cbsl_fallback' },
  { indicator: 'slfr', value: 9.25, source: 'cbsl_fallback' },
  { indicator: 'awplr', value: 10.45, source: 'cbsl_fallback' },
  { indicator: 'tbill_91d', value: 9.12, source: 'cbsl_fallback' },
  { indicator: 'tbill_182d', value: 9.35, source: 'cbsl_fallback' },
  { indicator: 'tbill_364d', value: 9.5, source: 'cbsl_fallback' },
  { indicator: 'inflation_ccpi_yoy', value: 5.2, source: 'cbsl_fallback' },
  { indicator: 'money_supply_m2', value: 12400, source: 'cbsl_fallback' }, // in billions LKR
];

// ── Helpers ─────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Simple HTTP(S) GET that returns a Buffer.
 */
function httpGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 30000 }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Upsert a single macro_data row.
 */
async function upsert(
  pg: Client,
  indicator: string,
  dataDate: string,
  value: number,
  source: string,
): Promise<void> {
  // Check if exists
  const existing = await pg.query(
    'SELECT id FROM macro_data WHERE indicator = $1 AND data_date = $2',
    [indicator, dataDate],
  );

  if (existing.rows.length > 0) {
    await pg.query(
      'UPDATE macro_data SET value = $1, source = $2 WHERE id = $3',
      [value, source, existing.rows[0].id],
    );
    console.log(`  Updated ${indicator} = ${value} (${dataDate})`);
  } else {
    await pg.query(
      'INSERT INTO macro_data (indicator, data_date, value, source) VALUES ($1, $2, $3, $4)',
      [indicator, dataDate, value, source],
    );
    console.log(`  Inserted ${indicator} = ${value} (${dataDate})`);
  }
}

// ── CBSL Interest Rates ─────────────────────────────────────────

async function ingestInterestRates(pg: Client): Promise<boolean> {
  console.log('\n--- Ingesting CBSL Interest Rates ---');

  const url =
    'https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/statistics/Key_Rates.xlsx';

  try {
    // Dynamic import for xlsx — resolve from CWD (backend) rather than script directory
    const xlsxPath = require.resolve('xlsx');
    const XLSX = await import(xlsxPath) as typeof import('xlsx');

    console.log(`Downloading: ${url}`);
    const buffer = await httpGet(url);

    // Save locally
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const filePath = path.join(DATA_DIR, 'Key_Rates.xlsx');
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved to ${filePath} (${buffer.length} bytes)`);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: 1,
      defval: null,
    }) as unknown[][];

    console.log(`Sheet "${sheetName}" has ${rows.length} rows`);

    // Scan for numeric data rows, keep track of the latest one
    let latestDataRow: unknown[] | null = null;
    let latestDate: string | null = null;

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      const firstCell = row[0];

      // Identify date-like first column
      const isDateLike =
        firstCell instanceof Date ||
        (typeof firstCell === 'number' && firstCell > 40000 && firstCell < 60000) ||
        (typeof firstCell === 'string' && /\d{4}/.test(firstCell));

      if (!isDateLike) continue;

      // Count numeric cells (skip first)
      const numericCount = row
        .slice(1)
        .filter((c) => typeof c === 'number' && !isNaN(c as number)).length;

      if (numericCount < 2) continue;

      latestDataRow = row;

      // Parse date
      if (firstCell instanceof Date) {
        latestDate = firstCell.toISOString().split('T')[0];
      } else if (typeof firstCell === 'number' && firstCell > 40000) {
        const epoch = new Date(1899, 11, 30);
        const d = new Date(epoch.getTime() + firstCell * 86400000);
        latestDate = d.toISOString().split('T')[0];
      } else if (typeof firstCell === 'string') {
        const parsed = new Date(firstCell);
        latestDate = !isNaN(parsed.getTime())
          ? parsed.toISOString().split('T')[0]
          : today();
      }
    }

    if (!latestDataRow || !latestDate) {
      console.log('Could not find data rows in interest rates Excel');
      return false;
    }

    console.log(`Latest data row date: ${latestDate}`);

    // Positional extraction (common CBSL layout):
    // Date | SDFR | SLFR | Repo | Rev.Repo | AWPLR | AWDR | 91d | 182d | 364d
    const positionalMap: Array<{ index: number; indicator: string }> = [
      { index: 1, indicator: 'sdfr' },
      { index: 2, indicator: 'slfr' },
      // skip 3 (repo), 4 (reverse repo)
      { index: 5, indicator: 'awplr' },
      { index: 6, indicator: 'awdr' },
      { index: 7, indicator: 'tbill_91d' },
      { index: 8, indicator: 'tbill_182d' },
      { index: 9, indicator: 'tbill_364d' },
    ];

    let anyInserted = false;

    for (const { index, indicator } of positionalMap) {
      if (index < latestDataRow.length) {
        const value = latestDataRow[index];
        if (typeof value === 'number' && !isNaN(value)) {
          await upsert(pg, indicator, latestDate, value, 'cbsl');
          anyInserted = true;
        }
      }
    }

    return anyInserted;
  } catch (error) {
    console.error(`Failed to download/parse CBSL Excel: ${String(error)}`);
    return false;
  }
}

// ── USD/LKR Exchange Rate ───────────────────────────────────────

async function ingestUsdLkr(pg: Client): Promise<boolean> {
  console.log('\n--- Fetching USD/LKR Exchange Rate ---');

  try {
    const buffer = await httpGet('https://open.er-api.com/v6/latest/USD');
    const data = JSON.parse(buffer.toString()) as {
      result: string;
      rates: Record<string, number>;
    };

    const lkrRate = data?.rates?.LKR;

    if (lkrRate && typeof lkrRate === 'number') {
      await upsert(pg, 'usd_lkr', today(), lkrRate, 'er-api.com');
      console.log(`USD/LKR = ${lkrRate}`);
      return true;
    } else {
      console.log('LKR rate not found in API response');
      return false;
    }
  } catch (error) {
    console.error(`Failed to fetch USD/LKR: ${String(error)}`);
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const pg = new Client(PG_CONFIG);

  try {
    await pg.connect();
    console.log('Connected to PostgreSQL');

    // 1. Try CBSL interest rates
    const ratesOk = await ingestInterestRates(pg);

    // 2. Try USD/LKR
    const fxOk = await ingestUsdLkr(pg);

    // 3. Insert fallback values if CBSL download failed
    if (!ratesOk) {
      console.log('\n--- Inserting fallback indicator values ---');
      const dateStr = today();

      for (const item of FALLBACK_INDICATORS) {
        await upsert(pg, item.indicator, dateStr, item.value, item.source);
      }

      console.log('Fallback values inserted');
    }

    // 4. If USD/LKR also failed, insert a reasonable fallback
    if (!fxOk) {
      console.log('\n--- Inserting fallback USD/LKR rate ---');
      await upsert(pg, 'usd_lkr', today(), 298.5, 'fallback');
    }

    // 5. Summary
    console.log('\n=== Ingestion Summary ===');
    const res = await pg.query(
      `SELECT indicator, value, data_date, source
       FROM macro_data
       WHERE (indicator, data_date) IN (
         SELECT indicator, MAX(data_date) FROM macro_data GROUP BY indicator
       )
       ORDER BY indicator`,
    );

    console.log(`\nLatest indicators in database (${res.rows.length} total):`);
    for (const row of res.rows) {
      const val =
        parseFloat(row.value) > 1_000_000
          ? `${(parseFloat(row.value) / 1e12).toFixed(2)}T`
          : parseFloat(row.value).toFixed(4);
      console.log(
        `  ${row.indicator.padEnd(20)} = ${val.padStart(15)}  (${row.data_date.toISOString().split('T')[0]}, ${row.source})`,
      );
    }

    console.log('\nDone!');
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
