/**
 * atrad-recon.ts — Read-only ATrad holdings verification script
 *
 * Logs in, navigates to Stock Holding, captures screenshot + HTML,
 * parses and prints all holdings data, reads cash balance.
 *
 * DOES NOT place orders, modify data, or click any trading buttons.
 * Max 1 login attempt to avoid account lockout.
 *
 * Usage (from src/backend/ directory):
 *   npx tsx ../../scripts/atrad-recon.ts
 *
 * Output files:
 *   scripts/atrad-recon-screenshot.png   — Stock Holding page
 *   scripts/atrad-recon-holdings.html    — Holdings page HTML dump
 *   data/atrad-sync/recon-acct-summary.html
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ─── Environment ──────────────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const SCRIPTS_DIR = path.resolve(__dirname);
const DATA_DIR    = path.resolve(__dirname, '..', 'data', 'atrad-sync');
const STEP_MS     = 15_000; // per-step timeout

function ensureDirs(): void {
  [SCRIPTS_DIR, DATA_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`[${ts}] ${msg}`);
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ─── Playwright helpers ───────────────────────────────────────────────────────

async function shot(page: Page, name: string): Promise<void> {
  const filePath = path.join(SCRIPTS_DIR, name);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    log(`Screenshot → ${filePath}`);
  } catch (e) {
    log(`Screenshot failed: ${String(e)}`);
  }
}

async function fillField(
  page: Page,
  value: string,
  selectors: string[],
  label: string,
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.fill(value);
        log(`  Filled [${label}] via: ${sel}`);
        return true;
      }
    } catch { /* try next */ }
  }
  log(`  WARN: could not fill [${label}]`);
  return false;
}

async function clickEl(
  page: Page,
  selectors: string[],
  label: string,
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      // Safety: never click trading buttons
      const text = (await el.textContent() ?? '').trim();
      if (/\b(buy|sell|place.*order|submit.*order|confirm)\b/i.test(text)) {
        log(`  SKIP forbidden: "${text.slice(0, 40)}"`);
        continue;
      }
      await el.click();
      log(`  Clicked [${label}] via: ${sel}`);
      return true;
    } catch { /* try next */ }
  }
  log(`  Could not find: ${label}`);
  return false;
}

// ─── Number parser ────────────────────────────────────────────────────────────

function parseNumber(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9.\-()]/g, '');
  if (!cleaned) return 0;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -(parseFloat(cleaned.slice(1, -1)) || 0);
  }
  return parseFloat(cleaned) || 0;
}

// ─── Holdings parser ──────────────────────────────────────────────────────────

interface Holding {
  symbol:       string;
  qty:          number;
  avgPrice:     number;
  currentPrice: number;
  marketValue:  number;
  unrealizedPL: number;
}

async function parseHoldings(page: Page): Promise<Holding[]> {
  const tableSelectors = [
    '#_atrad_equityDiv table',
    // exclude the watchlist ticker grid
  ];

  for (const sel of tableSelectors) {
    try {
      const table = await page.$(sel);
      if (!table) continue;
      log(`  Holdings table found: ${sel}`);

      const headers = await table.$$eval(
        'thead th, thead td, tr:first-child th, tr:first-child td',
        (cells) => cells.map((c) => (c.textContent ?? '').trim().toLowerCase()),
      );
      log(`  Headers: ${JSON.stringify(headers)}`);

      const col: Record<string, number> = {};
      headers.forEach((h, i) => {
        if (/symbol|security|stock|scrip|code/i.test(h))            col.symbol = i;
        if (/qty|quantity|shares/i.test(h))                         col.qty = i;
        if (/avg|average|cost|buy.*price/i.test(h))                 col.avgPrice = i;
        if (/current.*price|market.*price|ltp|last.*price|last/i.test(h)) col.currentPrice = i;
        if (/market.*val|mkt.*val|current.*val|mkt\.?\s*val/i.test(h))   col.marketValue = i;
        if (/p.*l|profit|gain|unreali/i.test(h))                    col.unrealizedPL = i;
      });
      log(`  Col map: ${JSON.stringify(col)}`);

      const rows = await table.$$('tbody tr, tr:not(:first-child)');
      const holdings: Holding[] = [];

      for (const row of rows) {
        const cells = await row.$$eval('td', (tds) =>
          tds.map((td) => (td.textContent ?? '').trim()),
        );
        if (cells.length < 3) continue;
        const symbol = cells[col.symbol ?? 0] ?? '';
        if (!symbol || /^(total|sum|footer|\s*)$/i.test(symbol)) continue;
        const qty = parseNumber(cells[col.qty ?? 2]);
        if (qty <= 0) continue;
        holdings.push({
          symbol:       symbol.replace(/\.N\d{4}$/i, '').trim(),
          qty,
          avgPrice:     parseNumber(cells[col.avgPrice ?? 3]),
          currentPrice: parseNumber(cells[col.currentPrice ?? 4]),
          marketValue:  parseNumber(cells[col.marketValue ?? 5]),
          unrealizedPL: parseNumber(cells[col.unrealizedPL ?? 6]),
        });
      }
      return holdings;
    } catch (e) {
      log(`  Parse error for ${sel}: ${String(e)}`);
    }
  }

  // Primary: stockHoldingDataGrid — the Dojo DataGrid widget for equity holdings
  log('  Trying stockHoldingDataGrid rows...');
  for (const gridSel of [
    '[widgetid="stockHoldingDataGrid"]',
    '[widgetid="stockHoldingGridId"]',
    '#_atrad_equityDiv',
  ]) {
    try {
      const grid = await page.$(gridSel);
      if (!grid) { log(`  ${gridSel}: not found`); continue; }
      const rows = await grid.$$('.dojoxGridRow');
      log(`  ${gridSel}: ${rows.length} dojoxGridRow(s)`);
      if (rows.length === 0) continue;

      const holdings: Holding[] = [];
      for (const row of rows) {
        const cells = await row.$$eval('.dojoxGridCell', (els) =>
          els.map((el) => (el.textContent ?? '').trim()),
        );
        const nonEmpty = cells.filter(c => c.length > 0);
        if (nonEmpty.length < 2) continue;
        log(`  Row: ${JSON.stringify(nonEmpty.slice(0, 8))}`);
        const symbol = nonEmpty[0] ?? '';
        if (!symbol || /total|header|column/i.test(symbol)) continue;
        const qty = parseNumber(nonEmpty[1]);
        if (qty <= 0) continue;
        holdings.push({
          symbol:       symbol.replace(/\.N\d{4}$/i, '').trim(),
          qty,
          avgPrice:     parseNumber(nonEmpty[2]),
          currentPrice: parseNumber(nonEmpty[3]),
          marketValue:  parseNumber(nonEmpty[4]),
          unrealizedPL: parseNumber(nonEmpty[5]),
        });
      }
      if (holdings.length > 0) return holdings;
    } catch (e) {
      log(`  ${gridSel} error: ${String(e)}`);
    }
  }

  // Final fallback
  const tableCounts = await page.$$eval('table', (tbls) => tbls.length);
  log(`  No holdings found. Tables on page: ${tableCounts}. Check atrad-recon-holdings.html`);
  return [];
}

// ─── Account balance scraper ──────────────────────────────────────────────────

async function scrapeBalance(page: Page): Promise<void> {
  // ATrad Account Summary exposes account data via specific element IDs.
  // Confirmed from HTML dump: txtAccSumaryCashBalance, txtAccSumaryBuyingPowr, etc.
  const fields = await page.evaluate(() => {
    const targets: Array<{ label: string; id: string }> = [
      { label: 'Total Cost of Portfolio',  id: 'txtAccSumaryTcostPortfolio' },
      { label: 'Market Value of Portfolio', id: 'txtAccSumaryTMvaluePortfolio' },
      { label: 'Gain / Loss',              id: 'txtAccSumaryTGainLoss' },
      { label: 'Cash Balance',             id: 'txtAccSumaryCashBalance' },
      { label: 'Buying Power',             id: 'txtAccSumaryBuyingPowr' },
      { label: 'Cash Block Amount',        id: 'txtAccSumaryCashBlock' },
      { label: 'Per Order Limit',          id: 'txtAccSumaryPerOrderLimit' },
    ];
    return targets.map(({ label, id }) => {
      const el = document.getElementById(id);
      return { label, value: el ? (el.textContent ?? '').trim() : '' };
    }).filter((f) => f.value !== '');
  });

  if (fields.length === 0) {
    log('  No balance fields found — check recon-acct-summary.html');
    return;
  }
  fields.forEach(({ label, value }) => {
    console.log(`  ${label.padEnd(35)} │ ${value}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  loadEnv();
  ensureDirs();

  const loginUrl  = process.env.ATRAD_URL ?? process.env.ATRAD_LOGIN_URL ?? 'https://trade.hnbstockbrokers.lk/atsweb/login';
  const username  = process.env.ATRAD_USERNAME;
  const password  = process.env.ATRAD_PASSWORD;

  if (!username || !password) {
    console.error('[ERROR] ATRAD_USERNAME or ATRAD_PASSWORD not set in environment');
    process.exit(1);
  }

  log(`Login URL : ${loginUrl}`);
  log(`Username  : ${username}`);
  log('Password  : ***');

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 250,
    args: ['--start-maximized'],
  });

  const context: BrowserContext = await browser.newContext({
    viewport: null,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page: Page = await context.newPage();
  page.setDefaultTimeout(STEP_MS);

  try {
    // ── Step 1: Load login page ──────────────────────────────────────────────
    section('Step 1 — Login page');
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: STEP_MS });
    await page.waitForTimeout(2000);
    log(`Title: ${await page.title()}`);
    log(`URL  : ${page.url()}`);
    await shot(page, 'atrad-recon-01-login.png');

    // ── Step 2: Fill credentials ─────────────────────────────────────────────
    section('Step 2 — Fill credentials');
    const userOk = await fillField(page, username, [
      '#txtUserName',
      'input[name="txtUserName"]',
      'input[name="username"]',
      'input[type="text"]:first-of-type',
    ], 'username');

    const passOk = await fillField(page, password, [
      '#txtPassword',
      'input[name="txtPassword"]',
      'input[name="password"]',
      'input[type="password"]',
    ], 'password');

    if (!userOk || !passOk) {
      log('FATAL: Could not fill login form — saving debug HTML');
      fs.writeFileSync(path.join(SCRIPTS_DIR, 'atrad-recon-login-debug.html'), await page.content());
      log('Saved: atrad-recon-login-debug.html');
      await browser.close();
      process.exit(1);
    }

    // ── Step 3: Submit — ONE attempt only (avoid lockout) ───────────────────
    section('Step 3 — Submit login (single attempt)');
    const loginClicked = await clickEl(page, [
      '#btnSubmit',
      'button[type="submit"]',
      'input[type="submit"]',
      '#btnLogin',
      'button:has-text("Login")',
    ], 'login button');

    if (!loginClicked) {
      log('Login button not found — pressing Enter');
      await page.keyboard.press('Enter');
    }

    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: STEP_MS });
    } catch {
      await page.waitForTimeout(5000);
    }

    await shot(page, 'atrad-recon-02-post-login.png');
    log(`Post-login URL  : ${page.url()}`);
    log(`Post-login title: ${await page.title()}`);

    // Check for login error
    for (const sel of ['.error-message', '.alert-danger', '#errorMessage', '.error']) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        const msg = (await el.textContent() ?? '').trim();
        if (/invalid|incorrect|failed|wrong|locked/i.test(msg)) {
          log(`LOGIN ERROR: ${msg.slice(0, 200)}`);
          await browser.close();
          process.exit(1);
        }
      } catch { /* ignore */ }
    }
    log('Login appears successful');

    // Wait for Dojo to finish rendering the menu bar
    // ATRAD.MenuBar.displayMenuBar() injects items into #homeMenuBar after page load
    log('Waiting for Dojo menu bar to render...');
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('#homeMenuBar [widgetid]').length > 0 ||
              document.getElementById('dijit_PopupMenuBarItem_0') !== null ||
              document.getElementById('dijit_PopupMenuBarItem_4') !== null,
        { timeout: 12000 },
      );
      log('Dojo menu bar ready');
    } catch {
      log('Dojo menu wait timed out — waiting 5s fallback');
      await page.waitForTimeout(5000);
    }

    // Log what menu items are actually in the DOM so we can see exact IDs
    const menuItemIds: string[] = await page.evaluate(() => {
      const items = document.querySelectorAll('#homeMenuBar [widgetid], [id*="PopupMenuBarItem"]');
      return Array.from(items).map(el => `${el.tagName}#${el.id} widgetid=${el.getAttribute('widgetid') ?? ''} text=${(el.textContent ?? '').trim().slice(0, 30)}`);
    });
    log(`Menu items in DOM: ${JSON.stringify(menuItemIds)}`);

    // ── Step 4: Account Summary ──────────────────────────────────────────────
    section('Step 4 — Account Summary (cash balance)');
    const clientOk1 = await clickEl(page, [
      '#dijit_PopupMenuBarItem_4',
      '#dijit_PopupMenuBarItem_4_text',
      'span:has-text("Client")',
      'td:has-text("Client")',
      'div:has-text("Client")',
    ], 'Client menu');

    if (clientOk1) {
      try {
        await page.waitForSelector('#dijit_PopupMenuBarItem_4_dropdown', {
          state: 'visible', timeout: 8000,
        });
      } catch {
        await page.waitForTimeout(2000);
      }
      await clickEl(page, [
        '#dijit_MenuItem_41',
        '#dijit_MenuItem_41_text',
        'td:has-text("Account Summary")',
        'tr:has-text("Account Summary")',
      ], 'Account Summary menu item');
      await page.waitForTimeout(4000);
      await shot(page, 'atrad-recon-03-account-summary.png');

      const acctHtml = await page.content();
      const acctPath = path.join(DATA_DIR, 'recon-acct-summary.html');
      fs.writeFileSync(acctPath, acctHtml);
      log(`Account Summary HTML → ${acctPath} (${(acctHtml.length / 1024).toFixed(1)} KB)`);

      section('Account Balance');
      await scrapeBalance(page);
    } else {
      log('WARN: Could not open Client menu — skipping Account Summary');
    }

    // ── Step 5: Stock Holding ────────────────────────────────────────────────
    section('Step 5 — Stock Holding (portfolio)');

    // Intercept the XHR response that carries holdings data
    const holdingResponses: Array<{ url: string; body: string }> = [];
    // Capture ALL responses to see what fires after Refresh click
    page.on('response', async (response) => {
      const url = response.url();
      // Skip static assets
      if (/\.(js|css|png|gif|jpg|woff|ico)(\?|$)/i.test(url)) return;
      try {
        const body = await response.text();
        if (/holding|portfolio|client|getStock|equity|position/i.test(url + body.slice(0, 200))) {
          holdingResponses.push({ url, body: body.slice(0, 5000) });
          log(`  XHR captured: ${url} (${body.length} bytes)`);
        } else {
          // Log all non-asset requests anyway for debugging
          log(`  XHR (other): ${url.slice(0, 120)} status=${response.status()}`);
        }
      } catch { /* ignore */ }
    });

    const clientOk2 = await clickEl(page, [
      '#dijit_PopupMenuBarItem_4',
      '#dijit_PopupMenuBarItem_4_text',
      'span:has-text("Client")',
      'td:has-text("Client")',
      'div:has-text("Client")',
    ], 'Client menu (2nd)');

    if (clientOk2) {
      try {
        await page.waitForSelector('#dijit_PopupMenuBarItem_4_dropdown', {
          state: 'visible', timeout: 8000,
        });
      } catch {
        await page.waitForTimeout(2000);
      }
      await clickEl(page, [
        '#dijit_MenuItem_40',
        '#dijit_MenuItem_40_text',
        'td:has-text("Stock Holding")',
        'tr:has-text("Stock Holding")',
      ], 'Stock Holding menu item');

      // Wait for Dojo initialization (getUsersBrokerAndExchange + getClientAccount)
      await page.waitForTimeout(4000);

      // Strategy 1: click Refresh with Account=ALL, no security filter
      // (matches manual browser behaviour: leave security blank → shows all holdings)
      log('Clicking Refresh (Account=ALL, no security filter)...');
      const dojoSubmitResult = await page.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          if (!w.dijit?.byId) return 'dijit not available';

          // Set account to ALL
          const acctWidget = w.dijit.byId('stockHoldingClientAccount');
          if (acctWidget) acctWidget.set('value', 'ALL');

          // Clear security field so the form sends with no security restriction
          const secWidget = w.dijit.byId('stockHoldingSecurity');
          if (secWidget) {
            secWidget.set('value', '');
            secWidget.set('displayedValue', '');
          }
          // Also clear the underlying input directly
          const secInput = document.getElementById('stockHoldingSecurity') as HTMLInputElement | null;
          if (secInput) { secInput.value = ''; secInput.setAttribute('value', ''); }

          // Click Refresh
          const btn = w.dijit.byId('stockHoldingRefreshbtn');
          if (btn) { btn.onClick({}); return 'clicked Refresh'; }
          return 'Refresh button not found';
        } catch (e) {
          return `error: ${String(e)}`;
        }
      });
      log(`Dojo submit result: ${dojoSubmitResult}`);
      await page.waitForTimeout(2000);

      // Close any "Invalid security" validation dialog that client-side JS may show
      const dialogResult = await page.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          // Look for visible Dojo dialogs with a close icon or OK button
          for (const sel of [
            '.dijitDialogCloseIcon',
            '.dijitDialogPaneActionBar button',
            '.atradDialogCloseBtn',
            'button[title*="Close" i]',
            'button[title*="OK" i]',
            'span[title*="Close" i]',
          ]) {
            const btn = document.querySelector(sel) as HTMLElement | null;
            if (btn) { btn.click(); return `closed via ${sel}`; }
          }
          // Try ATRAD.ErrorPanel hide
          if (w.dijit?.registry) {
            for (const [, widget] of Object.entries(w.dijit.registry._hash ?? {})) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ww = widget as any;
              if (ww?.domNode?.style?.display !== 'none' &&
                  (ww?.id?.includes('Error') || ww?.declaredClass?.includes('Error'))) {
                if (ww.hide) { ww.hide(); return `hid ${ww.id}`; }
                if (ww.close) { ww.close(); return `closed ${ww.id}`; }
              }
            }
          }
          return 'no dialog found';
        } catch (e) { return `error: ${String(e)}`; }
      });
      log(`Dialog close: ${dialogResult}`);
      await page.waitForTimeout(1000);

      // Strategy 2: direct POST with the known security + actual account number
      // Account Summary confirms AEL.N0000 (200 shares) is in the system.
      // Try: (a) with actual account + AEL.N0000, (b) ALL + AEL.N0000
      log('Direct POST to getStockHolding with AEL.N0000...');
      const holdingXhrData: string = await page.evaluate(async () => {
        const base = window.location.origin + '/atsweb/client';
        // Read account from widget if available; fallback to known username
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        let account = '128229LI0'; // known account / username
        if (w.dijit?.byId) {
          const acct = w.dijit.byId('stockHoldingClientAccount');
          const v = acct?.get('value');
          if (v && v !== '' && v !== 'ALL') account = String(v);
        }
        const attempts = [
          { stockHoldingClientAccount: account, stockHoldingSecurity: 'AEL.N0000' },
          { stockHoldingClientAccount: 'ALL',   stockHoldingSecurity: 'AEL.N0000' },
        ];
        for (const extra of attempts) {
          const params = new URLSearchParams({
            action: 'getStockHolding',
            exchange: 'CSE',
            broker: 'FWS',
            format: 'json',
            ...extra,
          });
          try {
            const resp = await fetch(base, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            });
            const text = await resp.text();
            if (text && text.length > 10) return `POST params=${params.toString()}\nBODY:${text}`;
          } catch (e) { return `fetch error: ${String(e)}`; }
        }
        return 'no data';
      });
      log(`Direct POST result (first 400 chars): ${holdingXhrData.slice(0, 400)}`);
      if (holdingXhrData !== 'no data' && !holdingXhrData.startsWith('fetch error')) {
        holdingResponses.push({ url: 'direct-post', body: holdingXhrData });
        fs.writeFileSync(path.join(DATA_DIR, 'recon-holding-xhr.txt'), holdingXhrData);
        log('Holding POST data saved to recon-holding-xhr.txt');
      }

      // Strategy 3: Wait for grid to populate from any of the above
      log('Waiting for stockHoldingDataGrid rows...');
      try {
        await page.waitForFunction(
          () => {
            const selectors = [
              '[widgetid="stockHoldingDataGrid"]',
              '[widgetid="stockHoldingGridId"]',
              '#_atrad_equityDiv',
            ];
            for (const sel of selectors) {
              const grid = document.querySelector(sel);
              if (!grid) continue;
              for (const row of grid.querySelectorAll('.dojoxGridRow')) {
                for (const cell of row.querySelectorAll('.dojoxGridCell')) {
                  if (((cell.textContent ?? '').trim()).length > 1) return true;
                }
              }
            }
            return false;
          },
          { timeout: 10000 },
        );
        log('Grid populated');
      } catch {
        log('Grid still empty after all strategies');
        await page.waitForTimeout(2000);
      }
    } else {
      log('WARN: Could not open Client menu for Stock Holding');
      await page.waitForTimeout(5000);
    }

    // Log captured XHR responses
    if (holdingResponses.length > 0) {
      log(`Captured ${holdingResponses.length} XHR response(s):`);
      holdingResponses.forEach(({ url, body }) => {
        log(`  URL: ${url}`);
        log(`  Body (first 400): ${body.slice(0, 400)}`);
      });
    } else {
      log('No XHR responses captured');
    }

    // Main screenshot (the one the user asked for)
    await shot(page, 'atrad-recon-screenshot.png');
    log('Primary screenshot saved: scripts/atrad-recon-screenshot.png');

    // Full page HTML dump
    const holdingsHtml = await page.content();
    const holdingsPath = path.join(SCRIPTS_DIR, 'atrad-recon-holdings.html');
    fs.writeFileSync(holdingsPath, holdingsHtml);
    log(`Holdings HTML → ${holdingsPath} (${(holdingsHtml.length / 1024).toFixed(1)} KB)`);
    // Also keep a copy in data dir
    fs.writeFileSync(path.join(DATA_DIR, 'recon-stock-holding.html'), holdingsHtml);

    // ── Step 6: Parse and print holdings ─────────────────────────────────────
    section('Step 6 — Parse holdings');

    // Try to parse from XHR/POST data first
    // ATrad response shape: { data: { portfolios: [{clientaccount, holdername, quantity, avgPrice, totCost, lastTraded}],
    //                                  markerValTot: [...], quantityTot: [...] } }
    // NOTE: ATrad returns single-quoted JS object literals, not valid JSON.
    //       Must convert single quotes → double quotes before JSON.parse.
    function atradParse(raw: string): unknown {
      // Replace single-quoted keys/values with double quotes (handle escaped apostrophes)
      const normalized = raw
        .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"')  // quoted strings
        .replace(/:\s*''/g, ': ""')                     // empty string values
        .replace(/,\s*}/g, '}')                         // trailing commas
        .replace(/,\s*]/g, ']');
      return JSON.parse(normalized);
    }

    let holdingsFromXhr: Holding[] = [];
    for (const { url, body } of holdingResponses) {
      try {
        const bodyText = body.includes('BODY:') ? body.split('BODY:')[1].trim() : body;
        // ATrad uses single-quoted JS object literals — normalize first
        const json = atradParse(bodyText) as Record<string, unknown>;

        // Log top-level structure for diagnostics
        log(`  Parsing response from ${url}: keys=${Object.keys(json).join(',')}`);
        if (json?.code) log(`  ATrad code=${json.code} description=${String(json.description ?? '')}`);

        // Primary: ATrad portfolios array
        const portfolios: unknown[] =
          json?.data?.portfolios ?? json?.portfolios ?? [];

        if (Array.isArray(portfolios) && portfolios.length > 0) {
          for (const item of portfolios as Record<string, unknown>[]) {
            const sym = String(item.clientaccount ?? item.security ?? item.symbol ?? '');
            const qty = parseNumber(String(item.quantity ?? item.qty ?? 0));
            if (!sym || qty <= 0) continue;
            const avgPriceRaw = item.avgPrice ?? item.averagePrice ?? item.costPrice ?? 0;
            const lastTradedRaw = item.lastTraded ?? item.marketPrice ?? item.currentPrice ?? 0;
            const totCost = parseNumber(String(item.totCost ?? 0));
            const marketVal = qty * parseNumber(String(lastTradedRaw));
            holdingsFromXhr.push({
              symbol:       sym.replace(/\.N\d{4}$/i, '').trim(),
              qty,
              avgPrice:     parseNumber(String(avgPriceRaw)),
              currentPrice: parseNumber(String(lastTradedRaw)),
              marketValue:  marketVal || totCost,
              unrealizedPL: marketVal ? marketVal - totCost : 0,
            });
          }
          if (holdingsFromXhr.length > 0) {
            log(`Parsed ${holdingsFromXhr.length} holding(s) from ATrad portfolios array`);
            break;
          }
        }

        // Fallback: flat array at root
        const flat: unknown[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        for (const item of flat as Record<string, unknown>[]) {
          const sym = String(item.symbol ?? item.securityCode ?? item.security ?? item.clientaccount ?? '');
          const qty = parseNumber(String(item.quantity ?? item.qty ?? 0));
          if (!sym || qty <= 0) continue;
          holdingsFromXhr.push({
            symbol:       sym.replace(/\.N\d{4}$/i, '').trim(),
            qty,
            avgPrice:     parseNumber(String(item.avgPrice ?? item.averagePrice ?? 0)),
            currentPrice: parseNumber(String(item.lastTraded ?? item.marketPrice ?? 0)),
            marketValue:  parseNumber(String(item.marketValue ?? item.totCost ?? 0)),
            unrealizedPL: 0,
          });
        }
        if (holdingsFromXhr.length > 0) {
          log(`Parsed ${holdingsFromXhr.length} holding(s) from flat array`);
          break;
        }
      } catch (e) {
        log(`  JSON parse failed for ${url}: ${String(e).slice(0, 100)}`);
      }
    }

    const holdings = holdingsFromXhr.length > 0 ? holdingsFromXhr : await parseHoldings(page);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  ATrad Portfolio Holdings                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    if (holdings.length === 0) {
      console.log('║  (no holdings parsed — check atrad-recon-holdings.html)      ║');
    } else {
      holdings.forEach((h, i) => {
        const pl = h.unrealizedPL >= 0 ? `+${h.unrealizedPL.toFixed(2)}` : h.unrealizedPL.toFixed(2);
        console.log(`║  ${String(i + 1).padStart(2)}. ${h.symbol.padEnd(12)} qty=${String(h.qty).padStart(6)}  avg=${h.avgPrice.toFixed(2).padStart(8)}  cur=${h.currentPrice.toFixed(2).padStart(8)} ║`);
        console.log(`║      mktVal=${h.marketValue.toFixed(2).padStart(12)}  P&L=${pl.padStart(12)}                       ║`);
      });
      console.log('╠══════════════════════════════════════════════════════════════╣');
      const totalMV  = holdings.reduce((s, h) => s + h.marketValue, 0);
      const totalPL  = holdings.reduce((s, h) => s + h.unrealizedPL, 0);
      const plSign   = totalPL >= 0 ? '+' : '';
      console.log(`║  TOTAL  holdings=${holdings.length}  mktVal=${totalMV.toFixed(2).padStart(14)}  P&L=${plSign}${totalPL.toFixed(2).padStart(10)}  ║`);
    }
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // ── Step 7: Logout ────────────────────────────────────────────────────────
    section('Step 7 — Logout');
    const logoutOk = await clickEl(page, [
      '#butUserLogOut',          // confirmed Dojo widget ID
      '#butUserLogOut_label',
      'a:has-text("Logout")',
      'span:has-text("Logout")',
      'td:has-text("Logout")',
      '#logout',
    ], 'logout button');

    if (logoutOk) {
      await page.waitForTimeout(2000);
      log('Logged out');
    } else {
      log('Logout button not found — closing browser directly');
    }

    await context.close();
    await browser.close();
    log('Browser closed. Recon complete.');

    section('Output files');
    console.log(`  scripts/atrad-recon-screenshot.png`);
    console.log(`  scripts/atrad-recon-holdings.html`);
    console.log(`  data/atrad-sync/recon-acct-summary.html`);
    console.log(`  data/atrad-sync/recon-stock-holding.html\n`);

  } catch (err) {
    console.error(`\n[ERROR] ${String(err)}`);
    try {
      await shot(page, 'atrad-recon-error.png');
      fs.writeFileSync(path.join(SCRIPTS_DIR, 'atrad-recon-error.html'), await page.content());
      log('Error state saved: atrad-recon-error.png + atrad-recon-error.html');
    } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
