import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { GlobalDataService } from './global-data.service';
import { Public } from '../auth/public.decorator';

@Controller('global')
export class GlobalDataController {
  constructor(private readonly globalDataService: GlobalDataService) {}

  /**
   * GET /api/global/indicators — All global market indicators with change data.
   */
  @Public()
  @Get('indicators')
  async getGlobalIndicators() {
    return this.globalDataService.getGlobalIndicators();
  }

  /** POST /api/global/refresh — Requires JWT. */
  @Post('refresh')
  async refreshData() {
    return this.globalDataService.fetchAllGlobalData();
  }

  /**
   * GET /api/global/economic-calendar — High-impact economic events for the week.
   */
  @Public()
  @Get('economic-calendar')
  async getEconomicCalendar() {
    return this.globalDataService.getEconomicCalendar();
  }

  /** POST /api/global/manual — Requires JWT. */
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
