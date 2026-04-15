#!/usr/bin/env npx tsx
/**
 * atrad-scraper-recon.ts — debug why the production scraper returns zeros.
 *
 * Logs into ATrad, then for each step:
 *   - saves a screenshot
 *   - dumps the HTML of the page
 *   - reports whether expected selectors match anything
 *   - reports whether the expected Account Summary fields are present
 *
 * Run headless so it works under any environment; artefacts land in
 * scripts/recon-out/ (gitignored — contains session HTML that may
 * include account numbers).
 *
 * Usage:
 *   NODE_PATH=src/backend/node_modules \
 *     src/backend/node_modules/.bin/tsx scripts/atrad-scraper-recon.ts
 */

import { chromium, Page } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ATRAD_URL =
  process.env.ATRAD_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';
const OUT_DIR = path.resolve(__dirname, 'recon-out');
const TS = new Date().toISOString().replace(/[:.]/g, '-');

fs.mkdirSync(OUT_DIR, { recursive: true });

async function snap(page: Page, label: string): Promise<void> {
  const shot = path.join(OUT_DIR, `${TS}-${label}.png`);
  const html = path.join(OUT_DIR, `${TS}-${label}.html`);
  await page.screenshot({ path: shot, fullPage: true });
  fs.writeFileSync(html, await page.content());
  console.log(`  saved ${label}.png + ${label}.html`);
}

async function probeSelectors(page: Page, selectors: string[], label: string): Promise<void> {
  console.log(`\n--- probe: ${label} ---`);
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    console.log(`  ${count > 0 ? 'FOUND' : 'miss '} × ${count}  ${sel}`);
  }
}

async function dumpAllMenuItems(page: Page): Promise<void> {
  console.log('\n--- all dijit menu bar items present on page ---');
  const items = await page
    .locator('[id^="dijit_PopupMenuBarItem_"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        id: (el as HTMLElement).id,
        text: (el as HTMLElement).innerText.trim(),
      })),
    );
  for (const it of items) console.log(`  ${it.id} → "${it.text}"`);

  console.log('\n--- all dijit menu items (dropdown contents) ---');
  const menuItems = await page
    .locator('[id^="dijit_MenuItem_"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        id: (el as HTMLElement).id,
        text: (el as HTMLElement).innerText.trim(),
      })),
    );
  for (const it of menuItems) console.log(`  ${it.id} → "${it.text}"`);
}

async function run(): Promise<void> {
  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;
  if (!username || !password) {
    console.error('ATRAD_USERNAME / ATRAD_PASSWORD must be set');
    process.exit(1);
  }

  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Run tag: ${TS}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  try {
    console.log(`\n[1] goto login: ${ATRAD_URL}`);
    await page.goto(ATRAD_URL, { waitUntil: 'networkidle' });
    await snap(page, '01-login');

    console.log('\n[2] fill credentials');
    await page.fill('#txtUserName', username);
    await page.fill('#txtPassword', password);
    await page.click('#btnSubmit');

    console.log('[3] wait for dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    await snap(page, '02-post-login');
    console.log(`  URL: ${page.url()}`);
    console.log(`  title: ${await page.title()}`);

    await dumpAllMenuItems(page);

    await probeSelectors(
      page,
      [
        '#dijit_PopupMenuBarItem_0',
        '#dijit_PopupMenuBarItem_1',
        '#dijit_PopupMenuBarItem_2',
        '#dijit_PopupMenuBarItem_3',
        '#dijit_PopupMenuBarItem_4',
        '#dijit_PopupMenuBarItem_5',
        '#dijit_MenuItem_40',
        '#dijit_MenuItem_41',
        '#dijit_MenuItem_42',
        '#txtAccSumaryCashBalance',
        '#txtAccSumaryBuyingPowr',
        '#txtAccSumaryTMvaluePortfolio',
        '#butUserLogOut',
      ],
      'production scraper selectors right after login',
    );

    console.log('\n[4] click Client menu (PopupMenuBarItem_4)');
    const clientMenu = page.locator('#dijit_PopupMenuBarItem_4');
    const hasClient = (await clientMenu.count()) > 0;
    console.log(`  menu found: ${hasClient}`);
    if (hasClient) {
      await clientMenu.click();
      await page.waitForTimeout(1500);
      await snap(page, '03-menu-open');

      console.log('\n[5] click Account Summary (MenuItem_41)');
      const accountSummary = page.locator('#dijit_MenuItem_41');
      const hasAS = (await accountSummary.count()) > 0;
      console.log(`  menuitem found: ${hasAS}`);
      if (hasAS) {
        await accountSummary.click();
        await page.waitForTimeout(4000);
        await snap(page, '04-account-summary-4s');

        // ── Value-polling probe ────────────────────────────────────────
        console.log('\n[VALUE POLL] watching target fields over 20s');
        const targets = [
          '#txtAccSumaryCashBalance',
          '#txtAccSumaryBuyingPowr',
          '#txtAccSumaryTMvaluePortfolio',
        ];
        for (let i = 0; i < 10; i++) {
          const snapshot = await page.evaluate((sels) => {
            return sels.map((sel) => {
              const el = document.querySelector(sel) as
                | HTMLInputElement
                | null;
              if (!el) return { sel, exists: false };
              return {
                sel,
                exists: true,
                tag: el.tagName,
                type: el.type,
                value: el.value,
                textContent: el.textContent?.trim() ?? '',
                outerSample: el.outerHTML.slice(0, 200),
              };
            });
          }, targets);
          console.log(`  t+${(i * 2).toString().padStart(2)}s`);
          for (const s of snapshot) {
            if (!s.exists) {
              console.log(`    ${s.sel} → MISSING`);
            } else {
              console.log(
                `    ${s.sel} → ${s.tag}[type=${s.type}] value="${s.value}" text="${s.textContent}"`,
              );
            }
          }
          await page.waitForTimeout(2000);
        }
        await snap(page, '05-account-summary-24s');

        await probeSelectors(
          page,
          [
            '#txtAccSumaryCashBalance',
            '#txtAccSumaryBuyingPowr',
            '#txtAccSumaryTMvaluePortfolio',
            'input[id*="Cash" i]',
            'input[id*="Balance" i]',
            'input[id*="BuyingPower" i]',
            'input[id*="Buying" i]',
            'input[id*="valuePortfolio" i]',
            '[class*="cash" i]',
            '[class*="balance" i]',
          ],
          'Account Summary fields',
        );

        const allInputs = await page
          .locator('input[type="text"]')
          .evaluateAll((els) =>
            els.map((el) => ({
              id: (el as HTMLInputElement).id,
              value: (el as HTMLInputElement).value,
              placeholder: (el as HTMLInputElement).placeholder,
            })),
          );
        console.log(`\n--- ALL text inputs on Account Summary (${allInputs.length} total) ---`);
        for (const inp of allInputs.filter((i) => i.id || i.value)) {
          console.log(`  #${inp.id || '(no-id)'}  value="${inp.value}"  placeholder="${inp.placeholder}"`);
        }
      }
    }

    console.log('\n[6] logout + close');
    const logout = page.locator('#butUserLogOut');
    if ((await logout.count()) > 0) await logout.click();
  } catch (err) {
    console.error('\nRecon error:', err instanceof Error ? err.message : err);
    await snap(page, 'error-state');
  } finally {
    await browser.close();
    console.log('\nDone. Review artefacts in scripts/recon-out/');
  }
}

void run();
