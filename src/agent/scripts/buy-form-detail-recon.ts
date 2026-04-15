/**
 * Focused recon: capture all IDs inside the Buy order form panel.
 * Logs in, opens Orders → Buy, then dumps every element inside the order panel.
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

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

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

async function main(): Promise<void> {
  loadEnvFile(path.resolve(__dirname, '..', '.env'));
  loadEnvFile(path.resolve(__dirname, '..', '..', '..', '.env'));

  const username = process.env.ATRAD_USERNAME!;
  const password = process.env.ATRAD_PASSWORD!;
  if (!username || !password) { console.error('Missing ATrad creds'); process.exit(1); }
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);

  try {
    // Login
    await page.goto('https://trade.hnbstockbrokers.lk/atsweb/login', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.fill('#txtUserName', username);
    await page.fill('#txtPassword', password);
    await page.click('#btnSubmit');
    await page.waitForTimeout(5000);
    log('Logged in');

    // Open Orders → Buy
    await page.click('#dijit_PopupMenuBarItem_2');
    await page.waitForTimeout(1500);
    await page.click('#dijit_MenuItem_20');
    await page.waitForTimeout(3000);
    log('Buy form opened');

    // Dump ALL elements with IDs that contain 'debtorder' or 'order'
    const orderElements = await page.evaluate(() => {
      const allEls = document.querySelectorAll('[id*="debtorder"], [id*="order" i], [id*="Order" i]');
      return Array.from(allEls).map(el => {
        const input = el as HTMLInputElement;
        const rect = (el as HTMLElement).getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id,
          name: input.name || '',
          type: input.type || '',
          value: input.value?.slice(0, 80) || '',
          visible: rect.width > 0 && rect.height > 0,
          text: el.textContent?.trim().slice(0, 50) || '',
          className: el.className?.slice(0, 60) || '',
        };
      });
    });

    log(`\n=== ORDER FORM ELEMENTS (${orderElements.length}) ===`);
    for (const el of orderElements) {
      if (!el.visible) continue;
      const parts = [
        `<${el.tag}>`,
        `#${el.id}`,
        el.name ? `name="${el.name}"` : '',
        el.type ? `type="${el.type}"` : '',
        el.value ? `val="${el.value}"` : '',
        el.text ? `text="${el.text}"` : '',
      ].filter(Boolean).join(' ');
      log(`  ${parts}`);
    }

    // Also find the submit button specifically
    log('\n=== BUTTONS ===');
    const buttons = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, input[type="submit"], input[type="button"], span[role="button"], .dijitButton, [class*="Button"]');
      return Array.from(btns)
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
            value: input.value?.slice(0, 50) || '',
            text: el.textContent?.trim().slice(0, 50) || '',
            className: el.className?.slice(0, 80) || '',
          };
        });
    });

    for (const btn of buttons) {
      const parts = [
        `<${btn.tag}>`,
        btn.id ? `#${btn.id}` : '',
        btn.name ? `name="${btn.name}"` : '',
        btn.type ? `type="${btn.type}"` : '',
        btn.value ? `val="${btn.value}"` : '',
        btn.text ? `text="${btn.text}"` : '',
      ].filter(Boolean).join(' ');
      log(`  ${parts}`);
    }

    // Find dropdowns (select elements or Dojo ComboBox widgets)
    log('\n=== DROPDOWNS / SELECTS ===');
    const selects = await page.evaluate(() => {
      const sels = document.querySelectorAll('select, [role="listbox"], [class*="ComboBox"], [class*="Select"], [id*="cmb"], [id*="ddl"]');
      return Array.from(sels)
        .filter(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map(el => {
          const select = el as HTMLSelectElement;
          const options = select.options ? Array.from(select.options).map(o => o.text.slice(0, 30)) : [];
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            name: (el as HTMLInputElement).name || '',
            value: (el as HTMLInputElement).value?.slice(0, 50) || '',
            options: options.slice(0, 5),
            className: el.className?.slice(0, 80) || '',
          };
        });
    });

    for (const sel of selects) {
      log(`  <${sel.tag}> ${sel.id ? '#' + sel.id : ''} name="${sel.name}" val="${sel.value}" opts=[${sel.options.join(', ')}]`);
    }

    // Check labels near form fields
    log('\n=== LABELS ===');
    const labels = await page.evaluate(() => {
      const lbls = document.querySelectorAll('label, .dijitLabelText, td[class*="label" i]');
      return Array.from(lbls)
        .filter(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map(el => ({
          text: el.textContent?.trim().slice(0, 40) || '',
          htmlFor: (el as HTMLLabelElement).htmlFor || '',
          id: el.id || '',
        }));
    });

    for (const lbl of labels) {
      log(`  "${lbl.text}" for="${lbl.htmlFor}" id="${lbl.id}"`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'order-recon-detail.png'), fullPage: true });
    log('\nDone. Review output above for complete selector map.');

    await page.close();
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main();
