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
        name: 'Buy Below Fair Value',
        description:
          'Buys when a stock trades 10% below its 50-day average price. Takes a quick 5% profit or cuts loss at 8%. Conservative, mean-reversion approach.',
      },
    ];
  }

  @Get('symbols')
  async getAvailableSymbols(): Promise<string[]> {
    return this.backtestService.getAvailableSymbols();
  }
}
