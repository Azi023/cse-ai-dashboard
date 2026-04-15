/**
 * ATrad Full Recon Script
 *
 * Steps:
 *   3A — Login page recon: verify access, dump all selectors
 *   3B — Login test: attempt login with credentials from env
 *   3C — Portfolio page recon: map holdings/balance selectors
 *   3D — Order entry page recon (READ ONLY): map form field IDs
 *
 * Usage (from src/backend/):
 *   npx tsx ../../src/agent/scripts/recon.ts
 *
 * Output:
 *   src/agent/screenshots/recon-*.png
 *   src/agent/src/atrad/selectors.ts  (generated from findings)
 *   stdout: full selector dump
 *
 * SAFETY:
 *   - READ-ONLY — never clicks buy/sell/submit on order forms
 *   - Max 1 login attempt
 *   - All screenshots saved for audit trail
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ── Environment ────────────────────────────────────────────────────────────

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
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

function loadEnv(): void {
  // Load agent .env first (takes priority), then root .env for missing keys
  const agentEnv = path.resolve(__dirname, '..', '.env');
  const rootEnv = path.resolve(__dirname, '..', '..', '..', '.env');
  loadEnvFile(agentEnv);
  loadEnvFile(rootEnv);
}

// ── Config ─────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const SELECTORS_OUTPUT = path.resolve(__dirname, '..', 'src', 'atrad', 'selectors.ts');
const TIMEOUT_MS = 30_000;
const STEP_MS = 15_000;

const ATRAD_LOGIN_URL = 'https://trade.hnbstockbrokers.lk/atsweb/login';

// Known selectors from existing codebase (to verify)
const KNOWN_SELECTORS = {
  login: {
    username: '#txtUserName',
    password: '#txtPassword',
    submit: '#btnSubmit',
  },
  navigation: {
    clientMenu: '#dijit_PopupMenuBarItem_4',
    stockHolding: '#dijit_MenuItem_40',
    accountSummary: '#dijit_MenuItem_41',
  },
  accountSummary: {
    cashBalance: '#txtAccSumaryCashBalance',
    buyingPower: '#txtAccSumaryBuyingPowr',
    portfolioValue: '#txtAccSumaryTMvaluePortfolio',
  },
  // Order entry — UNKNOWN, needs recon
  orderEntry: {} as Record<string, string>,
};

// Dangerous selectors — NEVER click these
const FORBIDDEN_SELECTORS = [
  '#btnBuy', '#btnSell', '#btnSubmitOrder', '#btnConfirmOrder',
  'button[name*="buy" i]', 'button[name*="sell" i]',
  'button[name*="order" i]', 'input[value*="Buy" i]',
  'input[value*="Sell" i]', 'input[value*="Submit Order" i]',
];

// ── Utilities ──────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function section(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, `recon-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  log(`Screenshot → ${filePath}`);
  return filePath;
}

// ── Selector Discovery ─────────────────────────────────────────────────────

interface DiscoveredElement {
  tag: string;
  id: string;
  name: string;
  type: string;
  placeholder: string;
  className: string;
  value: string;
  text: string;
  role: string;
  ariaLabel: string;
}

async function discoverFormElements(page: Page): Promise<DiscoveredElement[]> {
  return page.evaluate(() => {
    const selectors = 'input, select, textarea, button, [role="button"], [role="textbox"], [role="combobox"]';
    const elements = document.querySelectorAll(selectors);
    return Array.from(elements).map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      name: (el as HTMLInputElement).name || '',
      type: (el as HTMLInputElement).type || '',
      placeholder: (el as HTMLInputElement).placeholder || '',
      className: el.className || '',
      value: (el as HTMLInputElement).value || '',
      text: el.textContent?.trim().slice(0, 80) || '',
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
    }));
  });
}

async function discoverTables(page: Page): Promise<{ selector: string; rows: number; cols: number; headers: string[] }[]> {
  return page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    return Array.from(tables).map((t, i) => {
      const headers = Array.from(t.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
      return {
        selector: t.id ? `#${t.id}` : `table:nth-of-type(${i + 1})`,
        rows: t.querySelectorAll('tr').length,
        cols: t.querySelectorAll('tr:first-child td, tr:first-child th').length,
        headers,
      };
    });
  });
}

async function discoverGrids(page: Page): Promise<{ selector: string; role: string; rows: number; text: string }[]> {
  return page.evaluate(() => {
    // Dojo DataGrid uses role="grid" or dgrid containers
    const grids = document.querySelectorAll('[role="grid"], .dgrid, .dojoxGridView, [id*="grid" i], [class*="grid" i]');
    return Array.from(grids).map(g => ({
      selector: g.id ? `#${g.id}` : g.className.split(' ')[0] ? `.${g.className.split(' ')[0]}` : 'unknown',
      role: g.getAttribute('role') || '',
      rows: g.querySelectorAll('[role="row"], tr, .dgrid-row').length,
      text: g.textContent?.trim().slice(0, 200) || '',
    }));
  });
}

// ── Step 3A: Login Page Recon ──────────────────────────────────────────────

interface ReconFindings {
  loginPageLoaded: boolean;
  loginUrl: string;
  loginSelectors: {
    username: string | null;
    password: string | null;
    submit: string | null;
  };
  loginPageElements: DiscoveredElement[];
  loginSucceeded: boolean;
  portfolioSelectors: {
    cashBalance: string | null;
    buyingPower: string | null;
    portfolioValue: string | null;
    holdingsTable: string | null;
  };
  portfolioElements: DiscoveredElement[];
  portfolioTables: { selector: string; rows: number; cols: number; headers: string[] }[];
  portfolioGrids: { selector: string; role: string; rows: number; text: string }[];
  orderEntrySelectors: Record<string, string>;
  orderEntryElements: DiscoveredElement[];
  errors: string[];
}

async function step3A(page: Page, findings: ReconFindings): Promise<void> {
  section('STEP 3A — Login Page Recon');

  log(`Navigating to: ${ATRAD_LOGIN_URL}`);
  try {
    const response = await page.goto(ATRAD_LOGIN_URL, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT_MS,
    });

    if (!response) {
      log('ERROR: No response received');
      findings.errors.push('No response from ATrad login URL');
      return;
    }

    const status = response.status();
    log(`HTTP Status: ${status}`);

    if (status === 403) {
      log('FATAL: 403 Forbidden — ATrad is blocking this IP');
      findings.errors.push('403 Forbidden — ATrad blocks this IP');
      await screenshot(page, '3a-403-forbidden');
      return;
    }

    if (status >= 400) {
      log(`ERROR: HTTP ${status}`);
      findings.errors.push(`HTTP ${status} on login page`);
      await screenshot(page, `3a-http-${status}`);
      return;
    }

    findings.loginPageLoaded = true;
    findings.loginUrl = page.url();
    log(`SUCCESS: Login page loaded at ${findings.loginUrl}`);
    await screenshot(page, '3a-login-page');

    // Discover all form elements
    const elements = await discoverFormElements(page);
    findings.loginPageElements = elements;

    log(`\nFound ${elements.length} form elements:`);
    for (const el of elements) {
      const idStr = el.id ? `#${el.id}` : '';
      const nameStr = el.name ? `[name="${el.name}"]` : '';
      const typeStr = el.type ? `type="${el.type}"` : '';
      log(`  <${el.tag}> ${idStr} ${nameStr} ${typeStr} placeholder="${el.placeholder}" text="${el.text}"`);
    }

    // Verify known selectors
    log('\nVerifying known selectors:');
    for (const [key, selector] of Object.entries(KNOWN_SELECTORS.login)) {
      const exists = await page.$(selector);
      const status = exists ? 'FOUND' : 'MISSING';
      log(`  ${key}: ${selector} → ${status}`);

      if (exists) {
        (findings.loginSelectors as Record<string, string | null>)[key] = selector;
      } else {
        // Try to find alternative
        const alternatives = elements.filter(el => {
          if (key === 'username') return el.type === 'text' && (el.id.toLowerCase().includes('user') || el.name.toLowerCase().includes('user'));
          if (key === 'password') return el.type === 'password';
          if (key === 'submit') return el.tag === 'button' || (el.tag === 'input' && el.type === 'submit');
          return false;
        });
        if (alternatives.length > 0) {
          const alt = alternatives[0];
          const altSelector = alt.id ? `#${alt.id}` : alt.name ? `[name="${alt.name}"]` : null;
          log(`    → Alternative found: ${altSelector}`);
          (findings.loginSelectors as Record<string, string | null>)[key] = altSelector;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${msg}`);
    findings.errors.push(`Login page navigation failed: ${msg}`);
    await screenshot(page, '3a-error').catch(() => {});
  }
}

// ── Step 3B: Login Test ────────────────────────────────────────────────────

async function step3B(page: Page, findings: ReconFindings): Promise<void> {
  section('STEP 3B — Login Test');

  if (!findings.loginPageLoaded) {
    log('SKIP: Login page did not load in Step 3A');
    return;
  }

  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;

  if (!username || !password) {
    log('ERROR: ATRAD_USERNAME or ATRAD_PASSWORD not set in environment');
    findings.errors.push('Missing ATrad credentials in env');
    return;
  }

  log(`Logging in as: ${username.slice(0, 3)}***`);

  try {
    // Fill username
    const userSel = findings.loginSelectors.username;
    if (userSel) {
      await page.fill(userSel, username);
      log(`  Filled username via ${userSel}`);
    } else {
      log('  ERROR: No username selector found');
      findings.errors.push('No username selector');
      return;
    }

    // Fill password
    const passSel = findings.loginSelectors.password;
    if (passSel) {
      await page.fill(passSel, password);
      log(`  Filled password via ${passSel}`);
    } else {
      log('  ERROR: No password selector found');
      findings.errors.push('No password selector');
      return;
    }

    await screenshot(page, '3b-before-login');

    // Click login
    const submitSel = findings.loginSelectors.submit;
    if (submitSel) {
      await page.click(submitSel);
      log(`  Clicked login via ${submitSel}`);
    } else {
      log('  ERROR: No submit selector found');
      findings.errors.push('No submit selector');
      return;
    }

    // Wait for navigation or error
    log('  Waiting for post-login navigation...');
    await page.waitForTimeout(5000);

    // Check for login errors
    const errorText = await page.evaluate(() => {
      const errorEls = document.querySelectorAll('.error, .alert-danger, [class*="error" i], [class*="invalid" i], [id*="error" i]');
      return Array.from(errorEls).map(e => e.textContent?.trim()).filter(Boolean).join('; ');
    });

    if (errorText) {
      log(`  Login error message: ${errorText}`);
      findings.errors.push(`Login error: ${errorText}`);
      await screenshot(page, '3b-login-error');
      return;
    }

    // Check if URL changed (indicates successful login)
    const currentUrl = page.url();
    log(`  Current URL: ${currentUrl}`);

    if (currentUrl !== ATRAD_LOGIN_URL && !currentUrl.includes('login')) {
      findings.loginSucceeded = true;
      log('  SUCCESS: Login appears successful');
    } else {
      // Check for Dojo framework loading (ATrad uses Dojo)
      const hasDojo = await page.evaluate(() => !!(window as unknown as Record<string, unknown>).dojo || !!(window as unknown as Record<string, unknown>).dijit);
      if (hasDojo) {
        findings.loginSucceeded = true;
        log('  SUCCESS: Login succeeded (Dojo framework detected)');
      } else {
        log('  UNCERTAIN: URL did not change and no Dojo detected');
      }
    }

    await screenshot(page, '3b-post-login');

    // Wait a bit more for Dojo widgets to fully load
    await page.waitForTimeout(3000);
    await screenshot(page, '3b-post-login-settled');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  ERROR: ${msg}`);
    findings.errors.push(`Login attempt failed: ${msg}`);
    await screenshot(page, '3b-error').catch(() => {});
  }
}

// ── Step 3C: Portfolio Page Recon ──────────────────────────────────────────

async function step3C(page: Page, findings: ReconFindings): Promise<void> {
  section('STEP 3C — Portfolio Page Recon');

  if (!findings.loginSucceeded) {
    log('SKIP: Login did not succeed in Step 3B');
    return;
  }

  try {
    // Method 1: Try the Dojo menu navigation (Client → Stock Holding)
    log('Attempting menu navigation to Stock Holding...');

    const clientMenu = await page.$(KNOWN_SELECTORS.navigation.clientMenu);
    if (clientMenu) {
      log(`  Found client menu: ${KNOWN_SELECTORS.navigation.clientMenu}`);
      await clientMenu.click();
      await page.waitForTimeout(1500);
      await screenshot(page, '3c-menu-open');

      const stockHolding = await page.$(KNOWN_SELECTORS.navigation.stockHolding);
      if (stockHolding) {
        log(`  Found Stock Holding: ${KNOWN_SELECTORS.navigation.stockHolding}`);
        await stockHolding.click();
        await page.waitForTimeout(3000);
        log('  Navigated to Stock Holding page');
      } else {
        log('  WARN: Stock Holding menu item not found, trying alternatives...');
        // Dump all menu items
        const menuItems = await page.evaluate(() => {
          const items = document.querySelectorAll('[id^="dijit_MenuItem_"], .dijitMenuItem');
          return Array.from(items).map(item => ({
            id: item.id,
            text: item.textContent?.trim().slice(0, 60),
          }));
        });
        log(`  Available menu items: ${JSON.stringify(menuItems, null, 2)}`);
      }
    } else {
      log('  WARN: Client menu not found, dumping navigation elements...');
      const navElements = await page.evaluate(() => {
        const items = document.querySelectorAll('[id^="dijit_"], .dijitMenuBarItem, [role="menubar"] [role="menuitem"]');
        return Array.from(items).map(item => ({
          id: item.id,
          text: item.textContent?.trim().slice(0, 60),
          tag: item.tagName.toLowerCase(),
        }));
      });
      log(`  Navigation elements: ${JSON.stringify(navElements, null, 2)}`);
    }

    await screenshot(page, '3c-stock-holding');

    // Now try Account Summary
    log('\nNavigating to Account Summary...');
    const clientMenu2 = await page.$(KNOWN_SELECTORS.navigation.clientMenu);
    if (clientMenu2) {
      await clientMenu2.click();
      await page.waitForTimeout(1500);

      const acctSummary = await page.$(KNOWN_SELECTORS.navigation.accountSummary);
      if (acctSummary) {
        log(`  Found Account Summary: ${KNOWN_SELECTORS.navigation.accountSummary}`);
        await acctSummary.click();
        await page.waitForTimeout(3000);
        log('  Navigated to Account Summary page');
      }
    }

    await screenshot(page, '3c-account-summary');

    // Verify account summary selectors
    log('\nVerifying account summary selectors:');
    for (const [key, selector] of Object.entries(KNOWN_SELECTORS.accountSummary)) {
      const el = await page.$(selector);
      if (el) {
        const value = await el.inputValue().catch(() => null) || await el.textContent().catch(() => null);
        log(`  ${key}: ${selector} → FOUND (value: "${value}")`);
        (findings.portfolioSelectors as Record<string, string | null>)[key] = selector;
      } else {
        log(`  ${key}: ${selector} → MISSING`);
      }
    }

    // Discover all form elements on portfolio pages
    findings.portfolioElements = await discoverFormElements(page);
    log(`\nForm elements on portfolio page: ${findings.portfolioElements.length}`);
    for (const el of findings.portfolioElements) {
      if (el.id || el.name) {
        const idStr = el.id ? `#${el.id}` : '';
        const nameStr = el.name ? `[name="${el.name}"]` : '';
        const val = el.value ? ` = "${el.value.slice(0, 40)}"` : '';
        log(`  <${el.tag}> ${idStr} ${nameStr}${val}`);
      }
    }

    // Discover tables and grids
    findings.portfolioTables = await discoverTables(page);
    findings.portfolioGrids = await discoverGrids(page);

    log(`\nTables found: ${findings.portfolioTables.length}`);
    for (const t of findings.portfolioTables) {
      log(`  ${t.selector}: ${t.rows} rows, ${t.cols} cols, headers: [${t.headers.join(', ')}]`);
    }

    log(`\nGrids found: ${findings.portfolioGrids.length}`);
    for (const g of findings.portfolioGrids) {
      log(`  ${g.selector}: ${g.rows} rows, role="${g.role}", text: "${g.text.slice(0, 100)}"`);
    }

    // Navigate back to Stock Holding and look for the holdings data specifically
    log('\nNavigating back to Stock Holding for holdings data...');
    const clientMenu3 = await page.$(KNOWN_SELECTORS.navigation.clientMenu);
    if (clientMenu3) {
      await clientMenu3.click();
      await page.waitForTimeout(1000);
      const sh = await page.$(KNOWN_SELECTORS.navigation.stockHolding);
      if (sh) {
        await sh.click();
        await page.waitForTimeout(3000);
      }
    }

    await screenshot(page, '3c-holdings-data');

    // Try to find and dump the holdings grid/table data
    const holdingsData = await page.evaluate(() => {
      // Look for the equity div that ATrad uses
      const equityDiv = document.querySelector('#_atrad_equityDiv');
      if (equityDiv) {
        return {
          found: '#_atrad_equityDiv',
          html: equityDiv.innerHTML.slice(0, 2000),
        };
      }
      // Fallback: look for any table with stock data
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const text = table.textContent || '';
        if (text.includes('AEL') || text.includes('Symbol') || text.includes('Qty') || text.includes('Holding')) {
          return {
            found: table.id ? `#${table.id}` : 'table (matched by content)',
            html: table.outerHTML.slice(0, 2000),
          };
        }
      }
      return { found: null, html: '' };
    });

    if (holdingsData.found) {
      log(`\nHoldings container: ${holdingsData.found}`);
      findings.portfolioSelectors.holdingsTable = holdingsData.found;
    } else {
      log('\nWARN: Could not locate holdings table/grid');
    }

    // Save holdings HTML for analysis
    if (holdingsData.html) {
      const htmlPath = path.join(SCREENSHOT_DIR, 'recon-holdings-html.txt');
      fs.writeFileSync(htmlPath, holdingsData.html, 'utf-8');
      log(`  Holdings HTML saved → ${htmlPath}`);
    }

    // Try the API approach (ATrad has a JSON API for holdings)
    log('\nTrying ATrad JSON API for holdings...');
    const apiResult = await page.evaluate(async () => {
      try {
        const resp = await fetch('/atsweb/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'action=getStockHolding&exchange=CSE&broker=FWS&stockHoldingClientAccount=128229LI0&stockHoldingSecurity=&format=json',
        });
        const text = await resp.text();
        return { status: resp.status, body: text.slice(0, 3000) };
      } catch (err) {
        return { status: -1, body: String(err) };
      }
    });

    log(`  API response status: ${apiResult.status}`);
    if (apiResult.body) {
      log(`  API response body: ${apiResult.body.slice(0, 500)}`);
      const apiPath = path.join(SCREENSHOT_DIR, 'recon-api-holdings.json');
      fs.writeFileSync(apiPath, apiResult.body, 'utf-8');
      log(`  API response saved → ${apiPath}`);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${msg}`);
    findings.errors.push(`Portfolio recon failed: ${msg}`);
    await screenshot(page, '3c-error').catch(() => {});
  }
}

// ── Step 3D: Order Entry Page Recon (READ ONLY) ───────────────────────────

async function step3D(page: Page, findings: ReconFindings): Promise<void> {
  section('STEP 3D — Order Entry Page Recon (READ ONLY)');

  if (!findings.loginSucceeded) {
    log('SKIP: Login did not succeed');
    return;
  }

  try {
    // Look for order/trade entry in the Dojo menu
    log('Looking for order entry form...');

    // Common navigation paths in ATrad
    const orderNavPaths = [
      { menu: '#dijit_PopupMenuBarItem_0', label: 'Trade/Order menu item 0' },
      { menu: '#dijit_PopupMenuBarItem_1', label: 'Trade/Order menu item 1' },
      { menu: '#dijit_PopupMenuBarItem_2', label: 'Trade/Order menu item 2' },
      { menu: '#dijit_PopupMenuBarItem_3', label: 'Trade/Order menu item 3' },
    ];

    // First, dump all top-level menu bar items
    const menuBar = await page.evaluate(() => {
      const items = document.querySelectorAll('[id^="dijit_PopupMenuBarItem_"], .dijitMenuBarItem');
      return Array.from(items).map(item => ({
        id: item.id,
        text: item.textContent?.trim().slice(0, 40),
      }));
    });

    log('Top-level menu bar items:');
    for (const item of menuBar) {
      log(`  ${item.id}: "${item.text}"`);
    }

    // Try each menu to find order-related items
    for (const nav of orderNavPaths) {
      const menuEl = await page.$(nav.menu);
      if (!menuEl) continue;

      log(`\nExploring menu: ${nav.menu}`);
      await menuEl.click();
      await page.waitForTimeout(1500);

      const subItems = await page.evaluate(() => {
        const items = document.querySelectorAll('.dijitMenuItemLabel, [id^="dijit_MenuItem_"]');
        return Array.from(items)
          .filter(item => item.offsetParent !== null) // visible only
          .map(item => ({
            id: item.id || (item.parentElement?.id || ''),
            text: item.textContent?.trim().slice(0, 60),
          }));
      });

      log('  Sub-menu items:');
      for (const sub of subItems) {
        log(`    ${sub.id}: "${sub.text}"`);
      }

      // Look for "Order" or "Trade" items
      const orderItem = subItems.find(s =>
        s.text?.toLowerCase().includes('order') ||
        s.text?.toLowerCase().includes('trade') ||
        s.text?.toLowerCase().includes('buy') ||
        s.text?.toLowerCase().includes('new order')
      );

      if (orderItem && orderItem.id) {
        log(`  Found order-related item: ${orderItem.id} = "${orderItem.text}"`);

        // Click it to reveal the order form
        const orderEl = await page.$(`#${orderItem.id}`);
        if (orderEl) {
          await orderEl.click();
          await page.waitForTimeout(3000);
          log('  Navigated to order form');
          await screenshot(page, '3d-order-form');
          break;
        }
      }

      // Close the menu by pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Now discover all form elements on the current page
    const elements = await discoverFormElements(page);
    findings.orderEntryElements = elements;

    log(`\nOrder page form elements: ${elements.length}`);

    // Categorize elements
    const categories: Record<string, DiscoveredElement[]> = {
      symbol: [],
      quantity: [],
      price: [],
      orderType: [],
      buySell: [],
      submit: [],
      other: [],
    };

    for (const el of elements) {
      const combined = `${el.id} ${el.name} ${el.placeholder} ${el.className} ${el.ariaLabel}`.toLowerCase();

      if (combined.includes('symbol') || combined.includes('security') || combined.includes('stock') || combined.includes('scrip')) {
        categories.symbol.push(el);
      } else if (combined.includes('quantity') || combined.includes('qty') || combined.includes('volume')) {
        categories.quantity.push(el);
      } else if (combined.includes('price') || combined.includes('rate') || combined.includes('limit')) {
        categories.price.push(el);
      } else if (combined.includes('order') && combined.includes('type')) {
        categories.orderType.push(el);
      } else if (combined.includes('buy') || combined.includes('sell') || combined.includes('side')) {
        categories.buySell.push(el);
      } else if (el.tag === 'button' || el.type === 'submit') {
        categories.submit.push(el);
      } else {
        categories.other.push(el);
      }
    }

    log('\nCategorized elements:');
    for (const [cat, els] of Object.entries(categories)) {
      if (els.length === 0) continue;
      log(`\n  ${cat.toUpperCase()}:`);
      for (const el of els) {
        const idStr = el.id ? `#${el.id}` : '';
        const nameStr = el.name ? `[name="${el.name}"]` : '';
        const typeStr = el.type ? `type="${el.type}"` : '';
        log(`    <${el.tag}> ${idStr} ${nameStr} ${typeStr} placeholder="${el.placeholder}"`);

        // Map to findings
        if (cat !== 'other' && cat !== 'submit') {
          const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : null;
          if (selector) {
            findings.orderEntrySelectors[cat] = selector;
          }
        }
      }
    }

    // Check for order entry iframe (some platforms use iframes)
    const iframes = await page.evaluate(() => {
      const frames = document.querySelectorAll('iframe');
      return Array.from(frames).map(f => ({
        id: f.id,
        name: f.name,
        src: f.src,
      }));
    });

    if (iframes.length > 0) {
      log(`\nIframes found: ${iframes.length}`);
      for (const iframe of iframes) {
        log(`  #${iframe.id || 'unnamed'} name="${iframe.name}" src="${iframe.src}"`);
      }
    }

    await screenshot(page, '3d-final');

    // SAFETY: Verify we haven't accidentally navigated to a dangerous state
    log('\nSAFETY CHECK: Verifying no dangerous buttons were activated...');
    for (const sel of FORBIDDEN_SELECTORS) {
      const dangerEl = await page.$(sel);
      if (dangerEl) {
        const isVisible = await dangerEl.isVisible();
        log(`  WARNING: Dangerous button visible: ${sel} (visible: ${isVisible})`);
      }
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${msg}`);
    findings.errors.push(`Order entry recon failed: ${msg}`);
    await screenshot(page, '3d-error').catch(() => {});
  }
}

// ── Generate selectors.ts ──────────────────────────────────────────────────

function generateSelectorsFile(findings: ReconFindings): void {
  section('Generating selectors.ts');

  const content = `/**
 * ATrad DOM Selectors — Auto-generated by recon.ts on ${new Date().toISOString()}
 *
 * These selectors were discovered by automated Playwright recon of the ATrad
 * trading platform at trade.hnbstockbrokers.lk.
 *
 * DO NOT EDIT MANUALLY unless recon confirms changes.
 */

// ── Login Form ─────────────────────────────────────────────────────────────

export const LOGIN_SELECTORS = {
  url: '${findings.loginUrl || ATRAD_LOGIN_URL}',
  username: '${findings.loginSelectors.username || '#txtUserName'}',
  password: '${findings.loginSelectors.password || '#txtPassword'}',
  submit: '${findings.loginSelectors.submit || '#btnSubmit'}',
} as const;

// ── Navigation (Dojo MenuBar) ──────────────────────────────────────────────

export const NAV_SELECTORS = {
  clientMenu: '${KNOWN_SELECTORS.navigation.clientMenu}',
  stockHolding: '${KNOWN_SELECTORS.navigation.stockHolding}',
  accountSummary: '${KNOWN_SELECTORS.navigation.accountSummary}',
} as const;

// ── Account Summary ────────────────────────────────────────────────────────

export const ACCOUNT_SELECTORS = {
  cashBalance: '${findings.portfolioSelectors.cashBalance || '#txtAccSumaryCashBalance'}',
  buyingPower: '${findings.portfolioSelectors.buyingPower || '#txtAccSumaryBuyingPowr'}',
  portfolioValue: '${findings.portfolioSelectors.portfolioValue || '#txtAccSumaryTMvaluePortfolio'}',
} as const;

// ── Holdings ───────────────────────────────────────────────────────────────

export const HOLDINGS_SELECTORS = {
  /** Container for holdings data — may be table, Dojo grid, or API-based */
  container: '${findings.portfolioSelectors.holdingsTable || '#_atrad_equityDiv'}',
  /** ATrad JSON API endpoint for holdings (called via fetch inside browser context) */
  apiEndpoint: '/atsweb/client',
  apiParams: {
    action: 'getStockHolding',
    exchange: 'CSE',
    broker: 'FWS',
    stockHoldingClientAccount: '128229LI0',
    stockHoldingSecurity: '',
    format: 'json',
  },
} as const;

// ── Order Entry (RECON REQUIRED — populated by Step 3D) ───────────────────

export const ORDER_SELECTORS = {
  symbol: '${findings.orderEntrySelectors.symbol || 'FILL_AFTER_RECON'}',
  quantity: '${findings.orderEntrySelectors.quantity || 'FILL_AFTER_RECON'}',
  price: '${findings.orderEntrySelectors.price || 'FILL_AFTER_RECON'}',
  orderType: '${findings.orderEntrySelectors.orderType || 'FILL_AFTER_RECON'}',
  buySell: '${findings.orderEntrySelectors.buySell || 'FILL_AFTER_RECON'}',
  /** NEVER click this during recon or testing */
  submitOrder: 'FILL_AFTER_RECON',
} as const;

// ── Dangerous Selectors (NEVER CLICK) ──────────────────────────────────────

export const FORBIDDEN_SELECTORS = [
  '#btnBuy', '#btnSell', '#btnSubmitOrder', '#btnConfirmOrder',
  'button[name*="buy" i]', 'button[name*="sell" i]',
  'button[name*="order" i]', 'input[value*="Buy" i]',
  'input[value*="Sell" i]', 'input[value*="Submit Order" i]',
] as const;
`;

  const dir = path.dirname(SELECTORS_OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SELECTORS_OUTPUT, content, 'utf-8');
  log(`selectors.ts written → ${SELECTORS_OUTPUT}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();

  section('ATrad Full Recon — Starting');
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Screenshots: ${SCREENSHOT_DIR}`);
  log(`Selectors output: ${SELECTORS_OUTPUT}`);

  // Ensure directories
  [SCREENSHOT_DIR, path.dirname(SELECTORS_OUTPUT)].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const findings: ReconFindings = {
    loginPageLoaded: false,
    loginUrl: '',
    loginSelectors: { username: null, password: null, submit: null },
    loginPageElements: [],
    loginSucceeded: false,
    portfolioSelectors: { cashBalance: null, buyingPower: null, portfolioValue: null, holdingsTable: null },
    portfolioElements: [],
    portfolioTables: [],
    portfolioGrids: [],
    orderEntrySelectors: {},
    orderEntryElements: [],
    errors: [],
  };

  let browser: Browser | null = null;

  try {
    log('Launching Chromium (headed mode)...');
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(STEP_MS);

    // Execute all steps sequentially
    await step3A(page, findings);
    await step3B(page, findings);
    await step3C(page, findings);
    await step3D(page, findings);

    // Generate selectors.ts from findings
    generateSelectorsFile(findings);

    // Final summary
    section('RECON SUMMARY');
    log(`Login page loaded: ${findings.loginPageLoaded}`);
    log(`Login URL: ${findings.loginUrl}`);
    log(`Login selectors: ${JSON.stringify(findings.loginSelectors)}`);
    log(`Login succeeded: ${findings.loginSucceeded}`);
    log(`Portfolio selectors: ${JSON.stringify(findings.portfolioSelectors)}`);
    log(`Order entry selectors: ${JSON.stringify(findings.orderEntrySelectors)}`);
    log(`Errors: ${findings.errors.length > 0 ? findings.errors.join('; ') : 'None'}`);

    // Save full findings as JSON
    const findingsPath = path.join(SCREENSHOT_DIR, 'recon-findings.json');
    const jsonFindings = {
      ...findings,
      loginPageElements: findings.loginPageElements.length,
      portfolioElements: findings.portfolioElements.length,
      orderEntryElements: findings.orderEntryElements.length,
    };
    fs.writeFileSync(findingsPath, JSON.stringify(jsonFindings, null, 2), 'utf-8');
    log(`Findings JSON → ${findingsPath}`);

    await page.close();
    await context.close();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL ERROR: ${msg}`);
    findings.errors.push(`Fatal: ${msg}`);
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed');
    }
  }

  if (findings.errors.length > 0) {
    console.log('\n⚠ Recon completed with errors:');
    for (const e of findings.errors) {
      console.log(`  - ${e}`);
    }
    process.exit(findings.loginPageLoaded ? 0 : 1);
  } else {
    console.log('\n✓ Recon completed successfully');
    process.exit(0);
  }
}

main();
