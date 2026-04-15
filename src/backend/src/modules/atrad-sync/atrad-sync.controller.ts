import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ATradSyncService } from './atrad-sync.service';
import { OrderService, CreateOrderDto } from './order.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Public } from '../auth/public.decorator';
import { SyncPushDto } from './dto/sync-push.dto';

/**
 * ATrad Sync controller.
 * GET (read) endpoints marked @Public() temporarily while login flow is validated.
 * POST (write) endpoints require JWT + X-API-Key — they launch live browser automation.
 */
@Controller('atrad')
export class ATradSyncController {
  constructor(
    private readonly atradSyncService: ATradSyncService,
    private readonly orderService: OrderService,
  ) {}

  // ── ATrad Sync endpoints ─────────────────────────────────────────────────────

  /**
   * POST /api/atrad/sync — Trigger a manual ATrad portfolio sync.
   * Protected: JWT + API key. Launches Playwright, logs into live broker account.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('sync')
  async triggerSync() {
    return this.atradSyncService.triggerSync();
  }

  /**
   * POST /api/atrad/sync-push — Receive scraped ATrad data from local machine.
   * Protected: JWT required. Used when VPS can't reach ATrad directly (IP block).
   * Local script runs Playwright, scrapes data, POSTs it here.
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('sync-push')
  async syncPush(@Body() dto: SyncPushDto) {
    return this.atradSyncService.processPushedSync(dto);
  }

  /** GET /api/atrad/status — Last sync time, success/failure, holdings count. */
  @Public()
  @Get('status')
  async getStatus() {
    const status = await this.atradSyncService.getLastSyncStatus();
    return {
      ...status,
      lastSynced: status.lastSyncTime?.toISOString() ?? null,
      configured: status.lastSyncTime !== null,
    };
  }

  /**
   * GET /api/atrad/sync-status — Detailed health check with staleness indicator.
   */
  @Public()
  @Get('sync-status')
  async getSyncStatus() {
    return this.atradSyncService.getSyncStatus();
  }

  /** GET /api/atrad/holdings — Latest synced holdings from ATrad. */
  @Public()
  @Get('holdings')
  async getHoldings() {
    return await this.atradSyncService.getHoldings();
  }

  /**
   * POST /api/atrad/test — Test ATrad login (validates credentials).
   * Protected: JWT + API key. Tests live credentials against broker platform.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('test')
  async testConnection() {
    return this.atradSyncService.testConnection();
  }

  // ── Order endpoints ──────────────────────────────────────────────────────────

  /**
   * GET /api/atrad/orders — List all orders.
   */
  @Public()
  @Get('orders')
  async listOrders(@Query('status') status?: string) {
    return this.orderService.getOrderHistory(status);
  }

  /** GET /api/atrad/orders/active — Active orders only. */
  @Public()
  @Get('orders/active')
  async getActiveOrders() {
    return this.orderService.getActiveOrders();
  }

  /** GET /api/atrad/orders/:id — Get a single order by ID. */
  @Public()
  @Get('orders/:id')
  async getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.getOrderById(id);
  }

  /**
   * POST /api/atrad/orders — Create a new pending order.
   * Protected: JWT + API key.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('orders')
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.orderService.createPendingOrder(dto);
  }

  /**
   * POST /api/atrad/orders/:id/approve — Approve a pending order.
   * Protected: JWT + API key. Approval enables live execution path.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('orders/:id/approve')
  async approveOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.approveOrder(id);
  }

  /**
   * POST /api/atrad/orders/:id/execute — Execute an approved order via Playwright.
   * Protected: JWT + API key. Places a real order on the live broker platform.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('orders/:id/execute')
  async executeOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.executeOrder(id);
  }

  /**
   * POST /api/atrad/orders/:id/cancel — Cancel a pending or approved order.
   * Protected: JWT + API key.
   */
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.cancelOrder(id);
  }
}
