import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import { takeScreenshot } from '../utils/screenshot';
import { NAV_SELECTORS, ORDER_SELECTORS } from './selectors';
import type { PendingTrade } from '../vps-client';

/**
 * Navigate to the Buy order form via Orders → Buy menu.
 * Returns true if the form is visible and ready for input.
 */
export async function openBuyForm(page: Page): Promise<boolean> {
  logger.info('Opening buy order form...');

  try {
    // Click Orders menu
    await page.click(NAV_SELECTORS.ordersMenu);
    await page.waitForTimeout(1500);

    // Click "Buy" sub-item
    await page.click(NAV_SELECTORS.buyMenuItem);
    await page.waitForTimeout(3000);

    // Verify form is visible
    const form = await page.$(ORDER_SELECTORS.form);
    if (!form) {
      logger.error('Buy form did not appear after clicking Orders → Buy');
      await takeScreenshot(page, 'buy-form-missing');
      return false;
    }

    logger.info('Buy form opened successfully');
    await takeScreenshot(page, 'buy-form-ready');
    return true;
  } catch (err) {
    logger.error('Failed to open buy form', err);
    await takeScreenshot(page, 'buy-form-error').catch(() => {});
    return false;
  }
}

/**
 * Fill the buy order form with trade parameters.
 * Does NOT submit — call submitOrder() separately after user confirmation.
 */
export async function fillBuyOrder(
  page: Page,
  symbol: string,
  quantity: number,
  price: number,
): Promise<{
  success: boolean;
  orderValue?: string;
  commission?: string;
  netValue?: string;
  screenshotPath?: string;
  notes: string;
}> {
  logger.info(`Filling buy order: ${quantity}x ${symbol} @ ${price}`);

  try {
    // Clear and fill security (Dojo ComboBox — triple-click to select all, then type)
    await page.click(ORDER_SELECTORS.security, { clickCount: 3 });
    await page.keyboard.type(symbol, { delay: 100 });
    await page.waitForTimeout(2000); // Wait for ComboBox dropdown to populate

    // Press Enter or Tab to confirm the security selection
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);

    // Clear and fill quantity (Dojo NumberSpinner — triple-click to select, then type)
    await page.click(ORDER_SELECTORS.quantity, { clickCount: 3 });
    await page.keyboard.type(String(quantity));
    await page.waitForTimeout(500);

    // Clear and fill price
    await page.click(ORDER_SELECTORS.price, { clickCount: 3 });
    await page.keyboard.type(price.toFixed(2));
    await page.waitForTimeout(500);

    // Tab out to trigger calculation
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2000);

    // Read calculated values
    const orderValue = await page.$eval(ORDER_SELECTORS.orderVal, el => el.textContent?.trim() ?? '').catch(() => '');
    const commission = await page.$eval(ORDER_SELECTORS.commissionVal, el => el.textContent?.trim() ?? '').catch(() => '');
    const netValue = await page.$eval(ORDER_SELECTORS.netValueVal, el => el.textContent?.trim() ?? '').catch(() => '');
    const buyingPower = await page.$eval(ORDER_SELECTORS.buyingPowerVal, el => el.textContent?.trim() ?? '').catch(() => '');

    logger.info(`Order value: ${orderValue}, Commission: ${commission}, Net: ${netValue}, Buying power: ${buyingPower}`);

    const screenshotPath = await takeScreenshot(page, `buy-filled-${symbol}`);

    return {
      success: true,
      orderValue,
      commission,
      netValue,
      screenshotPath,
      notes: `Order filled: ${quantity}x ${symbol} @ ${price}. Order value: ${orderValue}, Commission: ${commission}, Net: ${netValue}. Buying power: ${buyingPower}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to fill buy order: ${msg}`);
    await takeScreenshot(page, `buy-fill-error-${symbol}`).catch(() => {});
    return { success: false, notes: `Fill failed: ${msg}` };
  }
}

/**
 * Submit the buy order. REQUIRES explicit user confirmation.
 * Checks the Confirm checkbox and clicks the Buy button.
 */
export async function submitBuyOrder(page: Page): Promise<{
  success: boolean;
  status?: string;
  screenshotPath?: string;
  notes: string;
}> {
  logger.warn('SUBMITTING BUY ORDER — this places a real trade');

  try {
    // Check the Confirm checkbox
    const isChecked = await page.$eval(
      ORDER_SELECTORS.confirmCheckbox,
      (el) => (el as HTMLInputElement).checked,
    );
    if (!isChecked) {
      await page.click(ORDER_SELECTORS.confirmCheckbox);
      await page.waitForTimeout(500);
    }

    await takeScreenshot(page, 'buy-pre-submit');

    // Click Buy button
    await page.click(ORDER_SELECTORS.submitButton);
    await page.waitForTimeout(3000);

    // Check for confirmation dialog or status update
    const status = await page.$eval(ORDER_SELECTORS.statusVal, el => el.textContent?.trim() ?? '').catch(() => '');

    const screenshotPath = await takeScreenshot(page, 'buy-post-submit');

    logger.info(`Order submitted. Status: ${status}`);

    return {
      success: true,
      status,
      screenshotPath,
      notes: `Order submitted. Status: ${status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Submit failed: ${msg}`);
    await takeScreenshot(page, 'buy-submit-error').catch(() => {});
    return { success: false, notes: `Submit failed: ${msg}` };
  }
}

/**
 * Place a complete order (legacy interface for PendingTrade).
 * For supervised buy, use openBuyForm → fillBuyOrder → submitBuyOrder instead.
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
  logger.warn(
    `ORDER: Would ${trade.action} ${trade.quantity}x ${trade.symbol} @ ${trade.limitPrice ?? trade.triggerPrice}`,
  );

  const formOpened = await openBuyForm(page);
  if (!formOpened) {
    return { success: false, notes: 'Failed to open buy form' };
  }

  const fillResult = await fillBuyOrder(
    page,
    trade.symbol,
    trade.quantity,
    trade.limitPrice ?? trade.triggerPrice ?? 0,
  );

  if (!fillResult.success) {
    return { success: false, notes: fillResult.notes };
  }

  // Do NOT auto-submit — return the filled state for user review
  return {
    success: false,
    screenshotPath: fillResult.screenshotPath,
    notes: `Order FILLED but NOT submitted (requires manual confirmation). ${fillResult.notes}`,
  };
}
