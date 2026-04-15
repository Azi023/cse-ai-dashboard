import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'playwright';
import { config } from '../config';

export async function takeScreenshot(
  page: Page,
  name: string,
): Promise<string> {
  const dir = config.screenshotDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${name}-${timestamp}.png`;
  const filePath = path.join(dir, fileName);

  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
