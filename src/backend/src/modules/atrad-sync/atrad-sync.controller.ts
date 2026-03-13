import { Controller, Get, Post } from '@nestjs/common';
import { ATradSyncService } from './atrad-sync.service';

@Controller('atrad')
export class ATradSyncController {
  constructor(private readonly atradSyncService: ATradSyncService) {}

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
      // Aliases for frontend compatibility
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
}
