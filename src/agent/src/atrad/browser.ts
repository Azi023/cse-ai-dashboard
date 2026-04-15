import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config';
import { logger } from '../utils/logger';

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function launchBrowser(): Promise<Page> {
  if (browser) {
    await closeBrowser();
  }

  logger.info('Launching Chromium...');
  browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

export async function closeBrowser(): Promise<void> {
  try {
    if (context) {
      await context.close();
      context = null;
    }
    if (browser) {
      await browser.close();
      browser = null;
    }
    logger.info('Browser closed');
  } catch (err) {
    logger.error('Error closing browser', err);
  }
}

export function isBrowserOpen(): boolean {
  return browser !== null && browser.isConnected();
}
