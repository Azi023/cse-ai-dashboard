import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { SignalTrackingService } from './signal-tracking.service';
import { Public } from '../auth/public.decorator';

@Controller('signal-tracking')
export class SignalTrackingController {
  constructor(private readonly signalTrackingService: SignalTrackingService) {}

  /** GET /api/signal-tracking/performance — Overall performance stats. */
  @Public()
  @Get('performance')
  async getPerformanceStats() {
    return this.signalTrackingService.getPerformanceStats();
  }

  /** GET /api/signal-tracking/signals — All tracked signals. */
  @Public()
  @Get('signals')
  async getAllSignals(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.signalTrackingService.getAllSignals(limit);
  }

  /** POST /api/signal-tracking/record — Requires JWT. */
  @Post('record')
  async recordSignal(
    @Body()
    body: {
      symbol: string;
      direction: string;
      confidence: string;
      price_at_signal: number;
      reasoning?: string;
    },
  ) {
    return this.signalTrackingService.recordSignal(body);
  }

  /** POST /api/signal-tracking/check-outcomes — Requires JWT. */
  @Post('check-outcomes')
  async checkOutcomes() {
    return this.signalTrackingService.checkOutcomes();
  }
}
