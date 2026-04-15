import type { Page } from 'playwright';
import { config } from '../config';
import { logger } from '../utils/logger';
import { takeScreenshot } from '../utils/screenshot';
import { LOGIN_SELECTORS } from './selectors';

export async function loginToATrad(page: Page): Promise<boolean> {
  logger.info('Logging in to ATrad...');

  try {
    const response = await page.goto(LOGIN_SELECTORS.url, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    if (!response || response.status() >= 400) {
      logger.error(
        `ATrad login page returned HTTP ${response?.status() ?? 'no response'}`,
      );
      await takeScreenshot(page, 'login-failed');
      return false;
    }

    // Fill credentials
    await page.fill(LOGIN_SELECTORS.username, config.atradUsername);
    await page.fill(LOGIN_SELECTORS.password, config.atradPassword);
    await page.click(LOGIN_SELECTORS.submit);

    // Wait for post-login navigation
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    if (currentUrl.includes('login') && !currentUrl.includes('home')) {
      // Check for error messages
      const errorText = await page.evaluate(() => {
        const els = document.querySelectorAll(
          '.error, .alert-danger, [class*="error" i]',
        );
        return Array.from(els)
          .map((e) => e.textContent?.trim())
          .filter(Boolean)
          .join('; ');
      });

      if (errorText) {
        logger.error(`ATrad login failed: ${errorText}`);
      } else {
        logger.error('ATrad login may have failed — still on login page');
      }
      await takeScreenshot(page, 'login-error');
      return false;
    }

    logger.info('ATrad login successful');
    await takeScreenshot(page, 'login-success');
    return true;
  } catch (err) {
    logger.error('ATrad login error', err);
    await takeScreenshot(page, 'login-exception').catch(() => {});
    return false;
  }
}
