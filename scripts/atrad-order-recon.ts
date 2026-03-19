/**
 * atrad-order-recon.ts — ATrad Order UI Recon Script
 *
 * PURPOSE: Discover ATrad's order placement interface selectors.
 * Run this BEFORE building the order executor.
 *
 * READ-ONLY: Does NOT fill any form fields or click any order submit buttons.
 * Only navigates, screenshots, and dumps HTML.
 *
 * Usage (from src/backend/ directory):
 *   npx tsx ../../scripts/atrad-order-recon.ts
 *
 * Output:
 *   data/atrad-sync/order-recon/  — screenshots of every discovered menu/form
 *   data/atrad-sync/order-recon/summary.json — discovered selector candidates
 *
 * After running, check the screenshots and summary.json, then fill in the
 * FILL_AFTER_RECON selectors in:
 *   src/backend/src/modules/atrad-sync/atrad-order-executor.ts
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ── Environment loading (reads .env without modifying it) ─────────────────────

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

// ── Paths ─────────────────────────────────────────────────────────────────────

const RECON_DIR = path.resolve(__dirname, '..', 'data', 'atrad-sync', 'order-recon');
const SUMMARY_FILE = path.join(RECON_DIR, 'summary.json');
let screenshotCounter = 0;

function ensureReconDir(): void {
  if (!fs.existsSync(RECON_DIR)) fs.mkdirSync(RECON_DIR, { recursive: true });
}

// ── Safe screenshot (numbered, descriptive names) ────────────────────────────

async function shot(page: Page, name: string): Promise<string> {
  screenshotCounter++;
  const filename = `${String(screenshotCounter).padStart(2, '0')}-${name}.png`;
  const filePath = path.join(RECON_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`📸 ${filename}`);
  return filename;
}

// ── HTML dump ────────────────────────────────────────────────────────────────

async function dumpHtml(page: Page, name: string): Promise<void> {
  const filename = `${name}.html`;
  const html = await page.content();
  fs.writeFileSync(path.join(RECON_DIR, filename), html);
  console.log(`📄 HTML: ${filename}`);
}

// ── Login (reuse known selectors) ────────────────────────────────────────────

async function login(page: Page, username: string, password: string, loginUrl: string): Promise<boolean> {
  console.log(`\n🔐 Navigating to ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60_000 });
  await shot(page, 'login-page');

  try {
    await page.fill('#txtUserName', username);
    await page.fill('#txtPassword', password);
    await page.click('#btnSubmit');
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 });
    } catch {
      await page.waitForTimeout(5000);
    }
    await shot(page, 'post-login');
    console.log('✅ Login complete');
    return true;
  } catch (err) {
    console.error(`❌ Login failed: ${String(err)}`);
    await shot(page, 'login-failed');
    return false;
  }
}

// ── Discover all Dojo MenuBar items ──────────────────────────────────────────

interface MenuBarItem {
  id: string;
  text: string;
}

async function discoverMenuBarItems(page: Page): Promise<MenuBarItem[]> {
  const items = await page.$$eval('[id^="dijit_PopupMenuBarItem_"], [id^="dijit_MenuBarItem_"]', (els) =>
    els.map((el) => ({
      id: el.id,
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
    })),
  );
  console.log(`\n📋 Found ${items.length} menu bar items:`);
  items.forEach((item) => console.log(`   ${item.id}: "${item.text}"`));
  return items;
}

// ── Try to click a menu item and screenshot the result ───────────────────────

async function probeMenuItem(page: Page, selector: string, name: string): Promise<string[]> {
  const found: string[] = [];
  try {
    const el = await page.$(selector);
    if (!el) {
      console.log(`   ⚠️  ${selector} — not found`);
      return found;
    }
    await el.click();
    await page.waitForTimeout(2000);
    const filename = await shot(page, name);
    found.push(filename);

    // Look for submenu items that appeared
    const subItems = await page.$$eval(
      '[id^="dijit_MenuItem_"], [id^="dijit_PopupMenuItem_"]',
      (els) =>
        els
          .filter((el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map((el) => ({
            id: el.id,
            text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
          })),
    );

    if (subItems.length > 0) {
      console.log(`   📂 Submenu items visible (${subItems.length}):`);
      subItems.forEach((item) => console.log(`      ${item.id}: "${item.text}"`));
    }

    // Close this menu by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    return found;
  } catch (err) {
    console.log(`   ❌ Error probing ${selector}: ${String(err)}`);
    return found;
  }
}

// ── Discover order-related submenus ──────────────────────────────────────────

async function exploreOrdersMenu(page: Page, menuId: string): Promise<Record<string, string>> {
  const selectors: Record<string, string> = {};
  console.log(`\n🔍 Exploring Orders menu: ${menuId}`);

  // Click the Orders menu
  try {
    await page.click(`#${menuId}`);
    await page.waitForTimeout(2000);
    await shot(page, 'orders-menu-open');
    await dumpHtml(page, 'orders-menu-html');
  } catch (err) {
    console.log(`   ❌ Could not open menu ${menuId}: ${String(err)}`);
    return selectors;
  }

  // Find all visible menu items
  const menuItems = await page.$$eval(
    '[id^="dijit_MenuItem_"]',
    (els) =>
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => ({
          id: el.id,
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' '),
          tagName: el.tagName,
        })),
  );

  console.log(`   Found ${menuItems.length} visible menu items:`);
  menuItems.forEach((item) => console.log(`   ${item.id}: "${item.text}"`));

  // Record the menu selector itself
  selectors.orders_menu = `#${menuId}`;

  // Probe each item and take screenshots
  for (const item of menuItems) {
    const normalizedText = item.text.toLowerCase();
    const itemKey = normalizedText.replace(/[^a-z0-9]/g, '_').slice(0, 30);

    console.log(`\n   → Clicking "${item.text}" (#${item.id})`);

    // SAFETY CHECK: never click buy/sell/confirm during recon
    if (/\b(confirm|place order|submit order)\b/i.test(item.text)) {
      console.log(`   ⛔ SKIPPED: "${item.text}" looks like an order submission button`);
      continue;
    }

    try {
      await page.click(`#${item.id}`);
      await page.waitForTimeout(3000);
      const filename = await shot(page, `order-submenu-${itemKey}`);
      await dumpHtml(page, `order-submenu-${itemKey}`);

      // Extract form fields from this page
      const formFields = await extractFormFields(page);
      if (formFields.length > 0) {
        console.log(`   📝 Form fields found (${formFields.length}):`);
        formFields.forEach((f) => console.log(`      ${f.id || f.name}: ${f.type} "${f.placeholder}"`));
        selectors[`form_${itemKey}`] = JSON.stringify(formFields);
      }

      // Navigate back to menu for next item
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);

      // Re-open the menu for next iteration
      try {
        await page.click(`#${menuId}`);
        await page.waitForTimeout(1500);
      } catch {
        break; // Can't re-open menu, stop exploring
      }
    } catch (err) {
      console.log(`   ⚠️  Error exploring "${item.text}": ${String(err)}`);
    }
  }

  return selectors;
}

// ── Extract form fields from current page ────────────────────────────────────

interface FormField {
  id: string;
  name: string;
  type: string;
  placeholder: string;
  selector: string;
  label: string;
}

async function extractFormFields(page: Page): Promise<FormField[]> {
  return page.$$eval(
    'input, select, textarea',
    (els) =>
      els
        .filter((el) => {
          const input = el as HTMLInputElement;
          // Skip hidden inputs and submit buttons
          return input.type !== 'hidden' && input.type !== 'submit' && input.type !== 'image';
        })
        .map((el) => {
          const input = el as HTMLInputElement;
          const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ?? '';
          return {
            id: input.id || '',
            name: input.name || '',
            type: input.type || el.tagName.toLowerCase(),
            placeholder: input.placeholder || '',
            selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : input.tagName.toLowerCase(),
            label,
          };
        }),
  );
}

// ── Main recon flow ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();
  ensureReconDir();

  const loginUrl = process.env.ATRAD_URL || process.env.ATRAD_LOGIN_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';
  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;

  if (!username || !password) {
    console.error('❌ ATRAD_USERNAME and ATRAD_PASSWORD environment variables must be set');
    process.exit(1);
  }

  console.log('🔍 ATrad Order UI Recon Script');
  console.log('='.repeat(60));
  console.log(`Output directory: ${RECON_DIR}`);
  console.log('READ-ONLY: Will NOT submit any orders\n');

  let browser: Browser | null = null;
  const summary: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    loginUrl,
    menuBarItems: [] as MenuBarItem[],
    ordersMenuSelectors: {} as Record<string, string>,
    allFormFields: [] as FormField[],
  };

  try {
    browser = await chromium.launch({
      headless: false, // Watch the recon visually
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    // ── Step 1: Login ──────────────────────────────────────────────────────────
    const loggedIn = await login(page, username, password, loginUrl);
    if (!loggedIn) {
      console.error('❌ Login failed — cannot proceed with recon');
      return;
    }

    // ── Step 2: Full-page screenshot to see the nav bar ───────────────────────
    console.log('\n📷 Capturing full post-login page...');
    await shot(page, 'full-dashboard');
    await dumpHtml(page, 'full-dashboard');

    // ── Step 3: Discover all menu bar items ───────────────────────────────────
    const menuBarItems = await discoverMenuBarItems(page);
    summary.menuBarItems = menuBarItems;

    // ── Step 4: Probe each menu bar item ─────────────────────────────────────
    console.log('\n🗺️  Probing all menu bar items to find Orders...');
    for (const item of menuBarItems) {
      if (/client|portfolio|account/i.test(item.text)) {
        console.log(`\nSkipping Client menu (already known): ${item.id}`);
        continue;
      }
      console.log(`\n→ Probing: ${item.id} — "${item.text}"`);
      await probeMenuItem(page, `#${item.id}`, `menu-${item.id}`);
    }

    // ── Step 5: Find and explore the Orders menu ──────────────────────────────
    const ordersMenuItem = menuBarItems.find((m) =>
      /order|trade|deal/i.test(m.text),
    );

    if (ordersMenuItem) {
      console.log(`\n✅ Found Orders menu: ${ordersMenuItem.id} — "${ordersMenuItem.text}"`);
      const ordersSelectors = await exploreOrdersMenu(page, ordersMenuItem.id);
      summary.ordersMenuSelectors = ordersSelectors;
    } else {
      console.log('\n⚠️  No "Orders" menu found in menu bar. Checking for Trade/Deal menus...');
      // Try alternate names
      const altItem = menuBarItems.find((m) =>
        /buy|sell|transact|execut/i.test(m.text),
      );
      if (altItem) {
        console.log(`Found alternate menu: ${altItem.id} — "${altItem.text}"`);
        const altSelectors = await exploreOrdersMenu(page, altItem.id);
        summary.ordersMenuSelectors = altSelectors;
      }
    }

    // ── Step 6: Look for any standalone order forms on the current page ────────
    console.log('\n🔍 Scanning current page for order-related form fields...');
    const pageFormFields = await extractFormFields(page);
    const orderFormFields = pageFormFields.filter((f) =>
      /security|symbol|qty|quantity|price|trigger|stop|order|sell|buy/i.test(
        `${f.id} ${f.name} ${f.placeholder} ${f.label}`,
      ),
    );
    summary.allFormFields = orderFormFields;

    if (orderFormFields.length > 0) {
      console.log(`Found ${orderFormFields.length} order-related fields:`);
      orderFormFields.forEach((f) =>
        console.log(`  ${f.selector} [${f.type}] "${f.label || f.placeholder}"`),
      );
    }

    // ── Step 7: Logout safely ─────────────────────────────────────────────────
    try {
      const logoutEl = await page.$('#butUserLogOut');
      if (logoutEl) {
        await logoutEl.click();
        console.log('\n✅ Logged out successfully');
        await page.waitForTimeout(2000);
      }
    } catch {
      console.log('\n⚠️  Logout button not found — closing browser directly');
    }

    await context.close();
  } catch (err) {
    console.error(`\n❌ Recon error: ${String(err)}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // ── Save summary ─────────────────────────────────────────────────────────────
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('📊 Recon Complete!');
  console.log(`📁 Screenshots: ${RECON_DIR}`);
  console.log(`📋 Summary: ${SUMMARY_FILE}`);
  console.log('\nNext steps:');
  console.log('1. Review screenshots in data/atrad-sync/order-recon/');
  console.log('2. Open summary.json to see discovered selectors');
  console.log('3. Find the Sell/TP/SL order form selectors');
  console.log('4. Fill FILL_AFTER_RECON values in:');
  console.log('   src/backend/src/modules/atrad-sync/atrad-order-executor.ts');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
