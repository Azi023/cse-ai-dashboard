import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ATradSyncService } from './atrad-sync.service';
import { OrderService, CreateOrderDto } from './order.service';

@Controller('atrad')
export class ATradSyncController {
  constructor(
    private readonly atradSyncService: ATradSyncService,
    private readonly orderService: OrderService,
  ) {}

  // ── ATrad Sync endpoints ─────────────────────────────────────────────────────

  /** POST /api/atrad/sync — Trigger a manual ATrad portfolio sync. */
  @Post('sync')
  async triggerSync() {
    return this.atradSyncService.triggerSync();
  }

  /** GET /api/atrad/status — Last sync time, success/failure, holdings count. */
  @Get('status')
  async getStatus() {
    const status = await this.atradSyncService.getLastSyncStatus();
    return {
      ...status,
      lastSynced: status.lastSyncTime?.toISOString() ?? null,
      configured: status.lastSyncTime !== null,
    };
  }

  /** GET /api/atrad/holdings — Latest synced holdings from ATrad. */
  @Get('holdings')
  async getHoldings() {
    return await this.atradSyncService.getHoldings();
  }

  /** POST /api/atrad/test — Test ATrad login (validates credentials). */
  @Post('test')
  async testConnection() {
    return this.atradSyncService.testConnection();
  }

  // ── Order endpoints ──────────────────────────────────────────────────────────

  /**
   * GET /api/atrad/orders — List all orders.
   * Query: ?status=PENDING|APPROVED|EXECUTED|FAILED|CANCELLED (optional filter)
   */
  @Get('orders')
  async listOrders(@Query('status') status?: string) {
    return this.orderService.getOrderHistory(status);
  }

  /** GET /api/atrad/orders/active — Active orders only (PENDING + APPROVED + EXECUTING). */
  @Get('orders/active')
  async getActiveOrders() {
    return this.orderService.getActiveOrders();
  }

  /** GET /api/atrad/orders/:id — Get a single order by ID. */
  @Get('orders/:id')
  async getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.getOrderById(id);
  }

  /**
   * POST /api/atrad/orders — Create a new pending order.
   * Body: { symbol, order_type, action, quantity, trigger_price, limit_price?, reason? }
   */
  @Post('orders')
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.orderService.createPendingOrder(dto);
  }

  /**
   * POST /api/atrad/orders/:id/approve — Approve a pending order.
   * User explicitly confirms they want to execute this order.
   */
  @Post('orders/:id/approve')
  async approveOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.approveOrder(id);
  }

  /**
   * POST /api/atrad/orders/:id/execute — Execute an approved order via Playwright.
   * REQUIRES status = 'APPROVED'. Will fail-safe if selectors are not configured.
   */
  @Post('orders/:id/execute')
  async executeOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.executeOrder(id);
  }

  /**
   * POST /api/atrad/orders/:id/cancel — Cancel a pending or approved order.
   * Does NOT affect already-executed orders.
   */
  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.cancelOrder(id);
  }
}
