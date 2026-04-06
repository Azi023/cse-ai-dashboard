import { Controller, Post, Body, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DataService, BackfillOptions, BackfillResult } from './data.service';
import { Public } from '../auth/public.decorator';

interface BackfillRequestBody {
  symbols?: string[];
  days?: number;
}

@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  /** POST /api/data/backfill-history — Requires JWT. */
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
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

  /** GET /api/data/status */
  @Public()
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
