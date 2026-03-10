/**
 * test-atrad-connection.ts — ATrad platform reconnaissance script
 *
 * READ-ONLY — takes screenshots and dumps HTML structure.
 * Does NOT modify any portfolio data or trigger any syncs.
 *
 * Usage (from src/backend/ directory):
 *   npx tsx ../../scripts/test-atrad-connection.ts
 *
 * Output files (data/atrad-sync/):
 *   pre-login.png        — login page before credentials
 *   post-login.png       — page after logging in (5s wait)
 *   account-summary.png  — Client → Account Summary page
 *   account-summary.html — full HTML dump of account summary page
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ─── Load .env ───────────────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`[ERROR] .env not found at: ${envPath}`);
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
  console.log('[ENV] Loaded .env from project root');
}

// ─── Config ──────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'atrad-sync');

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[DIR] Created output directory: ${OUTPUT_DIR}`);
  }
}

async function screenshot(page: Page, filename: string): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[SCREENSHOT] Saved: ${filePath}`);
}

function log(msg: string): void {
  console.log(`[ATRAD] ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  loadEnv();
  ensureOutputDir();

  const loginUrl =
    process.env.ATRAD_URL ||
    process.env.ATRAD_LOGIN_URL ||
    'https://trade.hnbstockbrokers.lk/atsweb/login';

  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;

  if (!username || !password) {
    console.error('[ERROR] ATRAD_USERNAME or ATRAD_PASSWORD not set in .env');
    process.exit(1);
  }

  log(`Login URL: ${loginUrl}`);
  log(`Username: ${username}`);
  log('Password: ***');

  // ── Launch browser (visible so you can watch) ────────────────────────────
  log('Launching browser (headless: false — you should see a window)...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 200, // Slow down actions so you can watch
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null, // Use window size (maximized)
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  try {
    // ── Step 1: Load login page ────────────────────────────────────────────
    log(`Navigating to login page: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);
    log('Login page loaded');

    // Screenshot BEFORE login
    await screenshot(page, 'pre-login.png');

    // Print page title and URL
    log(`Page title: ${await page.title()}`);
    log(`Current URL: ${page.url()}`);

    // Dump all visible input fields on login page
    const inputs = await page.$$eval('input', (els) =>
      els.map((el) => ({
        type: el.type,
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        className: el.className || '',
      })),
    );
    log(`Input fields found on login page: ${JSON.stringify(inputs, null, 2)}`);

    // Dump all buttons on login page
    const buttons = await page.$$eval('button, input[type="submit"], input[type="button"]', (els) =>
      els.map((el) => ({
        tag: el.tagName,
        type: (el as HTMLInputElement).type || '',
        id: el.id || '',
        className: el.className || '',
        text: (el.textContent || '').trim().substring(0, 80),
      })),
    );
    log(`Buttons found on login page: ${JSON.stringify(buttons, null, 2)}`);

    // ── Step 2: Fill credentials ───────────────────────────────────────────
    log('Filling username...');
    // Try selectors in order
    const usernameFilled = await fillField(page, username, [
      'input[name="username"]',
      'input[name="userName"]',
      'input[name="loginId"]',
      'input[name="user"]',
      'input[id="username"]',
      'input[id="userName"]',
      'input[id="loginId"]',
      '#txtUsername',
      '#txtLoginId',
      'input[placeholder*="user" i]',
      'input[placeholder*="login" i]',
      'input[type="text"]',
    ]);
    log(`Username filled: ${usernameFilled}`);

    log('Filling password...');
    const passwordFilled = await fillField(page, password, [
      'input[type="password"]',
      'input[name="password"]',
      'input[name="passwd"]',
      '#txtPassword',
      'input[placeholder*="password" i]',
      'input[placeholder*="pass" i]',
    ]);
    log(`Password filled: ${passwordFilled}`);

    if (!usernameFilled || !passwordFilled) {
      log('WARNING: Could not fill all fields. Saving HTML for inspection...');
      const html = await page.content();
      fs.writeFileSync(path.join(OUTPUT_DIR, 'login-page.html'), html, 'utf-8');
      log('Saved login-page.html — check selectors');
      await browser.close();
      return;
    }

    // ── Step 3: Click login button ─────────────────────────────────────────
    log('Clicking login button...');
    const loginClicked = await clickButton(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      '#btnLogin',
      '.btn-login',
      'button.btn-primary',
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      'button:has-text("Log In")',
      'a:has-text("Login")',
    ]);

    if (!loginClicked) {
      log('Login button not found — pressing Enter instead');
      await page.keyboard.press('Enter');
    }

    // ── Step 4: Wait 5 seconds for page to load ────────────────────────────
    log('Waiting 5 seconds for post-login page to load...');
    await page.waitForTimeout(5000);

    log(`Post-login URL: ${page.url()}`);
    log(`Post-login title: ${await page.title()}`);

    // Screenshot AFTER login
    await screenshot(page, 'post-login.png');

    // ── Step 5: Navigate to Client → Account Summary ───────────────────────
    log('Looking for "Client" menu item...');
    const clientMenuClicked = await clickButton(page, [
      'a:has-text("Client")',
      'li:has-text("Client") > a',
      'span:has-text("Client")',
      '#clientMenu',
      '.client-menu',
      'nav a:has-text("Client")',
      '.navbar a:has-text("Client")',
      '[class*="menu"] a:has-text("Client")',
    ]);

    if (clientMenuClicked) {
      log('"Client" menu found and clicked — waiting for dropdown...');
      await page.waitForTimeout(1500);

      // Now click Account Summary within the dropdown
      const accountSummaryClicked = await clickButton(page, [
        'a:has-text("Account Summary")',
        'li:has-text("Account Summary") > a',
        'span:has-text("Account Summary")',
        '[class*="dropdown"] a:has-text("Account Summary")',
        '[class*="menu"] a:has-text("Account Summary")',
        'a:has-text("Acct Summary")',
        'a:has-text("Account")',
      ]);

      if (accountSummaryClicked) {
        log('"Account Summary" clicked — waiting for page to load...');
        await page.waitForTimeout(3000);
        log(`Account Summary URL: ${page.url()}`);
      } else {
        log('WARNING: Could not find "Account Summary" link after clicking Client menu');
        // Dump all links visible after clicking Client
        const links = await page.$$eval('a', (els) =>
          els.map((el) => ({
            text: (el.textContent || '').trim().substring(0, 60),
            href: el.href || '',
            id: el.id || '',
          })).filter((l) => l.text),
        );
        log(`All links after Client click: ${JSON.stringify(links, null, 2)}`);
      }
    } else {
      log('WARNING: Could not find "Client" menu item');
      // Dump all navigation links to help identify structure
      const navLinks = await page.$$eval('nav a, .navbar a, .menu a, header a, [class*="nav"] a', (els) =>
        els.map((el) => ({
          text: (el.textContent || '').trim().substring(0, 60),
          href: el.href || '',
          id: el.id || '',
          className: el.className || '',
        })).filter((l) => l.text),
      );
      log(`Navigation links found: ${JSON.stringify(navLinks, null, 2)}`);

      // Also dump ALL links on page
      const allLinks = await page.$$eval('a', (els) =>
        els.map((el) => ({
          text: (el.textContent || '').trim().substring(0, 60),
          href: el.href || '',
        })).filter((l) => l.text),
      );
      log(`All page links: ${JSON.stringify(allLinks, null, 2)}`);
    }

    // Screenshot of account summary page (or wherever we ended up)
    await screenshot(page, 'account-summary.png');

    // ── Step 6: Dump full HTML ─────────────────────────────────────────────
    log('Dumping full page HTML...');
    const html = await page.content();
    const htmlPath = path.join(OUTPUT_DIR, 'account-summary.html');
    fs.writeFileSync(htmlPath, html, 'utf-8');
    log(`HTML saved to: ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`);

    // ── Step 7: Print all text content ────────────────────────────────────
    log('Extracting visible text content...');
    const textContent = await page.evaluate(() => {
      // Get text from body, skipping script/style tags
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toLowerCase();
            if (['script', 'style', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;
            const text = (node.textContent || '').trim();
            if (!text) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      const texts: string[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = (node.textContent || '').trim();
        if (text.length > 1) texts.push(text);
      }
      return texts;
    });

    console.log('\n' + '═'.repeat(60));
    console.log('TEXT CONTENT FOUND ON PAGE:');
    console.log('═'.repeat(60));
    textContent.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    console.log('═'.repeat(60) + '\n');

    // ── Step 8: Close browser ─────────────────────────────────────────────
    log('Recon complete. Closing browser...');
    await context.close();
    await browser.close();

    console.log('\n✓ Done. Output files:');
    console.log(`  ${path.join(OUTPUT_DIR, 'pre-login.png')}`);
    console.log(`  ${path.join(OUTPUT_DIR, 'post-login.png')}`);
    console.log(`  ${path.join(OUTPUT_DIR, 'account-summary.png')}`);
    console.log(`  ${path.join(OUTPUT_DIR, 'account-summary.html')}`);
    console.log('\nReview the screenshots and HTML to identify correct selectors.');
  } catch (err) {
    console.error(`[ERROR] ${String(err)}`);
    try {
      await screenshot(page, 'error-state.png');
    } catch { /* ignore */ }
    await browser.close();
    process.exit(1);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fillField(page: Page, value: string, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.fill(value);
        log(`  Filled using: ${sel}`);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

async function clickButton(page: Page, selectors: string[]): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.textContent();
        // Safety: never click trading buttons
        if (text && /\b(buy|sell|order|place|confirm)\b/i.test(text)) {
          log(`  Skipping forbidden element: "${text?.trim()}"`);
          continue;
        }
        await el.click();
        log(`  Clicked using: ${sel}`);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
