import { Controller, Get, Param, Query, Res, Header } from '@nestjs/common';
import { ExportService } from './export.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('portfolio')
  async exportPortfolio(
    @Query('format') format: string = 'json',
  ): Promise<unknown> {
    const data = await this.exportService.getPortfolioExport();
    // Always return JSON — frontend handles CSV download
    return data;
  }

  @Get('shariah')
  async exportShariah(
    @Query('format') format: string = 'json',
  ): Promise<unknown> {
    const data = await this.exportService.getShariahReport();
    return data;
  }

  @Get('prices/:symbol')
  async exportPrices(
    @Param('symbol') symbol: string,
    @Query('days') days: string = '365',
  ): Promise<unknown> {
    const data = await this.exportService.getPriceHistoryExport(
      symbol,
      parseInt(days, 10),
    );
    return data;
  }
}
