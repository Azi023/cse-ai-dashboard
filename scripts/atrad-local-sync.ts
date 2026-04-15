#!/usr/bin/env npx tsx
/**
 * atrad-local-sync.ts — Run ATrad scrape from local machine, push to VPS.
 *
 * ATrad blocks Hetzner datacenter IPs, so we run Playwright locally
 * (residential IP) and POST the scraped portfolio data to the VPS API.
 *
 * Usage:
 *   npx tsx scripts/atrad-local-sync.ts
 *
 * Prerequisites:
 *   - ATRAD_USERNAME and ATRAD_PASSWORD in local .env
 *   - DASHBOARD_USERNAME and DASHBOARD_PASSWORD in local .env (for VPS login)
 *   - VPS reachable at https://csedash.xyz
 *
 * Schedule (optional):
 *   Add to local crontab or PM2 to run daily after market close (2:38 PM SLT).
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const VPS_URL = process.env.VPS_URL || 'https://csedash.xyz';
const ATRAD_URL =
  process.env.ATRAD_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';

// ── ATrad selectors (confirmed from previous recon) ──
const USERNAME_SELECTORS = [
  '#txtUserName',
  'input[name="txtUserName"]',
  'input[name="username"]',
  'input[type="text"][id*="user" i]',
];
const PASSWORD_SELECTORS = [
  '#txtPassword',
  'input[name="txtPassword"]',
  'input[type="password"]',
];
const LOGIN_BUTTON_SELECTORS = [
  '#btnSubmit',
  'input[type="submit"]',
  'button[type="submit"]',
  '#dijit_form_Button_0',
];

interface ATradHolding {
  symbol: string;
  companyName: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
}

async function findAndFill(
  page: any,
  selectors: string[],
  value: string,
  label: string,
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.fill(value);
        console.log(`  Filled ${label} via ${sel}`);
        return true;
      }
    } catch {
      continue;
    }
  }
  console.error(`  Could not find ${label} field`);
  return false;
}

async function findAndClick(
  page: any,
  selectors: string[],
  label: string,
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        console.log(`  Clicked ${label} via ${sel}`);
        return true;
      }
    } catch {
      continue;
    }
  }
  console.error(`  Could not find ${label}`);
  return false;
}

async function scrapeATrad(): Promise<{
  holdings: ATradHolding[];
  buyingPower: number;
  accountValue: number;
  cashBalance: number;
} | null> {
  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;

  if (!username || !password) {
    console.error('ATRAD_USERNAME and ATRAD_PASSWORD must be set');
    return null;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    console.log('Navigating to ATrad login...');
    await page.goto(ATRAD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Login page loaded');

    // Fill credentials
    const userOk = await findAndFill(page, USERNAME_SELECTORS, username, 'username');
    const passOk = await findAndFill(page, PASSWORD_SELECTORS, password, 'password');

    if (!userOk || !passOk) {
      console.error('Could not find login fields. ATrad may have changed their page.');
      return null;
    }

    // Submit login
    await findAndClick(page, LOGIN_BUTTON_SELECTORS, 'login button');
    await page.waitForLoadState('networkidle');
    console.log('Logged in, waiting for dashboard...');

    // Wait for Dojo to finish rendering the top menu bar — the Client
    // menu item is what we need for navigation. Dojo can take 5-15s to
    // hydrate the menu, especially on cold sessions.
    try {
      await page.waitForSelector('#dijit_PopupMenuBarItem_4', {
        state: 'attached',
        timeout: 30000,
      });
    } catch {
      console.log(
        'Client menu never rendered within 30s — dashboard layout may have changed',
      );
    }
    await page.waitForTimeout(1500);

    // Navigate to Account Summary.
    //
    // IMPORTANT: Dojo assigns widget IDs like `dijit_MenuItem_41` at creation
    // time and they drift between sessions depending on render order. Find
    // menu items by their visible text instead — stable across sessions.
    console.log('Opening Account Summary...');
    const clientMenu = page.locator('[id^="dijit_PopupMenuBarItem_"]', {
      hasText: /^Client$/i,
    });
    if ((await clientMenu.count()) > 0) {
      await clientMenu.first().click();
      await page.waitForTimeout(1500);

      const accountSummary = page.locator('[id^="dijit_MenuItem_"]', {
        hasText: /Account Summary/i,
      });
      if ((await accountSummary.count()) > 0) {
        await accountSummary.first().click();
      }

      // Poll for cell to render + populate (Dojo + XHR, can take 5-15s).
      for (let i = 0; i < 15; i++) {
        const ready = await page.evaluate(() => {
          const el = document.querySelector('#txtAccSumaryCashBalance');
          return !!el && (el.textContent ?? '').trim().length > 0;
        });
        if (ready) break;
        await page.waitForTimeout(2000);
      }
    }

    // Read cash balance, buying power, portfolio value.
    // NOTE: ATrad switched these fields from <input> to <TD> at some point
    // in 2026 — read via textContent, not inputValue.
    const readTextAsNumber = async (sel: string): Promise<number> => {
      const el = await page.$(sel);
      if (!el) return 0;
      const raw = (await el.textContent())?.trim() ?? '';
      const n = parseFloat(raw.replace(/,/g, ''));
      return isFinite(n) ? n : 0;
    };

    let cashBalance = await readTextAsNumber('#txtAccSumaryCashBalance');
    let buyingPower = await readTextAsNumber('#txtAccSumaryBuyingPowr');
    let portfolioMarketValue = await readTextAsNumber(
      '#txtAccSumaryTMvaluePortfolio',
    );
    let accountValue = 0;

    // Filter implausible values (account number in adjacent field)
    if (cashBalance > 50_000_000) cashBalance = 0;
    if (buyingPower > 50_000_000) buyingPower = 0;
    if (portfolioMarketValue > 50_000_000) portfolioMarketValue = 0;

    console.log(
      `Cash: ${cashBalance}, BP: ${buyingPower}, PortfolioMV: ${portfolioMarketValue}`,
    );

    // Fetch holdings via API.
    // ATrad's client account format varies ("128229LI0" vs "128229-LI-0"
    // vs empty which returns the session default). Try progressively
    // broader queries until one returns portfolios.
    const holdings: ATradHolding[] = [];
    try {
      const accountVariants = ['', '128229LI0', '128229-LI-0'];
      let holdingsResp = '';
      for (const acct of accountVariants) {
        holdingsResp = await page.evaluate(async (acctInner) => {
          const resp = await fetch('/atsweb/client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `action=getStockHolding&exchange=CSE&broker=FWS&stockHoldingClientAccount=${encodeURIComponent(acctInner)}&stockHoldingSecurity=&format=json`,
          });
          return resp.text();
        }, acct);
        const probe = holdingsResp.replace(/'/g, '"');
        if (/portfolios"?\s*:\s*\[\s*\{/.test(probe)) break;
      }

      const normalizedJson = holdingsResp.replace(/'/g, '"');
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(normalizedJson);
      } catch {
        /* non-JSON response — treat as no holdings */
      }

      // Try every known response shape. ATrad has used several over time:
      //   { portfolios: [...] }            — legacy
      //   { code, description, data: { portfolios: [...] } }  — current
      //   { clientHoldings: [...] } / { holdings: [...] }
      const candidates: unknown[] = [];
      const p = parsed as Record<string, unknown>;
      if (Array.isArray(p.portfolios)) candidates.push(...p.portfolios);
      if (Array.isArray(p.clientHoldings)) candidates.push(...p.clientHoldings);
      if (Array.isArray(p.holdings)) candidates.push(...p.holdings);

      const data = p.data as Record<string, unknown> | unknown[] | undefined;
      if (Array.isArray(data)) {
        candidates.push(...data);
      } else if (data && typeof data === 'object') {
        for (const v of Object.values(data)) {
          if (Array.isArray(v)) candidates.push(...v);
        }
      }

      for (const item of candidates) {
        const h = item as Record<string, unknown>;
        const symbol =
          (h.securityId as string) ||
          (h.security as string) ||
          (h.symbol as string) ||
          'UNKNOWN';
        const qty = parseFloat(String(h.quantity ?? h.qty ?? 0));
        if (qty === 0) continue;
        holdings.push({
          symbol,
          companyName:
            (h.securityName as string) ||
            (h.security as string) ||
            (h.name as string) ||
            '',
          quantity: qty,
          avgPrice: parseFloat(String(h.avgPrice ?? h.averagePrice ?? 0)),
          currentPrice: parseFloat(
            String(h.lastTradedPrice ?? h.currentPrice ?? h.price ?? 0),
          ),
          marketValue: parseFloat(String(h.marketValue ?? 0)),
          unrealizedPL: parseFloat(String(h.unrealizedPL ?? 0)),
          unrealizedPLPct: parseFloat(
            String(h.unrealizedPLPercentage ?? h.unrealizedPLPct ?? 0),
          ),
        });
      }

      accountValue =
        holdings.reduce((sum, h) => sum + h.marketValue, 0) + cashBalance;
    } catch (err) {
      console.log(
        'Could not fetch holdings via API, continuing with balance only',
      );
    }

    // Fallback: if holdings API returned nothing, derive account value
    // from the UI-scraped portfolio market value cell.
    if (holdings.length === 0 && portfolioMarketValue > 0) {
      accountValue = portfolioMarketValue + cashBalance;
    }

    console.log(`Holdings: ${holdings.length}, Account Value: ${accountValue}`);

    // Logout
    const logoutBtn = await page.$('#butUserLogOut');
    if (logoutBtn) await logoutBtn.click();

    return { holdings, buyingPower, accountValue, cashBalance };
  } catch (err) {
    console.error('Scrape error:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    await browser.close();
  }
}

async function loginToVPS(): Promise<string | null> {
  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!username || !password) {
    console.error('DASHBOARD_USERNAME and DASHBOARD_PASSWORD must be set for VPS auth');
    return null;
  }

  try {
    const resp = await fetch(`${VPS_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!resp.ok) {
      console.error(`VPS login failed: ${resp.status}`);
      return null;
    }

    // Extract access_token from Set-Cookie header
    const cookies = resp.headers.getSetCookie();
    for (const cookie of cookies) {
      if (cookie.startsWith('access_token=')) {
        return cookie.split('=')[1].split(';')[0];
      }
    }

    console.error('No access_token cookie in login response');
    return null;
  } catch (err) {
    console.error('VPS login error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function pushToVPS(
  token: string,
  data: {
    holdings: ATradHolding[];
    buyingPower: number;
    accountValue: number;
    cashBalance: number;
  },
): Promise<boolean> {
  try {
    const resp = await fetch(`${VPS_URL}/api/atrad/sync-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`Push failed: ${resp.status} ${body}`);
      return false;
    }

    const result = await resp.json();
    console.log('Push result:', JSON.stringify(result, null, 2));
    return true;
  } catch (err) {
    console.error('Push error:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== ATrad Local Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Step 1: Scrape ATrad from local machine
  console.log('\n[1/3] Scraping ATrad...');
  const data = await scrapeATrad();
  if (!data) {
    console.error('ATrad scrape failed. Exiting.');
    process.exit(1);
  }

  // Step 2: Login to VPS
  console.log('\n[2/3] Logging into VPS...');
  const token = await loginToVPS();
  if (!token) {
    console.error('VPS login failed. Exiting.');
    process.exit(1);
  }

  // Step 3: Push data to VPS
  console.log('\n[3/3] Pushing data to VPS...');
  const ok = await pushToVPS(token, data);
  if (!ok) {
    console.error('Push to VPS failed. Exiting.');
    process.exit(1);
  }

  console.log('\nSync complete!');
}

main();
