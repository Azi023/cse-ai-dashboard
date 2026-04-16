import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { PendingOrder } from '../../entities/pending-order.entity';
import { Portfolio } from '../../entities';
import { Alert } from '../../entities/alert.entity';
import { RedisService } from '../cse-data/redis.service';
import { TradingCalendarService } from '../cse-data/trading-calendar.service';

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface HeartbeatResponse {
  status: 'ok';
  serverTime: string;
  marketOpen: boolean;
}

export interface PendingTradeResponse {
  id: number;
  symbol: string;
  action: string;
  quantity: number;
  triggerPrice: number;
  limitPrice: number | null;
  stopPrice: number | null;
  orderType: string;
  tif: string;
  board: string;
  reason: string | null;
  strategyId: string | null;
  source: string | null;
  approvedAt: string | null;
  linkedOrderId: number | null;
}

export interface ExecutionReportDto {
  tradeQueueId: number;
  status: 'FILLED' | 'PARTIAL' | 'REJECTED' | 'ERROR';
  fillPrice?: number;
  filledQuantity?: number;
  atradOrderRef?: string;
  atradBlotterStatus?: string;
  screenshotPath?: string;
  notes?: string;
}

export interface PortfolioSyncDto {
  cashBalance: number;
  holdings: {
    symbol: string;
    quantity: number;
    avgCost: number;
    marketValue: number;
    unrealizedGain: number;
  }[];
}

export interface SyncTriggerResponse {
  shouldSync: boolean;
  reason: string;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(PendingOrder)
    private readonly pendingOrderRepo: Repository<PendingOrder>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    private readonly redisService: RedisService,
    private readonly calendar: TradingCalendarService,
  ) {}

  // ── Heartbeat ──────────────────────────────────────────────────────────

  getHeartbeat(): HeartbeatResponse {
    const now = new Date();
    const sltHour = this.getSLTHour(now);
    const day = now.getDay(); // 0=Sun, 6=Sat
    const isWeekday = day >= 1 && day <= 5;
    const marketOpen = isWeekday && sltHour >= 9.5 && sltHour < 14.5;

    return {
      status: 'ok',
      serverTime: now.toISOString(),
      marketOpen,
    };
  }

  // ── Pending Trades ─────────────────────────────────────────────────────

  async getPendingTrades(): Promise<PendingTradeResponse[]> {
    const orders = await this.pendingOrderRepo.find({
      where: { status: 'APPROVED' },
      order: { approved_at: 'ASC' },
    });

    return orders.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      action: o.action,
      quantity: o.quantity,
      triggerPrice: Number(o.trigger_price),
      limitPrice: o.limit_price ? Number(o.limit_price) : null,
      stopPrice: o.stop_price ? Number(o.stop_price) : null,
      orderType: o.order_type,
      tif: o.tif ?? 'DAY',
      board: o.board ?? 'REGULAR',
      reason: o.reason,
      strategyId: o.strategy_id,
      source: o.source,
      approvedAt: o.approved_at?.toISOString() ?? null,
      linkedOrderId: o.linked_order_id ?? null,
    }));
  }

  // ── Report Execution ───────────────────────────────────────────────────

  async reportExecution(
    dto: ExecutionReportDto,
  ): Promise<{ success: boolean }> {
    const order = await this.pendingOrderRepo.findOne({
      where: { id: dto.tradeQueueId },
    });

    if (!order) {
      this.logger.warn(`reportExecution: order ${dto.tradeQueueId} not found`);
      return { success: false };
    }

    const isSuccess = dto.status === 'FILLED' || dto.status === 'PARTIAL';

    await this.pendingOrderRepo.save({
      ...order,
      status: isSuccess ? 'EXECUTED' : 'FAILED',
      executed_at: new Date(),
      atrad_order_id: dto.atradOrderRef ?? null,
      atrad_blotter_status: dto.atradBlotterStatus ?? null,
      execution_screenshot: dto.screenshotPath ?? null,
      error_message:
        dto.status === 'ERROR' || dto.status === 'REJECTED'
          ? (dto.notes ?? `Execution ${dto.status}`)
          : null,
    });

    // Create notification alert
    const alertTitle = isSuccess
      ? `Order EXECUTED: ${order.action} ${order.quantity} ${order.symbol} @ ${dto.fillPrice ?? 'market'}`
      : `Order FAILED: ${order.action} ${order.quantity} ${order.symbol} — ${dto.notes ?? dto.status}`;

    await this.alertRepo.save(
      this.alertRepo.create({
        symbol: order.symbol,
        alert_type: 'auto_generated',
        title: alertTitle,
        message: dto.notes ?? null,
        is_triggered: true,
        triggered_at: new Date(),
      }),
    );

    this.logger.log(
      `Execution reported: order #${order.id} ${order.symbol} → ${dto.status}`,
    );

    return { success: true };
  }

  // ── Sync Portfolio ─────────────────────────────────────────────────────

  async syncPortfolio(
    dto: PortfolioSyncDto,
  ): Promise<{ success: boolean; updated: number }> {
    this.logger.log(
      `Portfolio sync received: cash=${dto.cashBalance}, holdings=${dto.holdings.length}`,
    );

    // Store cash balance and buying power in Redis (same keys as existing ATrad sync)
    const syncedAt = new Date().toISOString();
    await this.redisService.setJson('atrad:balance', {
      cashBalance: dto.cashBalance,
      buyingPower: dto.cashBalance,
      lastSynced: syncedAt,
    });
    await this.redisService.setJson('atrad:last_sync', {
      syncedAt,
      lastSynced: syncedAt,
      cashBalance: dto.cashBalance,
      buyingPower: dto.cashBalance,
      holdings: dto.holdings,
    });

    // Store holdings in Redis for quick access
    await this.redisService.setJson('atrad:holdings', dto.holdings);

    // Reset sync trigger flag
    await this.redisService.del('atrad:sync_requested');

    // Create notification
    await this.alertRepo.save(
      this.alertRepo.create({
        alert_type: 'auto_generated',
        title: `ATrad sync completed: LKR ${Number(dto.cashBalance).toLocaleString()} cash, ${dto.holdings.length} holdings`,
        is_triggered: true,
        triggered_at: new Date(),
      }),
    );

    this.logger.log('Portfolio sync complete, Redis updated');
    return { success: true, updated: dto.holdings.length };
  }

  // ── Sync Trigger ───────────────────────────────────────────────────────

  async getSyncTrigger(): Promise<SyncTriggerResponse> {
    const requested = await this.redisService.get('atrad:sync_requested');

    if (requested === 'true') {
      return {
        shouldSync: true,
        reason: 'Post-close sync requested by VPS cron',
      };
    }

    // Check if last sync was too long ago (>24h stale data warning)
    const lastSync = await this.redisService.getJson<{ syncedAt?: string }>(
      'atrad:last_sync',
    );
    if (lastSync?.syncedAt) {
      const elapsed = Date.now() - new Date(lastSync.syncedAt).getTime();
      const hours = elapsed / (1000 * 60 * 60);
      if (hours > 24) {
        return {
          shouldSync: true,
          reason: `Last sync was ${hours.toFixed(1)}h ago (>24h stale)`,
        };
      }
    } else {
      return { shouldSync: true, reason: 'No previous sync recorded' };
    }

    return { shouldSync: false, reason: 'No sync needed' };
  }

  // ── Cron: Request ATrad sync at 2:38 PM SLT ───────────────────────────

  @Cron('0 38 14 * * 1-5')
  async requestATradSync(): Promise<void> {
    if (this.calendar.skipIfNonTrading(this.logger, 'requestATradSync')) return;
    this.logger.log('Setting ATrad sync flag (2:38 PM SLT post-close)');
    await this.redisService.set('atrad:sync_requested', 'true', 3600); // 1h TTL

    // If agent hasn't synced within 30 minutes, log warning
    setTimeout(
      async () => {
        const stillRequested = await this.redisService.get(
          'atrad:sync_requested',
        );
        if (stillRequested === 'true') {
          this.logger.warn(
            'ATrad sync was requested 30 minutes ago but agent has not completed it. Is the agent online?',
          );
          await this.alertRepo.save(
            this.alertRepo.create({
              alert_type: 'auto_generated',
              title: 'ATrad sync overdue — agent may be offline',
              message:
                'Sync was requested at 2:38 PM but not completed within 30 minutes',
              is_triggered: true,
              triggered_at: new Date(),
            }),
          );
        }
      },
      30 * 60 * 1000,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private getSLTHour(date: Date): number {
    // SLT = UTC + 5:30
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    return utcHours + 5 + (utcMinutes + 30) / 60;
  }
}
