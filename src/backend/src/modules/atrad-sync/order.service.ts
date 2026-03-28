import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  IsPositive,
  IsObject,
  MaxLength,
} from 'class-validator';
import { PendingOrder } from '../../entities/pending-order.entity';
import { PositionRisk } from '../../entities/position-risk.entity';
import { StrategySignal } from '../../entities/strategy-signal.entity';
import { Alert, Portfolio, Stock } from '../../entities';
import { ATradOrderExecutor } from './atrad-order-executor';
import { RedisService } from '../cse-data/redis.service';
import {
  SAFETY_RAILS,
  SafetyCheckDetail,
  SafetyCheckResult,
} from './safety-rails';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateOrderDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsString()
  @IsIn(['STOP_LOSS', 'TAKE_PROFIT', 'LIMIT_BUY'])
  order_type!: string;

  @IsString()
  @IsIn(['BUY', 'SELL'])
  action!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  trigger_price!: number;

  @IsOptional()
  @IsNumber()
  limit_price?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  strategy_id?: string;

  @IsOptional()
  @IsObject()
  risk_data?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  safety_check_result?: Record<string, unknown>;
}

export class CreateTradeQueueDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsString()
  @IsIn(['BUY', 'SELL'])
  direction!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  limit_price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  strategy_id?: string;

  @IsOptional()
  @IsString()
  reasoning?: string;
}

// ── ATrad cache shape (partial — only what we need) ───────────────────────────

interface ATradCache {
  cashBalance: number;
  accountValue: number;
  buyingPower: number;
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
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(StrategySignal)
    private readonly signalRepo: Repository<StrategySignal>,
    private readonly redisService: RedisService,
    private readonly executor: ATradOrderExecutor,
  ) {}

  // ── Cron: 2:47 PM SLT — Auto-suggest TP/SL from risk analysis ────────────
  // Moved from 2:44 to avoid collision with run-risk-analysis (9:14) and
  // check-exit-signals (9:16). Must run after risk analysis completes.

  @Cron('17 9 * * 1-5', { name: 'suggest-tp-sl-orders' })
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

  // ── Cron: 2:48 PM SLT — Queue HIGH confidence BUY signals ────────────────
  // Runs 5 minutes after signal generation (2:43 PM SLT) to ensure signals are
  // saved before we process them.

  @Cron('18 9 * * 1-5', { name: 'queue-strategy-buy-signals' })
  async processHighConfidenceSignals(): Promise<void> {
    if (!SAFETY_RAILS.ENABLED) {
      this.logger.log(
        'Trade automation disabled (SAFETY_RAILS.ENABLED=false) — skipping signal queuing',
      );
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    this.logger.log(
      `Processing HIGH confidence BUY signals for trade queue (${today})`,
    );

    const signals = await this.signalRepo.find({
      where: { signal_date: today, direction: 'BUY', confidence: 'HIGH' },
      order: { score: 'DESC' },
    });

    if (signals.length === 0) {
      this.logger.log('No HIGH confidence BUY signals today');
      return;
    }

    this.logger.log(
      `Found ${signals.length} HIGH confidence BUY signal(s): ` +
        signals.map((s) => `${s.symbol}/${s.strategy_id}`).join(', '),
    );

    let queued = 0;
    for (const signal of signals) {
      const result = await this.createTradeQueueEntry(signal);
      if (result) queued++;
    }

    this.logger.log(
      `Trade queue: ${queued}/${signals.length} signals queued as PENDING orders`,
    );
  }

  // ── Create trade queue entry from strategy signal ─────────────────────────

  async createTradeQueueEntry(
    signal: StrategySignal,
  ): Promise<PendingOrder | null> {
    if (signal.direction !== 'BUY' || signal.confidence !== 'HIGH') {
      return null;
    }

    // Compute limit price: 0.5% below entry price (patient buyer discount)
    const entryPrice = Number(signal.entry_price);
    const limitPrice =
      Math.round(entryPrice * (1 - SAFETY_RAILS.LIMIT_OFFSET_PCT / 100) * 100) /
      100;

    // Compute quantity from signal data
    const quantity = signal.position_size_shares
      ? Number(signal.position_size_shares)
      : signal.position_size_lkr
        ? Math.floor(Number(signal.position_size_lkr) / limitPrice)
        : Math.floor(10_000 / limitPrice); // fallback: LKR 10K allocation

    if (quantity <= 0) {
      this.logger.warn(
        `Skipping ${signal.symbol}/${signal.strategy_id}: computed quantity=0`,
      );
      return null;
    }

    const orderAmountLkr = quantity * limitPrice;

    // Check for duplicate today (same symbol + strategy)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await this.orderRepo.findOne({
      where: {
        symbol: signal.symbol,
        strategy_id: signal.strategy_id,
        created_at: MoreThanOrEqual(todayStart),
        status: In(['PENDING', 'APPROVED', 'EXECUTING']),
      },
    });

    if (existing) {
      this.logger.log(
        `Trade queue entry already exists for ${signal.symbol}/${signal.strategy_id} today (#${existing.id})`,
      );
      return existing;
    }

    // Run all safety checks
    const safetyResult = await this.runSafetyChecks({
      symbol: signal.symbol,
      quantity,
      limitPrice,
      orderAmountLkr,
    });

    if (!safetyResult.passed) {
      this.logger.log(
        `Trade queue rejected: ${signal.symbol}/${signal.strategy_id} — ` +
          `failed check: ${safetyResult.rejectedBy}`,
      );
      return null;
    }

    // All checks passed — create PENDING order
    const reasoning =
      Array.isArray(signal.reasoning) && signal.reasoning.length > 0
        ? signal.reasoning.join(' | ')
        : `Strategy: ${signal.strategy_name}. Score: ${signal.score}/100.`;

    const order = this.orderRepo.create({
      symbol: signal.symbol.toUpperCase(),
      order_type: 'LIMIT_BUY',
      action: 'BUY',
      quantity,
      trigger_price: limitPrice,
      limit_price: null,
      status: 'PENDING',
      source: 'STRATEGY_ENGINE',
      reason: reasoning,
      strategy_id: signal.strategy_id,
      safety_check_result: safetyResult as unknown as Record<string, unknown>,
      risk_data: {
        signal_date: signal.signal_date,
        entry_price: signal.entry_price,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        market_regime: signal.market_regime,
        score: signal.score,
        data_confidence: signal.data_confidence,
        strategy_name: signal.strategy_name,
      } as Record<string, unknown>,
      approved_at: null,
      executed_at: null,
      atrad_order_id: null,
      execution_screenshot: null,
      error_message: null,
    });

    const saved = await this.orderRepo.save(order);

    await this.createBuySignalAlert(saved, signal);

    this.logger.log(
      `Queued: BUY ${quantity}x ${signal.symbol} @ LKR ${limitPrice.toFixed(2)} ` +
        `[${signal.strategy_id}] — order #${saved.id}`,
    );
    return saved;
  }

  // ── Public: Run safety checks (also usable from API for pre-flight checks) ─

  async runSafetyChecks(params: {
    symbol: string;
    quantity: number;
    limitPrice: number;
    orderAmountLkr: number;
  }): Promise<SafetyCheckResult> {
    const { symbol, quantity, limitPrice, orderAmountLkr } = params;
    const checks: SafetyCheckDetail[] = [];

    // ── CHECK 1: Kill switch ─────────────────────────────────────────────────
    checks.push({
      name: 'KILL_SWITCH',
      passed: SAFETY_RAILS.ENABLED,
      reason: SAFETY_RAILS.ENABLED
        ? 'Trade automation is enabled'
        : 'Trade automation disabled — set SAFETY_RAILS.ENABLED=true to activate',
    });

    // ── CHECK 2: Shariah compliance ──────────────────────────────────────────
    const fullSymbol = symbol.includes('.') ? symbol : `${symbol}.N0000`;
    const stock = await this.stockRepo.findOne({
      where: { symbol: fullSymbol },
    });
    const isCompliant = stock?.shariah_status === 'compliant';
    checks.push({
      name: 'SHARIAH_COMPLIANCE',
      passed: isCompliant,
      reason: isCompliant
        ? `${symbol} is Shariah-compliant`
        : `${symbol} shariah_status="${stock?.shariah_status ?? 'unknown'}" — only compliant stocks allowed`,
    });

    // ── CHECK 3: Max single order size ───────────────────────────────────────
    const check3Passed = orderAmountLkr <= SAFETY_RAILS.MAX_SINGLE_ORDER_LKR;
    checks.push({
      name: 'MAX_ORDER_SIZE',
      passed: check3Passed,
      reason: check3Passed
        ? `Order LKR ${orderAmountLkr.toFixed(0)} ≤ max LKR ${SAFETY_RAILS.MAX_SINGLE_ORDER_LKR}`
        : `Order LKR ${orderAmountLkr.toFixed(0)} exceeds max LKR ${SAFETY_RAILS.MAX_SINGLE_ORDER_LKR}`,
      value: Math.round(orderAmountLkr),
      limit: SAFETY_RAILS.MAX_SINGLE_ORDER_LKR,
    });

    // ── CHECK 4: Max daily buys (LKR) ────────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBuyOrders = await this.orderRepo.find({
      where: {
        action: 'BUY',
        status: In(['PENDING', 'APPROVED', 'EXECUTING', 'EXECUTED']),
        created_at: MoreThanOrEqual(todayStart),
      },
    });
    const existingDailyBuysLkr = todayBuyOrders.reduce(
      (sum, o) => sum + Number(o.trigger_price) * Number(o.quantity),
      0,
    );
    const totalDailyBuysLkr = existingDailyBuysLkr + orderAmountLkr;
    const check4Passed = totalDailyBuysLkr <= SAFETY_RAILS.MAX_DAILY_BUY_LKR;
    checks.push({
      name: 'MAX_DAILY_BUYS',
      passed: check4Passed,
      reason: check4Passed
        ? `Daily buys LKR ${totalDailyBuysLkr.toFixed(0)} ≤ max LKR ${SAFETY_RAILS.MAX_DAILY_BUY_LKR}`
        : `Daily buys LKR ${totalDailyBuysLkr.toFixed(0)} would exceed max LKR ${SAFETY_RAILS.MAX_DAILY_BUY_LKR}`,
      value: Math.round(totalDailyBuysLkr),
      limit: SAFETY_RAILS.MAX_DAILY_BUY_LKR,
    });

    // ── CHECK 5: Max daily order count ───────────────────────────────────────
    const check5Passed = todayBuyOrders.length < SAFETY_RAILS.MAX_DAILY_ORDERS;
    checks.push({
      name: 'MAX_DAILY_ORDERS',
      passed: check5Passed,
      reason: check5Passed
        ? `Today's buy orders: ${todayBuyOrders.length} < max ${SAFETY_RAILS.MAX_DAILY_ORDERS}`
        : `Today's buy orders: ${todayBuyOrders.length} reached max ${SAFETY_RAILS.MAX_DAILY_ORDERS}`,
      value: todayBuyOrders.length,
      limit: SAFETY_RAILS.MAX_DAILY_ORDERS,
    });

    // ── CHECK 6: Portfolio concentration ─────────────────────────────────────
    const atradCache = await this.redisService
      .getJson<ATradCache>('atrad:last_sync')
      .catch(() => null);
    const portfolioHoldings = await this.portfolioRepo.find({
      where: { is_open: true },
    });
    const totalCostBasis = portfolioHoldings.reduce(
      (s, h) => s + Number(h.buy_price) * Number(h.quantity),
      0,
    );
    const portfolioTotal = atradCache?.accountValue
      ? atradCache.accountValue
      : totalCostBasis;
    const symbolBase = symbol.replace(/\.N\d+$/i, '');
    const existingHoldingValue = portfolioHoldings
      .filter((h) => h.symbol.replace(/\.N\d+$/i, '') === symbolBase)
      .reduce((s, h) => s + Number(h.buy_price) * Number(h.quantity), 0);
    const newTotalValue = existingHoldingValue + orderAmountLkr;
    const denominator = portfolioTotal + orderAmountLkr;
    const newAllocationPct =
      denominator > 0 ? (newTotalValue / denominator) * 100 : 0;
    const check6Passed =
      newAllocationPct <= SAFETY_RAILS.MAX_PORTFOLIO_ALLOCATION_PCT;
    checks.push({
      name: 'PORTFOLIO_CONCENTRATION',
      passed: check6Passed,
      reason: check6Passed
        ? `${symbol} allocation ${newAllocationPct.toFixed(1)}% ≤ max ${SAFETY_RAILS.MAX_PORTFOLIO_ALLOCATION_PCT}%`
        : `${symbol} would reach ${newAllocationPct.toFixed(1)}% of portfolio — max ${SAFETY_RAILS.MAX_PORTFOLIO_ALLOCATION_PCT}%`,
      value: Math.round(newAllocationPct * 10) / 10,
      limit: SAFETY_RAILS.MAX_PORTFOLIO_ALLOCATION_PCT,
    });

    // ── CHECK 7: Minimum cash reserve ────────────────────────────────────────
    const cashBalance = atradCache?.cashBalance ?? 0;
    const cashAfterOrder = cashBalance - orderAmountLkr;
    const check7Passed =
      cashBalance > 0 && cashAfterOrder >= SAFETY_RAILS.MIN_CASH_RESERVE_LKR;
    checks.push({
      name: 'CASH_RESERVE',
      passed: check7Passed,
      reason:
        cashBalance === 0
          ? 'No ATrad sync data — trigger a sync first (POST /api/atrad/sync)'
          : check7Passed
            ? `Post-order cash LKR ${cashAfterOrder.toFixed(0)} ≥ reserve LKR ${SAFETY_RAILS.MIN_CASH_RESERVE_LKR}`
            : `Insufficient cash: LKR ${cashBalance.toFixed(0)} − LKR ${orderAmountLkr.toFixed(0)} = LKR ${cashAfterOrder.toFixed(0)} < reserve LKR ${SAFETY_RAILS.MIN_CASH_RESERVE_LKR}`,
      value: Math.round(cashAfterOrder),
      limit: SAFETY_RAILS.MIN_CASH_RESERVE_LKR,
    });

    // ── CHECK 8: Portfolio loss limit ────────────────────────────────────────
    // Uses total P&L vs cost basis (daily snapshot not yet available).
    // Blocks buying when portfolio is significantly down overall.
    let check8Passed = true;
    let check8Reason = 'Skipped — no portfolio or ATrad data available';
    const accountValue = atradCache?.accountValue ?? 0;
    if (accountValue > 0 && totalCostBasis > 0) {
      const portfolioPnlPct =
        ((accountValue - totalCostBasis) / totalCostBasis) * 100;
      check8Passed = portfolioPnlPct > -SAFETY_RAILS.DAILY_LOSS_LIMIT_PCT;
      check8Reason = check8Passed
        ? `Portfolio P&L ${portfolioPnlPct.toFixed(1)}% (above -${SAFETY_RAILS.DAILY_LOSS_LIMIT_PCT}% threshold)`
        : `Portfolio down ${(-portfolioPnlPct).toFixed(1)}% — exceeds loss threshold of ${SAFETY_RAILS.DAILY_LOSS_LIMIT_PCT}%`;
    }
    checks.push({
      name: 'PORTFOLIO_LOSS_LIMIT',
      passed: check8Passed,
      reason: check8Reason,
    });

    const failedCheck = checks.find((c) => !c.passed);
    return {
      passed: !failedCheck,
      checks,
      rejectedBy: failedCheck?.name,
      checkedAt: new Date().toISOString(),
    };
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
      strategy_id: dto.strategy_id ?? null,
      safety_check_result: dto.safety_check_result ?? null,
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

  async rejectOrder(orderId: number): Promise<PendingOrder> {
    const order = await this.findOrFail(orderId);
    if (!['PENDING', 'APPROVED'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot reject order #${orderId} in status '${order.status}'.`,
      );
    }
    const saved = await this.orderRepo.save({ ...order, status: 'REJECTED' });
    this.logger.log(`Order #${orderId} rejected`);
    return saved;
  }

  async executeOrder(orderId: number): Promise<PendingOrder> {
    const order = await this.findOrFail(orderId);

    if (order.status !== 'APPROVED') {
      throw new BadRequestException(
        `Order #${orderId} is not APPROVED (current: ${order.status}). ` +
          'Approve the order first before executing.',
      );
    }

    await this.orderRepo.save({ ...order, status: 'EXECUTING' });
    this.logger.log(`Order #${orderId} marked EXECUTING`);

    const result = await this.executor.executeOrder({
      orderId: order.id,
      symbol: order.symbol,
      action: order.action as 'BUY' | 'SELL',
      quantity: Number(order.quantity),
      triggerPrice: Number(order.trigger_price),
      limitPrice: order.limit_price ? Number(order.limit_price) : null,
      orderType: order.order_type,
    });

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
    if (
      ['EXECUTING', 'EXECUTED', 'CANCELLED', 'REJECTED'].includes(order.status)
    ) {
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

  private async createBuySignalAlert(
    order: PendingOrder,
    signal: StrategySignal,
  ): Promise<void> {
    const alert = this.alertRepo.create({
      symbol: order.symbol,
      alert_type: 'order_suggestion',
      title: `Trade Queue: BUY ${order.symbol} — ${signal.strategy_name}`,
      message:
        `Strategy engine queued a BUY signal: ${order.quantity}x ${order.symbol} ` +
        `@ LKR ${Number(order.trigger_price).toFixed(2)} (limit). ` +
        `Strategy: ${signal.strategy_name}. Score: ${signal.score}/100. ` +
        `All safety checks passed. Review in Orders page.`,
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
