import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { GlobalDataService } from './global-data.service';

@Controller('global')
export class GlobalDataController {
  constructor(private readonly globalDataService: GlobalDataService) {}

  /**
   * GET /api/global/indicators — All global market indicators with change data.
   */
  @Get('indicators')
  async getGlobalIndicators() {
    return this.globalDataService.getGlobalIndicators();
  }

  /**
   * POST /api/global/refresh — Manually trigger a fetch of all global data.
   */
  @Post('refresh')
  async refreshData() {
    return this.globalDataService.fetchAllGlobalData();
  }

  /**
   * POST /api/global/manual — Manually set a value (e.g., tea price, rubber price).
   * Body: { indicator: string, value: number, date?: string }
   */
  @Post('manual')
  async setManual(
    @Body() body: { indicator: string; value: number; date?: string },
  ) {
    await this.globalDataService.setManualIndicator(
      body.indicator,
      body.value,
      body.date,
    );
    return { message: `Set ${body.indicator} = ${body.value}` };
  }
}
