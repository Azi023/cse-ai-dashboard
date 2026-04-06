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
import { Public } from '../auth/public.decorator';

/**
 * AI Engine controller.
 * GET endpoints marked @Public() temporarily while login flow is validated.
 * POST endpoints require JWT auth — each call is billable via Claude API.
 */
@Controller('ai')
export class AiEngineController {
  constructor(private readonly aiEngineService: AiEngineService) {}

  @Public()
  @Get('status')
  getStatus(): { mode: 'live' | 'mock'; model: string | null } {
    return this.aiEngineService.getStatus();
  }

  @Public()
  @Get('usage')
  async getTokenUsage() {
    return this.aiEngineService.getTokenUsage();
  }

  @Public()
  @Get('daily-brief')
  async getDailyBrief(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<DailyBrief> {
    return this.aiEngineService.getDailyBrief(forceRefresh === 'true');
  }

  @Public()
  @Get('analyze/:symbol')
  async analyzeStock(
    @Param('symbol') symbol: string,
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<StockAnalysis> {
    return this.aiEngineService.analyzeStock(symbol, forceRefresh === 'true');
  }

  /**
   * POST /api/ai/chat — Each call is billable via Claude API.
   * Protected: JWT required.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('chat')
  async chat(
    @Body() body: { message: string; history?: ChatMessage[] },
  ): Promise<{ role: 'assistant'; content: string; timestamp: Date }> {
    return this.aiEngineService.chat(body.message, body.history ?? []);
  }

  @Public()
  @Get('signals')
  async getSignals(
    @Query('forceRefresh') forceRefresh?: string,
  ): Promise<TradingSignal[]> {
    return this.aiEngineService.getSignals(forceRefresh === 'true');
  }

  /**
   * POST /api/ai/signals/generate-eod — Cron-triggered EOD signal generation.
   * Protected: JWT + API key. Triggers billable Claude API call.
   */
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
