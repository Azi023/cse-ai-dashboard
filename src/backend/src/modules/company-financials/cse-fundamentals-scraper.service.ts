import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, Browser, BrowserContext, Page, Frame } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { SHARIAH_WHITELIST } from '../shariah-screening/blacklist';
import { CompanyFinancial, Stock } from '../../entities';

// ── Constants ────────────────────────────────────────────────────────────────

const CSE_BASE_URL = 'https://www.cse.lk';
const FUNDAMENTALS_DIR = path.resolve(
  process.cwd(),
  '../../data/cse-fundamentals',
);
const DELAY_BETWEEN_STOCKS_MS = 2000;
const WIDGET_WAIT_MS = 8000;
const PAGE_TIMEOUT_MS = 45_000;

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface FundamentalsData {
  symbol: string;
  scrapedAt: string;
  // Valuation
  market_cap?: number | null;
  enterprise_value?: number | null;
  pe_ratio?: number | null;
  ps_ratio?: number | null;
  pb_ratio?: number | null;
  // Income Statement
  total_revenue?: number | null;
  revenue_per_share?: number | null;
  gross_profit?: number | null;
  operating_income?: number | null;
  net_income?: number | null;
  eps_diluted?: number | null;
  // Balance Sheet
  total_assets?: number | null;
  total_liabilities?: number | null;
  total_equity?: number | null;
  total_debt?: number | null;
  // Cash Flow
  operating_cf?: number | null;
  investing_cf?: number | null;
  financing_cf?: number | null;
  free_cf?: number | null;
  capex?: number | null;
  // Profitability
  gross_margin?: number | null;
  operating_margin?: number | null;
  pretax_margin?: number | null;
  net_margin?: number | null;
  // Efficiency
  roa?: number | null;
  roe?: number | null;
  roic?: number | null;
  // Price History
  beta?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  avg_volume?: number | null;
  // Dividends
  dividend_yield?: number | null;
  dividends_per_share?: number | null;
  // Raw key/value pairs from scrape
  raw?: Record<string, string>;
}

export interface ScrapeResult {
  symbol: string;
  status: 'success' | 'partial' | 'failed';
  message?: string;
  data?: FundamentalsData;
  screenshotPath?: string;
  jsonPath?: string;
  dbStatus?: 'upserted' | 'skipped' | 'error';
}

export interface ScrapeAllResult {
  total: number;
  success: number;
  partial: number;
  failed: number;
  tier2TriggerStatus: string;
  results: ScrapeResult[];
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CseFundamentalsScraperService {
  private readonly logger = new Logger(CseFundamentalsScraperService.name);

  constructor(
    @InjectRepository(CompanyFinancial)
    private readonly financialRepo: Repository<CompanyFinancial>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
  ) {}

  async scrapeAll(singleSymbol?: string): Promise<ScrapeAllResult> {
    const symbols = singleSymbol
      ? [singleSymbol]
      : await this.buildTargetList();
    this.logger.log(
      `CSE fundamentals scrape starting — ${symbols.length} symbols`,
    );

    ensureDir(FUNDAMENTALS_DIR);

    let browser: Browser | null = null;
    const results: ScrapeResult[] = [];

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      // Login to MYCSE once — cookies persist across all pages in this context
      const loggedIn = await this.loginToCse(context);
      this.logger.log(
        loggedIn
          ? 'Proceeding with MYCSE session — full fundamental data expected'
          : 'Proceeding without MYCSE session — partial data only (header metrics)',
      );

      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        this.logger.log(`[${i + 1}/${symbols.length}] Scraping ${symbol}...`);

        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TIMEOUT_MS);

        const result = await this.scrapeSymbol(page, symbol);
        results.push(result);

        if (result.data) {
          result.dbStatus = await this.upsertFundamentals(symbol, result.data);
        }

        await page.close();

        if (i < symbols.length - 1) {
          await delay(DELAY_BETWEEN_STOCKS_MS);
        }
      }

      await context.close();
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          /* ignore close errors */
        }
      }
    }

    const success = results.filter((r) => r.status === 'success').length;
    const partial = results.filter((r) => r.status === 'partial').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    await this.writeReport(results);

    // Trigger Tier 2 screening now that financial data has been refreshed
    const tier2TriggerStatus = await this.triggerTier2Screening();

    this.logger.log(
      `Scrape complete — success: ${success}, partial: ${partial}, failed: ${failed}`,
    );

    return {
      total: symbols.length,
      success,
      partial,
      failed,
      tier2TriggerStatus,
      results,
    };
  }

  // ── MYCSE login ───────────────────────────────────────────────────────────

  private async loginToCse(context: BrowserContext): Promise<boolean> {
    const username = process.env.CSE_USERNAME;
    const password = process.env.CSE_PASSWORD;

    if (!username || !password) {
      this.logger.warn(
        'CSE_USERNAME or CSE_PASSWORD not set — skipping MYCSE login',
      );
      return false;
    }

    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    // Helper: screenshot at each step for diagnostics
    const ss = async (name: string): Promise<void> => {
      try {
        await page.screenshot({
          path: path.join(FUNDAMENTALS_DIR, name),
          fullPage: false,
        });
        this.logger.log(`[login] Screenshot: ${name} — URL: ${page.url()}`);
      } catch {
        /* non-critical */
      }
    };

    try {
      // ── Step 1: Load CSE homepage ──────────────────────────────────────────
      await page.goto(CSE_BASE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(2000);
      await ss('login-step-1-homepage.png');

      // Dump every anchor's href+text so we can see what MYCSE link looks like
      const allLinks = await page
        .$$eval('a', (els) =>
          els.map((el) => ({
            href: el.getAttribute('href') ?? '',
            text: (el.textContent ?? '').trim().slice(0, 60),
          })),
        )
        .catch(() => [] as { href: string; text: string }[]);
      const mycseLinks = allLinks.filter(
        (l) =>
          l.href.toLowerCase().includes('mycse') ||
          l.href.toLowerCase().includes('identity.cse') ||
          l.text.toLowerCase().includes('mycse'),
      );
      this.logger.log(
        `[login] MYCSE-related links: ${JSON.stringify(mycseLinks)}`,
      );

      // ── Step 2: Click MYCSE button ─────────────────────────────────────────
      const mycseSelectors = [
        'a:has-text("MYCSE")',
        'button:has-text("MYCSE")',
        'a[href*="identity.cse"]',
        'a[href*="mycse"]',
        '[class*="mycse"]',
      ];

      let clicked = false;
      for (const sel of mycseSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            clicked = true;
            this.logger.log(`[login] Clicked MYCSE via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!clicked) {
        this.logger.warn('[login] MYCSE button not found — skipping login');
        await ss('login-step-2-mycse-not-found.png');
        return false;
      }

      // Wait for identity.cse.lk OAuth page
      try {
        await page.waitForURL('**identity.cse.lk**', { timeout: 15000 });
      } catch {
        await page.waitForTimeout(4000);
      }
      await ss('login-step-2-identity.png');
      this.logger.log(`[login] Step 2 URL: ${page.url()}`);

      // ── Step 3: Click "Continue with CSE" ─────────────────────────────────
      // Dump all button/link texts to diagnose what options are available
      const allButtonTexts = await page
        .$$eval('button, a', (els) =>
          els
            .map((el) => (el.textContent ?? '').trim())
            .filter((t) => t.length > 0),
        )
        .catch(() => [] as string[]);
      this.logger.log(
        `[login] Buttons on identity page: ${JSON.stringify(allButtonTexts)}`,
      );

      const cseLoginSelectors = [
        'button:has-text("Continue with CSE")',
        'a:has-text("Continue with CSE")',
        'button:has-text("CSE")',
        'a:has-text("CSE")',
      ];

      let cseClicked = false;
      for (const sel of cseLoginSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            cseClicked = true;
            this.logger.log(`[login] Clicked "Continue with CSE" via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      // Fallback: iterate all visible buttons, pick the one with CSE (not Apple/Google)
      if (!cseClicked) {
        try {
          const buttons = await page.$$(
            'button, a[class*="btn"], [role="button"]',
          );
          for (const btn of buttons) {
            const text = ((await btn.textContent()) ?? '').toLowerCase().trim();
            const isAppleOrGoogle =
              text.includes('apple') || text.includes('google');
            if (
              text.includes('cse') &&
              !isAppleOrGoogle &&
              (await btn.isVisible())
            ) {
              await btn.click();
              cseClicked = true;
              this.logger.log(
                `[login] Clicked CSE button via fallback: "${text}"`,
              );
              break;
            }
          }
        } catch (err) {
          this.logger.warn(
            `[login] Fallback button search failed: ${String(err)}`,
          );
        }
      }

      await ss('login-step-3-continue-cse.png');

      if (!cseClicked) {
        this.logger.warn(
          '[login] "Continue with CSE" not found — skipping login',
        );
        return false;
      }

      // Wait for idpconnect.cse.lk login form
      try {
        await page.waitForURL('**idpconnect.cse.lk**', { timeout: 15000 });
      } catch {
        await page.waitForTimeout(4000);
      }
      await ss('login-step-4-idpconnect.png');
      this.logger.log(`[login] Step 4 URL: ${page.url()}`);

      // ── Step 4: Fill Username + Password ──────────────────────────────────
      // Wait for form inputs to appear
      await page
        .waitForSelector(
          'input[type="text"], input[type="email"], input[name="Username"]',
          {
            timeout: 10000,
          },
        )
        .catch(() => null);

      const usernameSelectors = [
        'input[name="Username"]',
        'input[name="username"]',
        'input[id="Username"]',
        'input[id="username"]',
        'input[placeholder*="username" i]',
        'input[placeholder*="email" i]',
        'input[type="email"]',
        'input[type="text"]',
      ];

      let usernameField = null;
      for (const sel of usernameSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            usernameField = el;
            this.logger.log(`[login] Username field via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!usernameField) {
        const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
        this.logger.warn(
          `[login] No username field. Page text: ${bodyText.slice(0, 500)}`,
        );
        await ss('login-step-4-no-form.png');
        return false;
      }

      await usernameField.fill(username);

      const passField = await page.$('input[type="password"]');
      if (!passField || !(await passField.isVisible())) {
        this.logger.warn('[login] No password field on idpconnect form');
        return false;
      }
      await passField.fill(password);

      await ss('login-step-5-fill-creds.png');

      // ── Step 5: Click "Sign In" ────────────────────────────────────────────
      const signInSelectors = [
        'button:has-text("Sign In")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'input[type="submit"]',
        'button[type="submit"]',
      ];

      let submitted = false;
      for (const sel of signInSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            submitted = true;
            this.logger.log(`[login] Clicked Sign In via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!submitted) {
        this.logger.warn('[login] Sign In button not found');
        return false;
      }

      // ── Step 6: Wait for redirect back to cse.lk ──────────────────────────
      try {
        await page.waitForURL('https://www.cse.lk/**', { timeout: 30000 });
      } catch {
        try {
          await page.waitForURL('**cse.lk**', { timeout: 10000 });
        } catch {
          await page.waitForTimeout(5000);
        }
      }

      await ss('login-step-6-post-signin.png');

      const finalUrl = page.url();
      const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
      this.logger.log(`[login] Step 6 final URL: ${finalUrl}`);

      // Save the definitive login-result screenshot
      try {
        await page.screenshot({
          path: path.join(FUNDAMENTALS_DIR, 'login-result.png'),
        });
      } catch {
        /* non-critical */
      }

      const loginSucceeded =
        finalUrl.includes('cse.lk') &&
        !finalUrl.toLowerCase().includes('/login') &&
        !finalUrl.toLowerCase().includes('idpconnect') &&
        !finalUrl.toLowerCase().includes('identity.cse');

      const hasLogoutIndicator =
        bodyText.toLowerCase().includes('logout') ||
        bodyText.toLowerCase().includes('sign out') ||
        bodyText.toLowerCase().includes('my account');

      if (loginSucceeded || hasLogoutIndicator) {
        this.logger.log(
          `[login] MYCSE login SUCCESS — URL: ${finalUrl}, logoutIndicator: ${hasLogoutIndicator}`,
        );
        return true;
      }

      this.logger.warn(
        `[login] MYCSE login FAILED — URL: ${finalUrl}. Partial data only.`,
      );
      return false;
    } catch (err) {
      this.logger.warn(`[login] MYCSE login error: ${String(err)}`);
      await ss('login-error.png');
      return false;
    } finally {
      await page.close();
    }
  }

  // ── Build target symbol list ──────────────────────────────────────────────

  private async buildTargetList(): Promise<string[]> {
    const seen = new Set<string>();
    const symbols: string[] = [];

    // 1. Almas Shariah whitelist stocks (priority)
    for (const entry of SHARIAH_WHITELIST) {
      if (!seen.has(entry.symbol)) {
        seen.add(entry.symbol);
        symbols.push(entry.symbol);
      }
    }

    // 2. Top 20 most-traded (by market cap as proxy) — excluding whitelist
    try {
      const topTraded = await this.stockRepo.find({
        where: { is_active: true },
        order: { market_cap: 'DESC' },
        take: 50,
      });

      let added = 0;
      for (const stock of topTraded) {
        if (!seen.has(stock.symbol)) {
          seen.add(stock.symbol);
          symbols.push(stock.symbol);
          added++;
          if (added >= 20) break;
        }
      }
    } catch (err) {
      this.logger.warn(`Could not load top-traded stocks: ${String(err)}`);
    }

    return symbols;
  }

  // ── Scrape a single symbol ────────────────────────────────────────────────

  private async scrapeSymbol(
    page: Page,
    symbol: string,
  ): Promise<ScrapeResult> {
    const safeSymbol = symbol.replace(/\./g, '_');
    const screenshotPath = path.join(FUNDAMENTALS_DIR, `${safeSymbol}.png`);
    const jsonPath = path.join(FUNDAMENTALS_DIR, `${safeSymbol}.json`);

    try {
      const url = `${CSE_BASE_URL}/company-profile?symbol=${encodeURIComponent(symbol)}`;
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(2000);

      // Extract header data (market cap, day range) from the main page before tab navigation
      const headerData = await extractHeaderData(page, this.logger);

      // Click "Financials" tab
      const financialsClicked = await clickTabByText(page, [
        'Financials',
        'Financial',
      ]);
      if (!financialsClicked) {
        this.logger.warn(`${symbol}: Could not find Financials tab`);
      }
      await page.waitForTimeout(1500);

      // Click "Fundamental Data" sub-tab
      const fundamentalClicked = await clickTabByText(page, [
        'Fundamental Data',
        'Fundamentals',
        'Fundamental',
      ]);
      if (!fundamentalClicked) {
        this.logger.warn(`${symbol}: Could not find Fundamental Data sub-tab`);
      }

      // Scroll down so the TradingView widget (below fold) enters the viewport
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);

      // Wait for TradingView widget to load — try known content selectors first
      await Promise.race([
        page
          .waitForSelector('text=P/E ratio', { timeout: 12000 })
          .catch(() => null),
        page
          .waitForSelector('text=Total revenue', { timeout: 12000 })
          .catch(() => null),
        page
          .waitForSelector('text=Net income', { timeout: 12000 })
          .catch(() => null),
        page.waitForTimeout(WIDGET_WAIT_MS),
      ]);

      // Log all frames so we can diagnose iframe structure
      const frames = page.frames();
      this.logger.log(`${symbol}: ${frames.length} frames on page`);
      for (const f of frames) {
        const fUrl = f.url();
        if (fUrl && fUrl !== 'about:blank') {
          this.logger.log(`  Frame: ${fUrl.slice(0, 120)}`);
        }
      }

      // Log last 2000 chars of page body to diagnose widget content
      try {
        const pageText = await page.textContent('body');
        if (pageText) {
          this.logger.log(
            `${symbol}: Page text (last 2000 chars): ${pageText.slice(-2000).replace(/\s+/g, ' ')}`,
          );
        }
      } catch {
        /* non-critical */
      }

      // Full-page screenshot after scrolling and waiting
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch {
        /* non-critical */
      }

      // Extract financial metrics from TradingView widget
      const widgetData = await extractTradingViewData(page, this.logger);

      // Merge header data (lower priority) with widget data (higher priority)
      const merged: Record<string, string> = { ...headerData, ...widgetData };

      const data: FundamentalsData = {
        symbol,
        scrapedAt: new Date().toISOString(),
        ...mapRawToFundamentals(merged),
        raw: merged,
      };

      // Save JSON output
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

      const hasNumericData = Object.entries(data).some(
        ([k, v]) =>
          k !== 'raw' &&
          k !== 'symbol' &&
          k !== 'scrapedAt' &&
          typeof v === 'number' &&
          v !== null,
      );

      return {
        symbol,
        status: hasNumericData ? 'success' : 'partial',
        data,
        screenshotPath,
        jsonPath,
        message: hasNumericData
          ? undefined
          : 'Page loaded but no numeric data extracted (widget may not have loaded)',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`${symbol}: scrape failed — ${msg}`);
      return { symbol, status: 'failed', message: msg };
    }
  }

  // ── Upsert into company_financials ────────────────────────────────────────

  private async upsertFundamentals(
    symbol: string,
    data: FundamentalsData,
  ): Promise<'upserted' | 'skipped' | 'error'> {
    try {
      const fiscalYear = String(new Date().getFullYear());

      const existing = await this.financialRepo.findOne({
        where: { symbol, fiscal_year: fiscalYear, quarter: 'ANNUAL' },
      });

      // Map scraped data to entity fields
      const fields: Partial<CompanyFinancial> = {
        total_revenue: data.total_revenue ?? null,
        net_profit: data.net_income ?? null,
        earnings_per_share: data.eps_diluted ?? null,
        total_assets: data.total_assets ?? null,
        total_liabilities: data.total_liabilities ?? null,
        shareholders_equity: data.total_equity ?? null,
        interest_bearing_debt: data.total_debt ?? null,
        pe_ratio: data.pe_ratio ?? null,
        pb_ratio: data.pb_ratio ?? null,
        return_on_equity: data.roe ?? null,
        dividend_yield: data.dividend_yield ?? null,
        source: 'CSE_WEBSITE',
        report_date: new Date(),
      };

      if (existing) {
        // Never overwrite MANUAL entries — only update CSE_API or CSE_WEBSITE records
        if (existing.source === 'MANUAL') {
          this.logger.log(
            `${symbol}: Skipping upsert — manual record exists for ${fiscalYear}`,
          );
          return 'skipped';
        }
        Object.assign(existing, fields);
        await this.financialRepo.save(existing);
      } else {
        const record = this.financialRepo.create({
          symbol,
          fiscal_year: fiscalYear,
          quarter: 'ANNUAL',
          ...fields,
        });
        await this.financialRepo.save(record);
      }

      // Update stock entity with price history data
      try {
        const stock = await this.stockRepo.findOne({ where: { symbol } });
        if (stock) {
          if (data.beta != null) stock.beta = data.beta;
          if (data.week52_high != null) stock.week52_high = data.week52_high;
          if (data.week52_low != null) stock.week52_low = data.week52_low;
          await this.stockRepo.save(stock);
        }
      } catch {
        /* non-critical — stock update failure doesn't fail the main upsert */
      }

      return 'upserted';
    } catch (err) {
      this.logger.error(`${symbol}: DB upsert failed — ${String(err)}`);
      return 'error';
    }
  }

  // ── Trigger Tier 2 Shariah screening ─────────────────────────────────────

  private async triggerTier2Screening(): Promise<string> {
    try {
      const resp = await fetch(
        'http://localhost:3001/api/shariah/run-tier2-screening',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (resp.ok) {
        const body = (await resp.json()) as Record<string, unknown>;
        const screened = body['screened'] ?? body['processed'] ?? '?';
        return `Triggered — ${String(screened)} stocks screened`;
      }
      return `HTTP ${resp.status}`;
    } catch (err) {
      return `Failed: ${String(err)}`;
    }
  }

  // ── Write markdown report ─────────────────────────────────────────────────

  private async writeReport(results: ScrapeResult[]): Promise<void> {
    const reportPath = path.resolve(
      process.cwd(),
      '../../tasks/cse-scraper-report.md',
    );
    try {
      const ts = new Date().toISOString();
      const success = results.filter((r) => r.status === 'success').length;
      const partial = results.filter((r) => r.status === 'partial').length;
      const failed = results.filter((r) => r.status === 'failed').length;

      const lines: string[] = [
        `# CSE Fundamentals Scraper Report`,
        ``,
        `**Run at:** ${ts}`,
        `**Total:** ${results.length} | **Success:** ${success} | **Partial:** ${partial} | **Failed:** ${failed}`,
        ``,
        `## Results`,
        ``,
        `| Symbol | Status | DB | Notes |`,
        `|--------|--------|----|-------|`,
        ...results.map(
          (r) =>
            `| ${r.symbol} | ${r.status} | ${r.dbStatus ?? '-'} | ${r.message ?? ''} |`,
        ),
      ];

      fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
      this.logger.log(`Report saved: ${reportPath}`);
    } catch (err) {
      this.logger.warn(`Failed to write report: ${String(err)}`);
    }
  }
}

// ── Helpers (module-level, not exported) ──────────────────────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickTabByText(page: Page, labels: string[]): Promise<boolean> {
  for (const label of labels) {
    const selectors = [
      `a:has-text("${label}")`,
      `button:has-text("${label}")`,
      `li:has-text("${label}")`,
      `[role="tab"]:has-text("${label}")`,
      `.nav-link:has-text("${label}")`,
      `.tab-link:has-text("${label}")`,
      `[class*="tab"]:has-text("${label}")`,
    ];

    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el && (await el.isVisible())) {
          await el.click();
          return true;
        }
      } catch {
        /* try next selector */
      }
    }

    // Fallback: getByText
    try {
      const el = page.getByText(label, { exact: true }).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        return true;
      }
    } catch {
      /* try next label */
    }
  }
  return false;
}

async function extractHeaderData(
  page: Page,
  logger: Logger,
): Promise<Record<string, string>> {
  const data: Record<string, string> = {};
  try {
    // Use full page text for robust extraction — CSE renders data in various containers
    const pageText = (await page.textContent('body')) ?? '';

    // CSE Financial Highlights section patterns
    const patterns: Array<{ key: string; regex: RegExp }> = [
      // Market cap: "Market Capitalization LKR 66,500,000,000.00"
      {
        key: 'market cap',
        regex: /market\s*cap(?:itali[sz]ation)?[\s:LKR]+([0-9,. ]+(?:[BMK])?)/i,
      },
      // Beta Against ASPI: "Beta Against ASPI 1.29"
      {
        key: 'beta against aspi',
        regex: /beta\s+against\s+aspi[\s:]+([0-9.-]+)/i,
      },
      // Beta Against S&P SL20: "Beta Against S&P SL20 0.92"
      {
        key: 'beta against sp20',
        regex: /beta\s+against\s+s[&a]p\s*(?:sl\s*)?20[\s:]+([0-9.-]+)/i,
      },
      // Generic beta fallback (first occurrence)
      { key: 'beta', regex: /\bbeta[\s:]+([0-9.-]+)/i },
      // 52-week high/low
      {
        key: '52w high',
        regex: /52[\s-]?(?:week|wk)\s*high[\s:LKR]+([0-9,.]+)/i,
      },
      {
        key: '52w low',
        regex: /52[\s-]?(?:week|wk)\s*low[\s:LKR]+([0-9,.]+)/i,
      },
      // Day's range: "Day's Price Range 69.00 - 72.00"
      {
        key: "day's range",
        regex: /day[''s]*\s*(?:price\s*)?range[\s:]+([0-9.,\s–-]+)/i,
      },
      // Turnover
      { key: 'turnover', regex: /turnover[\s:LKR]+([0-9,.]+(?:[BMK])?)/i },
      // Share volume
      {
        key: 'share volume',
        regex: /(?:share|shares?)\s*volume[\s:]+([0-9,.]+)/i,
      },
    ];

    for (const { key, regex } of patterns) {
      if (data[key]) continue; // don't overwrite already-found values
      const match = pageText.match(regex);
      if (match) {
        data[key] = match[1].trim();
      }
    }

    if (Object.keys(data).length > 0) {
      logger.log(`Header data extracted: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    logger.debug(`Header extraction failed: ${String(err)}`);
  }
  return data;
}

async function extractTradingViewData(
  page: Page,
  logger: Logger,
): Promise<Record<string, string>> {
  const data: Record<string, string> = {};

  // Strategy 1: Find TradingView iframe and extract from it
  try {
    const iframes = await page.$$('iframe');
    for (const iframeEl of iframes) {
      const src = (await iframeEl.getAttribute('src')) ?? '';
      const isTv = src.includes('tradingview') || src.includes('tv-widget');

      let frame: Frame | null = null;

      if (isTv) {
        frame = await iframeEl.contentFrame();
      } else {
        // Check any iframe that might contain financial data
        try {
          const f = await iframeEl.contentFrame();
          if (f) {
            const content = await f.content();
            if (
              /earnings|revenue|balance\s*sheet|cash\s*flow|market\s*cap/i.test(
                content,
              )
            ) {
              frame = f;
            }
          }
        } catch {
          /* skip inaccessible iframes */
        }
      }

      if (!frame) continue;

      logger.log(
        `Extracting from iframe (src: ${src.slice(0, 60) || 'inline'})`,
      );
      const extracted = await extractFromFrame(frame);
      Object.assign(data, extracted);

      if (Object.keys(data).length > 3) break;
    }
  } catch (err) {
    logger.warn(`Iframe extraction error: ${String(err)}`);
  }

  // Strategy 2: Direct page table/element extraction if iframe yielded nothing
  if (Object.keys(data).length === 0) {
    try {
      const pageData = await extractFinancialTablesFromPage(page);
      Object.assign(data, pageData);
    } catch (err) {
      logger.warn(`Direct page extraction error: ${String(err)}`);
    }
  }

  logger.log(`Extracted ${Object.keys(data).length} raw fields for metrics`);
  return data;
}

async function extractFromFrame(frame: Frame): Promise<Record<string, string>> {
  const data: Record<string, string> = {};
  try {
    // TradingView fundamental widget: rows with label + value structure
    const rows = await frame.$$eval(
      'tr, [class*="row"], [class*="item"], [class*="line"], [class*="metric"]',
      (els) =>
        els.map((el) => ({
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          children: Array.from(el.children).map((c) =>
            (c.textContent ?? '').trim(),
          ),
        })),
    );

    for (const { text, children } of rows) {
      if (!text || text.length < 2) continue;

      // Two-column child pattern (label | value)
      if (children.length >= 2 && children[0] && children[1]) {
        const label = children[0].toLowerCase();
        const value = children[1];
        if (label.length > 0 && label.length < 60 && value.length > 0) {
          data[label] = value;
          continue;
        }
      }

      // Colon-separated "Label: Value" within single element
      const colonMatch = text.match(/^([A-Za-z][^:]{0,50}):\s*(.+)$/);
      if (colonMatch) {
        data[colonMatch[1].trim().toLowerCase()] = colonMatch[2].trim();
      }
    }

    // Also try label + adjacent value elements
    const labels = await frame.$$eval(
      '[class*="label"], [class*="name"], [class*="title"], [class*="desc"]',
      (els) => els.map((el) => (el.textContent ?? '').trim()),
    );
    const values = await frame.$$eval(
      '[class*="value"], [class*="number"], [class*="amount"]',
      (els) => els.map((el) => (el.textContent ?? '').trim()),
    );

    const limit = Math.min(labels.length, values.length);
    for (let i = 0; i < limit; i++) {
      const k = labels[i].toLowerCase();
      if (k && k.length < 60 && !data[k]) {
        data[k] = values[i];
      }
    }
  } catch {
    /* non-critical */
  }
  return data;
}

async function extractFinancialTablesFromPage(
  page: Page,
): Promise<Record<string, string>> {
  const data: Record<string, string> = {};
  try {
    const tables = await page.$$('table');
    for (const table of tables) {
      const text = await table.textContent();
      if (!text || !/revenue|earnings|assets|equity|cash/i.test(text)) {
        continue;
      }
      const rows = await table.$$('tr');
      for (const row of rows) {
        const cells = await row.$$eval('td, th', (cs) =>
          cs.map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()),
        );
        if (cells.length >= 2 && cells[0] && cells[0].length < 80) {
          data[cells[0].toLowerCase()] = cells[1];
        }
      }
      if (Object.keys(data).length >= 5) break;
    }
  } catch {
    /* non-critical */
  }
  return data;
}

// ── Number parser ─────────────────────────────────────────────────────────────
// Handles: "12.34B", "1,234.56", "45.67M", "0.12%", "-5.6"

function parseFinancialNumber(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  let multiplier = 1;
  if (/[Bb]/.test(s)) multiplier = 1_000_000_000;
  else if (/[Mm]/.test(s)) multiplier = 1_000_000;
  else if (/[Kk]/.test(s)) multiplier = 1_000;

  // Strip everything except digits, dot, minus
  const numStr = s.replace(/[^0-9.\-]/g, '');
  if (!numStr) return null;

  const n = parseFloat(numStr);
  if (isNaN(n)) return null;
  return n * multiplier;
}

// ── Map raw key/value pairs to typed FundamentalsData fields ─────────────────

function mapRawToFundamentals(
  raw: Record<string, string>,
): Partial<FundamentalsData> {
  const pick = (...keys: string[]): number | null => {
    for (const k of keys) {
      const kLower = k.toLowerCase();
      for (const rawKey of Object.keys(raw)) {
        if (rawKey.toLowerCase().includes(kLower)) {
          const v = parseFinancialNumber(raw[rawKey]);
          if (v !== null) return v;
        }
      }
    }
    return null;
  };

  return {
    market_cap: pick('market cap', 'mktcap'),
    enterprise_value: pick('enterprise value'),
    pe_ratio: pick('p/e', 'pe ratio', 'price/earning', 'pe ttm'),
    ps_ratio: pick('p/s', 'ps ratio', 'price/sale'),
    pb_ratio: pick('p/b', 'pb ratio', 'price/book'),
    total_revenue: pick('total revenue', 'revenue ttm', 'net revenue'),
    revenue_per_share: pick('revenue per share'),
    gross_profit: pick('gross profit'),
    operating_income: pick('operating income', 'ebit'),
    net_income: pick('net income', 'net profit', 'net earnings'),
    eps_diluted: pick('eps diluted', 'diluted eps', 'earnings per share'),
    total_assets: pick('total assets'),
    total_liabilities: pick('total liabilities'),
    total_equity: pick(
      'total equity',
      'shareholders equity',
      "stockholders' equity",
    ),
    total_debt: pick('total debt', 'long-term debt'),
    operating_cf: pick(
      'operating cash',
      'cash from operations',
      'operating cf',
    ),
    investing_cf: pick('investing cash', 'investing cf'),
    financing_cf: pick('financing cash', 'financing cf'),
    free_cf: pick('free cash', 'fcf'),
    capex: pick('capex', 'capital expenditure', 'capital expenditures'),
    gross_margin: pick('gross margin'),
    operating_margin: pick('operating margin', 'ebit margin'),
    pretax_margin: pick('pretax margin', 'pre-tax margin'),
    net_margin: pick('net margin', 'profit margin', 'net profit margin'),
    roa: pick('roa', 'return on assets'),
    roe: pick('roe', 'return on equity'),
    roic: pick('roic', 'return on invested capital'),
    beta: pick('beta against aspi', 'beta', '1-year beta'),
    week52_high: pick('52w high', '52-week high', '52 week high'),
    week52_low: pick('52w low', '52-week low', '52 week low'),
    avg_volume: pick('average volume', 'avg volume'),
    dividend_yield: pick('dividend yield'),
    dividends_per_share: pick('dividends per share', 'dps'),
  };
}
