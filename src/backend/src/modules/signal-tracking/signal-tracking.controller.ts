import { Controller, Get, Post, Body, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { SignalTrackingService } from './signal-tracking.service';

@Controller('signal-tracking')
export class SignalTrackingController {
  constructor(private readonly signalTrackingService: SignalTrackingService) {}

  /** GET /api/signal-tracking/performance — Overall performance stats. */
  @Get('performance')
  async getPerformanceStats() {
    return this.signalTrackingService.getPerformanceStats();
  }

  /** GET /api/signal-tracking/signals — All signal records. */
  @Get('signals')
  async getAllSignals(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.signalTrackingService.getAllSignals(limit);
  }

  /** POST /api/signal-tracking/record — Record a new signal. */
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

  /** POST /api/signal-tracking/check-outcomes — Manually check outcomes. */
  @Post('check-outcomes')
  async checkOutcomes() {
    await this.signalTrackingService.checkOutcomes();
    return { message: 'Outcome check completed' };
  }
}
