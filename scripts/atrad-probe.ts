/**
 * atrad-probe.ts — quick probe to inspect stockHoldingClientAccount widget state
 * Usage: npx tsx ../../scripts/atrad-probe.ts
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

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

  // Capture all non-asset XHR
  page.on('response', async (r) => {
    const url = r.url();
    if (/\.(js|css|png|gif|jpg|woff|ico)(\?|$)/i.test(url)) return;
    try {
      const body = await r.text();
      console.log(`XHR: ${url.slice(0, 100)} [${body.length}b]`);
      if (/holding|getStock|account.*list|clientAcc/i.test(url + body.slice(0, 100))) {
        console.log(`  RELEVANT BODY: ${body.slice(0, 600)}`);
        fs.writeFileSync(path.resolve(__dirname, '..', 'data', 'atrad-sync', `probe-xhr-${Date.now()}.txt`), `${url}\n${body}`);
      }
    } catch { /* ignore */ }
  });

  // Login
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('#txtUserName', username);
  await page.fill('#txtPassword', password);
  await page.click('#btnSubmit');
  try { await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }); } catch { await page.waitForTimeout(6000); }
  console.log('Logged in. Menu wait...');
  await page.waitForFunction(() => document.getElementById('dijit_PopupMenuBarItem_4') !== null, { timeout: 12000 });
  console.log('Menu ready. Opening Stock Holding...');

  // Open Client → Stock Holding
  await page.click('#dijit_PopupMenuBarItem_4');
  await page.waitForTimeout(2000);
  await page.click('#dijit_MenuItem_40');
  console.log('Stock Holding panel opened. Waiting 4s...');
  await page.waitForTimeout(4000);

  // Inspect widget state
  const info = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const result: Record<string, unknown> = {};

    if (!w.dijit?.byId) { result.error = 'dijit not available'; return result; }

    // stockHoldingClientAccount
    const acctWidget = w.dijit.byId('stockHoldingClientAccount');
    if (acctWidget) {
      result.acctWidgetValue = acctWidget.get('value');
      result.acctWidgetDisplay = acctWidget.get('displayedValue');
      if (acctWidget.store) {
        const items: unknown[] = [];
        acctWidget.store.fetch({ onItem: (item: unknown) => items.push(item) });
        result.storeItems = items;
      }
    }

    // Form hidden fields
    const ex = document.getElementById('stockHolding_exchange') as HTMLInputElement;
    const br = document.getElementById('stockHolding_broker') as HTMLInputElement;
    const fmt = document.getElementById('stockHolding_format') as HTMLInputElement;
    result.exchange = ex?.value;
    result.broker = br?.value;
    result.format = fmt?.value;

    // Account input field current value
    const acctInput = document.getElementById('stockHoldingClientAccount') as HTMLInputElement;
    result.acctInputValue = acctInput?.value;

    return result;
  });
  console.log('Widget info:', JSON.stringify(info, null, 2));

  // Try to get account list via direct fetch with different params
  const accountListAttempt = await page.evaluate(async () => {
    const urls = [
      '/atsweb/client?action=getClientAccountList&format=json',
      '/atsweb/client?action=getAccountList&format=json',
      '/atsweb/client?action=getClients&format=json',
      '/atsweb/client?action=getUserAccounts&format=json&exchange=CSE',
    ];
    const results: Array<{ url: string; status: number; body: string }> = [];
    for (const url of urls) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        const body = await r.text();
        results.push({ url, status: r.status, body: body.slice(0, 300) });
      } catch (e) {
        results.push({ url, status: -1, body: String(e) });
      }
    }
    return results;
  });
  console.log('\nAccount list attempts:');
  accountListAttempt.forEach(({ url, status, body }) => {
    console.log(`  ${url} → ${status}: ${body.slice(0, 150)}`);
  });

  // Try getStockHolding with exchange+broker
  const holdingAttempts = await page.evaluate(async () => {
    const attempts = [
      '/atsweb/client?action=getStockHolding&format=json&exchange=CSE&broker=FWS',
      '/atsweb/client?action=getStockHolding&format=json&exchange=CSE',
    ];
    const results: Array<{ url: string; body: string }> = [];
    for (const url of attempts) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        const body = await r.text();
        results.push({ url, body: body.slice(0, 400) });
      } catch (e) { results.push({ url, body: String(e) }); }
    }
    return results;
  });
  console.log('\nHolding fetch attempts:');
  holdingAttempts.forEach(({ url, body }) => console.log(`  ${url}\n  → ${body}`));

  await browser.close();
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });
