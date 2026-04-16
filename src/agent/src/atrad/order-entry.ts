/**
 * order-entry.ts — Unified ATrad order form handler (Buy / Sell / Stop-Limit)
 *
 * Handles all order types through ATrad's single Dojo form component.
 * Buy and Sell are the same form — only the Action dropdown differs.
 *
 * SAFETY:
 *  - fillOrder() fills the form and returns WITHOUT submitting
 *  - submitOrder() is a separate explicit step that clicks the submit button
 *  - Every fill includes a read-back verification step
 *  - Every submit produces pre/post screenshots
 *  - placeOrder() (legacy interface) fills but does NOT submit by default
 *
 * DOJO GOTCHAS:
 *  - Dropdowns: Must use dijit.byId().set('value') — page.selectOption() fails
 *  - NumberSpinners: Must triple-click + type + Tab to trigger onChange
 *  - Security ComboBox: Type + wait 2s for async lookup + Tab to confirm
 *  - Order Type must be set BEFORE filling stopPrice (field is disabled until STOP LIMIT)
 *  - Form prefix is dynamic: debtorder_0_, debtorder_1_, etc.
 */

import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import { takeScreenshot } from '../utils/screenshot';
import {
  NAV_SELECTORS,
  orderSelectors,
  widgetId,
  ATRAD_ACTION_VALUES,
  ATRAD_ORDER_TYPE_VALUES,
  ATRAD_TIF_VALUES,
  ATRAD_BOARD_VALUES,
} from './selectors';
import {
  detectFormPrefix,
  setDojoSelect,
  fillDojoInput,
  fillSecurityComboBox,
  readDojoValue,
  readDisplayValue,
  ensureDojoCheckbox,
} from './dojo-helpers';
import type { PendingTrade } from '../vps-client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface OrderParams {
  action: 'BUY' | 'SELL';
  symbol: string;
  quantity: number;
  price: number;
  orderType: 'LIMIT' | 'STOP_LIMIT';
  stopPrice?: number;
  tif: 'DAY' | 'GTC' | 'GTD' | 'IOC' | 'FOK';
  tifDays?: number;
  board?: 'REGULAR' | 'CROSSING' | 'AON' | 'AUCTION';
}

export interface FillResult {
  success: boolean;
  prefix: string | null;
  formValues?: FormReadBack;
  mismatch?: string;
  orderValue?: string;
  commission?: string;
  netValue?: string;
  screenshotPath?: string;
  notes: string;
}

export interface SubmitResult {
  success: boolean;
  atradOrderRef?: string;
  status?: string;
  screenshotPath?: string;
  notes: string;
}

interface FormReadBack {
  action: string;
  symbol: string;
  quantity: string;
  price: string;
  stopPrice: string;
  orderType: string;
  tif: string;
  board: string;
}

// ── Open Order Form ────────────────────────────────────────────────────────

/**
 * Open the Buy or Sell order form via the Orders menu.
 * Both open the same Dojo form component — the Action dropdown value differs.
 *
 * @returns The detected dynamic prefix, or null if form failed to open
 */
export async function openOrderForm(
  page: Page,
  action: 'BUY' | 'SELL',
): Promise<string | null> {
  const menuItem =
    action === 'BUY' ? NAV_SELECTORS.buyMenuItem : NAV_SELECTORS.sellMenuItem;
  const label = action === 'BUY' ? 'Buy' : 'Sell';

  logger.info(`Opening ${label} order form...`);

  try {
    // Click the Orders menu bar item
    await page.click(NAV_SELECTORS.ordersMenu);
    await page.waitForTimeout(1500);

    // Click Buy or Sell sub-item
    await page.click(menuItem);
    await page.waitForTimeout(3000);

    // Detect the dynamic form prefix
    const prefix = await detectFormPrefix(page);
    if (!prefix) {
      logger.error(`${label} form did not appear — no form prefix detected`);
      await takeScreenshot(page, `order-form-missing-${action.toLowerCase()}`);
      return null;
    }

    // Verify form container exists
    const sel = orderSelectors(prefix);
    const form = await page.$(sel.form);
    if (!form) {
      logger.error(`Form element not found: ${sel.form}`);
      await takeScreenshot(page, `order-form-notfound-${action.toLowerCase()}`);
      return null;
    }

    logger.info(`${label} form opened — prefix: ${prefix}`);
    await takeScreenshot(page, `order-form-ready-${action.toLowerCase()}`);
    return prefix;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to open ${label} form: ${msg}`);
    await takeScreenshot(page, `order-form-error-${action.toLowerCase()}`).catch(() => {});
    return null;
  }
}

// ── Fill Order Form ────────────────────────────────────────────────────────

/**
 * Fill the order form with the given parameters. Does NOT submit.
 *
 * CRITICAL: Fields must be filled in this order because Dojo widgets have
 * dependencies (e.g., stopPrice is disabled until orderType = STOP_LIMIT).
 *
 * 1. Order Type (enables/disables stopPrice)
 * 2. TIF + Board
 * 3. Security (triggers async lookup, populates market data)
 * 4. Quantity
 * 5. Price
 * 6. Stop Price (only if STOP_LIMIT)
 * 7. Tab out to trigger calculation
 * 8. Read back all values for verification
 */
export async function fillOrder(
  page: Page,
  prefix: string,
  params: OrderParams,
): Promise<FillResult> {
  const sel = orderSelectors(prefix);
  const wid = (field: string) => widgetId(prefix, field);

  logger.info(
    `Filling order: ${params.action} ${params.quantity}x ${params.symbol} ` +
      `@ ${params.price} [${params.orderType}] TIF=${params.tif}`,
  );

  try {
    // ── Step 1: Set Order Type (MUST be first — enables stopPrice field) ──
    const orderTypeValue = ATRAD_ORDER_TYPE_VALUES[params.orderType];
    await setDojoSelect(page, wid('cmbOrderType'), orderTypeValue);
    logger.info(`Set order type: ${params.orderType} (value=${orderTypeValue})`);

    // ── Step 2: Set TIF ──────────────────────────────────────────────────
    const tifValue = ATRAD_TIF_VALUES[params.tif];
    await setDojoSelect(page, wid('cmbTif'), tifValue);
    logger.info(`Set TIF: ${params.tif} (value=${tifValue})`);

    // Set TIF days for GTD
    if (params.tif === 'GTD' && params.tifDays) {
      await setDojoSelect(page, wid('cmbTifDays'), String(params.tifDays));
      logger.info(`Set TIF days: ${params.tifDays}`);
    }

    // ── Step 3: Set Board ────────────────────────────────────────────────
    const board = params.board ?? 'REGULAR';
    const boardValue = ATRAD_BOARD_VALUES[board];
    await setDojoSelect(page, wid('cmbBoard'), boardValue);
    logger.info(`Set board: ${board} (value=${boardValue})`);

    // ── Step 4: Fill Security (ComboBox — needs special handling) ────────
    await fillSecurityComboBox(page, sel.security, params.symbol);
    logger.info(`Filled security: ${params.symbol}`);

    // ── Step 5: Fill Quantity ────────────────────────────────────────────
    await fillDojoInput(page, sel.quantity, String(params.quantity));
    logger.info(`Filled quantity: ${params.quantity}`);

    // ── Step 6: Fill Price ──────────────────────────────────────────────
    await fillDojoInput(page, sel.price, params.price.toFixed(2));
    logger.info(`Filled price: ${params.price.toFixed(2)}`);

    // ── Step 7: Fill Stop Price (only for STOP_LIMIT) ───────────────────
    if (params.orderType === 'STOP_LIMIT' && params.stopPrice !== undefined) {
      await fillDojoInput(page, sel.stopPrice, params.stopPrice.toFixed(2));
      logger.info(`Filled stop price: ${params.stopPrice.toFixed(2)}`);
    }

    // ── Step 8: Tab out to trigger final calculation ─────────────────────
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2000);

    // ── Step 9: Read back ALL values for verification ───────────────────
    const formValues = await readBackFormValues(page, prefix);
    logger.info(`Read-back: ${JSON.stringify(formValues)}`);

    // ── Step 10: Verify form values match params ────────────────────────
    const mismatch = verifyFormValues(params, formValues);
    if (mismatch) {
      logger.error(`FORM MISMATCH: ${mismatch}`);
      const screenshotPath = await takeScreenshot(
        page,
        `order-mismatch-${params.symbol}`,
      );
      return {
        success: false,
        prefix,
        formValues,
        mismatch,
        screenshotPath,
        notes: `Form value mismatch: ${mismatch}`,
      };
    }

    logger.info('Form verification PASSED — all values match');

    // ── Step 11: Read calculated values ─────────────────────────────────
    const orderValue = await readDisplayValue(page, sel.orderVal);
    const commission = await readDisplayValue(page, sel.commissionVal);
    const netValue = await readDisplayValue(page, sel.netValueVal);

    logger.info(
      `Calculated: orderValue=${orderValue}, commission=${commission}, net=${netValue}`,
    );

    const screenshotPath = await takeScreenshot(
      page,
      `order-filled-${params.action.toLowerCase()}-${params.symbol}`,
    );

    return {
      success: true,
      prefix,
      formValues,
      orderValue,
      commission,
      netValue,
      screenshotPath,
      notes:
        `Order filled: ${params.action} ${params.quantity}x ${params.symbol} ` +
        `@ ${params.price.toFixed(2)} [${params.orderType}]. ` +
        `Value: ${orderValue}, Commission: ${commission}, Net: ${netValue}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to fill order: ${msg}`);
    await takeScreenshot(page, `order-fill-error-${params.symbol}`).catch(
      () => {},
    );
    return { success: false, prefix, notes: `Fill failed: ${msg}` };
  }
}

// ── Submit Order ───────────────────────────────────────────────────────────

/**
 * Submit the currently filled order form.
 *
 * SAFETY: This clicks the real Buy/Sell button and places a real order.
 * Only call after fillOrder() returns success and the caller has verified
 * all parameters are correct.
 *
 * Steps:
 * 1. Ensure confirm checkbox is checked
 * 2. Take pre-submit screenshot
 * 3. Click submit button
 * 4. Wait for response
 * 5. Check status field for success/error
 * 6. Take post-submit screenshot
 * 7. Extract ATrad order reference if available
 */
export async function submitOrder(
  page: Page,
  prefix: string,
): Promise<SubmitResult> {
  const sel = orderSelectors(prefix);
  const wid = (field: string) => widgetId(prefix, field);

  logger.warn('SUBMITTING ORDER — this places a real trade on ATrad');

  try {
    // ── Step 1: Ensure confirm checkbox is checked ──────────────────────
    await ensureDojoCheckbox(page, wid('chkConfirm'), true);

    // ── Step 2: Pre-submit screenshot ───────────────────────────────────
    await takeScreenshot(page, 'order-pre-submit');

    // ── Step 3: Click submit button ─────────────────────────────────────
    await page.click(sel.submitButton);
    await page.waitForTimeout(3000);

    // ── Step 4: Post-submit screenshot ──────────────────────────────────
    const screenshotPath = await takeScreenshot(page, 'order-post-submit');

    // ── Step 5: Check status field ──────────────────────────────────────
    const status = await readDisplayValue(page, sel.statusVal);
    logger.info(`Post-submit status: "${status}"`);

    // ── Step 6: Check for error indicators ──────────────────────────────
    const errorPatterns = [/error/i, /failed/i, /invalid/i, /insufficient/i, /rejected/i, /market\s*close/i];
    const statusLower = status.toLowerCase();
    const hasError = errorPatterns.some((p) => p.test(statusLower));

    if (hasError) {
      logger.error(`Order submission error: ${status}`);
      return {
        success: false,
        status,
        screenshotPath,
        notes: `Order rejected/failed: ${status}`,
      };
    }

    // ── Step 7: Try to extract ATrad order reference ────────────────────
    // After successful submission, ATrad may show an order ID in the page
    const pageText = await page.innerText('body').catch(() => '');
    const orderIdMatch = pageText.match(
      /order\s*(?:id|ref|number|#)[:\s]*([A-Z0-9\-]+)/i,
    );
    const atradOrderRef = orderIdMatch?.[1];

    if (atradOrderRef) {
      logger.info(`ATrad order reference: ${atradOrderRef}`);
    }

    return {
      success: true,
      atradOrderRef,
      status,
      screenshotPath,
      notes: `Order submitted. Status: ${status}${atradOrderRef ? `. ATrad ref: ${atradOrderRef}` : ''}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Submit failed: ${msg}`);
    await takeScreenshot(page, 'order-submit-error').catch(() => {});
    return { success: false, notes: `Submit failed: ${msg}` };
  }
}

// ── Close Order Form ───────────────────────────────────────────────────────

/**
 * Close the currently open order form without submitting.
 */
export async function closeOrderForm(
  page: Page,
  prefix: string,
): Promise<void> {
  const sel = orderSelectors(prefix);
  try {
    await page.click(sel.closeButton);
    await page.waitForTimeout(1000);
    logger.info('Order form closed');
  } catch {
    logger.warn('Could not close order form — may already be closed');
  }
}

// ── Read-Back & Verification ───────────────────────────────────────────────

async function readBackFormValues(
  page: Page,
  prefix: string,
): Promise<FormReadBack> {
  const wid = (field: string) => widgetId(prefix, field);
  const sel = orderSelectors(prefix);

  return {
    action: await readDojoValue(page, wid('cmbActionSelect')),
    symbol: await readDojoValue(page, wid('txtSecurity')),
    quantity: await readDojoValue(page, wid('spnQuantity')),
    price: await readDojoValue(page, wid('spnPrice')),
    stopPrice: await readDojoValue(page, wid('spnStopPrice')),
    orderType: await readDojoValue(page, wid('cmbOrderType')),
    tif: await readDojoValue(page, wid('cmbTif')),
    board: await readDojoValue(page, wid('cmbBoard')),
  };
}

/**
 * Verify read-back form values match the intended order parameters.
 * Returns a mismatch description string, or null if all checks pass.
 */
function verifyFormValues(
  params: OrderParams,
  form: FormReadBack,
): string | null {
  // Symbol check — normalize by stripping .N0000 suffix for comparison
  const normalizeSymbol = (s: string) =>
    s.toUpperCase().replace(/\.N\d+$/i, '');
  if (normalizeSymbol(form.symbol) !== normalizeSymbol(params.symbol)) {
    return `Symbol: form="${form.symbol}" expected="${params.symbol}"`;
  }

  // Quantity check
  const formQty = parseInt(form.quantity, 10);
  if (isNaN(formQty) || formQty !== params.quantity) {
    return `Quantity: form=${form.quantity} expected=${params.quantity}`;
  }

  // Price check (allow 0.01 tolerance for decimal rendering)
  const formPrice = parseFloat(form.price);
  if (isNaN(formPrice) || Math.abs(formPrice - params.price) > 0.01) {
    return `Price: form=${form.price} expected=${params.price.toFixed(2)}`;
  }

  // Order Type check
  const expectedOrderType = ATRAD_ORDER_TYPE_VALUES[params.orderType];
  if (form.orderType !== expectedOrderType) {
    return `OrderType: form=${form.orderType} expected=${expectedOrderType} (${params.orderType})`;
  }

  // Stop Price check (only for STOP_LIMIT)
  if (
    params.orderType === 'STOP_LIMIT' &&
    params.stopPrice !== undefined
  ) {
    const formStopPrice = parseFloat(form.stopPrice);
    if (
      isNaN(formStopPrice) ||
      Math.abs(formStopPrice - params.stopPrice) > 0.01
    ) {
      return `StopPrice: form=${form.stopPrice} expected=${params.stopPrice.toFixed(2)}`;
    }
  }

  // TIF check
  const expectedTif = ATRAD_TIF_VALUES[params.tif];
  if (form.tif !== expectedTif) {
    return `TIF: form=${form.tif} expected=${expectedTif} (${params.tif})`;
  }

  return null; // All checks passed
}

// ── Legacy Interface (for index.ts compatibility) ──────────────────────────

/**
 * Place an order from a PendingTrade. Opens the form, fills it, takes
 * screenshots, but does NOT submit. Returns the fill result for the
 * caller to decide whether to proceed with submitOrder().
 *
 * This is the entry point called by the agent main loop in index.ts.
 */
export async function placeOrder(
  page: Page,
  trade: PendingTrade,
): Promise<{
  success: boolean;
  atradOrderRef?: string;
  screenshotPath?: string;
  notes: string;
}> {
  logger.info(
    `Processing trade #${trade.id}: ${trade.action} ${trade.quantity}x ${trade.symbol}`,
  );

  // Map PendingTrade to OrderParams
  const orderParams = mapTradeToOrderParams(trade);

  // Open the appropriate form
  const prefix = await openOrderForm(page, orderParams.action);
  if (!prefix) {
    return { success: false, notes: 'Failed to open order form' };
  }

  // Fill the form
  const fillResult = await fillOrder(page, prefix, orderParams);
  if (!fillResult.success) {
    await closeOrderForm(page, prefix);
    return {
      success: false,
      screenshotPath: fillResult.screenshotPath,
      notes: fillResult.notes,
    };
  }

  // Form is filled and verified — DO NOT submit automatically.
  // The agent main loop should call submitOrder() explicitly after
  // confirming safety rails allow it.
  return {
    success: false, // Intentionally false — form filled but not submitted
    screenshotPath: fillResult.screenshotPath,
    notes:
      `Order FILLED but NOT submitted (requires explicit submitOrder call). ` +
      fillResult.notes,
  };
}

/**
 * Map a PendingTrade from the VPS to the OrderParams format for the form handler.
 *
 * The VPS now sends explicit tif, board, and stopPrice fields.
 * We still derive atrad order type from our internal order_type.
 */
function mapTradeToOrderParams(trade: PendingTrade): OrderParams {
  const action = trade.action.toUpperCase() as 'BUY' | 'SELL';
  const orderType = trade.orderType;

  // Determine ATrad order type from our internal type
  let atradOrderType: 'LIMIT' | 'STOP_LIMIT' = 'LIMIT';
  if (
    orderType === 'STOP_LOSS' ||
    orderType === 'STOP_LIMIT_BUY' ||
    orderType === 'STOP_LIMIT_SELL'
  ) {
    atradOrderType = 'STOP_LIMIT';
  }

  // Use explicit stopPrice from VPS, fall back to limitPrice for backward compat
  const stopPrice =
    trade.stopPrice ?? (atradOrderType === 'STOP_LIMIT' ? trade.limitPrice : null);

  // Use explicit tif/board from VPS, with sensible defaults
  const tif = (trade.tif ?? 'DAY') as OrderParams['tif'];
  const board = (trade.board ?? 'REGULAR') as NonNullable<OrderParams['board']>;

  return {
    action,
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.triggerPrice,
    orderType: atradOrderType,
    stopPrice: stopPrice ?? undefined,
    tif,
    board,
  };
}
