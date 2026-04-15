import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { vpsClient } from './vps-client';
import { launchBrowser, closeBrowser } from './atrad/browser';
import { loginToATrad } from './atrad/login';
import { syncPortfolio } from './atrad/portfolio-sync';
import { placeOrder } from './atrad/order-entry';

// ── State ──────────────────────────────────────────────────────────────────

let isRunning = true;
let lastHeartbeat: Date | null = null;
let consecutiveHeartbeatFailures = 0;

// ── Helpers ────────────────────────────────────────────────────────────────

function getSLTHour(): number {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  return utcH + 5 + (utcM + 30) / 60;
}

function isMarketHours(): boolean {
  const day = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;
  const hour = getSLTHour();
  return isWeekday && hour >= config.marketOpenHour && hour < config.marketCloseHour;
}

function isExtendedHours(): boolean {
  // 9:00 AM - 3:30 PM SLT (covers pre-market + post-close pipeline)
  const day = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;
  const hour = getSLTHour();
  return isWeekday && hour >= 9 && hour < 15.5;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Heartbeat ──────────────────────────────────────────────────────────────

async function sendHeartbeat(): Promise<boolean> {
  try {
    const result = await vpsClient.heartbeat();
    lastHeartbeat = new Date();
    consecutiveHeartbeatFailures = 0;
    logger.debug(
      `Heartbeat OK — server: ${result.serverTime}, market: ${result.marketOpen ? 'OPEN' : 'CLOSED'}`,
    );
    return true;
  } catch (err) {
    consecutiveHeartbeatFailures++;
    logger.error(
      `Heartbeat failed (${consecutiveHeartbeatFailures} consecutive)`,
      err,
    );
    return false;
  }
}

// ── Trade Execution ────────────────────────────────────────────────────────

async function processPendingTrades(): Promise<void> {
  try {
    const trades = await vpsClient.getPendingTrades();

    if (trades.length === 0) return;

    logger.info(`Found ${trades.length} pending trade(s)`);

    const page = await launchBrowser();
    const loggedIn = await loginToATrad(page);

    if (!loggedIn) {
      logger.error('Cannot execute trades — ATrad login failed');
      for (const trade of trades) {
        await vpsClient.reportExecution({
          tradeQueueId: trade.id,
          status: 'ERROR',
          notes: 'ATrad login failed',
        });
      }
      await closeBrowser();
      return;
    }

    for (const trade of trades) {
      logger.info(
        `Processing trade #${trade.id}: ${trade.action} ${trade.quantity}x ${trade.symbol}`,
      );

      const result = await placeOrder(page, trade);

      await vpsClient.reportExecution({
        tradeQueueId: trade.id,
        status: result.success ? 'FILLED' : 'ERROR',
        fillPrice: undefined,
        filledQuantity: result.success ? trade.quantity : 0,
        atradOrderRef: result.atradOrderRef,
        screenshotPath: result.screenshotPath,
        notes: result.notes,
      });

      logger.info(
        `Trade #${trade.id} reported: ${result.success ? 'FILLED' : 'ERROR'} — ${result.notes}`,
      );
    }

    await closeBrowser();
  } catch (err) {
    logger.error('Error processing pending trades', err);
    await closeBrowser();
  }
}

// ── Portfolio Sync ─────────────────────────────────────────────────────────

async function handleSyncTrigger(): Promise<void> {
  try {
    const trigger = await vpsClient.getSyncTrigger();

    if (!trigger.shouldSync) return;

    logger.info(`Sync triggered: ${trigger.reason}`);

    const page = await launchBrowser();
    const loggedIn = await loginToATrad(page);

    if (!loggedIn) {
      logger.error('Cannot sync portfolio — ATrad login failed');
      await closeBrowser();
      return;
    }

    const result = await syncPortfolio(page);

    await vpsClient.syncPortfolio({
      cashBalance: result.cashBalance,
      holdings: result.holdings,
    });

    logger.info(
      `Portfolio synced to VPS: cash=${result.cashBalance}, holdings=${result.holdings.length}`,
    );

    await closeBrowser();
  } catch (err) {
    logger.error('Error during portfolio sync', err);
    await closeBrowser();
  }
}

// ── Main Loop ──────────────────────────────────────────────────────────────

async function mainLoop(): Promise<void> {
  logger.info('=== CSE Agent starting ===');
  logger.info(`VPS URL: ${config.vpsUrl}`);
  logger.info(`ATrad URL: ${config.atradUrl}`);

  // Initial heartbeat to verify connectivity
  const connected = await sendHeartbeat();
  if (!connected) {
    logger.warn('Initial heartbeat failed — VPS may be unreachable. Continuing anyway...');
  }

  let lastHeartbeatTime = Date.now();

  while (isRunning) {
    const now = Date.now();
    const marketOpen = isMarketHours();
    const extendedHours = isExtendedHours();

    // Heartbeat
    const heartbeatInterval = extendedHours
      ? config.heartbeatInterval
      : config.idleHeartbeatInterval;

    if (now - lastHeartbeatTime >= heartbeatInterval) {
      await sendHeartbeat();
      lastHeartbeatTime = now;
    }

    if (extendedHours) {
      // Check for pending trades (only during market + extended hours)
      if (marketOpen) {
        await processPendingTrades();
      }

      // Check for sync triggers (during extended hours — catches 2:38 PM sync)
      await handleSyncTrigger();

      // Poll interval during active hours
      await sleep(config.pollInterval);
    } else {
      // Off hours — just heartbeat, sleep longer
      await sleep(config.idleHeartbeatInterval);
    }
  }

  logger.info('=== CSE Agent stopped ===');
}

// ── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down...`);
  isRunning = false;
  closeBrowser().then(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Entry Point ────────────────────────────────────────────────────────────

try {
  validateConfig();
  mainLoop().catch((err) => {
    logger.error('Fatal error in main loop', err);
    process.exit(1);
  });
} catch (err) {
  logger.error('Configuration error', err);
  process.exit(1);
}
