/**
 * trade.controller.ts — /api/trade/* endpoints
 *
 * This controller exposes the human-approval trade queue to the frontend.
 * All order creation goes through the safety check pipeline automatically.
 *
 * Execution flow:
 *   POST /api/trade/queue  → safety checks → PENDING (if all pass)
 *   POST /api/trade/approve/:id → PENDING → APPROVED
 *   POST /api/trade/execute/:id → APPROVED → EXECUTING → EXECUTED/FAILED
 *   POST /api/trade/reject/:id  → PENDING/APPROVED → REJECTED
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderService, CreateTradeQueueDto } from './order.service';
import { SAFETY_RAILS } from './safety-rails';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

/** All trade endpoints require a valid X-API-Key header. */
@UseGuards(ApiKeyGuard)
@Throttle({ default: { ttl: 60_000, limit: 5 } }) // 5 req/min — trade actions are high-value
@Controller('trade')
export class TradeController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * GET /api/trade/queue — All trade queue entries (newest first, max 100).
   */
  @Get('queue')
  async getQueue() {
    return this.orderService.getOrderHistory();
  }

  /**
   * GET /api/trade/queue/pending — Only PENDING_APPROVAL entries.
   */
  @Get('queue/pending')
  async getPendingQueue() {
    return this.orderService.getActiveOrders();
  }

  /**
   * POST /api/trade/queue — Manually add to trade queue.
   * Runs all safety checks. Requires SAFETY_RAILS.ENABLED = true.
   *
   * Body: { symbol, direction, quantity, limit_price, strategy_id?, reasoning? }
   */
  @Post('queue')
  async createQueueEntry(@Body() dto: CreateTradeQueueDto) {
    if (!dto.symbol || !dto.direction || !dto.quantity || !dto.limit_price) {
      throw new BadRequestException(
        'Required: symbol, direction, quantity, limit_price',
      );
    }

    const symbol = dto.symbol.toUpperCase();
    const quantity = Number(dto.quantity);
    const limitPrice = Number(dto.limit_price);
    const orderAmountLkr = quantity * limitPrice;

    // Run safety checks (returns result even if ENABLED=false, for visibility)
    const safetyResult = await this.orderService.runSafetyChecks({
      symbol,
      quantity,
      limitPrice,
      orderAmountLkr,
    });

    // If kill switch is off, return the check results but don't create entry
    if (!SAFETY_RAILS.ENABLED) {
      return {
        created: false,
        reason: 'Trade automation disabled — SAFETY_RAILS.ENABLED=false',
        safetyCheckResult: safetyResult,
      };
    }

    if (!safetyResult.passed) {
      return {
        created: false,
        reason: `Safety check failed: ${safetyResult.rejectedBy}`,
        safetyCheckResult: safetyResult,
      };
    }

    // All checks passed — create the order with safety result embedded
    const order = await this.orderService.createPendingOrder({
      symbol,
      order_type: 'LIMIT_BUY',
      action: dto.direction.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      quantity,
      trigger_price: limitPrice,
      reason:
        dto.reasoning ??
        `Manual queue entry — ${dto.direction.toUpperCase()} ${symbol}`,
      source: 'MANUAL',
      strategy_id: dto.strategy_id,
      safety_check_result: safetyResult as unknown as Record<string, unknown>,
    });

    return { created: true, order, safetyCheckResult: safetyResult };
  }

  /**
   * POST /api/trade/approve/:id — Approve a PENDING order.
   */
  @Post('approve/:id')
  async approveOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.approveOrder(id);
  }

  /**
   * POST /api/trade/reject/:id — Reject a PENDING or APPROVED order.
   */
  @Post('reject/:id')
  async rejectOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.rejectOrder(id);
  }

  /**
   * POST /api/trade/execute/:id — Execute an APPROVED order via Playwright.
   */
  @Post('execute/:id')
  async executeOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.executeOrder(id);
  }

  /**
   * GET /api/trade/safety-status — Check current safety rails status.
   * Useful for the frontend to show whether trade automation is active.
   */
  @Get('safety-status')
  getSafetyStatus() {
    return {
      enabled: SAFETY_RAILS.ENABLED,
      requireHumanApproval: SAFETY_RAILS.REQUIRE_HUMAN_APPROVAL,
      limits: {
        maxSingleOrderLkr: SAFETY_RAILS.MAX_SINGLE_ORDER_LKR,
        maxDailyBuyLkr: SAFETY_RAILS.MAX_DAILY_BUY_LKR,
        maxPortfolioAllocationPct: SAFETY_RAILS.MAX_PORTFOLIO_ALLOCATION_PCT,
        minCashReserveLkr: SAFETY_RAILS.MIN_CASH_RESERVE_LKR,
        maxDailyOrders: SAFETY_RAILS.MAX_DAILY_ORDERS,
        dailyLossLimitPct: SAFETY_RAILS.DAILY_LOSS_LIMIT_PCT,
        limitOffsetPct: SAFETY_RAILS.LIMIT_OFFSET_PCT,
      },
    };
  }
}
