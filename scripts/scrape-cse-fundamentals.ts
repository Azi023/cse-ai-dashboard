/**
 * scrape-cse-fundamentals.ts — Standalone CSE fundamentals scraper
 *
 * Calls the backend endpoint POST /api/financials/scrape-cse which:
 *   1. Navigates to cse.lk/company-profile for each of the 11 Almas whitelist
 *      stocks + top 20 most-traded stocks
 *   2. Opens Financials → Fundamental Data tab and waits for TradingView widget
 *   3. Extracts all visible metrics (valuation, income, balance sheet, cash flow,
 *      profitability, dividends, price history)
 *   4. Saves screenshots → data/cse-fundamentals/{symbol}.png
 *   5. Saves JSON       → data/cse-fundamentals/{symbol}.json
 *   6. Upserts into company_financials table
 *   7. Triggers POST /api/shariah/run-tier2-screening
 *   8. Writes report    → tasks/cse-scraper-report.md
 *
 * Prerequisites: backend must be running on port 3001.
 *   Start with: cd src/backend && npm run start:dev
 *
 * Usage (from repo root):
 *   cd src/backend && npx tsx ../../scripts/scrape-cse-fundamentals.ts
 *
 * Or run via API directly:
 *   curl -X POST http://localhost:3001/api/financials/scrape-cse
 */

const BACKEND_URL = 'http://localhost:3001';
const SCRAPE_ENDPOINT = `${BACKEND_URL}/api/financials/scrape-cse`;

interface ScrapeResult {
  symbol: string;
  status: 'success' | 'partial' | 'failed';
  dbStatus?: string;
  message?: string;
}

interface ScrapeResponse {
  total: number;
  success: number;
  partial: number;
  failed: number;
  tier2TriggerStatus: string;
  results: ScrapeResult[];
}

async function main(): Promise<void> {
  console.log('CSE Fundamentals Scraper');
  console.log('========================');
  console.log(`Endpoint: ${SCRAPE_ENDPOINT}`);
  console.log('');

  // Check backend is reachable
  try {
    const healthRes = await fetch(`${BACKEND_URL}/api/global/indicators`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok && healthRes.status !== 404) {
      console.error(
        `Backend health check failed: HTTP ${healthRes.status}. Is the backend running on port 3001?`,
      );
      process.exit(1);
    }
    console.log('Backend reachable');
  } catch (err) {
    console.error(
      `Cannot reach backend at ${BACKEND_URL}. Start with: cd src/backend && npm run start:dev`,
    );
    console.error(String(err));
    process.exit(1);
  }

  console.log('Starting scrape — this will take several minutes...');
  console.log('(visiting each stock page + waiting for TradingView widget)\n');

  const startMs = Date.now();

  let response: Response;
  try {
    response = await fetch(SCRAPE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No timeout here — scraping all stocks takes several minutes
    });
  } catch (err) {
    console.error(`Request failed: ${String(err)}`);
    process.exit(1);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`Scrape endpoint returned HTTP ${response.status}:`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  const data = (await response.json()) as ScrapeResponse;
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log(`\nScrape complete in ${elapsedSec}s`);
  console.log(`  Total:   ${data.total}`);
  console.log(`  Success: ${data.success}`);
  console.log(`  Partial: ${data.partial}`);
  console.log(`  Failed:  ${data.failed}`);
  console.log(`  Tier 2 Screening: ${data.tier2TriggerStatus}`);
  console.log('');

  if (data.results && data.results.length > 0) {
    console.log('Per-symbol results:');
    const colW = Math.max(...data.results.map((r) => r.symbol.length), 10);
    for (const r of data.results) {
      const pad = r.symbol.padEnd(colW);
      const db = r.dbStatus ? ` [DB: ${r.dbStatus}]` : '';
      const note = r.message ? ` — ${r.message}` : '';
      console.log(`  ${pad}  ${r.status}${db}${note}`);
    }
  }

  console.log('\nReport written to: tasks/cse-scraper-report.md');
  console.log('Screenshots:       data/cse-fundamentals/*.png');
  console.log('JSON data:         data/cse-fundamentals/*.json');
}

main().catch((err: unknown) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
