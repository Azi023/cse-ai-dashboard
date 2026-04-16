/**
 * dojo-helpers.ts — Playwright interaction utilities for ATrad's Dojo Toolkit widgets.
 *
 * ATrad Premier uses Dojo (dijit) widgets that DO NOT behave like standard HTML
 * form elements. Standard Playwright methods (selectOption, fill) fail silently
 * or produce incorrect state. These helpers interact with the Dojo widget layer
 * directly via page.evaluate().
 *
 * Widget types encountered:
 *  - dijit/form/FilteringSelect (dropdowns: action, orderType, tif, board)
 *  - dijit/form/NumberSpinner (quantity, price, stopPrice)
 *  - dijit/form/ComboBox (security symbol lookup)
 *  - dijit/form/CheckBox (confirm checkbox)
 *
 * Key gotcha: The visible <input> element and the Dojo widget's internal value
 * can desync. Always read/write via dijit.byId(), never via DOM attributes.
 */

import type { Page } from 'playwright';

// ── Dojo FilteringSelect (dropdowns) ────────────────────────────────────────

/**
 * Set a Dojo FilteringSelect widget's value programmatically.
 *
 * Playwright's page.selectOption() does NOT work on Dojo widgets — the visible
 * <select> is actually a hidden input + Dojo overlay. We must call
 * dijit.byId(widgetId).set('value', val) to update both the widget state and
 * the form value.
 *
 * @param page     Playwright page
 * @param widgetId Dojo widget ID (WITHOUT # prefix), e.g. 'debtorder_0_cmbOrderType'
 * @param value    The option value to set, e.g. '4' for STOP LIMIT
 */
export async function setDojoSelect(
  page: Page,
  widgetId: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ id, val }) => {
      const dijitNs = (window as unknown as Record<string, unknown>).dijit as
        | { byId: (id: string) => { set: (prop: string, val: string) => void } | undefined }
        | undefined;
      const widget = dijitNs?.byId(id);
      if (!widget) {
        throw new Error(`Dojo widget not found: ${id}`);
      }
      widget.set('value', val);
    },
    { id: widgetId, val: value },
  );
  // Allow Dojo's onChange chain to propagate (enables/disables dependent fields)
  await page.waitForTimeout(500);
}

// ── Dojo NumberSpinner / TextBox (input fields) ─────────────────────────────

/**
 * Fill a Dojo NumberSpinner or TextBox field.
 *
 * Triple-click to select all existing content, type the new value, then Tab
 * to trigger Dojo's onChange handler. The Tab is critical — without it, the
 * widget's internal value may not update, and dependent calculations (order
 * value, commission) won't fire.
 *
 * @param page     Playwright page
 * @param selector CSS selector WITH # prefix, e.g. '#debtorder_0_spnQuantity'
 * @param value    String value to type
 */
export async function fillDojoInput(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  // Triple-click selects all text in the input
  await page.click(selector, { clickCount: 3 });
  await page.waitForTimeout(200);
  // Type with slight delay to let Dojo process keystrokes
  await page.keyboard.type(value, { delay: 50 });
  // Tab out to trigger onChange and dependent recalculations
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
}

// ── Dojo ComboBox (security symbol lookup) ──────────────────────────────────

/**
 * Fill ATrad's security ComboBox with a stock symbol.
 *
 * The ComboBox does an async server lookup as you type. After typing the symbol,
 * we must wait for the dropdown to populate (2s), then Tab to confirm the
 * selection. If we Tab too early, the ComboBox may not have resolved the symbol
 * and the form will show an empty/invalid security.
 *
 * @param page     Playwright page
 * @param selector CSS selector for the ComboBox input
 * @param symbol   Stock symbol, e.g. 'AEL.N0000'
 */
export async function fillSecurityComboBox(
  page: Page,
  selector: string,
  symbol: string,
): Promise<void> {
  // Triple-click to select any existing value
  await page.click(selector, { clickCount: 3 });
  await page.waitForTimeout(200);
  // Type the symbol with delay to let autocomplete fire
  await page.keyboard.type(symbol, { delay: 100 });
  // Wait for the async dropdown to populate
  await page.waitForTimeout(2000);
  // Tab to confirm selection — triggers security lookup + populates info fields
  await page.keyboard.press('Tab');
  // Wait for security properties to load (best bid, ask, buying power, etc.)
  await page.waitForTimeout(1500);
}

// ── Read Dojo widget value ──────────────────────────────────────────────────

/**
 * Read a Dojo widget's current value via dijit.byId().get('value').
 *
 * Do NOT use page.inputValue() on Dojo widgets — the DOM input element's value
 * attribute and the widget's internal value can desync, especially after
 * programmatic updates.
 *
 * @param page     Playwright page
 * @param widgetId Dojo widget ID (WITHOUT # prefix)
 * @returns        The widget's current value as a string, or '' if not found
 */
export async function readDojoValue(
  page: Page,
  widgetId: string,
): Promise<string> {
  return page.evaluate((id) => {
    const dijitNs = (window as unknown as Record<string, unknown>).dijit as
      | { byId: (id: string) => { get: (prop: string) => unknown } | undefined }
      | undefined;
    const widget = dijitNs?.byId(id);
    if (!widget) return '';
    const val = widget.get('value');
    return val !== null && val !== undefined ? String(val) : '';
  }, widgetId);
}

/**
 * Read a display-only text element's content (e.g., order value, commission).
 * These are not Dojo widgets — they're plain DOM elements updated by Dojo.
 *
 * @param page     Playwright page
 * @param selector CSS selector WITH # prefix
 * @returns        The element's text content, trimmed
 */
export async function readDisplayValue(
  page: Page,
  selector: string,
): Promise<string> {
  return page
    .$eval(selector, (el) => el.textContent?.trim() ?? '')
    .catch(() => '');
}

// ── Dojo CheckBox ───────────────────────────────────────────────────────────

/**
 * Ensure a Dojo CheckBox is in the desired checked state.
 *
 * ATrad's confirm checkbox (`chkConfirm`) defaults to checked (value=1).
 * After form resets or Dojo state changes, it may uncheck. This helper
 * checks the current state and clicks only if needed.
 *
 * @param page     Playwright page
 * @param widgetId Dojo widget ID (WITHOUT # prefix)
 * @param checked  Desired state — true for checked
 */
export async function ensureDojoCheckbox(
  page: Page,
  widgetId: string,
  checked: boolean,
): Promise<void> {
  const isChecked = await page.evaluate((id) => {
    const dijitNs = (window as unknown as Record<string, unknown>).dijit as
      | { byId: (id: string) => { get: (prop: string) => unknown } | undefined }
      | undefined;
    const widget = dijitNs?.byId(id);
    if (!widget) return false;
    return widget.get('checked') === true || widget.get('value') === 'on';
  }, widgetId);

  if (isChecked !== checked) {
    await page.click(`#${widgetId}`);
    await page.waitForTimeout(300);
  }
}

// ── Dynamic Form Prefix Detection ───────────────────────────────────────────

/**
 * Detect the current ATrad order form prefix.
 *
 * ATrad creates a new form instance (with incrementing prefix) each time
 * Buy or Sell is opened: debtorder_0_, debtorder_1_, debtorder_2_, etc.
 * After clicking the menu item and waiting for the form to appear, call
 * this to discover which prefix is active.
 *
 * Strategy: Find the LAST visible form matching the debtorder pattern.
 * The most recently opened form is always the last in DOM order.
 *
 * @returns The prefix string (e.g. 'debtorder_2_') or null if no form found
 */
export async function detectFormPrefix(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const forms = document.querySelectorAll(
      '[id^="debtorder_"][id$="_orderForm"]',
    );
    if (forms.length === 0) return null;
    const lastForm = forms[forms.length - 1];
    const match = lastForm.id.match(/^(debtorder_\d+_)orderForm$/);
    return match ? match[1] : null;
  });
}
