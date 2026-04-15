/**
 * ATrad Order Entry Recon — Focused script to map order form selectors.
 *
 * The main recon script failed to open the Orders dropdown properly.
 * This script:
 *   1. Logs in
 *   2. Clicks "Orders" menu → lists sub-items
 *   3. Clicks the correct sub-item to open the order entry form
 *   4. Maps every form field (symbol, qty, price, buy/sell, order type, submit)
 *   5. Screenshots everything
 *   6. Does NOT click submit or any dangerous buttons
 *
 * Usage: cd src/agent && npx tsx scripts/order-recon.ts
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
  const agentEnv = path.resolve(__dirname, '..', '.env');
  const rootEnv = path.resolve(__dirname, '..', '..', '..', '.env');
  loadEnvFile(agentEnv);
  loadEnvFile(rootEnv);
}

// ── Config ─────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const ATRAD_LOGIN_URL = 'https://trade.hnbstockbrokers.lk/atsweb/login';

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, `order-recon-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  log(`Screenshot → ${filePath}`);
  return filePath;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();

  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;

  if (!username || !password) {
    console.error('ERROR: ATRAD_USERNAME or ATRAD_PASSWORD not set');
    process.exit(1);
  }

  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
    page.setDefaultTimeout(15_000);

    // ── Step 1: Login ──────────────────────────────────────────────────
    log('Step 1: Login');
    await page.goto(ATRAD_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.fill('#txtUserName', username);
    await page.fill('#txtPassword', password);
    await page.click('#btnSubmit');
    await page.waitForTimeout(5000);

    const url = page.url();
    if (url.includes('login') && !url.includes('home')) {
      log('FATAL: Login failed');
      await screenshot(page, '1-login-failed');
      return;
    }
    log(`Login OK → ${url}`);
    await page.waitForTimeout(3000); // Let Dojo widgets fully load
    await screenshot(page, '1-logged-in');

    // ── Step 2: Explore Orders menu ────────────────────────────────────
    log('\nStep 2: Exploring Orders menu dropdown');

    // Click the "Orders" menu bar item to open its dropdown
    const ordersMenu = await page.$('#dijit_PopupMenuBarItem_2');
    if (!ordersMenu) {
      log('ERROR: Orders menu not found at #dijit_PopupMenuBarItem_2');
      // Dump all menu bar items as fallback
      const allMenus = await page.evaluate(() => {
        const items = document.querySelectorAll('[id^="dijit_PopupMenuBarItem_"]');
        return Array.from(items).map(el => ({ id: el.id, text: el.textContent?.trim().slice(0, 40) }));
      });
      log(`Available menus: ${JSON.stringify(allMenus)}`);
      return;
    }

    await ordersMenu.click();
    await page.waitForTimeout(2000);
    await screenshot(page, '2-orders-dropdown');

    // Dump ALL visible menu items in the dropdown popup
    // The Dojo popup menu appears as a separate container
    const dropdownItems = await page.evaluate(() => {
      // Dojo popup menus are positioned absolutely and become visible
      const popups = document.querySelectorAll('.dijitMenuPopup, .dijitPopup');
      const results: { popupId: string; items: { id: string; text: string; visible: boolean }[] }[] = [];

      for (const popup of popups) {
        const items = popup.querySelectorAll('.dijitMenuItem, [role="menuitem"]');
        const popupItems = Array.from(items).map(item => ({
          id: item.id || '',
          text: item.textContent?.trim().slice(0, 80) || '',
          visible: (item as HTMLElement).offsetParent !== null,
        }));

        if (popupItems.length > 0) {
          results.push({
            popupId: popup.id || popup.className.split(' ')[0],
            items: popupItems,
          });
        }
      }

      // Also check for menu items that might be direct children of a visible menu
      const allMenuItems = document.querySelectorAll('[id^="dijit_MenuItem_"]');
      const visibleItems = Array.from(allMenuItems)
        .filter(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map(el => ({
          id: el.id,
          text: el.textContent?.trim().slice(0, 80) || '',
          visible: true,
        }));

      return { popups: results, visibleMenuItems: visibleItems };
    });

    log('Dropdown popups:');
    for (const popup of dropdownItems.popups) {
      log(`  Popup: ${popup.popupId}`);
      for (const item of popup.items) {
        log(`    ${item.id}: "${item.text}" (visible: ${item.visible})`);
      }
    }

    log('\nAll visible dijit_MenuItem elements:');
    for (const item of dropdownItems.visibleMenuItems) {
      log(`  ${item.id}: "${item.text}"`);
    }

    // ── Step 3: Try to find and click the order entry sub-item ─────────
    log('\nStep 3: Finding order entry form');

    // Common names for order entry in broker platforms
    const orderKeywords = ['new order', 'order entry', 'place order', 'equity order', 'buy', 'buy order'];

    let orderFormOpened = false;

    // First try: click each visible menu item under Orders that looks like order entry
    for (const item of dropdownItems.visibleMenuItems) {
      const text = item.text.toLowerCase();
      if (orderKeywords.some(kw => text.includes(kw))) {
        log(`  Clicking order entry: ${item.id} = "${item.text}"`);
        const el = await page.$(`#${item.id}`);
        if (el) {
          await el.click();
          await page.waitForTimeout(3000);
          await screenshot(page, '3-order-form-opened');
          orderFormOpened = true;
          break;
        }
      }
    }

    // If no match found, try clicking all visible items under the Orders dropdown
    if (!orderFormOpened) {
      log('  No keyword match found. Trying each visible sub-item...');

      // Re-open the Orders dropdown (it may have closed)
      await ordersMenu.click();
      await page.waitForTimeout(1500);

      // Find items that are actually part of the Orders dropdown (not top-level menus)
      // Orders dropdown items should have IDs like dijit_MenuItem_10, _11, etc.
      // Top-level menus are dijit_PopupMenuBarItem_*
      const subItems = dropdownItems.visibleMenuItems.filter(
        item => item.id.startsWith('dijit_MenuItem_') && !item.text.match(/^(Watch|Market|Orders|Order Management|Client|Chart|Analysis|Report|Announcements)$/),
      );

      log(`  Filtered sub-items (${subItems.length}):`);
      for (const item of subItems) {
        log(`    ${item.id}: "${item.text}"`);
      }

      // Click the first non-navigation sub-item
      if (subItems.length > 0) {
        const target = subItems[0];
        log(`  Clicking first sub-item: ${target.id} = "${target.text}"`);
        const el = await page.$(`#${target.id}`);
        if (el) {
          await el.click();
          await page.waitForTimeout(3000);
          await screenshot(page, '3-order-form-attempt');
          orderFormOpened = true;
        }
      }
    }

    // ── Step 4: Also try Order Management menu ─────────────────────────
    if (!orderFormOpened) {
      log('\nStep 4: Trying Order Management menu (#dijit_PopupMenuBarItem_3)');
      const orderMgmt = await page.$('#dijit_PopupMenuBarItem_3');
      if (orderMgmt) {
        await orderMgmt.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '4-order-mgmt-dropdown');

        const mgmtItems = await page.evaluate(() => {
          const items = document.querySelectorAll('[id^="dijit_MenuItem_"]');
          return Array.from(items)
            .filter(el => {
              const rect = (el as HTMLElement).getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .map(el => ({
              id: el.id,
              text: el.textContent?.trim().slice(0, 80) || '',
            }));
        });

        log('Order Management sub-items:');
        for (const item of mgmtItems) {
          log(`  ${item.id}: "${item.text}"`);
        }
      }
    }

    // ── Step 5: Check if the order form is on the main page already ────
    // Some platforms show order entry inline (not via menu navigation)
    log('\nStep 5: Scanning page for inline order entry elements');

    // Look for common order form patterns by checking all visible inputs/selects
    const formFields = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      return Array.from(inputs)
        .filter(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map(el => {
          const input = el as HTMLInputElement;
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            name: input.name || '',
            type: input.type || '',
            placeholder: input.placeholder || '',
            value: input.value?.slice(0, 50) || '',
            className: el.className?.slice(0, 80) || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            parentId: el.parentElement?.id || '',
            label: (() => {
              // Try to find associated label
              if (el.id) {
                const label = document.querySelector(`label[for="${el.id}"]`);
                if (label) return label.textContent?.trim().slice(0, 40) || '';
              }
              // Check previous sibling text
              const prev = el.previousElementSibling;
              if (prev && prev.tagName === 'LABEL') return prev.textContent?.trim().slice(0, 40) || '';
              return '';
            })(),
          };
        });
    });

    log(`Found ${formFields.length} visible form fields:`);
    for (const f of formFields) {
      const parts = [
        `<${f.tag}>`,
        f.id ? `#${f.id}` : '',
        f.name ? `[name="${f.name}"]` : '',
        f.type ? `type="${f.type}"` : '',
        f.value ? `val="${f.value}"` : '',
        f.placeholder ? `ph="${f.placeholder}"` : '',
        f.label ? `label="${f.label}"` : '',
        f.ariaLabel ? `aria="${f.ariaLabel}"` : '',
      ].filter(Boolean).join(' ');
      log(`  ${parts}`);
    }

    // ── Step 6: Try clicking on the market watch row to see buy dialog ──
    log('\nStep 6: Trying to click a stock row to trigger buy dialog');

    // Close any open menus first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Look for clickable stock rows — ATrad might show a buy/sell dialog on row click or double-click
    const stockRows = await page.evaluate(() => {
      // Market watch grid rows
      const cells = document.querySelectorAll('.dojoxGridCell, [role="gridcell"]');
      const aelCells = Array.from(cells).filter(c => c.textContent?.includes('AEL'));
      return aelCells.map(c => ({
        text: c.textContent?.trim().slice(0, 50),
        id: c.id,
        parentId: c.parentElement?.id || '',
        className: c.className?.slice(0, 60),
      }));
    });

    log(`AEL cells found: ${stockRows.length}`);
    for (const row of stockRows) {
      log(`  ${row.id || row.className}: "${row.text}" parent=${row.parentId}`);
    }

    // Try double-clicking on the market watch to see if order dialog appears
    // First, find the market watch grid
    const marketWatchGrid = await page.$('#gridContainer4');
    if (marketWatchGrid) {
      // Find a cell in the grid (try to find one with a security name)
      const firstSecurityCell = await page.$('#gridContainer4 .dojoxGridCell');
      if (firstSecurityCell) {
        log('  Double-clicking a market watch cell...');
        await firstSecurityCell.dblclick();
        await page.waitForTimeout(2000);
        await screenshot(page, '6-after-dblclick');

        // Check if a new dialog/panel appeared
        const newDialogs = await page.evaluate(() => {
          const dialogs = document.querySelectorAll('.dijitDialog, [role="dialog"], .dijitDialogPaneContent, .dijitDialogUnderlay');
          return Array.from(dialogs)
            .filter(el => (el as HTMLElement).offsetParent !== null)
            .map(el => ({
              id: el.id,
              className: el.className?.slice(0, 80),
              text: el.textContent?.trim().slice(0, 200),
            }));
        });

        log(`Dialogs after double-click: ${newDialogs.length}`);
        for (const d of newDialogs) {
          log(`  ${d.id}: "${d.text}"`);
        }
      }
    }

    // ── Step 7: Try the ATrad API for order entry ──────────────────────
    log('\nStep 7: Checking ATrad API endpoints for order entry');

    // ATrad uses internal fetch calls — check if there's an order-related API
    const apiCheck = await page.evaluate(async () => {
      const results: Record<string, string> = {};

      // Test known API patterns
      const endpoints = [
        { url: '/atsweb/order', body: 'action=getOrderForm&format=json' },
        { url: '/atsweb/order', body: 'action=newOrder&format=html' },
        { url: '/atsweb/client', body: 'action=getOrderEntry&format=json' },
      ];

      for (const ep of endpoints) {
        try {
          const resp = await fetch(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: ep.body,
          });
          const text = await resp.text();
          results[`${ep.url}?${ep.body}`] = `HTTP ${resp.status}: ${text.slice(0, 200)}`;
        } catch (err) {
          results[`${ep.url}?${ep.body}`] = `ERROR: ${String(err)}`;
        }
      }

      return results;
    });

    log('API endpoint checks:');
    for (const [endpoint, result] of Object.entries(apiCheck)) {
      log(`  ${endpoint}`);
      log(`    → ${result}`);
    }

    // ── Final: Take comprehensive screenshot ───────────────────────────
    await screenshot(page, 'final');

    // Cleanup
    await page.close();
    await context.close();

    log('\nOrder Entry Recon Complete');
    log('Review screenshots in src/agent/screenshots/order-recon-*');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL: ${msg}`);
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed');
    }
  }
}

main();
