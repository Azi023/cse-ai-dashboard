import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, Browser, Page, Frame } from 'playwright';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { SHARIAH_WHITELIST } from '../shariah-screening/blacklist';
import { CompanyFinancial, Stock } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

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
    private readonly redisService: RedisService,
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

      // Create ONE page for login + all scraping — keeps sessionStorage/cookies alive
      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);

      const loggedIn = await this.loginToCse(page);
      this.logger.log(
        loggedIn
          ? 'Proceeding with MYCSE session — full fundamental data expected'
          : 'Proceeding without MYCSE session — partial data only (header metrics)',
      );

      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        this.logger.log(`[${i + 1}/${symbols.length}] Scraping ${symbol}...`);

        const result = await this.scrapeSymbol(page, symbol);
        results.push(result);

        if (result.data) {
          result.dbStatus = await this.upsertFundamentals(symbol, result.data);
        }

        if (i < symbols.length - 1) {
          await delay(DELAY_BETWEEN_STOCKS_MS);
        }
      }

      await page.close();
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

  // ── Scheduled weekly scrape ──────────────────────────────────────────────

  // Friday 22:00 UTC = Saturday 03:30 SLT (no market activity, low risk window)
  @Cron('0 22 * * 5')
  async scheduledWeeklyScrape(): Promise<void> {
    const LOCK_KEY = 'scraper:running';
    const LOCK_TTL_S = 30 * 60; // 30 minutes

    const existing = await this.redisService.get(LOCK_KEY);
    if (existing) {
      this.logger.warn(
        'Weekly scrape skipped — another scrape is already in progress',
      );
      return;
    }

    await this.redisService.set(LOCK_KEY, '1', LOCK_TTL_S);
    this.logger.log('Weekly CSE fundamentals scrape starting (scheduled)');

    try {
      const result = await this.scrapeAll();
      this.logger.log(
        `Weekly scrape complete — success: ${result.success}, partial: ${result.partial}, failed: ${result.failed}`,
      );
    } catch (err) {
      this.logger.error(
        'Weekly scrape failed',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      await this.redisService.set(LOCK_KEY, '', 1); // expire immediately
    }
  }

  // ── MYCSE login ───────────────────────────────────────────────────────────

  private async loginToCse(page: Page): Promise<boolean> {
    const username = process.env.CSE_USERNAME;
    const password = process.env.CSE_PASSWORD;

    if (!username || !password) {
      this.logger.warn(
        'CSE_USERNAME or CSE_PASSWORD not set — skipping MYCSE login',
      );
      return false;
    }

    const ss = async (name: string): Promise<void> => {
      try {
        await page.screenshot({
          path: path.join(FUNDAMENTALS_DIR, name),
          fullPage: false,
        });
        this.logger.log(
          `[login] Screenshot saved: ${name} | URL: ${page.url()}`,
        );
      } catch {
        /* non-critical */
      }
    };

    const failStep = async (step: number, reason: string): Promise<false> => {
      const url = page.url();
      const title = await page.title().catch(() => '');
      this.logger.error(
        `[login] STEP ${step} FAILED: ${reason} | URL: ${url} | Title: ${title}`,
      );
      await ss(`login-step-${step}-FAILED.png`);
      return false;
    };

    try {
      // ── Step 1: Load CSE homepage ──────────────────────────────────────────
      this.logger.log('LOGIN STEP 1: Navigate to CSE homepage');
      await page.goto(CSE_BASE_URL, {
        waitUntil: 'load',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(3000); // Wait for nav JS to render
      await ss('login-step-1-homepage.png');

      // ── Step 2: Click MYCSE button ─────────────────────────────────────────
      this.logger.log('LOGIN STEP 2: Locate and click MYCSE button');

      const mycseSelectors = [
        'a:has-text("MYCSE")',
        'button:has-text("MYCSE")',
        'a[href*="identity.cse"]',
        'a[href*="mycse"]',
        '[class*="mycse"]',
        'a[href*="/login"]',
      ];

      let clicked = false;
      for (const sel of mycseSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
          await page.click(sel);
          clicked = true;
          this.logger.log(`[login] Clicked MYCSE via: ${sel}`);
          break;
        } catch {
          /* try next */
        }
      }

      if (!clicked) {
        // Dump all links/buttons for diagnostics
        const allLinks = await page
          .$$eval('a, button', (els) =>
            els.map((el) => ({
              href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
              text: (el.textContent ?? '').trim().slice(0, 60),
              cls: (el.className ?? '').slice(0, 40),
            })),
          )
          .catch(() => []);
        this.logger.error(
          `[login] All links on homepage: ${JSON.stringify(allLinks)}`,
        );
        return await failStep(2, 'MYCSE button not found on homepage');
      }

      // Wait for cse.lk/my-cse to fully load before taking screenshot
      try {
        await page.waitForURL('**/my-cse**', { timeout: 15000 });
      } catch {
        await page.waitForTimeout(3000);
      }
      // Wait for the LOGIN button to be visible (translations may load async)
      for (const sel of [
        'button:has-text("LOGIN")',
        'a:has-text("LOGIN")',
        'button:has-text("Login")',
        'a:has-text("Login")',
      ]) {
        try {
          await page.waitForSelector(sel, { timeout: 5000, state: 'visible' });
          break;
        } catch {
          /* try next */
        }
      }
      await ss('login-step-2-mycse-click.png');
      this.logger.log(`[login] Step 2 URL: ${page.url()}`);

      // ── Step 3: Click the "LOGIN" button on cse.lk/my-cse ─────────────────
      // This triggers the OAuth flow to identity.cse.lk
      this.logger.log('LOGIN STEP 3: Click LOGIN button on my-cse page');

      const loginBtnSelectors = [
        'button:has-text("LOGIN")',
        'a:has-text("LOGIN")',
        'button:has-text("Login")',
        'a:has-text("Login")',
      ];
      let loginBtnClicked = false;
      for (const sel of loginBtnSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            this.logger.log(`[login] Clicking LOGIN btn via: ${sel}`);
            await el.click();
            loginBtnClicked = true;
            break;
          }
        } catch {
          /* try next */
        }
      }

      await ss('login-step-3-identity.png');

      if (!loginBtnClicked) {
        const btns = await page
          .$$eval('button, a', (els) =>
            els.map((el) => (el.textContent ?? '').trim().slice(0, 60)),
          )
          .catch(() => []);
        this.logger.error(
          `[login] LOGIN button not found. Buttons: ${JSON.stringify(btns)}`,
        );
        return await failStep(
          3,
          'LOGIN button not found on cse.lk/my-cse page',
        );
      }

      // After clicking LOGIN, wait for identity.cse.lk or idpconnect.cse.lk
      let postLoginUrl = '';
      try {
        await page.waitForURL(
          (url) =>
            url.toString().includes('identity.cse.lk') ||
            url.toString().includes('idpconnect.cse.lk'),
          { timeout: 20000 },
        );
        postLoginUrl = page.url();
      } catch {
        await page.waitForTimeout(4000);
        postLoginUrl = page.url();
      }
      this.logger.log(`[login] Step 3 post-click URL: ${postLoginUrl}`);

      // ── Step 4: Handle identity.cse.lk if reached (provider selection) ────
      if (postLoginUrl.includes('identity.cse.lk')) {
        this.logger.log(
          'LOGIN STEP 4: On identity.cse.lk — click "Continue with CSE"',
        );

        const identityBtns = await page
          .$$eval('button, a', (els) =>
            els
              .map((el) => ({
                text: (el.textContent ?? '').trim().slice(0, 80),
                href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
              }))
              .filter((e) => e.text.length > 0),
          )
          .catch(() => []);
        this.logger.log(
          `[login] identity.cse.lk buttons: ${JSON.stringify(identityBtns)}`,
        );

        const cseLoginSelectors = [
          'button:has-text("Continue with CSE")',
          'a:has-text("Continue with CSE")',
          'button:has-text("Login with CSE")',
          'a:has-text("Login with CSE")',
          '[data-provider="cse"]',
        ];
        let cseClicked = false;
        for (const sel of cseLoginSelectors) {
          try {
            const el = await page.$(sel);
            if (el && (await el.isVisible())) {
              await el.click();
              cseClicked = true;
              this.logger.log(`[login] Clicked Continue with CSE via: ${sel}`);
              break;
            }
          } catch {
            /* try next */
          }
        }
        // Fallback: scan buttons that contain "cse" but not "apple"/"google"/"mycse"
        if (!cseClicked) {
          const allBtns = await page.$$('button, a, [role="button"]');
          for (const btn of allBtns) {
            const text = ((await btn.textContent()) ?? '').toLowerCase().trim();
            if (
              text.length > 0 &&
              text.includes('cse') &&
              !text.includes('apple') &&
              !text.includes('google') &&
              !text.includes('mycse') &&
              (await btn.isVisible().catch(() => false))
            ) {
              await btn.click();
              cseClicked = true;
              this.logger.log(`[login] Clicked CSE via fallback: "${text}"`);
              break;
            }
          }
        }
        await ss('login-step-4-continue-cse.png');
        if (!cseClicked) {
          return await failStep(
            4,
            '"Continue with CSE" not found on identity.cse.lk',
          );
        }
        // Wait for idpconnect.cse.lk
        try {
          await page.waitForURL('**idpconnect.cse.lk**', { timeout: 15000 });
        } catch {
          await page.waitForTimeout(4000);
        }
      } else {
        // LOGIN went straight to idpconnect.cse.lk (skipping identity.cse.lk)
        await ss('login-step-4-continue-cse.png');
      }

      // ── Step 5: At idpconnect.cse.lk ──────────────────────────────────────
      this.logger.log('LOGIN STEP 5: Waiting for idpconnect.cse.lk login form');
      await ss('login-step-5-idpconnect.png');
      this.logger.log(`[login] Step 5 URL: ${page.url()}`);

      // ── Step 6: Fill Username + Password ──────────────────────────────────
      this.logger.log('LOGIN STEP 6: Fill username and password');

      await page
        .waitForSelector(
          'input[type="text"], input[type="email"], input[name="Username"]',
          { timeout: 10000 },
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
        'input[type="text"]:not([type="password"])',
      ];

      let usernameField = null;
      for (const sel of usernameSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            usernameField = el;
            this.logger.log(`[login] Username field found via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!usernameField) {
        const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
        this.logger.error(
          `[login] No username field. Page text: ${bodyText.slice(0, 500)}`,
        );
        return await failStep(6, 'Username input not found on login form');
      }

      // Log field attributes and form details for diagnostics
      const fieldAttrs = await usernameField
        .evaluate((el) => ({
          name: el.getAttribute('name'),
          id: el.getAttribute('id'),
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
        }))
        .catch(() => null);
      this.logger.log(
        `[login] Username field attrs: ${JSON.stringify(fieldAttrs)}`,
      );

      // Log hidden inputs (CSRF tokens etc.)
      const hiddenInputs = await page
        .$$eval('input[type="hidden"]', (els) =>
          els.map((el) => ({
            name: el.getAttribute('name'),
            value: el.getAttribute('value')?.slice(0, 30),
          })),
        )
        .catch(() => []);
      this.logger.log(`[login] Hidden inputs: ${JSON.stringify(hiddenInputs)}`);

      // Log form action
      const formAction = await page
        .$eval('form', (f) => f.getAttribute('action') ?? f.action ?? '')
        .catch(() => '');
      this.logger.log(`[login] Form action: ${formAction}`);

      // APPROACH 1: click → clear → slow keyboard typing (triggers JS event listeners)
      await usernameField.click();
      await usernameField.fill('');
      await page.keyboard.type(username, { delay: 50 });
      await usernameField.dispatchEvent('input');
      await usernameField.dispatchEvent('change');
      await usernameField.dispatchEvent('blur');

      const passField = await page.$('input[type="password"]');
      if (!passField || !(await passField.isVisible())) {
        return await failStep(6, 'Password input not found on login form');
      }
      await passField.click();
      await passField.fill('');
      await page.keyboard.type(password, { delay: 50 });
      await passField.dispatchEvent('input');
      await passField.dispatchEvent('change');
      await passField.dispatchEvent('blur');

      // Verify actual .value properties before submitting
      const filledValues = await page
        .evaluate(() => {
          const user = document.querySelector(
            'input[name="Username"], input[name="username"], input[type="email"], input[type="text"]:not([type="password"])',
          ) as HTMLInputElement | null;
          const pass = document.querySelector(
            'input[type="password"]',
          ) as HTMLInputElement | null;
          return {
            usernameLen: user?.value?.length ?? 0,
            passwordLen: pass?.value?.length ?? 0,
          };
        })
        .catch(() => ({ usernameLen: -1, passwordLen: -1 }));
      this.logger.log(
        `[login] Field values after fill — username length: ${filledValues.usernameLen}, password length: ${filledValues.passwordLen}`,
      );

      // APPROACH 3 fallback: if values are empty, use React/native setter trick
      if (filledValues.usernameLen === 0 || filledValues.passwordLen === 0) {
        this.logger.warn(
          '[login] Field values empty after slow-type — trying native setter approach',
        );
        await page.evaluate(
          (creds) => {
            const userInput = document.querySelector(
              'input[name="Username"], input[name="username"], input[type="email"], input[type="text"]:not([type="password"])',
            ) as HTMLInputElement | null;
            const passInput = document.querySelector(
              'input[type="password"]',
            ) as HTMLInputElement | null;
            if (!userInput || !passInput) return;
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value',
            )?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(userInput, creds.username);
              nativeInputValueSetter.call(passInput, creds.password);
            } else {
              userInput.value = creds.username;
              passInput.value = creds.password;
            }
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            userInput.dispatchEvent(new Event('change', { bubbles: true }));
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
            passInput.dispatchEvent(new Event('change', { bubbles: true }));
          },
          { username, password },
        );
      }

      await ss('login-step-6-creds-filled.png');

      // ── Step 7: Click "Sign In" + wait for redirect back to cse.lk ────────
      this.logger.log(
        'LOGIN STEP 7: Submit form and wait for redirect to cse.lk',
      );

      const signInSelectors = [
        'button:has-text("Sign In")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button:has-text("Log in")',
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
        return await failStep(7, 'Sign In button not found');
      }

      // Wait for redirect back to cse.lk (not idpconnect/identity)
      try {
        await page.waitForURL(
          (url) =>
            url.toString().includes('cse.lk') &&
            !url.toString().includes('idpconnect') &&
            !url.toString().includes('identity.cse'),
          { timeout: 30000 },
        );
      } catch {
        try {
          await page.waitForURL('**cse.lk**', { timeout: 10000 });
        } catch {
          await page.waitForTimeout(5000);
        }
      }

      // /callback is an SPA OAuth callback — it processes the auth code and redirects.
      // Wait for it to navigate away so tokens are fully stored before we continue.
      if (page.url().includes('/callback')) {
        this.logger.log(
          '[login] On /callback — waiting for SPA to process auth token and redirect',
        );
        try {
          await page.waitForURL(
            (url) => !url.toString().includes('/callback'),
            { timeout: 15000 },
          );
        } catch {
          // /callback may stay as the final URL on some flows — wait anyway
          await page.waitForTimeout(5000);
        }
        this.logger.log(`[login] After /callback — URL: ${page.url()}`);
      }

      await ss('login-step-7-post-signin.png');

      const finalUrl = page.url();
      const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
      this.logger.log(`[login] Step 7 final URL: ${finalUrl}`);

      const loginSucceeded =
        finalUrl.includes('cse.lk') &&
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
        `[login] MYCSE login outcome uncertain — URL: ${finalUrl}. Body sample: ${bodyText.slice(0, 200)}`,
      );
      return false;
    } catch (err) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      this.logger.error(
        `[login] Exception: ${String(err)} | URL: ${url} | Title: ${title}`,
      );
      await ss('login-error.png');
      return false;
    }
  }

  // ── Isolated login test (visible browser, max logging) ───────────────────

  async testLoginFlow(): Promise<Record<string, unknown>> {
    const logs: string[] = [];
    const screenshots: string[] = [];
    const log = (msg: string) => {
      this.logger.log(msg);
      logs.push(msg);
    };

    log('=== CSE LOGIN TEST START ===');

    const username = process.env.CSE_USERNAME;
    const password = process.env.CSE_PASSWORD;
    log(`CSE_USERNAME loaded: ${username ?? 'MISSING!'}`);
    log(
      `CSE_PASSWORD loaded: ${password ? `${password.length} chars` : 'MISSING!'}`,
    );

    if (!username || !password) {
      return { ok: false, error: 'CSE_USERNAME or CSE_PASSWORD missing', logs };
    }

    ensureDir(FUNDAMENTALS_DIR);

    let browser: import('playwright').Browser | null = null;

    const ss = async (
      page: import('playwright').Page,
      name: string,
    ): Promise<void> => {
      const p = path.join(FUNDAMENTALS_DIR, name);
      try {
        await page.screenshot({ path: p, fullPage: false });
        log(`Screenshot: ${name} | URL: ${page.url()}`);
        screenshots.push(p);
      } catch (e) {
        log(`Screenshot FAILED: ${name} — ${String(e)}`);
      }
    };

    try {
      browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);

      // ── Step 1: CSE homepage ─────────────────────────────────────────────
      log('STEP 1: Navigate to https://www.cse.lk');
      await page.goto('https://www.cse.lk', {
        waitUntil: 'load',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(3000);
      await ss(page, 'test-login-1-home.png');
      log(`STEP 1 URL: ${page.url()}`);

      // ── Step 2: Click MYCSE button ───────────────────────────────────────
      log('STEP 2: Find and click MYCSE button');
      const mycseSelectors = [
        'a:has-text("MYCSE")',
        'button:has-text("MYCSE")',
        'a[href*="identity.cse"]',
        'a[href*="mycse"]',
        '[class*="mycse"]',
        'a[href*="/login"]',
      ];

      let mycseClicked = false;
      for (const sel of mycseSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
          await page.click(sel);
          mycseClicked = true;
          log(`STEP 2: Clicked via selector: ${sel}`);
          break;
        } catch {
          /* try next */
        }
      }

      if (!mycseClicked) {
        const allLinks = await page
          .$$eval('a, button', (els) =>
            els.map((el) => ({
              href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
              text: (el.textContent ?? '').trim().slice(0, 60),
              cls: (el.className ?? '').slice(0, 40),
            })),
          )
          .catch(() => []);
        log(`STEP 2 FAILED — all links on page: ${JSON.stringify(allLinks)}`);
        await ss(page, 'test-login-2-mycse-FAILED.png');
        return {
          ok: false,
          error: 'MYCSE button not found',
          logs,
          screenshots,
        };
      }

      try {
        await page.waitForURL('**/my-cse**', { timeout: 15000 });
      } catch {
        await page.waitForTimeout(3000);
      }
      await ss(page, 'test-login-2-after-mycse.png');
      log(`STEP 2 URL after click: ${page.url()}`);

      // ── Step 3: Click LOGIN on my-cse page ──────────────────────────────
      log('STEP 3: Find and click LOGIN button on my-cse page');

      // Log all buttons first
      const mycseBtns = await page
        .$$eval('button, a', (els) =>
          els
            .map((el) => ({
              text: (el.textContent ?? '').trim().slice(0, 60),
              href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
            }))
            .filter((b) => b.text.length > 0),
        )
        .catch(() => []);
      log(`STEP 3 buttons on my-cse page: ${JSON.stringify(mycseBtns)}`);

      const loginBtnSelectors = [
        'button:has-text("LOGIN")',
        'a:has-text("LOGIN")',
        'button:has-text("Login")',
        'a:has-text("Login")',
        'button:has-text("SIGN IN")',
        'a:has-text("SIGN IN")',
      ];
      let loginBtnClicked = false;
      for (const sel of loginBtnSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            await el.click();
            loginBtnClicked = true;
            log(`STEP 3: Clicked LOGIN via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!loginBtnClicked) {
        log('STEP 3 FAILED — LOGIN button not found on my-cse page');
        await ss(page, 'test-login-3-login-FAILED.png');
        return {
          ok: false,
          error: 'LOGIN button not found on my-cse page',
          logs,
          screenshots,
        };
      }

      // Wait for identity.cse.lk or idpconnect.cse.lk
      let postLoginUrl = '';
      try {
        await page.waitForURL(
          (url) =>
            url.toString().includes('identity.cse.lk') ||
            url.toString().includes('idpconnect.cse.lk'),
          { timeout: 20000 },
        );
        postLoginUrl = page.url();
      } catch {
        await page.waitForTimeout(4000);
        postLoginUrl = page.url();
      }
      log(`STEP 3 post-click URL: ${postLoginUrl}`);
      await ss(page, 'test-login-3-after-login-click.png');

      // ── Step 4: Handle identity.cse.lk (provider selection) if present ──
      if (postLoginUrl.includes('identity.cse.lk')) {
        log('STEP 4: On identity.cse.lk — logging all buttons');

        const identityBtns = await page
          .$$eval('button, a', (els) =>
            els
              .map((el) => ({
                text: (el.textContent ?? '').trim().slice(0, 80),
                href: (el as HTMLAnchorElement).getAttribute('href') ?? '',
              }))
              .filter((e) => e.text.length > 0),
          )
          .catch(() => []);
        log(`STEP 4 identity.cse.lk buttons: ${JSON.stringify(identityBtns)}`);

        const cseLoginSelectors = [
          'button:has-text("Continue with CSE")',
          'a:has-text("Continue with CSE")',
          'button:has-text("Login with CSE")',
          'a:has-text("Login with CSE")',
          '[data-provider="cse"]',
        ];
        let cseClicked = false;
        for (const sel of cseLoginSelectors) {
          try {
            const el = await page.$(sel);
            if (el && (await el.isVisible())) {
              await el.click();
              cseClicked = true;
              log(`STEP 4: Clicked Continue with CSE via: ${sel}`);
              break;
            }
          } catch {
            /* try next */
          }
        }

        if (!cseClicked) {
          const allBtns = await page.$$('button, a, [role="button"]');
          for (const btn of allBtns) {
            const text = ((await btn.textContent()) ?? '').toLowerCase().trim();
            if (
              text.includes('cse') &&
              !text.includes('apple') &&
              !text.includes('google') &&
              !text.includes('mycse') &&
              (await btn.isVisible().catch(() => false))
            ) {
              await btn.click();
              cseClicked = true;
              log(`STEP 4: Clicked via fallback text: "${text}"`);
              break;
            }
          }
        }

        await ss(page, 'test-login-3-after-continue.png');
        if (!cseClicked) {
          log('STEP 4 FAILED — "Continue with CSE" button not found');
          return {
            ok: false,
            error: 'Continue with CSE not found on identity.cse.lk',
            logs,
            screenshots,
          };
        }

        try {
          await page.waitForURL('**idpconnect.cse.lk**', { timeout: 15000 });
        } catch {
          await page.waitForTimeout(4000);
        }
        log(`STEP 4 post-click URL: ${page.url()}`);
      } else {
        log(
          `STEP 4: Skipped identity.cse.lk (landed directly at: ${postLoginUrl})`,
        );
        await ss(page, 'test-login-3-after-continue.png');
      }

      // ── Step 5: Fill credentials on idpconnect.cse.lk ───────────────────
      log('STEP 5: Log all inputs and buttons on login form');
      const currentUrl = page.url();
      log(`STEP 5 current URL: ${currentUrl}`);

      if (!currentUrl.includes('idpconnect.cse.lk')) {
        log(
          `STEP 5 WARNING: Expected idpconnect.cse.lk but got: ${currentUrl}`,
        );
      }

      await page
        .waitForSelector(
          'input[type="text"], input[type="email"], input[name="Username"]',
          { timeout: 10000 },
        )
        .catch(() => null);

      const allInputs = await page
        .$$eval('input', (els) =>
          els.map((el) => ({
            id: el.getAttribute('id'),
            name: el.getAttribute('name'),
            type: el.getAttribute('type'),
            placeholder: el.getAttribute('placeholder'),
          })),
        )
        .catch(() => []);
      log(`STEP 5 all inputs: ${JSON.stringify(allInputs)}`);

      const allBtnsOnForm = await page
        .$$eval('button, input[type="submit"]', (els) =>
          els.map((el) => ({
            text: (el.textContent ?? '').trim().slice(0, 60),
            type: el.getAttribute('type'),
            id: el.getAttribute('id'),
          })),
        )
        .catch(() => []);
      log(`STEP 5 all buttons: ${JSON.stringify(allBtnsOnForm)}`);

      // Find username field
      const usernameSelectors = [
        'input[name="Username"]',
        'input[name="username"]',
        'input[id="Username"]',
        'input[type="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input[type="text"]',
      ];
      let usernameField: import('playwright').ElementHandle | null = null;
      let usernameSelUsed = '';
      for (const sel of usernameSelectors) {
        try {
          const el = await page.$(sel);
          if (el && (await el.isVisible())) {
            usernameField = el;
            usernameSelUsed = sel;
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!usernameField) {
        const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
        log(
          `STEP 5 FAILED — username field not found. Page: ${bodyText.slice(0, 500)}`,
        );
        await ss(page, 'test-login-4-filled-FAILED.png');
        return {
          ok: false,
          error: 'Username input not found on idpconnect login form',
          logs,
          screenshots,
        };
      }
      log(`STEP 5: Username field found via: ${usernameSelUsed}`);

      // Slow-type username
      await usernameField.click();
      await usernameField.fill('');
      await page.keyboard.type(username, { delay: 50 });
      await usernameField.dispatchEvent('input');
      await usernameField.dispatchEvent('change');
      await usernameField.dispatchEvent('blur');

      // Slow-type password
      const passField = await page.$('input[type="password"]');
      if (!passField) {
        log('STEP 5 FAILED — password field not found');
        return {
          ok: false,
          error: 'Password input not found',
          logs,
          screenshots,
        };
      }
      await passField.click();
      await passField.fill('');
      await page.keyboard.type(password, { delay: 50 });
      await passField.dispatchEvent('input');
      await passField.dispatchEvent('change');
      await passField.dispatchEvent('blur');

      // Verify actual .value of both fields
      const filledValues = await page
        .evaluate(() => {
          const user = document.querySelector(
            'input[name="Username"], input[name="username"], input[type="email"], input[type="text"]',
          ) as HTMLInputElement | null;
          const pass = document.querySelector(
            'input[type="password"]',
          ) as HTMLInputElement | null;
          return {
            usernameLen: user?.value?.length ?? 0,
            passwordLen: pass?.value?.length ?? 0,
          };
        })
        .catch(() => ({ usernameLen: -1, passwordLen: -1 }));
      log(`STEP 5: Username field value length: ${filledValues.usernameLen}`);
      log(`STEP 5: Password field value length: ${filledValues.passwordLen}`);

      await ss(page, 'test-login-4-filled.png');

      // ── Step 6: Submit login form ────────────────────────────────────────
      log('STEP 6: Click Sign In button');

      const signInSelectors = [
        'button:has-text("Sign In")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button:has-text("Log In")',
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
            log(`STEP 6: Clicked Sign In via: ${sel}`);
            break;
          }
        } catch {
          /* try next */
        }
      }

      if (!submitted) {
        log('STEP 6 FAILED — Sign In button not found');
        await ss(page, 'test-login-5-result-FAILED.png');
        return {
          ok: false,
          error: 'Sign In button not found',
          logs,
          screenshots,
        };
      }

      // Wait 10s for redirect
      await page.waitForTimeout(10000);
      const resultUrl = page.url();
      log(`STEP 6 final URL after 10s wait: ${resultUrl}`);

      // Check for error text
      const bodyText = (await page.textContent('body').catch(() => '')) ?? '';
      const hasInvalid = bodyText.toLowerCase().includes('invalid');
      const hasError = bodyText.toLowerCase().includes('error');
      log(`STEP 6: Page contains "invalid": ${hasInvalid}`);
      log(`STEP 6: Page contains "error": ${hasError}`);
      if (hasInvalid || hasError) {
        const errorSnippet = bodyText
          .split('\n')
          .find(
            (l) =>
              l.toLowerCase().includes('invalid') ||
              l.toLowerCase().includes('error'),
          );
        log(
          `STEP 6: Error text found: "${errorSnippet?.trim().slice(0, 200)}"`,
        );
      }

      await ss(page, 'test-login-5-result.png');

      // ── Step 7: Navigate to AEL company profile ──────────────────────────
      log('STEP 7: Navigate to cse.lk/company-profile?symbol=AEL.N0000');
      await page.goto('https://www.cse.lk/company-profile?symbol=AEL.N0000', {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(3000);

      // Click Financials tab
      for (const sel of ['text=Financials', 'text=Financial']) {
        try {
          await page.click(sel, { timeout: 5000 });
          log(`STEP 7: Clicked Financials tab via: ${sel}`);
          break;
        } catch {
          /* try next */
        }
      }
      await page.waitForTimeout(2000);

      // Click Fundamental Data sub-tab
      for (const sel of [
        'text=Fundamental Data',
        'text=Fundamentals',
        'text=Fundamental',
      ]) {
        try {
          await page.click(sel, { timeout: 5000 });
          log(`STEP 7: Clicked Fundamental Data sub-tab via: ${sel}`);
          break;
        } catch {
          /* try next */
        }
      }
      await page.waitForTimeout(8000);

      await ss(page, 'test-login-6-fundamentals.png');

      const bodyFinal = (await page.textContent('body').catch(() => '')) ?? '';
      const hasSignUpBanner = bodyFinal.includes('SIGN UP WITH MYCSE');
      log(`STEP 7: "SIGN UP WITH MYCSE" banner present: ${hasSignUpBanner}`);
      log(`STEP 7 final URL: ${page.url()}`);

      const loginSucceeded =
        resultUrl.includes('cse.lk') &&
        !resultUrl.includes('idpconnect') &&
        !resultUrl.includes('identity.cse');

      log(`=== CSE LOGIN TEST END === loginSucceeded: ${loginSucceeded}`);

      await page.close();
      await context.close();

      return {
        ok: loginSucceeded && !hasSignUpBanner,
        loginSucceeded,
        hasSignUpBanner,
        finalUrl: resultUrl,
        logs,
        screenshots,
      };
    } catch (err) {
      log(`EXCEPTION: ${String(err)}`);
      return { ok: false, error: String(err), logs, screenshots };
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
        'http://localhost:4101/api/shariah/run-tier2-screening',
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
      // Total Market Cap (%): "Total Market Cap (%) 0.90%"
      {
        key: 'total market cap pct',
        regex: /total\s+market\s+cap[^0-9]*([0-9,.]+)\s*%/i,
      },
      // Beta Values Against ASPI: "Beta Values Against Aspi1.29" (no separator in text)
      {
        key: 'beta against aspi',
        regex: /beta\s+(?:values?\s+)?against\s+aspi[\s:]*([0-9.-]+)/i,
      },
      // Beta Values Against S&P SL20: "Beta Values Against S&p Sl200.92" (no separator)
      {
        key: 'beta against sp20',
        regex:
          /beta\s+(?:values?\s+)?against\s+s[&a]p\s*(?:sl\s*)?20[\s:]*([0-9.-]+)/i,
      },
      // Generic beta fallback (first occurrence)
      { key: 'beta', regex: /\bbeta[\s:]*([0-9.-]+)/i },
      // 52-week high/low
      {
        key: '52w high',
        regex: /52[\s-]?(?:week|wk)\s*high[\s:LKR]*([0-9,.]+)/i,
      },
      {
        key: '52w low',
        regex: /52[\s-]?(?:week|wk)\s*low[\s:LKR]*([0-9,.]+)/i,
      },
      // Day's Price Range: "Day's Price Range67.20 - 64.00" (no separator in text)
      {
        key: "day's range",
        regex: /day[''s]*\s*(?:price\s*)?range[\s:]*([0-9.,\s–-]+)/i,
      },
      // Turnover
      { key: 'turnover', regex: /turnover[\s:LKR]+([0-9,.]+(?:[BMK])?)/i },
      // Share Volume: "Share Volume1,110,547.00" (no separator in text)
      {
        key: 'share volume',
        regex: /(?:share|shares?)\s*volume[\s:]*([0-9,.]+)/i,
      },
      // Trade Volume: "Trade Volume314.00" (no separator in text)
      {
        key: 'trade volume',
        regex: /trade\s+volume[\s:]*([0-9,.]+)/i,
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

  // Strategy 1: Use page.frames() to find TradingView frame at any nesting depth.
  // page.$$('iframe') only searches the top-level DOM; the TradingView widget may
  // be nested inside an srcdoc wrapper frame, making it invisible to $$('iframe').
  try {
    const allFrames = page.frames();
    const tvFrame = allFrames.find(
      (f) => f.url().includes('tradingview') || f.url().includes('tv-widget'),
    );

    if (tvFrame) {
      logger.log(`Found TradingView frame: ${tvFrame.url().slice(0, 100)}`);
      // Give the widget up to 12 s to render data after load
      try {
        await tvFrame.waitForLoadState('networkidle', { timeout: 12000 });
      } catch {
        /* continue with whatever is loaded */
      }

      // Diagnostic: dump frame text to logs
      try {
        const frameText = await tvFrame.textContent('body').catch(() => '');
        logger.log(
          `TradingView frame text (first 500): ${(frameText ?? '').replace(/\s+/g, ' ').slice(0, 500)}`,
        );
      } catch {
        /* non-critical */
      }

      const extracted = await extractFromFrame(tvFrame);
      Object.assign(data, extracted);
      logger.log(
        `TradingView frame extraction: ${Object.keys(extracted).length} fields`,
      );
    } else {
      logger.warn(
        `TradingView frame not found. All frames: ${allFrames.map((f) => f.url().slice(0, 60)).join(' | ')}`,
      );
    }
  } catch (err) {
    logger.warn(`TradingView frame extraction error: ${String(err)}`);
  }

  // Strategy 2: Fallback — check all non-blank frames for financial keywords
  if (Object.keys(data).length === 0) {
    try {
      for (const frame of page.frames()) {
        if (
          frame.url() === 'about:blank' ||
          frame.url().includes('tradingview')
        )
          continue;
        try {
          const content = await frame.content();
          if (
            /earnings|revenue|balance\s*sheet|cash\s*flow|p\/e/i.test(content)
          ) {
            logger.log(`Trying fallback frame: ${frame.url().slice(0, 60)}`);
            const extracted = await extractFromFrame(frame);
            Object.assign(data, extracted);
            if (Object.keys(data).length > 3) break;
          }
        } catch {
          /* skip inaccessible frames */
        }
      }
    } catch (err) {
      logger.warn(`Fallback frame extraction error: ${String(err)}`);
    }
  }

  // Strategy 3: Direct page table/element extraction if all frames yielded nothing
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
