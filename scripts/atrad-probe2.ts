/**
 * atrad-probe2.ts — fetch stockHolding.js and inspect account widget
 * Usage: npx tsx ../../scripts/atrad-probe2.ts
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'atrad-sync');

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !(k in process.env)) process.env[k] = v;
  }
}

async function run(): Promise<void> {
  loadEnv();
  const loginUrl = process.env.ATRAD_URL ?? 'https://trade.hnbstockbrokers.lk/atsweb/login';
  const username = process.env.ATRAD_USERNAME!;
  const password = process.env.ATRAD_PASSWORD!;

  const browser = await chromium.launch({ headless: false, slowMo: 200, args: ['--start-maximized'] });
  const ctx = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // Capture getStockHolding and any client account list requests
  const captured: Array<{ url: string; body: string }> = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (/getStockHolding|stockHolding|clientAcc|accountList|getClient|getAccount|getPortfolio/i.test(url)) {
      try {
        const body = await r.text();
        captured.push({ url, body: body.slice(0, 2000) });
        console.log(`★ CAPTURED: ${url} → ${body.slice(0, 200)}`);
        fs.writeFileSync(path.join(DATA_DIR, `probe2-${Date.now()}.txt`), `${url}\n${body}`);
      } catch { /* ignore */ }
    }
  });

  // Login
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('#txtUserName', username);
  await page.fill('#txtPassword', password);
  await page.click('#btnSubmit');
  try { await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }); } catch { await page.waitForTimeout(6000); }
  console.log('Logged in.');
  await page.waitForFunction(() => document.getElementById('dijit_PopupMenuBarItem_4') !== null, { timeout: 12000 });

  // Fetch stockHolding.js directly (while authenticated)
  console.log('\nFetching stockHolding.js...');
  const jsContent = await page.evaluate(async () => {
    const resp = await fetch('/atsweb/view/html/scripts/client/stockHolding.js', { credentials: 'include' });
    if (resp.ok) return await resp.text();
    return `status=${resp.status}`;
  });
  const jsPath = path.join(DATA_DIR, 'stockHolding.js');
  fs.writeFileSync(jsPath, jsContent);
  console.log(`stockHolding.js saved (${jsContent.length} bytes) → ${jsPath}`);

  // Open Stock Holding
  console.log('\nOpening Stock Holding...');
  await page.click('#dijit_PopupMenuBarItem_4');
  await page.waitForTimeout(2000);
  await page.click('#dijit_MenuItem_40');
  await page.waitForTimeout(5000);

  // Inspect the ComboBox input directly
  const acctInputVal = await page.$eval('#stockHoldingClientAccount', (el) => (el as HTMLInputElement).value).catch(() => 'not found');
  console.log('stockHoldingClientAccount input value:', acctInputVal);

  // Get ALL input values in stockHoldingForm
  const formInputs = await page.$$eval('#stockHoldingForm input, #stockHoldingForm select', (els) =>
    els.map((el) => ({
      id: el.id,
      name: (el as HTMLInputElement).name,
      value: (el as HTMLInputElement).value,
      type: (el as HTMLInputElement).type,
    })).filter(e => e.id || e.name)
  ).catch(() => []);
  console.log('\nForm inputs:');
  formInputs.forEach(inp => console.log(`  ${inp.id || inp.name} [${inp.type}] = "${inp.value}"`));

  // Try fetching with exchange+broker params
  console.log('\nTrying direct fetch with various params...');
  const fetchResults = await page.evaluate(async () => {
    const attempts: Array<{url: string; body: string}> = [];
    const base = '/atsweb/client';
    const tries = [
      `${base}?action=getStockHolding&format=json&exchange=CSE&broker=FWS`,
      `${base}?action=getStockHolding&format=json&exchange=CSE&broker=FWS&clientAccNo=128229LI0`,
      `${base}?action=getStockHolding&format=json&exchange=CSE&broker=FWS&account=128229LI0`,
    ];
    for (const url of tries) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        const body = await r.text();
        attempts.push({ url: url.split('?')[1] ?? url, body: body.slice(0, 400) });
      } catch (e) {
        attempts.push({ url, body: String(e) });
      }
    }
    return attempts;
  });
  fetchResults.forEach(({ url, body }) => console.log(`  ${url}\n  → ${body}\n`));

  // Look for key patterns in stockHolding.js
  const refreshFn = jsContent.match(/stockHoldingRefreshbtn[\s\S]{0,200}/);
  const submitFn = jsContent.match(/getStockHolding[\s\S]{0,300}/);
  if (refreshFn) console.log('\nRefresh button handler snippet:\n', refreshFn[0]);
  if (submitFn) console.log('\ngetStockHolding snippet:\n', submitFn[0]);

  await browser.close();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
