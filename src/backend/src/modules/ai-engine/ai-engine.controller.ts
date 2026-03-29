import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AiEngineService,
  StockAnalysis,
  DailyBrief,
  ChatMessage,
  TradingSignal,
} from './ai-engine.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Controller('ai')
export class AiEngineController {
  constructor(private readonly aiEngineService: AiEngineService) {}

  @Get('status')
  getStatus(): { mode: 'live' | 'mock'; model: string | null } {
    return this.aiEngineService.getStatus();
  }

  @Get('usage')
  async getTokenUsage() {
    return this.aiEngineService.getTokenUsage();
  }

  @Get('daily-brief')
  async getDailyBrief(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<DailyBrief> {
    return this.aiEngineService.getDailyBrief(forceRefresh === 'true');
  }

  @Get('analyze/:symbol')
  async analyzeStock(
    @Param('symbol') symbol: string,
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<StockAnalysis> {
    return this.aiEngineService.analyzeStock(symbol, forceRefresh === 'true');
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 chat messages/min — each is billable
  @Post('chat')
  async chat(
    @Body() body: { message: string; history?: ChatMessage[] },
  ): Promise<{ role: 'assistant'; content: string; timestamp: Date }> {
    return this.aiEngineService.chat(body.message, body.history ?? []);
  }

  @Get('signals')
  async getSignals(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<TradingSignal[]> {
    return this.aiEngineService.getSignals(forceRefresh === 'true');
  }

  // Called by cron at 14:35 SLT weekdays (end of market day)
  @UseGuards(ApiKeyGuard)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Post('signals/generate-eod')
  async generateEodSignals(): Promise<{ message: string; count: number }> {
    const signals = await this.aiEngineService.getSignals(true);
    return {
      message: 'EOD signals generated and cached for 20 hours',
      count: signals.length,
    };
  }
}
