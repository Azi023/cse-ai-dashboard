import { Controller, Post, Body, Get } from '@nestjs/common';
import { DataService, BackfillOptions, BackfillResult } from './data.service';
import { Public } from '../auth/public.decorator';

interface BackfillRequestBody {
  symbols?: string[];
  days?: number;
}

@Public()
@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  /**
   * POST /api/data/backfill-history
   *
   * Triggers historical price backfill for all (or specified) stocks.
   * Uses Playwright to probe the CSE website for a historical data API;
   * falls back to HTML table scraping per stock if no API is found.
   *
   * Body (optional JSON):
   *   { symbols: ["AEL.N0000", "JKH.N0000"], days: 30 }
   *
   * Returns a BackfillResult summary when complete (may take several minutes).
   */
  @Post('backfill-history')
  async backfillHistory(
    @Body() body: BackfillRequestBody = {},
  ): Promise<BackfillResult> {
    const options: BackfillOptions = {
      symbols: body.symbols,
      days: body.days ?? 30,
    };
    return this.dataService.backfillHistory(options);
  }

  /**
   * GET /api/data/status
   *
   * Returns quick stats on how many daily_prices records exist.
   */
  @Get('status')
  async getStatus(): Promise<{
    message: string;
    endpoint: string;
  }> {
    return {
      message:
        'Data module active. Use POST /api/data/backfill-history to trigger backfill.',
      endpoint: 'POST /api/data/backfill-history',
    };
  }
}
