import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import {
  AiEngineService,
  StockAnalysis,
  DailyBrief,
  ChatMessage,
  TradingSignal,
} from './ai-engine.service';

@Controller('ai')
export class AiEngineController {
  constructor(private readonly aiEngineService: AiEngineService) {}

  @Get('status')
  getStatus(): { mode: 'live' | 'mock'; model: string | null } {
    return this.aiEngineService.getStatus();
  }

  @Get('daily-brief')
  async getDailyBrief(): Promise<DailyBrief> {
    return this.aiEngineService.getDailyBrief();
  }

  @Get('analyze/:symbol')
  async analyzeStock(@Param('symbol') symbol: string): Promise<StockAnalysis> {
    return this.aiEngineService.analyzeStock(symbol);
  }

  @Post('chat')
  async chat(
    @Body() body: { message: string; history?: ChatMessage[] },
  ): Promise<{ role: 'assistant'; content: string; timestamp: Date }> {
    return this.aiEngineService.chat(body.message, body.history ?? []);
  }

  @Get('signals')
  async getSignals(): Promise<TradingSignal[]> {
    return this.aiEngineService.getSignals();
  }
}
