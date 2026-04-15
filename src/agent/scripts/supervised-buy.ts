/**
 * Supervised Buy — Interactive script for a single, user-confirmed stock purchase.
 *
 * This script:
 *   1. Logs in to ATrad (headless: false — you see the browser)
 *   2. Opens the Buy order form
 *   3. Fills in: AEL.N0000, 78 shares, LKR 74.30 limit
 *   4. Screenshots the filled form for your review
 *   5. Waits for you to type CONFIRM or CANCEL in the terminal
 *   6. If CONFIRM: checks the confirm box, clicks Buy, captures result
 *   7. If CANCEL: closes the form, logs cancellation
 *   8. Syncs portfolio regardless (scrape cash + holdings → push to VPS)
 *
 * Usage: cd src/agent && npx tsx scripts/supervised-buy.ts
 *
 * SAFETY:
 *   - headless: false ALWAYS — you watch every step
 *   - NEVER submits without your terminal input
 *   - Screenshots at every stage for audit trail
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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
  loadEnvFile(path.resolve(__dirname, '..', '.env'));
  loadEnvFile(path.resolve(__dirname, '..', '..', '..', '.env'));
}

// ── Config ─────────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const ATRAD_LOGIN_URL = 'https://trade.hnbstockbrokers.lk/atsweb/login';

// ── Trade Parameters ───────────────────────────────────────────────────────
const SYMBOL = 'AEL';        // ATrad uses short symbols (no .N0000 suffix in the ComboBox)
const QUANTITY = 78;
const LIMIT_PRICE = 74.30;

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, `buy-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  log(`Screenshot → ${filePath}`);
  return filePath;
}

function askUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase());
    });
  });
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

  // ── Print trade calculation ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SUPERVISED BUY — AEL.N0000');
  console.log('═'.repeat(60));
  console.log(`  Symbol:         AEL.N0000`);
  console.log(`  Action:         BUY (Limit Order)`);
  console.log(`  Quantity:       ${QUANTITY} shares`);
  console.log(`  Limit Price:    LKR ${LIMIT_PRICE.toFixed(2)}`);
  console.log(`  Order Value:    LKR ${(QUANTITY * LIMIT_PRICE).toFixed(2)}`);
  console.log(`  Est. Fees:      ~LKR ${(QUANTITY * LIMIT_PRICE * 0.0112).toFixed(2)} (1.12%)`);
  console.log(`  Est. Total:     ~LKR ${(QUANTITY * LIMIT_PRICE * 1.0112).toFixed(2)}`);
  console.log(`  Available Cash: LKR 5,944.31`);
  console.log(`  Est. Remaining: ~LKR ${(5944.31 - QUANTITY * LIMIT_PRICE * 1.0112).toFixed(2)}`);
  console.log('═'.repeat(60));
  console.log('  Market is CLOSED (after 2:30 PM SLT).');
  console.log('  If ATrad accepts this order, it will queue for tomorrow\'s open.');
  console.log('═'.repeat(60) + '\n');

  const proceed = await askUser('Proceed with login and form fill? (YES/NO): ');
  if (proceed !== 'YES') {
    log('Aborted by user before login.');
    process.exit(0);
  }

  let browser: Browser | null = null;

  try {
    // ── Step 1: Login ──────────────────────────────────────────────────
    log('Step 1: Launching Chromium (you should see the browser)...');
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(20_000);

    await page.goto(ATRAD_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.fill('#txtUserName', username);
    await page.fill('#txtPassword', password);
    await page.click('#btnSubmit');
    await page.waitForTimeout(5000);

    const url = page.url();
    if (url.includes('login') && !url.includes('home')) {
      log('FATAL: Login failed — check credentials');
      await screenshot(page, 'login-failed');
      return;
    }
    log('Login successful');
    await page.waitForTimeout(3000);
    await screenshot(page, '1-logged-in');

    // ── Step 2: Open Buy form ──────────────────────────────────────────
    log('Step 2: Opening Orders → Buy...');
    await page.click('#dijit_PopupMenuBarItem_2');
    await page.waitForTimeout(1500);
    await page.click('#dijit_MenuItem_20');
    await page.waitForTimeout(3000);

    const form = await page.$('#debtorder_0_orderForm');
    if (!form) {
      log('FATAL: Buy form did not open');
      await screenshot(page, 'form-missing');
      return;
    }
    log('Buy form opened');
    await screenshot(page, '2-form-opened');

    // ── Step 3: Fill the form ──────────────────────────────────────────
    log('Step 3: Filling order form...');

    // Security — triple-click to select all, type symbol, wait for dropdown
    await page.click('#debtorder_0_txtSecurity', { clickCount: 3 });
    await page.keyboard.type(SYMBOL, { delay: 150 });
    await page.waitForTimeout(2000);

    // Check if a ComboBox dropdown appeared and select the right entry
    const dropdownOption = await page.$('.dijitComboBoxMenuPopup .dijitMenuItem, .dijitMenuItemLabel');
    if (dropdownOption) {
      // Look for AEL.N0000 in the dropdown
      const options = await page.evaluate(() => {
        const items = document.querySelectorAll('.dijitMenuItemLabel, .dijitComboBoxMenu .dijitMenuItem');
        return Array.from(items)
          .filter(el => (el as HTMLElement).offsetParent !== null)
          .map(el => ({ text: el.textContent?.trim().slice(0, 50) || '', id: el.id }));
      });
      log(`ComboBox options: ${JSON.stringify(options.slice(0, 5))}`);

      const aelOption = options.find(o => o.text.includes('AEL'));
      if (aelOption && aelOption.id) {
        await page.click(`#${aelOption.id}`);
        log(`Selected: ${aelOption.text}`);
      } else {
        // Just press Tab to confirm the typed text
        await page.keyboard.press('Tab');
      }
    } else {
      await page.keyboard.press('Tab');
    }
    await page.waitForTimeout(2000);
    await screenshot(page, '3a-security-filled');

    // Quantity
    await page.click('#debtorder_0_spnQuantity', { clickCount: 3 });
    await page.keyboard.type(String(QUANTITY));
    await page.waitForTimeout(500);

    // Price
    await page.click('#debtorder_0_spnPrice', { clickCount: 3 });
    await page.keyboard.type(LIMIT_PRICE.toFixed(2));
    await page.waitForTimeout(500);

    // Tab out to trigger calculation
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2000);

    // Read calculated values from the form
    const readField = async (selector: string): Promise<string> => {
      try {
        return await page.$eval(selector, el => el.textContent?.trim() ?? '');
      } catch {
        return 'N/A';
      }
    };

    const orderValue = await readField('#debtorder_0_orderVal');
    const commission = await readField('#debtorder_0_ordercommission');
    const netValue = await readField('#debtorder_0_ordernetvalue');
    const buyingPower = await readField('#debtorder_0_buyPowerVal');
    const status = await readField('#debtorder_0_orderstatus');

    // Read the security field to confirm it was accepted
    const securityValue = await page.$eval('#debtorder_0_txtSecurity', (el) => (el as HTMLInputElement).value).catch(() => 'N/A');
    const quantityValue = await page.$eval('#debtorder_0_spnQuantity', (el) => (el as HTMLInputElement).value).catch(() => 'N/A');
    const priceValue = await page.$eval('#debtorder_0_spnPrice', (el) => (el as HTMLInputElement).value).catch(() => 'N/A');

    await screenshot(page, '3b-form-filled');

    console.log('\n' + '═'.repeat(60));
    console.log('  ORDER FORM — READY FOR REVIEW');
    console.log('═'.repeat(60));
    console.log(`  Security:       ${securityValue}`);
    console.log(`  Quantity:       ${quantityValue}`);
    console.log(`  Price:          ${priceValue}`);
    console.log(`  Order Value:    ${orderValue}`);
    console.log(`  Commission:     ${commission}`);
    console.log(`  Net Value:      ${netValue}`);
    console.log(`  Buying Power:   ${buyingPower}`);
    console.log(`  Status:         ${status || '(empty)'}`);
    console.log('═'.repeat(60));
    console.log('  LOOK AT THE BROWSER WINDOW to verify the form is correct.');
    console.log('═'.repeat(60) + '\n');

    // ── Step 4: User confirmation ──────────────────────────────────────
    const confirm = await askUser('Type CONFIRM to submit the order, or CANCEL to abort: ');

    if (confirm === 'CONFIRM') {
      log('Step 4: User confirmed — submitting order...');

      // Check the Confirm checkbox
      const isChecked = await page.$eval(
        '#debtorder_0_chkConfirm',
        (el) => (el as HTMLInputElement).checked,
      );
      if (!isChecked) {
        await page.click('#debtorder_0_chkConfirm');
        await page.waitForTimeout(500);
      }

      await screenshot(page, '4a-pre-submit');

      // Click Buy
      await page.click('#debtorder_0_btnSubmit');
      await page.waitForTimeout(5000);

      await screenshot(page, '4b-post-submit');

      // Check for any confirmation dialog
      const dialogText = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.dijitDialog, [role="dialog"], .dijitDialogPaneContent');
        const visible = Array.from(dialogs).filter(el => (el as HTMLElement).offsetParent !== null);
        return visible.map(el => el.textContent?.trim().slice(0, 200)).join('\n');
      });

      if (dialogText) {
        log(`Confirmation dialog: ${dialogText}`);
        await screenshot(page, '4c-confirmation-dialog');

        // Look for OK/Confirm button in the dialog
        const okButton = await page.$('.dijitDialog button, .dijitDialog .dijitButton, .dijitDialog input[type="button"]');
        if (okButton) {
          const buttonText = await okButton.textContent().catch(() => '');
          log(`Dialog button found: "${buttonText}"`);

          const confirmDialog = await askUser(`Dialog says: "${dialogText.slice(0, 100)}". Press OK? (YES/NO): `);
          if (confirmDialog === 'YES') {
            await okButton.click();
            await page.waitForTimeout(3000);
            await screenshot(page, '4d-dialog-confirmed');
          } else {
            log('User declined dialog confirmation');
          }
        }
      }

      // Read final status
      const finalStatus = await readField('#debtorder_0_orderstatus');
      log(`Order status: ${finalStatus}`);

      console.log('\n' + '═'.repeat(60));
      console.log('  ORDER SUBMITTED');
      console.log('═'.repeat(60));
      console.log(`  Status: ${finalStatus || 'Check the browser window'}`);
      console.log('═'.repeat(60) + '\n');

    } else {
      log('Step 4: User cancelled — closing form');
      await page.click('#debtorder_0_btnClose');
      await page.waitForTimeout(1000);
      console.log('\nOrder cancelled. No trade was placed.\n');
    }

    // ── Step 5: Portfolio sync ─────────────────────────────────────────
    log('Step 5: Syncing portfolio...');

    // Navigate to Account Summary
    await page.click('#dijit_PopupMenuBarItem_4');
    await page.waitForTimeout(1500);
    await page.click('#dijit_MenuItem_41');
    await page.waitForTimeout(3000);

    const cashEl = await page.$('#txtAccSumaryCashBalance');
    const cash = cashEl ? await cashEl.inputValue().catch(() => '0') : '0';
    const portfolioEl = await page.$('#txtAccSumaryTMvaluePortfolio');
    const portfolio = portfolioEl ? await portfolioEl.inputValue().catch(() => '0') : '0';

    log(`Account: Cash=${cash}, Portfolio=${portfolio}`);
    await screenshot(page, '5-account-summary');

    console.log('\n' + '═'.repeat(60));
    console.log('  ACCOUNT AFTER TRADE');
    console.log('═'.repeat(60));
    console.log(`  Cash Balance:    LKR ${cash}`);
    console.log(`  Portfolio Value: LKR ${portfolio}`);
    console.log('═'.repeat(60) + '\n');

    // Cleanup
    await page.close();
    await context.close();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL: ${msg}`);
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed');
    }
  }

  log('Supervised buy script complete.');
}

main();
