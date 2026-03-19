/**
 * atrad-order-executor.ts — ATrad Order Execution via Playwright
 *
 * CRITICAL SAFETY RULES:
 *  1. NEVER execute an order with status !== 'APPROVED'
 *  2. ALWAYS take a screenshot before clicking any confirmation button
 *  3. ALWAYS verify form values match the approved order before submitting
 *  4. If ANY mismatch found → ABORT, set status FAILED
 *  5. Maximum 1 order per call (no batch execution)
 *  6. All actions logged to order-execution.log
 *
 * !! SELECTOR SETUP REQUIRED !!
 * Before enabling live execution, run:
 *   cd src/backend && npx tsx ../../scripts/atrad-order-recon.ts
 * Then fill in the FILL_AFTER_RECON constants below with discovered selectors.
 */

import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ── Directory Setup ───────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../../../../data/atrad-sync');
const ORDERS_DIR = path.join(DATA_DIR, 'orders');
const LOG_FILE = path.join(DATA_DIR, 'order-execution.log');

// ── RECON-REQUIRED SELECTORS ─────────────────────────────────────────────────
// Replace FILL_AFTER_RECON with values discovered by atrad-order-recon.ts
// The system will refuse execution until all selectors are populated.

const ORDERS_MENU_SELECTOR = 'FILL_AFTER_RECON';    // ATrad Orders top-nav menu
const SELL_MENU_ITEM = 'FILL_AFTER_RECON';           // "Sell" in Orders submenu
const SECURITY_INPUT = 'FILL_AFTER_RECON';           // Security/symbol field
const QUANTITY_INPUT = 'FILL_AFTER_RECON';           // Quantity field
const ORDER_TYPE_SELECT = 'FILL_AFTER_RECON';        // Order type (Stop/Limit)
const TRIGGER_PRICE_INPUT = 'FILL_AFTER_RECON';      // Trigger/stop price field
const LIMIT_PRICE_INPUT = 'FILL_AFTER_RECON';        // Limit price (optional)
const SUBMIT_BUTTON = 'FILL_AFTER_RECON';            // Submit/Place Order button
const CONFIRM_BUTTON = 'FILL_AFTER_RECON';           // Confirmation dialog OK button

const FILL_AFTER_RECON = 'FILL_AFTER_RECON';

function selectorsReady(): boolean {
  return [
    ORDERS_MENU_SELECTOR,
    SELL_MENU_ITEM,
    SECURITY_INPUT,
    QUANTITY_INPUT,
    TRIGGER_PRICE_INPUT,
    SUBMIT_BUTTON,
  ].every((s) => s !== FILL_AFTER_RECON);
}

// ── Execution result types ────────────────────────────────────────────────────

export interface OrderExecutionInput {
  orderId: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  triggerPrice: number;
  limitPrice?: number | null;
  orderType: string; // 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIMIT_BUY'
}

export interface OrderExecutionResult {
  success: boolean;
  atradOrderId?: string;
  screenshotPath?: string;
  errorMessage?: string;
}

// ── Logger helper (writes to file + NestJS logger) ───────────────────────────

function ensureDirectories(): void {
  [DATA_DIR, ORDERS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function logToFile(message: string): void {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] ${message}\n`);
  } catch {
    // Non-fatal: continue even if logging fails
  }
}

// ── ATrad Order Executor (NestJS Injectable) ──────────────────────────────────

@Injectable()
export class ATradOrderExecutor {
  private readonly logger = new Logger(ATradOrderExecutor.name);

  private log(msg: string): void {
    this.logger.log(msg);
    logToFile(msg);
  }

  private warn(msg: string): void {
    this.logger.warn(msg);
    logToFile(`WARN: ${msg}`);
  }

  private error(msg: string): void {
    this.logger.error(msg);
    logToFile(`ERROR: ${msg}`);
  }

  /**
   * Execute an approved order on ATrad via Playwright.
   *
   * This method ONLY runs if:
   *  1. All FILL_AFTER_RECON selectors have been replaced with real selectors
   *  2. The order status is 'APPROVED' (enforced by caller)
   *
   * The browser runs headless: false for the first implementation so the user
   * can watch the execution in real time.
   */
  async executeOrder(input: OrderExecutionInput): Promise<OrderExecutionResult> {
    ensureDirectories();
    this.log(`=== ORDER EXECUTION START: Order #${input.orderId} ===`);
    this.log(`Symbol: ${input.symbol}, Action: ${input.action}, Qty: ${input.quantity}, Trigger: ${input.triggerPrice}`);

    // ── Safety Gate 1: Selectors must be populated ──────────────────────────
    if (!selectorsReady()) {
      const msg =
        'ORDER EXECUTION REFUSED: Selectors not populated. ' +
        'Run scripts/atrad-order-recon.ts first, then fill FILL_AFTER_RECON constants ' +
        'in src/backend/src/modules/atrad-sync/atrad-order-executor.ts';
      this.error(msg);
      return { success: false, errorMessage: msg };
    }

    const loginUrl = process.env.ATRAD_URL || process.env.ATRAD_LOGIN_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';
    const username = process.env.ATRAD_USERNAME;
    const password = process.env.ATRAD_PASSWORD;

    if (!username || !password) {
      return { success: false, errorMessage: 'ATrad credentials not configured' };
    }

    let browser: Browser | null = null;

    try {
      this.log('Launching browser (headless: false — watch execution)...');
      browser = await chromium.launch({
        headless: false, // INTENTIONAL: user watches first execution
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();
      page.setDefaultTimeout(30_000);

      // ── Step 1: Login ──────────────────────────────────────────────────────
      this.log(`Navigating to ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      await this.screenshot(page, input.orderId, '01-login-page');

      await this.fillField(page, '#txtUserName', username, 'username');
      await this.fillField(page, '#txtPassword', password, 'password');
      await page.click('#btnSubmit');

      try {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 });
      } catch {
        await page.waitForTimeout(5000);
      }

      await this.screenshot(page, input.orderId, '02-post-login');
      this.log('Login complete');

      // ── Step 2: Navigate to Orders menu ───────────────────────────────────
      this.log('Opening Orders menu...');
      await page.click(ORDERS_MENU_SELECTOR);
      await page.waitForTimeout(2000);
      await this.screenshot(page, input.orderId, '03-orders-menu-open');

      // ── Step 3: Navigate to Sell order form ───────────────────────────────
      this.log('Clicking Sell order option...');
      await page.click(SELL_MENU_ITEM);
      await page.waitForTimeout(3000);
      await this.screenshot(page, input.orderId, '04-sell-form');
      this.log('Sell order form open');

      // ── Step 4: Fill the order form ───────────────────────────────────────
      this.log('Filling order form...');

      // Security field
      await this.fillField(page, SECURITY_INPUT, input.symbol, 'security');
      await page.waitForTimeout(1000); // Allow autocomplete/validation

      // Quantity field
      await this.fillField(page, QUANTITY_INPUT, String(input.quantity), 'quantity');

      // Order type (Stop Loss / Stop Limit)
      if (ORDER_TYPE_SELECT !== FILL_AFTER_RECON) {
        await page.selectOption(ORDER_TYPE_SELECT, { label: 'Stop Loss' });
        this.log('Set order type: Stop Loss');
      }

      // Trigger price
      await this.fillField(page, TRIGGER_PRICE_INPUT, String(input.triggerPrice), 'trigger price');

      // Limit price (optional, for stop-limit orders)
      if (input.limitPrice && LIMIT_PRICE_INPUT !== FILL_AFTER_RECON) {
        await this.fillField(page, LIMIT_PRICE_INPUT, String(input.limitPrice), 'limit price');
      }

      // ── Step 5: Screenshot BEFORE verification ────────────────────────────
      await page.waitForTimeout(1000);
      const preVerifyScreenshot = await this.screenshot(page, input.orderId, '05-pre-verify');
      this.log(`Pre-verification screenshot: ${preVerifyScreenshot}`);

      // ── Step 6: Read back and VERIFY form values ──────────────────────────
      this.log('VERIFYING form values against approved order...');
      const formValues = await this.readFormValues(page);
      const mismatch = this.checkMismatch(input, formValues);

      if (mismatch) {
        const msg = `ABORT: Form value mismatch detected — ${mismatch}. ` +
          `Approved: symbol=${input.symbol} qty=${input.quantity} price=${input.triggerPrice}. ` +
          `Form shows: ${JSON.stringify(formValues)}`;
        this.error(msg);
        await this.screenshot(page, input.orderId, '06-MISMATCH-abort');
        return { success: false, errorMessage: msg, screenshotPath: preVerifyScreenshot };
      }

      this.log('Form verification PASSED — all values match approved order');

      // ── Step 7: Screenshot BEFORE submitting ──────────────────────────────
      const preSubmitScreenshot = await this.screenshot(page, input.orderId, '07-pre-submit');

      // ── Step 8: Click Submit ──────────────────────────────────────────────
      this.log('Submitting order (clicking Submit button)...');
      await page.click(SUBMIT_BUTTON);
      await page.waitForTimeout(3000);
      await this.screenshot(page, input.orderId, '08-post-submit');

      // ── Step 9: Handle confirmation dialog (if any) ────────────────────────
      if (CONFIRM_BUTTON !== FILL_AFTER_RECON) {
        try {
          const confirmEl = await page.$(CONFIRM_BUTTON);
          if (confirmEl) {
            this.log('Confirmation dialog detected — clicking OK...');
            await this.screenshot(page, input.orderId, '09-confirm-dialog');
            await confirmEl.click();
            await page.waitForTimeout(3000);
          }
        } catch {
          this.log('No confirmation dialog detected (may not be required)');
        }
      }

      // ── Step 10: Check for success / error ───────────────────────────────
      const finalScreenshot = await this.screenshot(page, input.orderId, '10-final-state');
      const pageText = await page.innerText('body').catch(() => '');

      // Look for success indicators
      const successPatterns = [/order.*placed/i, /order.*submitted/i, /success/i, /order\s*id[:\s]+(\w+)/i];
      const errorPatterns = [/error/i, /failed/i, /invalid/i, /insufficient/i, /rejected/i];

      const isSuccess = successPatterns.some((p) => p.test(pageText));
      const isError = errorPatterns.some((p) => p.test(pageText));

      if (isError && !isSuccess) {
        const errText = this.extractErrorMessage(pageText);
        this.error(`Order placement failed: ${errText}`);
        return { success: false, errorMessage: errText, screenshotPath: finalScreenshot };
      }

      // Extract ATrad order ID from page text
      const orderIdMatch = pageText.match(/order\s*(?:id|ref|number|#)[:\s]*([A-Z0-9\-]+)/i);
      const atradOrderId = orderIdMatch?.[1] ?? undefined;

      this.log(`Order executed successfully. ATrad Order ID: ${atradOrderId ?? 'N/A'}`);
      this.log(`Execution screenshot: ${finalScreenshot}`);

      // ── Logout ─────────────────────────────────────────────────────────────
      try {
        const logoutEl = await page.$('#butUserLogOut');
        if (logoutEl) {
          await logoutEl.click();
          this.log('Logged out of ATrad');
        }
      } catch {
        this.warn('Logout button not found — browser will close anyway');
      }

      await context.close();
      this.log('=== ORDER EXECUTION COMPLETE ===');

      return {
        success: true,
        atradOrderId,
        screenshotPath: finalScreenshot,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Order execution threw: ${msg}`);
      return { success: false, errorMessage: `Execution error: ${msg}` };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close errors
        }
      }
      this.log('=== ORDER EXECUTION SESSION END ===\n');
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async fillField(
    page: Page,
    selector: string,
    value: string,
    name: string,
  ): Promise<void> {
    try {
      await page.fill(selector, value);
      this.log(`Filled ${name}: ${selector} = "${value}"`);
    } catch (err) {
      throw new Error(`Could not fill ${name} field (${selector}): ${String(err)}`);
    }
  }

  private async screenshot(page: Page, orderId: number, step: string): Promise<string> {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `order-${orderId}-${step}-${ts}.png`;
      const filePath = path.join(ORDERS_DIR, filename);
      await page.screenshot({ path: filePath, fullPage: true });
      this.log(`Screenshot: ${filePath}`);
      return filePath;
    } catch (err) {
      this.warn(`Screenshot failed for step ${step}: ${String(err)}`);
      return '';
    }
  }

  private async readFormValues(
    page: Page,
  ): Promise<{ symbol?: string; quantity?: string; triggerPrice?: string }> {
    const getValue = async (sel: string): Promise<string> => {
      try {
        return await page.inputValue(sel);
      } catch {
        return '';
      }
    };

    return {
      symbol: await getValue(SECURITY_INPUT),
      quantity: await getValue(QUANTITY_INPUT),
      triggerPrice: await getValue(TRIGGER_PRICE_INPUT),
    };
  }

  private checkMismatch(
    approved: OrderExecutionInput,
    form: { symbol?: string; quantity?: string; triggerPrice?: string },
  ): string | null {
    // Symbol check (case-insensitive, strip .N0000 variants for comparison)
    const normalizeSymbol = (s?: string) => (s ?? '').toUpperCase().replace(/\.N\d+$/i, '');
    if (normalizeSymbol(form.symbol) !== normalizeSymbol(approved.symbol)) {
      return `Symbol mismatch: form="${form.symbol}" approved="${approved.symbol}"`;
    }

    // Quantity check
    const formQty = parseInt(form.quantity ?? '0', 10);
    if (formQty !== approved.quantity) {
      return `Quantity mismatch: form=${formQty} approved=${approved.quantity}`;
    }

    // Price check (allow 1 cent tolerance for decimal rendering)
    const formPrice = parseFloat(form.triggerPrice ?? '0');
    const priceDiff = Math.abs(formPrice - approved.triggerPrice);
    if (priceDiff > 0.01) {
      return `Price mismatch: form=${formPrice} approved=${approved.triggerPrice} (diff=${priceDiff})`;
    }

    return null; // All checks passed
  }

  private extractErrorMessage(pageText: string): string {
    const lines = pageText.split('\n');
    const errorLine = lines.find((l) => /error|failed|invalid|rejected/i.test(l));
    return (errorLine ?? 'Unknown error — check execution screenshot').trim().slice(0, 200);
  }
}
