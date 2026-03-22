import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, Browser, Page, Frame } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { SHARIAH_WHITELIST } from '../shariah-screening/blacklist';
import { CompanyFinancial, Stock } from '../../entities';

// ── Constants ────────────────────────────────────────────────────────────────

const CSE_BASE_URL = 'https://www.cse.lk';
const FUNDAMENTALS_DIR = path.resolve(process.cwd(), '../../data/cse-fundamentals');
const DELAY_BETWEEN_STOCKS_MS = 2000;
const WIDGET_WAIT_MS = 5000;
const PAGE_TIMEOUT_MS = 30_000;

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

  async scrapeAll(): Promise<ScrapeAllResult> {
    const symbols = await this.buildTargetList();
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

      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        this.logger.log(`[${i + 1}/${symbols.length}] Scraping ${symbol}...`);

        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TIMEOUT_MS);

        const result = await this.scrapeSymbol(page, symbol);
        results.push(result);

        if (result.data) {
          result.dbStatus = await this.upsertFundamentals(
            symbol,
            result.data,
          );
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

    return { total: symbols.length, success, partial, failed, tier2TriggerStatus, results };
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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
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

      // Wait for TradingView widget to fully load
      await page.waitForTimeout(WIDGET_WAIT_MS);

      // Screenshot before extraction
      try {
        await page.screenshot({ path: screenshotPath, fullPage: false });
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
      const resp = await fetch('http://localhost:3001/api/shariah/run-tier2-screening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
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

async function clickTabByText(
  page: Page,
  labels: string[],
): Promise<boolean> {
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
    // Grab the full visible text from the page header area
    const headerSelectors = [
      '.company-header',
      '.stock-header',
      '.company-info',
      '.market-data-header',
      '[class*="company"][class*="header"]',
      '[class*="stock"][class*="info"]',
      '.profile-header',
      '#company-header',
    ];

    for (const sel of headerSelectors) {
      const el = await page.$(sel);
      if (!el) continue;

      const text = await el.textContent();
      if (!text) continue;

      const patterns: Array<{ key: string; regex: RegExp }> = [
        { key: 'market cap', regex: /market\s*cap[\s:]+([0-9,.BMKb]+)/i },
        { key: 'beta', regex: /beta[\s:]+([0-9.-]+)/i },
        {
          key: "day's range",
          regex: /day[''s]*\s*range[\s:]+([0-9.,\s-]+)/i,
        },
        {
          key: '52w high',
          regex: /52[\s-]?week\s*high[\s:]+([0-9,.]+)/i,
        },
        {
          key: '52w low',
          regex: /52[\s-]?week\s*low[\s:]+([0-9,.]+)/i,
        },
      ];

      for (const { key, regex } of patterns) {
        const match = text.match(regex);
        if (match) data[key] = match[1].trim();
      }
      break;
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
            if (/earnings|revenue|balance\s*sheet|cash\s*flow|market\s*cap/i.test(content)) {
              frame = f;
            }
          }
        } catch {
          /* skip inaccessible iframes */
        }
      }

      if (!frame) continue;

      logger.log(`Extracting from iframe (src: ${src.slice(0, 60) || 'inline'})`);
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
    market_cap:       pick('market cap', 'mktcap'),
    enterprise_value: pick('enterprise value'),
    pe_ratio:         pick('p/e', 'pe ratio', 'price/earning', 'pe ttm'),
    ps_ratio:         pick('p/s', 'ps ratio', 'price/sale'),
    pb_ratio:         pick('p/b', 'pb ratio', 'price/book'),
    total_revenue:    pick('total revenue', 'revenue ttm', 'net revenue'),
    revenue_per_share:pick('revenue per share'),
    gross_profit:     pick('gross profit'),
    operating_income: pick('operating income', 'ebit'),
    net_income:       pick('net income', 'net profit', 'net earnings'),
    eps_diluted:      pick('eps diluted', 'diluted eps', 'earnings per share'),
    total_assets:     pick('total assets'),
    total_liabilities:pick('total liabilities'),
    total_equity:     pick('total equity', 'shareholders equity', "stockholders' equity"),
    total_debt:       pick('total debt', 'long-term debt'),
    operating_cf:     pick('operating cash', 'cash from operations', 'operating cf'),
    investing_cf:     pick('investing cash', 'investing cf'),
    financing_cf:     pick('financing cash', 'financing cf'),
    free_cf:          pick('free cash', 'fcf'),
    capex:            pick('capex', 'capital expenditure', 'capital expenditures'),
    gross_margin:     pick('gross margin'),
    operating_margin: pick('operating margin', 'ebit margin'),
    pretax_margin:    pick('pretax margin', 'pre-tax margin'),
    net_margin:       pick('net margin', 'profit margin', 'net profit margin'),
    roa:              pick('roa', 'return on assets'),
    roe:              pick('roe', 'return on equity'),
    roic:             pick('roic', 'return on invested capital'),
    beta:             pick('beta', '1-year beta'),
    week52_high:      pick('52w high', '52-week high', '52 week high'),
    week52_low:       pick('52w low', '52-week low', '52 week low'),
    avg_volume:       pick('average volume', 'avg volume'),
    dividend_yield:   pick('dividend yield'),
    dividends_per_share: pick('dividends per share', 'dps'),
  };
}
