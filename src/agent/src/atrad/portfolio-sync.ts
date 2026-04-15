import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import { takeScreenshot } from '../utils/screenshot';
import { NAV_SELECTORS, ACCOUNT_SELECTORS, HOLDINGS_SELECTORS } from './selectors';
import type { PortfolioHolding } from '../vps-client';

export interface ATradSyncResult {
  cashBalance: number;
  holdings: PortfolioHolding[];
}

async function navigateToMenu(page: Page, menuItem: string): Promise<void> {
  const clientMenu = await page.$(NAV_SELECTORS.clientMenu);
  if (!clientMenu) {
    throw new Error(`Client menu not found: ${NAV_SELECTORS.clientMenu}`);
  }
  await clientMenu.click();
  await page.waitForTimeout(1500);

  const item = await page.$(menuItem);
  if (!item) {
    throw new Error(`Menu item not found: ${menuItem}`);
  }
  await item.click();
  await page.waitForTimeout(3000);
}

async function scrapeAccountSummary(
  page: Page,
): Promise<{ cashBalance: number; buyingPower: number; portfolioValue: number }> {
  await navigateToMenu(page, NAV_SELECTORS.accountSummary);
  await takeScreenshot(page, 'account-summary');

  const parseValue = async (selector: string): Promise<number> => {
    const el = await page.$(selector);
    if (!el) return 0;
    const raw = await el.inputValue().catch(() => null);
    if (!raw) return 0;
    return Number(raw.replace(/,/g, '')) || 0;
  };

  const cashBalance = await parseValue(ACCOUNT_SELECTORS.cashBalance);
  const buyingPower = await parseValue(ACCOUNT_SELECTORS.buyingPower);
  const portfolioValue = await parseValue(ACCOUNT_SELECTORS.portfolioValue);

  logger.info(
    `Account summary: cash=${cashBalance}, buying=${buyingPower}, portfolio=${portfolioValue}`,
  );

  return { cashBalance, buyingPower, portfolioValue };
}

async function scrapeHoldings(page: Page): Promise<PortfolioHolding[]> {
  await navigateToMenu(page, NAV_SELECTORS.stockHolding);
  await page.waitForTimeout(2000);
  await takeScreenshot(page, 'holdings');

  // Try the ATrad JSON API first (most reliable)
  const apiResult = await page.evaluate(
    (params) => {
      const body = new URLSearchParams(params).toString();
      return fetch('/atsweb/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
        .then((r) => r.text())
        .catch((e) => `ERROR: ${String(e)}`);
    },
    {
      action: HOLDINGS_SELECTORS.apiParams.action,
      exchange: HOLDINGS_SELECTORS.apiParams.exchange,
      broker: HOLDINGS_SELECTORS.apiParams.broker,
      stockHoldingClientAccount: HOLDINGS_SELECTORS.apiParams.stockHoldingClientAccount,
      stockHoldingSecurity: HOLDINGS_SELECTORS.apiParams.stockHoldingSecurity,
      format: HOLDINGS_SELECTORS.apiParams.format,
    },
  );

  if (apiResult.startsWith('ERROR:')) {
    logger.warn(`ATrad holdings API failed: ${apiResult}`);
    return scrapeHoldingsFromDOM(page);
  }

  try {
    // ATrad returns single-quote JSON — normalize before parsing
    const normalized = apiResult.replace(/'/g, '"');
    const parsed = JSON.parse(normalized);
    const portfolios = parsed?.data?.portfolios ?? [];

    if (!Array.isArray(portfolios) || portfolios.length === 0) {
      logger.info('ATrad API returned empty portfolios, trying DOM scrape');
      return scrapeHoldingsFromDOM(page);
    }

    const holdings: PortfolioHolding[] = portfolios.map(
      (p: Record<string, unknown>) => ({
        symbol: String(p.security ?? p.symbol ?? ''),
        quantity: Number(p.quantity ?? p.totalQuantity ?? 0),
        avgCost: Number(p.averagePrice ?? p.avgPrice ?? 0),
        marketValue: Number(p.marketValue ?? 0),
        unrealizedGain: Number(p.unrealizedGain ?? p.unrealizedPL ?? 0),
      }),
    );

    logger.info(`Parsed ${holdings.length} holdings from ATrad API`);
    return holdings;
  } catch (err) {
    logger.error('Failed to parse ATrad API response, falling back to DOM', err);
    return scrapeHoldingsFromDOM(page);
  }
}

async function scrapeHoldingsFromDOM(page: Page): Promise<PortfolioHolding[]> {
  // Fallback: scrape the Dojo DataGrid for holdings
  const holdings = await page.evaluate(() => {
    const grid = document.querySelector('#stockHoldingGridId');
    if (!grid) return [];

    const rows = grid.querySelectorAll('.dojoxGridRow');
    const result: {
      symbol: string;
      quantity: number;
      avgCost: number;
      marketValue: number;
      unrealizedGain: number;
    }[] = [];

    for (const row of rows) {
      const cells = row.querySelectorAll('.dojoxGridCell');
      if (cells.length < 10) continue;

      // Grid columns: [checkbox, Account No, Client Name, Quantity, Cleared Balance,
      //  Available Balance, Holding %, Avg Price, B.E.S Price, Total Cost, Traded Price]
      const quantity = Number(
        (cells[3]?.textContent ?? '0').replace(/,/g, ''),
      );
      const avgPrice = Number(
        (cells[7]?.textContent ?? '0').replace(/,/g, ''),
      );
      const totalCost = Number(
        (cells[9]?.textContent ?? '0').replace(/,/g, ''),
      );
      const tradedPrice = Number(
        (cells[10]?.textContent ?? '0').replace(/,/g, ''),
      );

      if (quantity > 0) {
        const marketValue = quantity * tradedPrice;
        result.push({
          symbol: '', // Symbol comes from the security dropdown, not the grid
          quantity,
          avgCost: avgPrice,
          marketValue,
          unrealizedGain: marketValue - totalCost,
        });
      }
    }

    return result;
  });

  logger.info(`Scraped ${holdings.length} holdings from DOM`);
  return holdings;
}

export async function syncPortfolio(page: Page): Promise<ATradSyncResult> {
  logger.info('Starting ATrad portfolio sync...');

  const { cashBalance } = await scrapeAccountSummary(page);
  const holdings = await scrapeHoldings(page);

  logger.info(
    `Sync complete: cash=${cashBalance}, holdings=${holdings.length}`,
  );

  return { cashBalance, holdings };
}
