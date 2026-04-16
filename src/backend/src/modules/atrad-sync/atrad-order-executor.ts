/**
 * atrad-order-executor.ts — ATrad Order Execution Coordinator
 *
 * ARCHITECTURE DECISION (April 2026):
 * ATrad blocks all VPS/datacenter IPs (confirmed Hetzner 403). The backend
 * CANNOT launch a browser to trade directly. All execution flows through the
 * WSL2 agent which has a Sri Lankan residential IP.
 *
 * This class is now a thin coordinator:
 *   1. Validates the order is safe to execute
 *   2. Marks it EXECUTING (the agent picks it up via polling)
 *   3. The agent fills + submits via Playwright on local machine
 *   4. The agent reports back via POST /api/internal/agent/report-execution
 *
 * The executeOrder() method returns immediately with a "delegated to agent"
 * result. The caller (order.service.ts) updates the order status and the
 * frontend polls for completion.
 *
 * SAFETY RULES (unchanged):
 *  1. NEVER execute an order with status !== 'APPROVED'
 *  2. All actions logged to order-execution.log
 *  3. Maximum 1 order per call (no batch execution)
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// ── Directory Setup ───────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../../../../data/atrad-sync');
const LOG_FILE = path.join(DATA_DIR, 'order-execution.log');

// ── Execution result types ────────────────────────────────────────────────────

export interface OrderExecutionInput {
  orderId: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  triggerPrice: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  orderType: string;
  tif?: string;
  board?: string;
}

export interface OrderExecutionResult {
  success: boolean;
  delegatedToAgent: boolean;
  atradOrderId?: string;
  screenshotPath?: string;
  errorMessage?: string;
}

// ── Logger helper ─────────────────────────────────────────────────────────────

function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function logToFile(message: string): void {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] ${message}\n`);
  } catch {
    // Non-fatal
  }
}

// ── ATrad Order Executor (NestJS Injectable) ──────────────────────────────────

@Injectable()
export class ATradOrderExecutor {
  private readonly logger = new Logger(ATradOrderExecutor.name);

  private log(msg: string): void {
    this.logger.log(msg);
    logToFile(msg);
  }

  private warn(msg: string): void {
    this.logger.warn(msg);
    logToFile(`WARN: ${msg}`);
  }

  /**
   * Delegate order execution to the WSL2 agent.
   *
   * This method validates the order parameters and returns immediately.
   * The order is marked EXECUTING by the caller (order.service.ts), and
   * the WSL2 agent picks it up on its next poll cycle (~30 seconds).
   *
   * The agent executes via Playwright:
   *   1. Opens ATrad, fills the order form
   *   2. Verifies all form values match the approved order
   *   3. Submits the order
   *   4. Captures screenshots at every step
   *   5. Reports result via POST /api/internal/agent/report-execution
   */
  async executeOrder(input: OrderExecutionInput): Promise<OrderExecutionResult> {
    ensureDirectories();
    this.log(`=== ORDER DELEGATION: Order #${input.orderId} ===`);
    this.log(
      `Symbol: ${input.symbol}, Action: ${input.action}, Qty: ${input.quantity}, ` +
        `Price: ${input.triggerPrice}, StopPrice: ${input.stopPrice ?? 'N/A'}, ` +
        `Type: ${input.orderType}, TIF: ${input.tif ?? 'DAY'}, Board: ${input.board ?? 'REGULAR'}`,
    );

    // ── Validate order parameters ──────────────────────────────────────────
    if (!input.symbol || input.quantity <= 0 || input.triggerPrice <= 0) {
      const msg = `Invalid order parameters: symbol=${input.symbol} qty=${input.quantity} price=${input.triggerPrice}`;
      this.warn(msg);
      return { success: false, delegatedToAgent: false, errorMessage: msg };
    }

    // ── Validate stop price for STOP_LIMIT orders ──────────────────────────
    if (
      (input.orderType === 'STOP_LOSS' || input.orderType === 'STOP_LIMIT_SELL' || input.orderType === 'STOP_LIMIT_BUY') &&
      (!input.stopPrice || input.stopPrice <= 0)
    ) {
      const msg = `STOP_LIMIT order requires a valid stop_price (got: ${input.stopPrice})`;
      this.warn(msg);
      return { success: false, delegatedToAgent: false, errorMessage: msg };
    }

    // ── Delegate to agent ──────────────────────────────────────────────────
    this.log(
      `Order #${input.orderId} delegated to WSL2 agent for execution. ` +
        `Agent will pick it up via GET /api/internal/agent/pending-trades within ~30s.`,
    );

    return {
      success: true,
      delegatedToAgent: true,
    };
  }
}
