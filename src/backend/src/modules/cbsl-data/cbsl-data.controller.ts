import { Controller, Get, Post, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { CbslDataService } from './cbsl-data.service';

@Controller('macro')
export class CbslDataController {
  constructor(private readonly cbslDataService: CbslDataService) {}

  /**
   * GET /api/macro/indicators — Latest values for all macro indicators.
   */
  @Get('indicators')
  async getLatestIndicators() {
    return this.cbslDataService.getLatestIndicators();
  }

  /**
   * POST /api/macro/refresh — Manually trigger data refresh from CBSL + exchange rate API.
   */
  @Post('refresh')
  async refreshData() {
    return this.cbslDataService.refreshAll();
  }

  /**
   * GET /api/macro/history/:indicator — Time series for a specific indicator.
   */
  @Get('history/:indicator')
  async getIndicatorHistory(
    @Param('indicator') indicator: string,
    @Query('limit', new DefaultValuePipe(365), ParseIntPipe) limit: number,
  ) {
    return this.cbslDataService.getIndicatorHistory(indicator, limit);
  }
}
