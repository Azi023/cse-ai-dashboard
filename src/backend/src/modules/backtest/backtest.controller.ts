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
        name: 'Buy the Dip (RSI)',
        description:
          'Buys when a stock has fallen sharply and looks oversold. Sells when it recovers or rises too fast. Good for volatile, sideways markets.',
      },
      {
        id: 'SMA_CROSSOVER',
        name: 'Trend Following (MA Cross)',
        description:
          'Buys when the short-term price trend crosses above the long-term trend (momentum). Exits when trend reverses. Better in trending markets.',
      },
      {
        id: 'VALUE_SCREEN',
        name: 'Buy Below SMA50',
        description:
          'Buys when price drops 10%+ below its 50-day average (mean-reversion). Takes a 5% profit or cuts loss at 8%. Conservative approach — best for range-bound stocks.',
      },
    ];
  }

  @Get('symbols')
  async getAvailableSymbols(): Promise<string[]> {
    return this.backtestService.getAvailableSymbols();
  }

  @Get('compliant-symbols')
  async getCompliantSymbols(): Promise<string[]> {
    return this.backtestService.getCompliantSymbols();
  }
}
