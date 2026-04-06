import { Controller, Get, Post, Param } from '@nestjs/common';
import { ShariahScreeningService } from './shariah-screening.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('shariah')
export class ShariahScreeningController {
  constructor(
    private readonly shariahScreeningService: ShariahScreeningService,
  ) {}

  /** GET /api/shariah/stats — Summary counts. */
  @Get('stats')
  async getStats() {
    return this.shariahScreeningService.getStats();
  }

  /** GET /api/shariah/compliant — List all compliant stocks. */
  @Get('compliant')
  async getCompliantStocks() {
    return this.shariahScreeningService.getCompliantStocks();
  }

  /** GET /api/shariah/non-compliant — List all non-compliant with reasons. */
  @Get('non-compliant')
  async getNonCompliantStocks() {
    return this.shariahScreeningService.getNonCompliantStocks();
  }

  /** GET /api/shariah/pending — List stocks pending review. */
  @Get('pending')
  async getPendingStocks() {
    return this.shariahScreeningService.getPendingStocks();
  }

  /** GET /api/shariah/status/:symbol — Shariah status for a specific stock. */
  @Get('status/:symbol')
  async getStockStatus(@Param('symbol') symbol: string) {
    return this.shariahScreeningService.getStockShariahStatus(symbol);
  }

  /** GET /api/shariah/overview — Overall screening status for stocks page header. */
  @Get('overview')
  async getOverview() {
    return this.shariahScreeningService.getOverviewStatus();
  }

  /** POST /api/shariah/refresh-whitelist — Manually trigger re-screening of all stocks. */
  @Post('refresh-whitelist')
  async refreshWhitelist() {
    await this.shariahScreeningService.runScreening();
    return this.shariahScreeningService.getOverviewStatus();
  }

  /** POST /api/shariah/run-tier2-screening — Run Tier 2 ratio screening on pending_review stocks. */
  @Post('run-tier2-screening')
  async runTier2Screening() {
    return this.shariahScreeningService.runTier2Screening();
  }
}
