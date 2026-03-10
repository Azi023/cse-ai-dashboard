import { Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface ATradHolding {
  symbol: string;
  companyName: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
}

export interface ATradPortfolio {
  holdings: ATradHolding[];
  buyingPower: number;
  accountValue: number;
  cashBalance: number;
  lastSynced: Date;
  syncSuccess: boolean;
  error?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const TIMEOUT_MS = 60_000;
const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '../../../../data/atrad-sync',
);

// Common selectors to try for login form fields
const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[name="userName"]',
  'input[name="user"]',
  'input[name="loginId"]',
  'input[name="login"]',
  'input[id="username"]',
  'input[id="userName"]',
  'input[id="user"]',
  'input[id="loginId"]',
  'input[type="text"]:first-of-type',
  '#txtUsername',
  '#txtLoginId',
  'input[placeholder*="user" i]',
  'input[placeholder*="login" i]',
  'input[placeholder*="name" i]',
];

const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input[name="passwd"]',
  'input[name="pass"]',
  'input[id="password"]',
  'input[id="passwd"]',
  'input[type="password"]',
  '#txtPassword',
  'input[placeholder*="password" i]',
];

const LOGIN_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Login")',
  'button:has-text("Sign In")',
  'button:has-text("Log In")',
  'a:has-text("Login")',
  '#btnLogin',
  '.login-btn',
  '.btn-login',
  'button.btn-primary',
];

// SAFETY: selectors we must NEVER click
const FORBIDDEN_SELECTORS = [
  'button:has-text("Buy")',
  'button:has-text("Sell")',
  'button:has-text("Order")',
  'button:has-text("Place")',
  'button:has-text("Submit Order")',
  'button:has-text("Confirm")',
  'a:has-text("Buy")',
  'a:has-text("Sell")',
  'a:has-text("Order")',
];

// ── Helper functions ────────────────────────────────────────────────────────

const logger = new Logger('ATradBrowser');

function ensureScreenshotDir(): void {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function findAndFill(
  page: Page,
  selectors: string[],
  value: string,
  fieldName: string,
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.fill(value);
        logger.log(`Filled ${fieldName} using selector: ${selector}`);
        return true;
      }
    } catch {
      // Try next selector
    }
  }
  logger.error(`Could not find ${fieldName} field with any known selector`);
  return false;
}

async function findAndClick(
  page: Page,
  selectors: string[],
  buttonName: string,
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click();
        logger.log(`Clicked ${buttonName} using selector: ${selector}`);
        return true;
      }
    } catch {
      // Try next selector
    }
  }
  logger.error(`Could not find ${buttonName} with any known selector`);
  return false;
}

function parseNumber(text: string | null | undefined): number {
  if (!text) return 0;
  // Remove commas, currency symbols, whitespace, and parentheses (negative)
  const cleaned = text.replace(/[^0-9.\-()]/g, '');
  if (!cleaned) return 0;

  // Handle parentheses for negative numbers: (123.45) => -123.45
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    return -parseFloat(cleaned.slice(1, -1)) || 0;
  }
  return parseFloat(cleaned) || 0;
}

async function takeScreenshot(page: Page, name: string): Promise<void> {
  try {
    ensureScreenshotDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(SCREENSHOT_DIR, `${name}-${timestamp}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    logger.log(`Screenshot saved: ${filePath}`);
  } catch (err) {
    logger.warn(`Failed to take screenshot "${name}": ${String(err)}`);
  }
}

// ── Portfolio navigation helpers ────────────────────────────────────────────

const PORTFOLIO_NAV_SELECTORS = [
  'a:has-text("Portfolio")',
  'a:has-text("Holdings")',
  'a:has-text("My Portfolio")',
  'a:has-text("Positions")',
  'button:has-text("Portfolio")',
  'button:has-text("Holdings")',
  '[data-menu="portfolio"]',
  '[data-tab="portfolio"]',
  '.nav-portfolio',
  '#portfolio-tab',
  '#portfolioTab',
  'li:has-text("Portfolio")',
  'span:has-text("Portfolio")',
];

async function navigateToPortfolio(page: Page): Promise<boolean> {
  // First check if portfolio data is already visible on the page
  const hasPortfolioTable = await page.$('table:has(th:has-text("Qty"))');
  if (hasPortfolioTable) {
    logger.log('Portfolio table already visible on page');
    return true;
  }

  for (const selector of PORTFOLIO_NAV_SELECTORS) {
    try {
      // Safety check: never click forbidden buttons
      for (const forbidden of FORBIDDEN_SELECTORS) {
        if (selector.toLowerCase().includes('buy') ||
            selector.toLowerCase().includes('sell') ||
            selector.toLowerCase().includes('order')) {
          continue;
        }
      }

      const element = await page.$(selector);
      if (element) {
        const text = await element.textContent();
        // Double-check the text doesn't contain forbidden words
        if (text && /buy|sell|order|place|confirm/i.test(text)) {
          continue;
        }
        await element.click();
        logger.log(`Navigated to portfolio using selector: ${selector}`);
        await page.waitForTimeout(2000);
        return true;
      }
    } catch {
      // Try next
    }
  }

  logger.warn('Could not find portfolio navigation element');
  return false;
}

// ── Scrape holdings from portfolio table ────────────────────────────────────

async function scrapeHoldings(page: Page): Promise<ATradHolding[]> {
  const holdings: ATradHolding[] = [];

  // Try multiple table selectors
  const tableSelectors = [
    'table.portfolio-table',
    'table.holdings-table',
    'table#portfolioTable',
    'table#holdingsTable',
    '#portfolio table',
    '#holdings table',
    '.portfolio table',
    '.holdings table',
    'table:has(th:has-text("Qty"))',
    'table:has(th:has-text("Symbol"))',
    'table:has(th:has-text("Security"))',
    'table:has(th:has-text("Quantity"))',
    // Fallback: any data table
    'table.table',
    'table.data-table',
    'table.grid',
  ];

  let tableElement = null;
  for (const sel of tableSelectors) {
    try {
      tableElement = await page.$(sel);
      if (tableElement) {
        logger.log(`Found portfolio table with selector: ${sel}`);
        break;
      }
    } catch {
      // Try next
    }
  }

  if (!tableElement) {
    logger.warn('No portfolio table found on page');

    // Try to extract from grid/card layout instead
    const cardHoldings = await scrapeHoldingsFromCards(page);
    if (cardHoldings.length > 0) return cardHoldings;

    return holdings;
  }

  // Extract headers to determine column positions
  const headers = await tableElement.$$eval('thead th, thead td, tr:first-child th, tr:first-child td', (cells) =>
    cells.map((c) => (c.textContent ?? '').trim().toLowerCase()),
  );

  logger.log(`Table headers found: ${JSON.stringify(headers)}`);

  // Map column indices
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (/symbol|security|stock|scrip/i.test(h)) colMap.symbol = i;
    if (/company|name/i.test(h)) colMap.companyName = i;
    if (/qty|quantity|shares|holding/i.test(h)) colMap.quantity = i;
    if (/avg.*price|average.*price|cost|buy.*price/i.test(h)) colMap.avgPrice = i;
    if (/current.*price|market.*price|last.*price|ltp|last/i.test(h)) colMap.currentPrice = i;
    if (/market.*val|mkt.*val|current.*val/i.test(h)) colMap.marketValue = i;
    if (/p\s*[&/]\s*l|profit|gain|unreali[sz]ed/i.test(h)) colMap.unrealizedPL = i;
    if (/%|pct|percent/i.test(h) && /p\s*[&/]\s*l|profit|gain|unreali[sz]ed/i.test(h)) colMap.unrealizedPLPct = i;
  });

  // Get data rows
  const rows = await tableElement.$$('tbody tr, tr:not(:first-child)');
  logger.log(`Found ${rows.length} data rows in portfolio table`);

  for (const row of rows) {
    try {
      const cells = await row.$$eval('td', (tds) =>
        tds.map((td) => (td.textContent ?? '').trim()),
      );

      if (cells.length < 3) continue;

      const symbol = cells[colMap.symbol ?? 0] ?? '';
      if (!symbol || /total|sum|footer/i.test(symbol)) continue;

      const companyName = cells[colMap.companyName ?? 1] ?? symbol;
      const quantity = parseNumber(cells[colMap.quantity ?? 2]);
      const avgPrice = parseNumber(cells[colMap.avgPrice ?? 3]);
      const currentPrice = parseNumber(cells[colMap.currentPrice ?? 4]);
      const marketValue = parseNumber(cells[colMap.marketValue ?? 5]);
      const unrealizedPL = parseNumber(cells[colMap.unrealizedPL ?? 6]);
      const unrealizedPLPct = parseNumber(cells[colMap.unrealizedPLPct ?? 7]);

      if (quantity > 0) {
        holdings.push({
          symbol: symbol.replace(/\.N\d+$/i, '').trim(),
          companyName,
          quantity,
          avgPrice,
          currentPrice,
          marketValue: marketValue || quantity * currentPrice,
          unrealizedPL,
          unrealizedPLPct,
        });
      }
    } catch (err) {
      logger.warn(`Error parsing row: ${String(err)}`);
    }
  }

  logger.log(`Scraped ${holdings.length} holdings from portfolio table`);
  return holdings;
}

async function scrapeHoldingsFromCards(page: Page): Promise<ATradHolding[]> {
  // Fallback: try extracting from card/tile layouts
  const holdings: ATradHolding[] = [];
  const cardSelectors = [
    '.holding-card',
    '.portfolio-item',
    '.stock-card',
    '[class*="holding"]',
    '[class*="portfolio-item"]',
  ];

  for (const sel of cardSelectors) {
    try {
      const cards = await page.$$(sel);
      if (cards.length > 0) {
        logger.log(`Found ${cards.length} portfolio cards with selector: ${sel}`);
        for (const card of cards) {
          const text = await card.textContent();
          if (text) {
            // Very rough extraction from card text
            logger.debug(`Card text: ${text.substring(0, 200)}`);
          }
        }
        break;
      }
    } catch {
      // Try next
    }
  }

  return holdings;
}

// ── Scrape account summary (buying power, cash, etc.) ───────────────────────

async function scrapeAccountSummary(
  page: Page,
): Promise<{ buyingPower: number; accountValue: number; cashBalance: number }> {
  const result = { buyingPower: 0, accountValue: 0, cashBalance: 0 };

  // Try to extract from labeled elements
  const labelPatterns: Array<{
    key: keyof typeof result;
    patterns: RegExp[];
  }> = [
    {
      key: 'buyingPower',
      patterns: [/buying\s*power/i, /available\s*balance/i, /available\s*cash/i, /free\s*cash/i],
    },
    {
      key: 'accountValue',
      patterns: [/account\s*value/i, /total\s*value/i, /portfolio\s*value/i, /net\s*worth/i, /equity/i],
    },
    {
      key: 'cashBalance',
      patterns: [/cash\s*balance/i, /cash/i, /settled\s*cash/i, /available\s*fund/i],
    },
  ];

  try {
    // Strategy 1: Look for label-value pairs in spans/divs
    const allText = await page.$$eval(
      'span, div, td, label, p',
      (elements) =>
        elements.map((el) => ({
          text: (el.textContent ?? '').trim(),
          next: el.nextElementSibling
            ? (el.nextElementSibling.textContent ?? '').trim()
            : '',
          parent: el.parentElement
            ? (el.parentElement.textContent ?? '').trim()
            : '',
        })),
    );

    for (const { key, patterns } of labelPatterns) {
      for (const el of allText) {
        for (const pattern of patterns) {
          if (pattern.test(el.text)) {
            // Try to parse the number from adjacent text
            const adjacentNumber = parseNumber(el.next) || parseNumber(el.parent.replace(el.text, ''));
            if (adjacentNumber > 0) {
              result[key] = adjacentNumber;
              logger.log(`Found ${key}: ${adjacentNumber}`);
              break;
            }
          }
        }
        if (result[key] > 0) break;
      }
    }

    // Strategy 2: Look for specific element IDs/classes
    const specificSelectors: Array<{
      key: keyof typeof result;
      selectors: string[];
    }> = [
      {
        key: 'buyingPower',
        selectors: ['#buyingPower', '.buying-power', '[data-field="buyingPower"]', '#availableBalance'],
      },
      {
        key: 'accountValue',
        selectors: ['#accountValue', '.account-value', '[data-field="accountValue"]', '#portfolioValue'],
      },
      {
        key: 'cashBalance',
        selectors: ['#cashBalance', '.cash-balance', '[data-field="cashBalance"]', '#cash'],
      },
    ];

    for (const { key, selectors } of specificSelectors) {
      if (result[key] > 0) continue; // Already found
      for (const sel of selectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            const text = await el.textContent();
            const val = parseNumber(text);
            if (val > 0) {
              result[key] = val;
              logger.log(`Found ${key} via ${sel}: ${val}`);
              break;
            }
          }
        } catch {
          // Try next
        }
      }
    }
  } catch (err) {
    logger.warn(`Error scraping account summary: ${String(err)}`);
  }

  return result;
}

// ── Main sync function ──────────────────────────────────────────────────────

export async function syncATradPortfolio(): Promise<ATradPortfolio> {
  const loginUrl = process.env.ATRAD_LOGIN_URL || 'https://trade.hnbstockbrokers.lk/atsweb/login';
  const username = process.env.ATRAD_USERNAME;
  const password = process.env.ATRAD_PASSWORD;

  // Validate credentials
  if (!username || !password) {
    logger.error('ATrad credentials not configured. Set ATRAD_USERNAME and ATRAD_PASSWORD in .env');
    return {
      holdings: [],
      buyingPower: 0,
      accountValue: 0,
      cashBalance: 0,
      lastSynced: new Date(),
      syncSuccess: false,
      error: 'ATrad credentials not configured. Set ATRAD_USERNAME and ATRAD_PASSWORD environment variables.',
    };
  }

  let browser: Browser | null = null;

  try {
    logger.log('Launching headless Chromium browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    // ── Step 1: Navigate to login page ──────────────────────────────────
    logger.log(`Navigating to ATrad login: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    logger.log('Login page loaded');
    await takeScreenshot(page, 'login-page');

    // ── Step 2: Fill credentials ────────────────────────────────────────
    logger.log('Filling login credentials...');
    const userFilled = await findAndFill(page, USERNAME_SELECTORS, username, 'username');
    const passFilled = await findAndFill(page, PASSWORD_SELECTORS, password, 'password');

    if (!userFilled || !passFilled) {
      await takeScreenshot(page, 'login-fields-not-found');
      return {
        holdings: [],
        buyingPower: 0,
        accountValue: 0,
        cashBalance: 0,
        lastSynced: new Date(),
        syncSuccess: false,
        error: `Could not find login form fields. Username found: ${userFilled}, Password found: ${passFilled}`,
      };
    }

    // ── Step 3: Click login button ──────────────────────────────────────
    logger.log('Clicking login button...');
    const loginClicked = await findAndClick(page, LOGIN_BUTTON_SELECTORS, 'login button');

    if (!loginClicked) {
      // Try pressing Enter as fallback
      logger.log('Login button not found, trying Enter key...');
      await page.keyboard.press('Enter');
    }

    // Wait for navigation after login
    logger.log('Waiting for post-login navigation...');
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 });
    } catch {
      // Some SPAs don't trigger navigation, wait for content change
      logger.log('No navigation detected, waiting for page content to change...');
      await page.waitForTimeout(5000);
    }

    await takeScreenshot(page, 'post-login');

    // Check for login errors
    const errorSelectors = [
      '.error-message',
      '.alert-danger',
      '.login-error',
      '#errorMessage',
      '.error',
      'div:has-text("Invalid")',
      'div:has-text("incorrect")',
      'span:has-text("Invalid")',
    ];

    for (const sel of errorSelectors) {
      try {
        const errorEl = await page.$(sel);
        if (errorEl) {
          const errorText = await errorEl.textContent();
          if (errorText && /invalid|incorrect|failed|wrong|error/i.test(errorText)) {
            logger.error(`Login error detected: ${errorText}`);
            return {
              holdings: [],
              buyingPower: 0,
              accountValue: 0,
              cashBalance: 0,
              lastSynced: new Date(),
              syncSuccess: false,
              error: `Login failed: ${errorText.trim()}`,
            };
          }
        }
      } catch {
        // Try next
      }
    }

    logger.log('Login appears successful');

    // ── Step 4: Navigate to portfolio/holdings ──────────────────────────
    logger.log('Looking for portfolio/holdings section...');
    await navigateToPortfolio(page);
    await page.waitForTimeout(3000); // Allow data to load
    await takeScreenshot(page, 'portfolio-page');

    // ── Step 5: Scrape holdings data ────────────────────────────────────
    logger.log('Scraping portfolio holdings...');
    const holdings = await scrapeHoldings(page);
    logger.log(`Found ${holdings.length} holdings`);

    // ── Step 6: Scrape account summary ──────────────────────────────────
    logger.log('Scraping account summary...');
    const accountSummary = await scrapeAccountSummary(page);
    logger.log(
      `Account summary — Buying Power: ${accountSummary.buyingPower}, ` +
      `Account Value: ${accountSummary.accountValue}, ` +
      `Cash Balance: ${accountSummary.cashBalance}`,
    );

    await takeScreenshot(page, 'final-state');

    // ── Step 7: Safely close browser ────────────────────────────────────
    logger.log('Sync complete. Closing browser...');
    await context.close();
    await browser.close();
    browser = null;

    return {
      holdings,
      buyingPower: accountSummary.buyingPower,
      accountValue: accountSummary.accountValue,
      cashBalance: accountSummary.cashBalance,
      lastSynced: new Date(),
      syncSuccess: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`ATrad sync failed: ${errorMessage}`);

    return {
      holdings: [],
      buyingPower: 0,
      accountValue: 0,
      cashBalance: 0,
      lastSynced: new Date(),
      syncSuccess: false,
      error: `Sync failed: ${errorMessage}`,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
