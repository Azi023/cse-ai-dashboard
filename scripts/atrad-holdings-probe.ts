#!/usr/bin/env npx tsx
/**
 * atrad-holdings-probe.ts — intercept ATrad's own Stock Holdings request.
 *
 * Our hardcoded POST to /atsweb/client with action=getStockHolding returns
 * portfolios:[] even though the UI clearly has positions. This probe:
 *   1. Logs in
 *   2. Captures ALL network requests + responses
 *   3. Navigates to "Stock Holdings" via the Client menu (text-based)
 *   4. Dumps the requests that fired, highlighting any that return a
 *      non-empty portfolios array
 *   5. Shows the exact URL + body + headers + response of the winning call
 */

import { chromium, Page, Request, Response } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ATRAD_URL =
  process.env.ATRAD_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';
const OUT_DIR = path.resolve(__dirname, 'recon-out');
const TS = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(OUT_DIR, { recursive: true });

interface Capture {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  status?: number;
  responseBody?: string;
  hasPortfolios?: boolean;
  portfolioCount?: number;
}

async function run(): Promise<void> {
  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;
  if (!username || !password) {
    console.error('ATRAD_USERNAME / ATRAD_PASSWORD must be set');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  const captures: Capture[] = [];

  // Log every outgoing request to /atsweb/client (+ generic POSTs)
  page.on('request', (req: Request) => {
    const url = req.url();
    if (!url.includes('/atsweb/')) return;
    captures.push({
      url,
      method: req.method(),
      body: req.postData(),
      headers: req.headers(),
    });
  });

  // Attach response info to the last capture matching this URL+body
  page.on('response', async (res: Response) => {
    const url = res.url();
    if (!url.includes('/atsweb/')) return;
    try {
      const body = await res.text();
      const cap = captures
        .slice()
        .reverse()
        .find(
          (c) =>
            c.url === url && c.method === res.request().method() && !c.status,
        );
      if (cap) {
        cap.status = res.status();
        cap.responseBody = body;
        const hasPortfolios = /"portfolios"\s*:\s*\[\s*\{/.test(
          body.replace(/'/g, '"'),
        );
        cap.hasPortfolios = hasPortfolios;
        if (hasPortfolios) {
          const m = body.match(/"portfolios"\s*:\s*\[([^\]]*)\]/);
          cap.portfolioCount = m ? (m[1].match(/\{/g) ?? []).length : 0;
        }
      }
    } catch {
      /* ignore bodies we can't read */
    }
  });

  try {
    console.log('[1] login');
    await page.goto(ATRAD_URL, { waitUntil: 'networkidle' });
    await page.fill('#txtUserName', username);
    await page.fill('#txtPassword', password);
    await page.click('#btnSubmit');
    await page.waitForLoadState('networkidle');

    console.log('[2] wait for Dojo menu');
    await page.waitForSelector('#dijit_PopupMenuBarItem_4', {
      state: 'attached',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    console.log('[3] hover Client menubar to open dropdown');
    const clientMenu = page
      .locator('[id^="dijit_PopupMenuBarItem_"]', { hasText: /^Client$/i })
      .first();
    await clientMenu.hover();
    await page.waitForTimeout(500);
    await clientMenu.click();
    await page.waitForTimeout(2000);

    // List every menu item under the Client menu (helps pick the right label)
    const menuItems = await page
      .locator('[id^="dijit_MenuItem_"]')
      .evaluateAll((els) =>
        els
          .map((el) => ({
            id: (el as HTMLElement).id,
            text: (el as HTMLElement).innerText.trim().split('\n')[0] ?? '',
          }))
          .filter((m) => m.text.length > 0),
      );
    console.log('\n--- Client menu items ---');
    for (const m of menuItems) console.log(`  ${m.id} → "${m.text}"`);

    console.log('\n[4] click Stock Holding — wait explicitly for its xhr');
    const stockHolding = page
      .locator('[id^="dijit_MenuItem_"]', { hasText: /Stock Holding/i })
      .first();
    if ((await stockHolding.count()) > 0) {
      const [holdingsResp] = await Promise.all([
        page
          .waitForResponse(
            (r) => {
              const url = r.url();
              const isMatch =
                url.includes('getStockHolding') ||
                url.includes('getClientHolding') ||
                (url.includes('/atsweb/client') && r.request().method() === 'POST');
              return isMatch;
            },
            { timeout: 15000 },
          )
          .catch(() => null),
        stockHolding.click(),
      ]);
      if (holdingsResp) {
        const body = await holdingsResp.text();
        const req = holdingsResp.request();
        console.log('\n🎯 STOCK HOLDINGS XHR INTERCEPTED');
        console.log(`  url:    ${holdingsResp.url()}`);
        console.log(`  method: ${req.method()}`);
        console.log(`  body:   ${req.postData() ?? '(none)'}`);
        console.log(`  status: ${holdingsResp.status()}`);
        console.log(`  resp:   ${body.slice(0, 1200)}`);
        fs.writeFileSync(
          path.join(OUT_DIR, `${TS}-ground-truth-request.json`),
          JSON.stringify(
            {
              url: holdingsResp.url(),
              method: req.method(),
              body: req.postData(),
              headers: req.headers(),
              status: holdingsResp.status(),
              responseBody: body,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(
          '  no getStockHolding xhr fired within 15s — menu click may not have navigated',
        );
      }
    }
    await page.waitForTimeout(5000);

    console.log(
      `\n[5] captured ${captures.length} /atsweb/ requests during Stock Holdings navigation:\n`,
    );
    for (const c of captures) {
      const tag =
        c.portfolioCount && c.portfolioCount > 0
          ? `🎯 portfolios×${c.portfolioCount}`
          : c.hasPortfolios
            ? '(portfolios key present but empty)'
            : '';
      console.log(`${c.method} ${c.url}`);
      console.log(`  status: ${c.status ?? '?'} ${tag}`);
      if (c.body) console.log(`  body:   ${c.body.slice(0, 300)}`);
      if (c.responseBody && (c.portfolioCount ?? 0) > 0) {
        console.log(
          `  resp (first 800): ${c.responseBody.replace(/\s+/g, ' ').slice(0, 800)}`,
        );
      }
      console.log('');
    }

    // Persist full capture log for later inspection
    const logPath = path.join(OUT_DIR, `${TS}-holdings-captures.json`);
    fs.writeFileSync(logPath, JSON.stringify(captures, null, 2));
    console.log(`Full capture written to ${logPath}`);

    // Screenshot the final page
    await page.screenshot({
      path: path.join(OUT_DIR, `${TS}-stock-holdings.png`),
      fullPage: true,
    });

    const logout = page.locator('#butUserLogOut');
    if ((await logout.count()) > 0) await logout.click();
  } catch (err) {
    console.error('Probe error:', err instanceof Error ? err.message : err);
  } finally {
    await browser.close();
  }
}

void run();
