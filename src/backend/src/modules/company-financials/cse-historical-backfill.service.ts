import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, Page, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Stock, DailyPrice } from '../../entities';

// ── Constants ─────────────────────────────────────────────────────────────────

const CSE_BASE_URL = 'https://www.cse.lk';
const PAGE_TIMEOUT_MS = 45_000;
const DELAY_BETWEEN_STOCKS_MS = 2000;
const BATCH_SIZE = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface OhlcvRow {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

interface StockResult {
  symbol: string;
  status: 'success' | 'failed' | 'skipped';
  rowsInserted: number;
  rowsSkipped: number;
  dateFrom?: string;
  dateTo?: string;
  message?: string;
}

export interface BackfillHistoryResult {
  startedAt: string;
  finishedAt: string;
  targetCount: number;
  successCount: number;
  failedCount: number;
  totalRowsInserted: number;
  totalRowsSkipped: number;
  priceRowsBefore: number;
  priceRowsAfter: number;
  results: StockResult[];
  reportPath: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CseHistoricalBackfillService {
  private readonly logger = new Logger(CseHistoricalBackfillService.name);

  constructor(
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Backfills up to 1 year of daily OHLCV data via the CSE public chart API
   * (companyChartDataByStock, period=5). No Playwright / login required.
   *
   * Note: The CSE Platinum MYCSE web portal does not expose historical data
   * beyond 1 year via a discoverable API endpoint. All /my-cse/* sub-routes
   * return 404. Period values 6-99 return only the last 5 trading days.
   * The maximum available history is ~239 trading days (≈ 1 year) via period=5.
   */
  async backfillHistory(symbols?: string[]): Promise<BackfillHistoryResult> {
    const startedAt = new Date().toISOString();
    this.logger.log('=== CSE Historical Backfill START ===');

    const priceRowsBefore = await this.dailyPriceRepo.count();
    const targetStocks = await this.buildTargetList(symbols);
    this.logger.log(`Target stocks: ${targetStocks.length}`);

    const results: StockResult[] = [];
    let totalRowsInserted = 0;
    let totalRowsSkipped = 0;

    // Build symbol → DB stock map
    const allStocks = await this.stockRepo.find({ where: { is_active: true } });
    const stockMap = new Map<string, Stock>(
      allStocks.map((s) => [s.symbol, s]),
    );

    // Build symbol → CSE stockId map from tradeSummary
    const stockIdMap = await this.fetchStockIdMap();
    if (stockIdMap.size === 0) {
      this.logger.error('Could not fetch stockId map — aborting');
      return this.makeFailResult(
        startedAt,
        targetStocks.length,
        priceRowsBefore,
      );
    }

    for (let i = 0; i < targetStocks.length; i++) {
      const symbol = targetStocks[i];
      this.logger.log(`[${i + 1}/${targetStocks.length}] ${symbol}`);

      const stock = stockMap.get(symbol);
      if (!stock) {
        results.push({
          symbol,
          status: 'skipped',
          rowsInserted: 0,
          rowsSkipped: 0,
          message: 'not in stocks table',
        });
        continue;
      }

      const stockId = stockIdMap.get(symbol);
      if (!stockId) {
        results.push({
          symbol,
          status: 'skipped',
          rowsInserted: 0,
          rowsSkipped: 0,
          message: 'no CSE stockId in tradeSummary',
        });
        continue;
      }

      let rows: OhlcvRow[] = [];
      try {
        rows = await this.fetchChartData(stockId);
      } catch (err) {
        this.logger.warn(`${symbol}: API fetch failed: ${String(err)}`);
        results.push({
          symbol,
          status: 'failed',
          rowsInserted: 0,
          rowsSkipped: 0,
          message: String(err),
        });
        if (i < targetStocks.length - 1) await delay(DELAY_BETWEEN_STOCKS_MS);
        continue;
      }

      if (rows.length === 0) {
        results.push({
          symbol,
          status: 'failed',
          rowsInserted: 0,
          rowsSkipped: 0,
          message: 'no data returned',
        });
        if (i < targetStocks.length - 1) await delay(DELAY_BETWEEN_STOCKS_MS);
        continue;
      }

      const { inserted, skipped } = await this.batchInsert(stock.id, rows);
      totalRowsInserted += inserted;
      totalRowsSkipped += skipped;

      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      results.push({
        symbol,
        status: 'success',
        rowsInserted: inserted,
        rowsSkipped: skipped,
        dateFrom: sorted[0]?.date,
        dateTo: sorted[sorted.length - 1]?.date,
      });
      this.logger.log(`${symbol}: ${inserted} inserted, ${skipped} skipped`);

      if (i < targetStocks.length - 1) await delay(DELAY_BETWEEN_STOCKS_MS);
    }

    const priceRowsAfter = await this.dailyPriceRepo.count();
    const finishedAt = new Date().toISOString();
    const successCount = results.filter((r) => r.status === 'success').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    const result: BackfillHistoryResult = {
      startedAt,
      finishedAt,
      targetCount: targetStocks.length,
      successCount,
      failedCount,
      totalRowsInserted,
      totalRowsSkipped,
      priceRowsBefore,
      priceRowsAfter,
      results,
      reportPath: '',
    };

    result.reportPath = await this.writeReport(result);
    this.logger.log(
      `=== Backfill COMPLETE: ${successCount} success, ${failedCount} failed, ${totalRowsInserted} rows inserted ===`,
    );
    return result;
  }

  // ── Direct CSE API helpers (no Playwright) ─────────────────────────────────

  /** Fetch symbol → CSE numeric stockId map from tradeSummary. */
  private async fetchStockIdMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const res = await axios.post<{
        reqTradeSummery?: Array<{ id?: number; symbol?: string }>;
      }>(`${CSE_BASE_URL}/api/tradeSummary`, '', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          Referer: `${CSE_BASE_URL}/`,
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15_000,
      });
      for (const item of res.data?.reqTradeSummery ?? []) {
        if (item.symbol && item.id) map.set(item.symbol, item.id);
      }
      this.logger.log(`StockId map: ${map.size} entries`);
    } catch (err) {
      this.logger.error(`tradeSummary fetch failed: ${String(err)}`);
    }
    return map;
  }

  /** Fetch ~1 year of daily OHLCV bars using companyChartDataByStock period=5. */
  private async fetchChartData(stockId: number): Promise<OhlcvRow[]> {
    const res = await axios.post<{
      chartData?: Array<{
        t?: number;
        p?: number;
        o?: number;
        h?: number;
        l?: number;
        q?: number;
      }>;
    }>(
      `${CSE_BASE_URL}/api/companyChartDataByStock`,
      `stockId=${stockId}&period=5`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
          Referer: `${CSE_BASE_URL}/`,
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15_000,
      },
    );

    const rows: OhlcvRow[] = [];
    for (const item of res.data?.chartData ?? []) {
      if (!item.t || !item.p) continue;
      const dt = new Date(item.t);
      dt.setMinutes(dt.getMinutes() + 330); // UTC → SLT
      const tradeDate = dt.toISOString().split('T')[0];
      const close = item.p;
      rows.push({
        date: tradeDate,
        open: item.o ?? close,
        high: item.h ?? close,
        low: item.l ?? close,
        close,
        volume: item.q ?? 0,
        turnover: 0,
      });
    }

    // Deduplicate by date (keep last — post-close candle has accumulated volume)
    const dateMap = new Map<string, OhlcvRow>();
    for (const row of rows) dateMap.set(row.date, row);
    return Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  // ── Login (concise version of the proven flow) ────────────────────────────

  private async loginToCse(page: Page): Promise<boolean> {
    const username = process.env.CSE_USERNAME;
    const password = process.env.CSE_PASSWORD;

    if (!username || !password) {
      this.logger.warn('CSE_USERNAME or CSE_PASSWORD not set — cannot login');
      return false;
    }

    try {
      // Step 1: Homepage
      await page.goto(CSE_BASE_URL, {
        waitUntil: 'load',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(2000);

      // Step 2: Click MYCSE button
      for (const sel of [
        'a:has-text("MYCSE")',
        'button:has-text("MYCSE")',
        'a[href*="my-cse"]',
        'a[href*="mycse"]',
      ]) {
        try {
          await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
          await page.click(sel);
          break;
        } catch {
          /* try next */
        }
      }

      try {
        await page.waitForURL('**/my-cse**', { timeout: 12000 });
      } catch {
        await page.waitForTimeout(3000);
      }

      // Step 3: Wait for LOGIN button to render (MYCSE is a React SPA — button appears async)
      const loginBtnSelectors = [
        'button:has-text("LOGIN")',
        'a:has-text("LOGIN")',
        'button:has-text("Login")',
        'a:has-text("Login")',
        'button:has-text("SIGN IN")',
        'a:has-text("SIGN IN")',
      ];
      for (const sel of loginBtnSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000, state: 'visible' });
          break;
        } catch {
          /* try next */
        }
      }
      for (const sel of loginBtnSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            break;
          }
        } catch {
          /* try next */
        }
      }

      // Step 4: Handle identity.cse.lk if needed
      try {
        await page.waitForURL(
          (u) =>
            u.toString().includes('identity.cse.lk') ||
            u.toString().includes('idpconnect.cse.lk'),
          { timeout: 15000 },
        );
      } catch {
        await page.waitForTimeout(3000);
      }

      if (page.url().includes('identity.cse.lk')) {
        for (const sel of [
          'button:has-text("Continue with CSE")',
          'a:has-text("Continue with CSE")',
          'button:has-text("Login with CSE")',
          '[data-provider="cse"]',
        ]) {
          try {
            const el = await page.$(sel);
            if (el && (await el.isVisible())) {
              await el.click();
              break;
            }
          } catch {
            /* try next */
          }
        }
        try {
          await page.waitForURL('**idpconnect.cse.lk**', { timeout: 12000 });
        } catch {
          await page.waitForTimeout(3000);
        }
      }

      // Step 5: Fill credentials on idpconnect
      await page
        .waitForSelector(
          'input[type="text"], input[type="email"], input[name="Username"]',
          { timeout: 10000 },
        )
        .catch(() => null);

      let userFilled = false;
      for (const sel of [
        'input[name="Username"]',
        'input[name="username"]',
        'input[type="email"]',
        'input[type="text"]',
      ]) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            await el.fill('');
            await page.keyboard.type(username, { delay: 40 });
            userFilled = true;
            break;
          }
        } catch {
          /* try next */
        }
      }
      if (!userFilled) {
        this.logger.error('[login] Username field not found');
        return false;
      }

      const passEl = await page.$('input[type="password"]');
      if (!passEl || !(await passEl.isVisible())) {
        this.logger.error('[login] Password field not found');
        return false;
      }
      await passEl.click();
      await passEl.fill('');
      await page.keyboard.type(password, { delay: 40 });

      // Step 6: Submit
      for (const sel of [
        'button:has-text("Sign In")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button[type="submit"]',
        'input[type="submit"]',
      ]) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            break;
          }
        } catch {
          /* try next */
        }
      }

      // Wait for redirect back to cse.lk
      try {
        await page.waitForURL(
          (u) =>
            u.toString().includes('cse.lk') &&
            !u.toString().includes('idpconnect') &&
            !u.toString().includes('identity.cse'),
          { timeout: 30000 },
        );
      } catch {
        await page.waitForTimeout(5000);
      }

      if (page.url().includes('/callback')) {
        try {
          await page.waitForURL((u) => !u.toString().includes('/callback'), {
            timeout: 12000,
          });
        } catch {
          await page.waitForTimeout(4000);
        }
      }

      const finalUrl = page.url();
      const success =
        finalUrl.includes('cse.lk') &&
        !finalUrl.includes('idpconnect') &&
        !finalUrl.includes('identity.cse');
      this.logger.log(
        `[login] ${success ? 'SUCCESS' : 'UNCERTAIN'} — URL: ${finalUrl}`,
      );
      return success;
    } catch (err) {
      this.logger.error(`[login] Exception: ${String(err)}`);
      return false;
    }
  }

  // ── Batch insert with ON CONFLICT DO NOTHING ──────────────────────────────

  private async batchInsert(
    stockId: number,
    rows: OhlcvRow[],
  ): Promise<{ inserted: number; skipped: number }> {
    if (rows.length === 0) return { inserted: 0, skipped: 0 };

    // Deduplicate by date (keep last occurrence)
    const dateMap = new Map<string, OhlcvRow>();
    for (const row of rows) dateMap.set(row.date, row);
    const deduped = Array.from(dateMap.values());

    let inserted = 0;
    let skipped = 0;

    // Process in batches of BATCH_SIZE
    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const batch = deduped.slice(start, start + BATCH_SIZE);
      try {
        const result = await this.dailyPriceRepo
          .createQueryBuilder()
          .insert()
          .into(DailyPrice)
          .values(
            batch.map((row) => ({
              stock_id: stockId,
              trade_date: new Date(row.date),
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              previous_close: null,
              volume: row.volume,
              turnover: row.turnover,
              trades_count: 0,
            })),
          )
          .orIgnore()
          .execute();

        const affectedRows = result.raw?.length ?? 0;
        inserted += affectedRows;
        skipped += batch.length - affectedRows;
      } catch (err) {
        this.logger.warn(
          `Batch insert error (stockId=${stockId}, batch start=${start}): ${String(err)}`,
        );
        // Fall back to per-row inserts for this batch
        for (const row of batch) {
          try {
            await this.dailyPriceRepo
              .createQueryBuilder()
              .insert()
              .into(DailyPrice)
              .values({
                stock_id: stockId,
                trade_date: new Date(row.date),
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                previous_close: null,
                volume: row.volume,
                turnover: row.turnover,
                trades_count: 0,
              })
              .orIgnore()
              .execute();
            inserted++;
          } catch {
            skipped++;
          }
        }
      }
    }

    return { inserted, skipped };
  }

  // ── Target list builder ───────────────────────────────────────────────────

  private async buildTargetList(overrideSymbols?: string[]): Promise<string[]> {
    if (overrideSymbols && overrideSymbols.length > 0) return overrideSymbols;

    const seen = new Set<string>();
    const symbols: string[] = [];

    // 1. All Shariah-compliant stocks (151 stocks)
    try {
      const compliant = await this.stockRepo.find({
        where: { shariah_status: 'compliant', is_active: true },
        order: { market_cap: 'DESC' },
      });
      for (const s of compliant) {
        if (!seen.has(s.symbol)) {
          seen.add(s.symbol);
          symbols.push(s.symbol);
        }
      }
      this.logger.log(`Target list: ${compliant.length} compliant stocks`);
    } catch (err) {
      this.logger.warn(`Could not load compliant stocks: ${String(err)}`);
    }

    // 2. Top 50 by market cap (for broad coverage of non-compliant but large stocks)
    try {
      const top50 = await this.stockRepo.find({
        where: { is_active: true },
        order: { market_cap: 'DESC' },
        take: 50,
      });
      for (const s of top50) {
        if (!seen.has(s.symbol)) {
          seen.add(s.symbol);
          symbols.push(s.symbol);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not load top 50 stocks: ${String(err)}`);
    }

    return symbols;
  }

  // ── Report writer ─────────────────────────────────────────────────────────

  private async writeReport(result: BackfillHistoryResult): Promise<string> {
    const reportPath = path.resolve(
      process.cwd(),
      '../../tasks/backfill-report.md',
    );

    const successRows = result.results.filter((r) => r.status === 'success');
    const failedRows = result.results.filter((r) => r.status === 'failed');
    const skippedRows = result.results.filter((r) => r.status === 'skipped');

    const durationMs =
      new Date(result.finishedAt).getTime() -
      new Date(result.startedAt).getTime();
    const durationMin = (durationMs / 60000).toFixed(1);

    const lines: string[] = [
      '# CSE Historical Price Backfill Report',
      '',
      `**Run Date:** ${result.startedAt.split('T')[0]}`,
      `**Started:** ${result.startedAt}`,
      `**Finished:** ${result.finishedAt}`,
      `**Duration:** ${durationMin} minutes`,
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Target stocks | ${result.targetCount} |`,
      `| Successful | ${result.successCount} |`,
      `| Failed | ${result.failedCount} |`,
      `| Skipped | ${skippedRows.length} |`,
      `| Rows before backfill | ${result.priceRowsBefore.toLocaleString()} |`,
      `| Rows after backfill | ${result.priceRowsAfter.toLocaleString()} |`,
      `| **Net rows inserted** | **${result.totalRowsInserted.toLocaleString()}** |`,
      `| Duplicate rows skipped | ${result.totalRowsSkipped.toLocaleString()} |`,
      '',
      '## Successful Stocks',
      '',
      `| Symbol | Date From | Date To | Rows Inserted | Rows Skipped |`,
      `|--------|-----------|---------|---------------|--------------|`,
      ...successRows.map(
        (r) =>
          `| ${r.symbol} | ${r.dateFrom ?? '-'} | ${r.dateTo ?? '-'} | ${r.rowsInserted} | ${r.rowsSkipped} |`,
      ),
      '',
    ];

    if (failedRows.length > 0) {
      lines.push(
        '## Failed Stocks',
        '',
        '| Symbol | Reason |',
        '|--------|--------|',
      );
      for (const r of failedRows)
        lines.push(`| ${r.symbol} | ${r.message ?? 'no data returned'} |`);
      lines.push('');
    }

    if (skippedRows.length > 0) {
      lines.push(
        '## Skipped Stocks',
        '',
        '| Symbol | Reason |',
        '|--------|--------|',
      );
      for (const r of skippedRows)
        lines.push(`| ${r.symbol} | ${r.message ?? 'unknown'} |`);
      lines.push('');
    }

    lines.push(
      '## Data Coverage After Backfill',
      '',
      `Stocks with ≥ 250 rows (1 year): ${successRows.filter((r) => r.rowsInserted + r.rowsSkipped >= 250).length}`,
      `Stocks with ≥ 750 rows (3 years): ${successRows.filter((r) => r.rowsInserted + r.rowsSkipped >= 750).length}`,
      `Stocks with ≥ 1250 rows (5 years): ${successRows.filter((r) => r.rowsInserted + r.rowsSkipped >= 1250).length}`,
    );

    try {
      const dir = path.dirname(reportPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
      this.logger.log(`Report written to: ${reportPath}`);
    } catch (err) {
      this.logger.warn(`Could not write report: ${String(err)}`);
    }

    return reportPath;
  }

  // ── MYCSE structure probe ─────────────────────────────────────────────────

  /**
   * Diagnostic: Login to CSE, navigate to MYCSE dashboard, and return all
   * navigation links. Use this to discover the correct Historical Share Prices URL
   * before running the full backfill.
   *
   * POST /api/financials/probe-mycse
   */
  async probeMycseStructure(): Promise<Record<string, unknown>> {
    const logs: string[] = [];
    const log = (msg: string) => {
      this.logger.log(msg);
      logs.push(msg);
    };
    const screenshotDir = path.resolve(
      process.cwd(),
      '../../data/cse-fundamentals',
    );

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);

      // Capture all network requests
      const networkUrls: string[] = [];
      page.on('request', (req) => {
        networkUrls.push(`${req.method()} ${req.url()}`);
      });

      log('=== MYCSE Probe START ===');
      const loggedIn = await this.loginToCse(page);
      log(`Login result: ${loggedIn}, URL: ${page.url()}`);

      if (!loggedIn) {
        return { ok: false, error: 'Login failed', logs };
      }

      // Navigate to MYCSE dashboard root
      log('Navigating to /my-cse dashboard...');
      await page.goto(`${CSE_BASE_URL}/my-cse`, {
        waitUntil: 'networkidle',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(4000);

      // ── Fetch Next.js app build manifest to discover all routes ─────────────
      log('--- Fetching Next.js route manifest ---');
      let mycseRoutes: string[] = [];
      try {
        const manifestResp = await page.request.get(
          `${CSE_BASE_URL}/_next/app-build-manifest.json`,
        );
        if (manifestResp.ok()) {
          const manifest = (await manifestResp.json()) as Record<
            string,
            unknown
          >;
          mycseRoutes = Object.keys(manifest.pages ?? manifest)
            .filter(
              (k) =>
                k.toLowerCase().includes('my-cse') ||
                k.toLowerCase().includes('mycse'),
            )
            .slice(0, 30);
          log(`Next.js MYCSE routes: ${JSON.stringify(mycseRoutes)}`);
        }
      } catch {
        /* ignore */
      }
      // Also try build-manifest.json (pages router)
      try {
        const bm = await page.request.get(
          `${CSE_BASE_URL}/_next/build-manifest.json`,
        );
        if (bm.ok()) {
          const manifest = (await bm.json()) as {
            pages?: Record<string, unknown>;
          };
          const allRoutes = Object.keys(manifest.pages ?? {});
          const histRoutes = allRoutes.filter(
            (k) =>
              k.toLowerCase().includes('histor') ||
              k.toLowerCase().includes('my-cse') ||
              k.toLowerCase().includes('mycse'),
          );
          log(`build-manifest MYCSE routes: ${JSON.stringify(histRoutes)}`);
          mycseRoutes = [...new Set([...mycseRoutes, ...histRoutes])];
        }
      } catch {
        /* ignore */
      }

      // Probe additional MYCSE URL candidates
      const extraMycseUrls = [
        '/my-cse/dashboard',
        '/my-cse/home',
        '/my-cse/user-dashboard',
        '/my-cse/historical-data',
        '/my-cse/price-history',
        '/my-cse/historical-prices',
        '/my-cse/share-prices',
        '/my-cse/watchlist',
        '/my-cse/portfolio',
        ...mycseRoutes.map((r) => r.replace(/\[.*?\]/g, 'AEL')),
      ];
      for (const u of [...new Set(extraMycseUrls)].slice(0, 12)) {
        try {
          await page.goto(`${CSE_BASE_URL}${u}`, {
            waitUntil: 'domcontentloaded',
            timeout: 8000,
          });
          await page.waitForTimeout(1500);
          const title = await page.title().catch(() => '');
          const hasContent = !(await page
            .$('*:has-text("404")')
            .then((el) => !!el)
            .catch(() => false));
          log(`MYCSE route ${u}: title="${title}", has404=${!hasContent}`);
        } catch {
          /* skip */
        }
      }

      // Navigate back to MYCSE home for the remaining checks
      await page.goto(`${CSE_BASE_URL}/my-cse`, {
        waitUntil: 'networkidle',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(4000);
      const mycseUrl = page.url();
      log(`MYCSE URL after navigation: ${mycseUrl}`);

      // Screenshot
      const ssPath = path.join(screenshotDir, 'probe-mycse-dashboard.png');
      await page.screenshot({ path: ssPath, fullPage: true }).catch(() => null);
      log(`Screenshot saved: ${ssPath}`);

      // Collect all links on the MYCSE dashboard
      const allLinks = await page
        .$$eval('a, button, [role="menuitem"], [role="link"], nav *', (els) =>
          els
            .map((el) => ({
              text: (el.textContent ?? '').trim().slice(0, 80),
              href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
              class: (el.className ?? '').slice(0, 60),
              id: el.id ?? '',
            }))
            .filter((l) => l.text.length > 0),
        )
        .catch(() => []);

      // Filter for historical-related links
      const historicalLinks = allLinks.filter(
        (l) =>
          l.text.toLowerCase().includes('histor') ||
          l.href.toLowerCase().includes('histor') ||
          l.text.toLowerCase().includes('price') ||
          l.text.toLowerCase().includes('share price'),
      );

      log(`All links count: ${allLinks.length}`);
      log(`Historical-related links: ${JSON.stringify(historicalLinks)}`);

      // Look for "Historical" in page text
      const pageText = await page.textContent('body').catch(() => '');
      const historicalMentions = (pageText ?? '')
        .split('\n')
        .filter((line) => line.toLowerCase().includes('histor'))
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .slice(0, 10);

      log(
        `Historical mentions in page text: ${JSON.stringify(historicalMentions)}`,
      );

      // Try navigating to historical prices via common patterns
      const candidateUrls = [
        `${CSE_BASE_URL}/my-cse/historical-share-prices`,
        `${CSE_BASE_URL}/my-cse/historical`,
        `${CSE_BASE_URL}/my-cse/prices`,
        `${CSE_BASE_URL}/my-cse/market-data`,
      ];

      const urlResults: Array<{
        url: string;
        finalUrl: string;
        title: string;
        hasForm: boolean;
      }> = [];
      for (const url of candidateUrls) {
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          await page.waitForTimeout(2000);
          const finalUrl = page.url();
          const title = await page.title().catch(() => '');
          const hasForm = await page
            .$('form, input[type="text"], input[type="date"]')
            .then((el) => !!el)
            .catch(() => false);
          urlResults.push({ url, finalUrl, title, hasForm });
          log(
            `URL probe: ${url} → ${finalUrl} | title: "${title}" | hasForm: ${hasForm}`,
          );
        } catch (err) {
          urlResults.push({
            url,
            finalUrl: 'error',
            title: String(err),
            hasForm: false,
          });
        }
      }

      // ── Test date-range params on the known chart API ────────────────────
      log('--- Testing companyChartDataByStock with date range params ---');
      const dateRangeTests: Array<{
        label: string;
        itemCount: number;
        firstDate: string;
        lastDate: string;
        statusCode: number;
      }> = [];

      const dateRangeVariants = [
        { label: 'period=1', body: 'stockId=2065&period=1' },
        { label: 'period=2', body: 'stockId=2065&period=2' },
        { label: 'period=3', body: 'stockId=2065&period=3' },
        { label: 'period=4', body: 'stockId=2065&period=4' },
        { label: 'period=5', body: 'stockId=2065&period=5' },
        { label: 'period=11', body: 'stockId=2065&period=11' },
        { label: 'period=12', body: 'stockId=2065&period=12' },
        { label: 'period=20', body: 'stockId=2065&period=20' },
        { label: 'period=99', body: 'stockId=2065&period=99' },
        {
          label: 'symbol+period=5',
          body: 'symbol=AEL.N0000&period=5',
        },
        {
          label: 'stockId+from/to',
          body: 'stockId=2065&from=2019-01-01&to=2026-03-28',
        },
      ];

      for (const v of dateRangeVariants) {
        try {
          const resp = await page.request.post(
            `${CSE_BASE_URL}/api/companyChartDataByStock`,
            {
              data: v.body,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            },
          );
          const json = await resp.json().catch(() => ({}));
          const items: Array<Record<string, unknown>> =
            ((json as Record<string, unknown>).chartData as Array<
              Record<string, unknown>
            >) ?? [];
          const firstDate =
            items.length > 0
              ? new Date(items[0].t as number).toISOString().split('T')[0]
              : '';
          const lastDate =
            items.length > 0
              ? new Date(items[items.length - 1].t as number)
                  .toISOString()
                  .split('T')[0]
              : '';
          dateRangeTests.push({
            label: v.label,
            itemCount: items.length,
            firstDate,
            lastDate,
            statusCode: resp.status(),
          });
          log(
            `  [${v.label}] ${resp.status()} → ${items.length} items, ${firstDate} to ${lastDate}`,
          );
        } catch (err) {
          log(`  [${v.label}] ERROR: ${String(err)}`);
        }
      }

      // ── Navigate to MYCSE historical-share-prices and interact with form ─────
      log('--- Navigating to MYCSE historical-share-prices ---');
      const histNetworkRequests: Array<{
        method: string;
        url: string;
        body: string;
      }> = [];
      const histNetworkResponses: Array<{
        url: string;
        body: string;
        status: number;
      }> = [];

      page.on('request', (req) => {
        histNetworkRequests.push({
          method: req.method(),
          url: req.url(),
          body: req.postData() ?? '',
        });
      });
      page.on('response', async (res) => {
        const url = res.url();
        if (url.includes('/api/')) {
          try {
            const body = await res.text();
            histNetworkResponses.push({
              url,
              body: body.slice(0, 300),
              status: res.status(),
            });
          } catch {
            /* ignore */
          }
        }
      });

      const histPageUrl = `${CSE_BASE_URL}/my-cse/historical-share-prices`;
      await page.goto(histPageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      // Wait up to 15s for React to render form elements
      await page
        .waitForSelector('input, select, button', { timeout: 15000 })
        .catch(() => null);
      await page.waitForTimeout(5000);

      const histSsPath = path.join(screenshotDir, 'probe-mycse-hist-page.png');
      await page
        .screenshot({ path: histSsPath, fullPage: true })
        .catch(() => null);
      log(`Screenshot: ${histSsPath}`);

      // Dump all form elements
      const formElements = await page
        .evaluate(() => {
          const els = Array.from(
            document.querySelectorAll(
              'input, select, textarea, button, [role="combobox"], [role="listbox"]',
            ),
          );
          return els.map((el) => ({
            tag: el.tagName,
            type: (el as HTMLInputElement).type ?? '',
            name: (el as HTMLInputElement).name ?? '',
            id: el.id ?? '',
            placeholder: (el as HTMLInputElement).placeholder ?? '',
            value: (el as HTMLInputElement).value ?? '',
            class: (el.className ?? '').slice(0, 80),
            text: (el.textContent ?? '').trim().slice(0, 60),
          }));
        })
        .catch(() => []);
      log(
        `Form elements (${formElements.length}): ${JSON.stringify(formElements.slice(0, 20))}`,
      );

      // Check page text for clues
      const histPageText =
        (await page.textContent('body').catch(() => '')) ?? '';
      const histHeadings = await page
        .$$eval(
          'h1, h2, h3, h4, h5, label, [class*="title"], [class*="header"]',
          (els) =>
            els
              .map((el) => (el.textContent ?? '').trim())
              .filter((t) => t.length > 0 && t.length < 100),
        )
        .catch(() => []);
      log(`Page headings: ${JSON.stringify(histHeadings.slice(0, 20))}`);

      // Get all navigation/menu links visible on this page
      const sidebarLinks = await page
        .$$eval('a, [role="menuitem"], nav *', (els) =>
          els
            .map((el) => ({
              text: (el.textContent ?? '').trim().slice(0, 60),
              href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
            }))
            .filter((l) => l.text.length > 0),
        )
        .catch(() => []);
      log(`Sidebar/nav links: ${JSON.stringify(sidebarLinks.slice(0, 30))}`);

      // Try to interact: pick AEL from any dropdown/select
      let formFilled = false;
      try {
        // Try select element for stock
        const selectEl = await page.$('select').catch(() => null);
        if (selectEl) {
          await selectEl
            .selectOption({ label: 'AEL.N0000' })
            .catch(() => selectEl.selectOption({ index: 1 }));
          formFilled = true;
          log('Filled select with AEL.N0000');
        }

        // Try text input for stock symbol
        const inputEl = await page
          .$('input[type="text"], input:not([type])')
          .catch(() => null);
        if (inputEl && !formFilled) {
          await inputEl.fill('AEL').catch(() => null);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
          formFilled = true;
          log('Filled text input with AEL');
        }

        if (formFilled) {
          // Fill date fields if present
          const dateInputs = await page
            .$$(
              'input[type="date"], input[placeholder*="date" i], input[placeholder*="from" i], input[placeholder*="to" i]',
            )
            .catch(() => []);
          if (dateInputs.length >= 1) {
            await dateInputs[0].fill('2019-01-01').catch(() => null);
            log('Filled from-date: 2019-01-01');
          }
          if (dateInputs.length >= 2) {
            await dateInputs[1].fill('2026-03-28').catch(() => null);
            log('Filled to-date: 2026-03-28');
          }

          // Click submit/search button
          const submitBtn = await page
            .$(
              'button[type="submit"], button:has-text("Search"), button:has-text("Get"), button:has-text("Download"), input[type="submit"]',
            )
            .catch(() => null);
          if (submitBtn) {
            await submitBtn.click();
            await page.waitForTimeout(5000);
            log('Clicked submit button');
          }
        }
      } catch (formErr) {
        log(`Form interaction error: ${String(formErr)}`);
      }

      const histFilledSsPath = path.join(
        screenshotDir,
        'probe-mycse-historical-filled.png',
      );
      await page
        .screenshot({ path: histFilledSsPath, fullPage: true })
        .catch(() => null);
      log(`Post-interaction screenshot: ${histFilledSsPath}`);

      // Capture any table headers from results
      const tableHeaders = await page
        .$$eval('table th, thead td', (ths) =>
          ths
            .map((th) => (th.textContent ?? '').trim())
            .filter((t) => t.length > 0),
        )
        .catch(() => []);
      log(`Table headers: ${JSON.stringify(tableHeaders)}`);

      const apiResponseSample = histNetworkResponses
        .filter((r) => r.url.includes('/api/'))
        .slice(0, 15);
      log(
        `API calls captured: ${apiResponseSample.map((r) => `${r.url} [${r.status}]`).join(', ')}`,
      );

      // ── Also check page URL/hash/state after React routing ───────────────────
      const finalHistUrl = page.url();
      log(`Final URL after interaction: ${finalHistUrl}`);

      await page.close();
      await context.close();

      return {
        ok: true,
        loginUrl: mycseUrl,
        allLinksCount: allLinks.length,
        historicalLinks,
        historicalMentions:
          historicalMentions.length > 0
            ? historicalMentions[0].slice(0, 500)
            : [],
        urlResults,
        networkRequestsCount: networkUrls.length,
        networkSample: networkUrls
          .filter(
            (u) =>
              u.toLowerCase().includes('histor') ||
              u.toLowerCase().includes('api'),
          )
          .slice(0, 20),
        screenshotPath: ssPath,
        // Date range API tests
        dateRangeTests,
        // Historical prices page specific
        histPageUrl,
        finalHistUrl,
        histSsPath,
        histFilledSsPath,
        formElements: formElements.slice(0, 30),
        histPageHeadings: histHeadings.slice(0, 20),
        histPageTextSnippet: histPageText.slice(0, 500),
        sidebarLinks: sidebarLinks.slice(0, 30),
        tableHeaders,
        apiResponseSample: apiResponseSample.map((r) => ({
          url: r.url,
          status: r.status,
          bodyPreview: r.body.slice(0, 300),
        })),
        logs,
      };
    } catch (err) {
      log(`Exception: ${String(err)}`);
      return { ok: false, error: String(err), logs };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ── Error result factory ──────────────────────────────────────────────────

  private makeFailResult(
    startedAt: string,
    targetCount: number,
    priceRowsBefore: number,
  ): BackfillHistoryResult {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      targetCount,
      successCount: 0,
      failedCount: targetCount,
      totalRowsInserted: 0,
      totalRowsSkipped: 0,
      priceRowsBefore,
      priceRowsAfter: priceRowsBefore,
      results: [],
      reportPath: '',
    };
  }
}
