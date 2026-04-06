import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CbslDataService } from './cbsl-data.service';
import { Public } from '../auth/public.decorator';

@Controller('macro')
export class CbslDataController {
  constructor(private readonly cbslDataService: CbslDataService) {}

  /**
   * GET /api/macro/indicators — Latest values for all tracked CBSL indicators.
   */
  @Public()
  @Get('indicators')
  async getLatestIndicators() {
    return this.cbslDataService.getLatestIndicators();
  }

  /** POST /api/macro/refresh — Requires JWT. */
  @Post('refresh')
  async refreshData() {
    return this.cbslDataService.refreshAll();
  }

  /**
   * GET /api/macro/history/:indicator — Historical values for one indicator.
   */
  @Public()
  @Get('history/:indicator')
  async getIndicatorHistory(
    @Param('indicator') indicator: string,
    @Query('limit', new DefaultValuePipe(60), ParseIntPipe) limit?: number,
  ) {
    return this.cbslDataService.getIndicatorHistory(indicator, limit);
  }
}
