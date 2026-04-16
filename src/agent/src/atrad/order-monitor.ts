/**
 * order-monitor.ts — ATrad blotter polling for order status tracking.
 *
 * Polls the ATrad blotter API to detect order status changes (NEW → FILLED,
 * NEW → CANCELED, etc.) and reports them to the VPS. Enables pseudo-OCO:
 * when one side of a linked pair fills, the VPS marks the counterpart as
 * CANCELLING and the agent cancels it on the next cycle.
 *
 * Uses ATrad's internal API rather than DOM scraping for reliability:
 *   GET /atsweb/order?action=getBlotterData&clientAcc=...&exchange=CSE
 */

import type { Page } from 'playwright';
import { logger } from '../utils/logger';
import { vpsClient } from '../vps-client';
import { ATRAD_ACCOUNT } from './selectors';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlotterEntry {
  securityId: string;
  side: string;
  orderQty: number;
  orderPrice: number;
  orderStatus: string;
  filledQty: number;
  grossAvgPrice: number;
  clientOrderId: string;
  exchangeOrderId: string;
  lastChangeTime: string;
  stopPrice?: number;
}

interface TrackedOrder {
  tradeQueueId: number;
  atradOrderRef: string;
  lastKnownStatus: string;
  linkedOrderId: number | null;
}

// ── State ──────────────────────────────────────────────────────────────────

const trackedOrders = new Map<string, TrackedOrder>();

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Register an ATrad order for monitoring after successful submission.
 */
export function trackOrder(
  atradOrderRef: string,
  tradeQueueId: number,
  linkedOrderId: number | null,
): void {
  trackedOrders.set(atradOrderRef, {
    tradeQueueId,
    atradOrderRef,
    lastKnownStatus: 'NEW',
    linkedOrderId,
  });
  logger.info(
    `Tracking order: ATrad ref=${atradOrderRef}, queue=#${tradeQueueId}` +
      (linkedOrderId ? `, linked=#${linkedOrderId}` : ''),
  );
}

/**
 * Stop tracking an ATrad order (after it's fully resolved).
 */
export function untrackOrder(atradOrderRef: string): void {
  trackedOrders.delete(atradOrderRef);
}

/**
 * Get all currently tracked orders.
 */
export function getTrackedOrders(): TrackedOrder[] {
  return Array.from(trackedOrders.values());
}

/**
 * Poll the ATrad blotter and detect status changes for tracked orders.
 * Reports changes to VPS which triggers OCO cancellation logic.
 *
 * @returns Number of status changes detected
 */
export async function pollBlotter(page: Page): Promise<number> {
  if (trackedOrders.size === 0) return 0;

  try {
    const entries = await fetchBlotterData(page);
    if (entries.length === 0) return 0;

    let changes = 0;

    for (const [ref, tracked] of trackedOrders) {
      const blotterEntry = entries.find(
        (e) =>
          e.exchangeOrderId === ref ||
          e.clientOrderId === ref,
      );

      if (!blotterEntry) continue;

      const newStatus = blotterEntry.orderStatus;
      if (newStatus === tracked.lastKnownStatus) continue;

      // Status changed
      logger.info(
        `Order ${ref} status: ${tracked.lastKnownStatus} → ${newStatus}`,
      );
      tracked.lastKnownStatus = newStatus;
      changes++;

      // Report to VPS
      try {
        await vpsClient.reportOrderStatusUpdate({
          atradOrderRef: ref,
          atradStatus: newStatus,
          filledQty: blotterEntry.filledQty || undefined,
          filledPrice: blotterEntry.grossAvgPrice || undefined,
        });
      } catch (err) {
        logger.error(`Failed to report status update for ${ref}`, err);
      }

      // If FILLED or CANCELED, stop tracking
      if (['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(newStatus)) {
        logger.info(`Order ${ref} terminal status (${newStatus}) — untracking`);
        trackedOrders.delete(ref);
      }
    }

    return changes;
  } catch (err) {
    logger.error('Blotter poll failed', err);
    return 0;
  }
}

// ── Internal ───────────────────────────────────────────────────────────────

/**
 * Fetch blotter data from ATrad's internal API via page.evaluate().
 * This runs within the authenticated browser session.
 */
async function fetchBlotterData(page: Page): Promise<BlotterEntry[]> {
  return page.evaluate(
    async (account) => {
      try {
        const params = new URLSearchParams({
          action: 'getBlotterData',
          clientAcc: account.clientAccount,
          exchange: account.exchange,
          ordStatus: 'ALL',
          ordType: 'ALL',
          lstUpdateTime: '',
          assetClass: 'EQUITY',
          otherAcc: '',
          format: 'json',
        });

        const resp = await fetch(`/atsweb/order?${params.toString()}`);
        if (!resp.ok) return [];

        const data = await resp.json();
        const blotterData = data?.data?.blotterdata;
        if (!Array.isArray(blotterData)) return [];

        return blotterData.map((entry: Record<string, unknown>) => ({
          securityId: String(entry.securityId ?? ''),
          side: String(entry.side ?? ''),
          orderQty: Number(entry.orderQty ?? 0),
          orderPrice: Number(entry.orderPrice ?? 0),
          orderStatus: String(entry.orderStatus ?? ''),
          filledQty: Number(entry.filledQty ?? 0),
          grossAvgPrice: Number(entry.grossAvgPrice ?? 0),
          clientOrderId: String(entry.clientOrderId ?? ''),
          exchangeOrderId: String(entry.exchangeOrderId ?? ''),
          lastChangeTime: String(entry.lastChangeTime ?? ''),
          stopPrice: entry.stopPrice ? Number(entry.stopPrice) : undefined,
        }));
      } catch {
        return [];
      }
    },
    { clientAccount: ATRAD_ACCOUNT.clientAccount, exchange: ATRAD_ACCOUNT.exchange },
  );
}
