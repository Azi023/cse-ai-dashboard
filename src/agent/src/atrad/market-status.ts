/**
 * market-status.ts — Pre-order market and security status checks.
 *
 * Before placing any order, the agent must verify:
 *  1. The market allows new orders (isnew=true from getMarketStatus)
 *  2. The specific security allows buy/sell (from getSecurityProperties)
 *  3. Available shares for sell orders (from getAvlSahres)
 *
 * These checks prevent placing orders that would be immediately rejected,
 * saving time and avoiding ATrad error states.
 */

import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import { ATRAD_ACCOUNT } from './selectors';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MarketStatus {
  isNewAllowed: boolean;
  isAmendAllowed: boolean;
  isCancelAllowed: boolean;
  securityStatus: string;
  tradeStatus: string;
}

export interface SecurityStatus {
  buyEnabled: boolean;
  sellEnabled: boolean;
  shortSellEnabled: boolean;
  lotSize: number;
}

export interface AvailableShares {
  available: number;
  original: number;
  pendingSell: number;
}

// ── Market Status ──────────────────────────────────────────────────────────

/**
 * Check if the market allows new orders, amendments, and cancellations.
 * Uses ATrad's getMarketStatus API.
 */
export async function checkMarketStatus(
  page: Page,
  symbol: string,
  boardId: string = '1',
): Promise<MarketStatus> {
  try {
    const result = await page.evaluate(
      async (params) => {
        const qs = new URLSearchParams({
          action: 'getMarketStatus',
          securityid: params.symbol,
          bordId: params.boardId,
          exchange: params.exchange,
          format: 'json',
        });

        const resp = await fetch(`/atsweb/order?${qs.toString()}`);
        if (!resp.ok) return null;

        const json = await resp.json();
        return json?.data ?? null;
      },
      { symbol, boardId, exchange: ATRAD_ACCOUNT.exchange },
    );

    if (!result) {
      logger.warn(`Market status check failed for ${symbol} — assuming closed`);
      return {
        isNewAllowed: false,
        isAmendAllowed: false,
        isCancelAllowed: false,
        securityStatus: 'unknown',
        tradeStatus: 'unknown',
      };
    }

    const status: MarketStatus = {
      isNewAllowed: result.isnew === true || result.isnew === 'true',
      isAmendAllowed: result.isammend === true || result.isammend === 'true',
      isCancelAllowed: result.iscancel === true || result.iscancel === 'true',
      securityStatus: String(result.securitystatus ?? ''),
      tradeStatus: String(result.tradestatus ?? ''),
    };

    logger.info(
      `Market status for ${symbol}: new=${status.isNewAllowed}, ` +
        `amend=${status.isAmendAllowed}, cancel=${status.isCancelAllowed}, ` +
        `status=${status.tradeStatus}`,
    );

    return status;
  } catch (err) {
    logger.error(`Market status check error for ${symbol}`, err);
    return {
      isNewAllowed: false,
      isAmendAllowed: false,
      isCancelAllowed: false,
      securityStatus: 'error',
      tradeStatus: 'error',
    };
  }
}

// ── Security Properties ────────────────────────────────────────────────────

/**
 * Check if a security allows buying and selling.
 * Some securities may be disabled for trading at certain times.
 */
export async function checkSecurityStatus(
  page: Page,
  symbol: string,
): Promise<SecurityStatus> {
  try {
    const result = await page.evaluate(
      async (params) => {
        const qs = new URLSearchParams({
          action: 'getSecurityProperties',
          txtSecurityId: params.symbol,
          format: 'json',
        });

        const resp = await fetch(`/atsweb/order?${qs.toString()}`);
        if (!resp.ok) return null;

        const json = await resp.json();
        const details = json?.data?.SecurityDetail;
        return Array.isArray(details) && details.length > 0
          ? details[0]
          : null;
      },
      { symbol },
    );

    if (!result) {
      logger.warn(`Security properties unavailable for ${symbol}`);
      return { buyEnabled: true, sellEnabled: true, shortSellEnabled: false, lotSize: 1 };
    }

    const status: SecurityStatus = {
      buyEnabled: result.isDisabledBuy !== true && result.isDisabledBuy !== 'true',
      sellEnabled: result.isDisabledSell !== true && result.isDisabledSell !== 'true',
      shortSellEnabled: result.isShortSellDisabled !== true && result.isShortSellDisabled !== 'true',
      lotSize: Number(result.lotSize ?? 1),
    };

    logger.info(
      `Security ${symbol}: buy=${status.buyEnabled}, sell=${status.sellEnabled}, ` +
        `shortSell=${status.shortSellEnabled}, lotSize=${status.lotSize}`,
    );

    return status;
  } catch (err) {
    logger.error(`Security properties check error for ${symbol}`, err);
    return { buyEnabled: true, sellEnabled: true, shortSellEnabled: false, lotSize: 1 };
  }
}

// ── Available Shares ───────────────────────────────────────────────────────

/**
 * Check available shares for a sell order.
 * Returns original quantity, available (after pending sells), and pending sell qty.
 */
export async function checkAvailableShares(
  page: Page,
  symbol: string,
): Promise<AvailableShares> {
  try {
    const result = await page.evaluate(
      async (params) => {
        const qs = new URLSearchParams({
          action: 'getAvlSahres', // ATrad's typo, not ours
          market: params.exchange,
          account: params.clientAccount,
          security: params.symbol,
          exchange: params.exchange,
          broker: params.broker,
          clientAnctId: params.clientAccountId,
          format: 'json',
        });

        const resp = await fetch(`/atsweb/order?${qs.toString()}`);
        if (!resp.ok) return null;

        const json = await resp.json();
        return json?.data ?? null;
      },
      {
        symbol,
        exchange: ATRAD_ACCOUNT.exchange,
        clientAccount: ATRAD_ACCOUNT.clientAccount,
        broker: ATRAD_ACCOUNT.broker,
        clientAccountId: ATRAD_ACCOUNT.clientAccountId,
      },
    );

    if (!result) {
      logger.warn(`Available shares check failed for ${symbol}`);
      return { available: 0, original: 0, pendingSell: 0 };
    }

    const shares: AvailableShares = {
      available: Number(result.sharesamount ?? 0),
      original: Number(result.orginalQty ?? 0),
      pendingSell: Number(result.pendingQty ?? 0),
    };

    logger.info(
      `Available shares for ${symbol}: available=${shares.available}, ` +
        `original=${shares.original}, pendingSell=${shares.pendingSell}`,
    );

    return shares;
  } catch (err) {
    logger.error(`Available shares check error for ${symbol}`, err);
    return { available: 0, original: 0, pendingSell: 0 };
  }
}

// ── Pre-Order Validation ───────────────────────────────────────────────────

/**
 * Run all pre-order checks. Returns null if order can proceed,
 * or an error string describing why it should be blocked.
 */
export async function validatePreOrder(
  page: Page,
  symbol: string,
  action: 'BUY' | 'SELL',
  quantity: number,
): Promise<string | null> {
  // Check market status
  const market = await checkMarketStatus(page, symbol);
  if (!market.isNewAllowed) {
    return `Market not accepting new orders (status: ${market.tradeStatus})`;
  }

  // Check security status
  const security = await checkSecurityStatus(page, symbol);
  if (action === 'BUY' && !security.buyEnabled) {
    return `Buying disabled for ${symbol}`;
  }
  if (action === 'SELL' && !security.sellEnabled) {
    return `Selling disabled for ${symbol}`;
  }

  // Check lot size
  if (quantity % security.lotSize !== 0) {
    return `Quantity ${quantity} not a multiple of lot size ${security.lotSize}`;
  }

  // For sell orders, check available shares
  if (action === 'SELL') {
    const shares = await checkAvailableShares(page, symbol);
    if (shares.available < quantity) {
      return `Insufficient shares: available=${shares.available}, requested=${quantity}`;
    }
  }

  return null; // All checks passed
}
