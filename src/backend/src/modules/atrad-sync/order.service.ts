import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { PendingOrder } from '../../entities/pending-order.entity';
import { PositionRisk } from '../../entities/position-risk.entity';
import { Alert } from '../../entities';
import { ATradOrderExecutor } from './atrad-order-executor';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateOrderDto {
  symbol!: string;
  order_type!: string; // 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIMIT_BUY'
  action!: string; // 'BUY' | 'SELL'
  quantity!: number;
  trigger_price!: number;
  limit_price?: number;
  reason?: string;
  source?: string;
  risk_data?: Record<string, unknown>;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(PendingOrder)
    private readonly orderRepo: Repository<PendingOrder>,
    @InjectRepository(PositionRisk)
    private readonly riskRepo: Repository<PositionRisk>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    private readonly executor: ATradOrderExecutor,
  ) {}

  // ── Cron: 2:44 PM SLT (9:14 AM UTC) — Auto-suggest TP/SL from risk analysis ──

  @Cron('14 9 * * 1-5', { name: 'suggest-tp-sl-orders' })
  async autoSuggestTpSlOrders(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    this.logger.log(
      `Auto-suggesting TP/SL orders from risk analysis (${today})`,
    );

    const risks = await this.riskRepo.find({
      where: { date: today },
      order: { symbol: 'ASC' },
    });

    if (risks.length === 0) {
      this.logger.log('No risk records for today — skipping TP/SL suggestion');
      return;
    }

    let suggested = 0;

    for (const risk of risks) {
      const symbol = risk.symbol;
      const sharesHeld = Number(risk.shares_held);
      const stopPrice = Number(risk.recommended_stop);
      const tpPrice = Number(risk.take_profit);

      if (sharesHeld <= 0 || stopPrice <= 0 || tpPrice <= 0) continue;

      // Check if active stop-loss order already exists
      const existingStop = await this.findActiveSuggestionForSymbol(
        symbol,
        'STOP_LOSS',
      );
      if (!existingStop) {
        await this.createPendingOrder({
          symbol,
          order_type: 'STOP_LOSS',
          action: 'SELL',
          quantity: sharesHeld,
          trigger_price: stopPrice,
          reason:
            `Auto-suggested stop-loss at LKR ${stopPrice.toFixed(2)} ` +
            `(${Number(risk.distance_to_stop_pct).toFixed(1)}% below current price). ` +
            `Max loss if triggered: LKR ${Number(risk.max_loss_lkr).toFixed(0)}.`,
          source: 'RISK_SERVICE',
          risk_data: {
            date: risk.date,
            entry_price: risk.entry_price,
            current_price: risk.current_price,
            stop_loss_atr: risk.stop_loss_atr,
            stop_loss_support: risk.stop_loss_support,
            recommended_stop: risk.recommended_stop,
            risk_reward_ratio: risk.risk_reward_ratio,
            position_heat_pct: risk.position_heat_pct,
          } as Record<string, unknown>,
        });
        suggested++;
        this.logger.log(
          `Suggested STOP_LOSS for ${symbol} at LKR ${stopPrice}`,
        );
      }

      // Check if active take-profit order already exists
      const existingTp = await this.findActiveSuggestionForSymbol(
        symbol,
        'TAKE_PROFIT',
      );
      if (!existingTp) {
        await this.createPendingOrder({
          symbol,
          order_type: 'TAKE_PROFIT',
          action: 'SELL',
          quantity: sharesHeld,
          trigger_price: tpPrice,
          reason:
            `Auto-suggested take-profit at LKR ${tpPrice.toFixed(2)} ` +
            `(target from risk:reward = ${Number(risk.risk_reward_ratio).toFixed(1)}:1). ` +
            `Potential gain: LKR ${Number(risk.max_gain_lkr).toFixed(0)}.`,
          source: 'RISK_SERVICE',
          risk_data: {
            date: risk.date,
            current_price: risk.current_price,
            take_profit: risk.take_profit,
            risk_reward_ratio: risk.risk_reward_ratio,
          } as Record<string, unknown>,
        });
        suggested++;
        this.logger.log(
          `Suggested TAKE_PROFIT for ${symbol} at LKR ${tpPrice}`,
        );
      }
    }

    if (suggested > 0) {
      await this.createSuggestionAlert(suggested);
      this.logger.log(`Auto-suggested ${suggested} orders. Notification sent.`);
    } else {
      this.logger.log(
        'All positions already have TP/SL suggestions — nothing new to create',
      );
    }
  }

  // ── CRUD operations ──────────────────────────────────────────────────────────

  async createPendingOrder(dto: CreateOrderDto): Promise<PendingOrder> {
    const order = this.orderRepo.create({
      symbol: dto.symbol.toUpperCase(),
      order_type: dto.order_type,
      action: dto.action,
      quantity: dto.quantity,
      trigger_price: dto.trigger_price,
      limit_price: dto.limit_price ?? null,
      status: 'PENDING',
      source: dto.source ?? 'MANUAL',
      reason: dto.reason ?? null,
      risk_data: dto.risk_data ?? null,
      approved_at: null,
      executed_at: null,
      atrad_order_id: null,
      execution_screenshot: null,
      error_message: null,
    });
    const saved = await this.orderRepo.save(order);
    this.logger.log(
      `Created pending order #${saved.id}: ${saved.order_type} ${saved.action} ${saved.quantity}x ${saved.symbol} @ ${saved.trigger_price}`,
    );
    return saved;
  }

  async approveOrder(orderId: number): Promise<PendingOrder> {
    const order = await this.findOrFail(orderId);
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Order #${orderId} is not in PENDING status (current: ${order.status}). Only PENDING orders can be approved.`,
      );
    }
    const approved = { ...order, status: 'APPROVED', approved_at: new Date() };
    const saved = await this.orderRepo.save(approved);
    this.logger.log(`Order #${orderId} approved`);
    return saved;
  }

  async executeOrder(orderId: number): Promise<PendingOrder> {
    const order = await this.findOrFail(orderId);

    // ── Safety gate: must be APPROVED ──────────────────────────────────────
    if (order.status !== 'APPROVED') {
      throw new BadRequestException(
        `Order #${orderId} is not APPROVED (current: ${order.status}). ` +
          'Approve the order first before executing.',
      );
    }

    // ── Set status to EXECUTING ────────────────────────────────────────────
    await this.orderRepo.save({ ...order, status: 'EXECUTING' });
    this.logger.log(`Order #${orderId} marked EXECUTING`);

    // ── Invoke Playwright executor ─────────────────────────────────────────
    const result = await this.executor.executeOrder({
      orderId: order.id,
      symbol: order.symbol,
      action: order.action as 'BUY' | 'SELL',
      quantity: Number(order.quantity),
      triggerPrice: Number(order.trigger_price),
      limitPrice: order.limit_price ? Number(order.limit_price) : null,
      orderType: order.order_type,
    });

    // ── Update status based on result ──────────────────────────────────────
    const finalStatus = result.success ? 'EXECUTED' : 'FAILED';
    const updated = {
      ...order,
      status: finalStatus,
      executed_at: result.success ? new Date() : null,
      atrad_order_id: result.atradOrderId ?? null,
      execution_screenshot: result.screenshotPath ?? null,
      error_message: result.errorMessage ?? null,
    };
    const saved = await this.orderRepo.save(updated);
    this.logger.log(`Order #${orderId} final status: ${finalStatus}`);

    if (result.success) {
      await this.createExecutionAlert(order, result.atradOrderId);
    } else {
      await this.createFailureAlert(
        order,
        result.errorMessage ?? 'Unknown error',
      );
    }

    return saved;
  }

  async cancelOrder(orderId: number): Promise<PendingOrder> {
    const order = await this.findOrFail(orderId);
    if (['EXECUTING', 'EXECUTED', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot cancel order #${orderId} in status '${order.status}'.`,
      );
    }
    const saved = await this.orderRepo.save({ ...order, status: 'CANCELLED' });
    this.logger.log(`Order #${orderId} cancelled`);
    return saved;
  }

  async getActiveOrders(): Promise<PendingOrder[]> {
    return this.orderRepo.find({
      where: { status: In(['PENDING', 'APPROVED', 'EXECUTING']) },
      order: { created_at: 'DESC' },
    });
  }

  async getOrderHistory(statusFilter?: string): Promise<PendingOrder[]> {
    if (statusFilter) {
      return this.orderRepo.find({
        where: { status: statusFilter },
        order: { created_at: 'DESC' },
        take: 100,
      });
    }
    return this.orderRepo.find({
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async getOrderById(orderId: number): Promise<PendingOrder> {
    return this.findOrFail(orderId);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async findOrFail(orderId: number): Promise<PendingOrder> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);
    return order;
  }

  private async findActiveSuggestionForSymbol(
    symbol: string,
    orderType: string,
  ): Promise<PendingOrder | null> {
    return this.orderRepo.findOne({
      where: {
        symbol,
        order_type: orderType,
        source: 'RISK_SERVICE',
        status: In(['PENDING', 'APPROVED']),
      },
    });
  }

  private async createSuggestionAlert(count: number): Promise<void> {
    const alert = this.alertRepo.create({
      symbol: 'PORTFOLIO',
      alert_type: 'order_suggestion',
      title: `${count} TP/SL Order${count > 1 ? 's' : ''} Suggested`,
      message:
        `The risk service has suggested ${count} new TP/SL order${count > 1 ? 's' : ''}. ` +
        'Review and approve them in the Orders page before they take effect.',
      is_triggered: true,
      triggered_at: new Date(),
      is_active: false,
      is_read: false,
    });
    await this.alertRepo.save(alert);
  }

  private async createExecutionAlert(
    order: PendingOrder,
    atradOrderId?: string,
  ): Promise<void> {
    const alert = this.alertRepo.create({
      symbol: order.symbol,
      alert_type: 'order_executed',
      title: `Order Executed: ${order.order_type} for ${order.symbol}`,
      message:
        `✅ Your ${order.order_type} order for ${order.quantity}x ${order.symbol} ` +
        `at LKR ${Number(order.trigger_price).toFixed(2)} has been placed on ATrad.` +
        (atradOrderId ? ` ATrad Order ID: ${atradOrderId}` : ''),
      is_triggered: true,
      triggered_at: new Date(),
      is_active: false,
      is_read: false,
    });
    await this.alertRepo.save(alert);
  }

  private async createFailureAlert(
    order: PendingOrder,
    errorMsg: string,
  ): Promise<void> {
    const alert = this.alertRepo.create({
      symbol: order.symbol,
      alert_type: 'order_failed',
      title: `Order Failed: ${order.order_type} for ${order.symbol}`,
      message:
        `❌ Order #${order.id} (${order.order_type} ${order.symbol} @ LKR ${Number(order.trigger_price).toFixed(2)}) ` +
        `failed to execute: ${errorMsg.slice(0, 300)}`,
      is_triggered: true,
      triggered_at: new Date(),
      is_active: false,
      is_read: false,
    });
    await this.alertRepo.save(alert);
  }
}
