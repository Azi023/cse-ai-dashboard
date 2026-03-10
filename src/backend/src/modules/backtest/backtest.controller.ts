import { Controller, Get, Query } from '@nestjs/common';
import { BacktestService, BacktestResult } from './backtest.service';

@Controller('backtest')
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Get('run')
  async runBacktest(
    @Query('strategy') strategy: string,
    @Query('symbol') symbol: string,
    @Query('days') days?: string,
    @Query('capital') capital?: string,
  ): Promise<BacktestResult> {
    return this.backtestService.runBacktest({
      strategy,
      symbol,
      days: days ? parseInt(days, 10) : 365,
      initialCapital: capital ? parseInt(capital, 10) : 10000,
    });
  }

  @Get('strategies')
  getStrategies(): Array<{ id: string; name: string; description: string }> {
    return [
      {
        id: 'RSI_OVERSOLD',
        name: 'RSI Oversold Bounce',
        description:
          'Buy when RSI(14) drops below 30 (oversold), sell when RSI exceeds 70 (overbought) or stop-loss at -8%.',
      },
      {
        id: 'SMA_CROSSOVER',
        name: 'SMA Golden/Death Cross',
        description:
          'Buy on golden cross (SMA20 crosses above SMA50), sell on death cross or stop-loss at -10%.',
      },
      {
        id: 'VALUE_SCREEN',
        name: 'Value Discount',
        description:
          'Buy when price is 10% below 50-day SMA, sell at +5% profit target or -8% stop-loss.',
      },
    ];
  }

  @Get('symbols')
  async getAvailableSymbols(): Promise<string[]> {
    return this.backtestService.getAvailableSymbols();
  }
}
