import { Controller, Get, Param, Post, Logger, Query } from '@nestjs/common';
import { AiContextBridgeService } from './ai-context-bridge.service';
import { MarketRegimeService } from './market-regime.service';
import { SignalGeneratorService } from './signal-generator.service';
import { StrategySelectorService } from './strategy-selector.service';
import { StrategyBacktesterService } from './strategy-backtester.service';
import { STRATEGY_REGISTRY } from './strategy-registry';
import { Public } from '../auth/public.decorator';

// ---------------------------------------------------------------------------

@Controller('strategy-engine')
export class StrategyEngineController {
  private readonly logger = new Logger(StrategyEngineController.name);

  constructor(
    private readonly bridge: AiContextBridgeService,
    private readonly regimeService: MarketRegimeService,
    private readonly signalGenerator: SignalGeneratorService,
    private readonly selectorService: StrategySelectorService,
    private readonly backtester: StrategyBacktesterService,
  ) {}

  /**
   * GET /api/strategy-engine/status
   */
  @Public()
  @Get('status')
  async getStatus() {
    const [summary, regimeResult] = await Promise.all([
      this.bridge.getEngineSummary(),
      this.regimeService.getCurrentRegime(),
    ]);

    const activeStrategies = regimeResult
      ? this.selectorService.selectStrategies({
          regime: regimeResult.regime,
          tier: 'BEGINNER',
          availableDataDays: 250,
        })
      : [];

    const inactiveStrategies = regimeResult
      ? this.selectorService.getInactiveStrategies({
          regime: regimeResult.regime,
          tier: 'BEGINNER',
          availableDataDays: 250,
        })
      : [];

    return {
      success: true,
      data: {
        regime: summary.regime,
        regimeConfidence: summary.regimeConfidence,
        regimeReasoning: regimeResult?.reasoning ?? null,
        regimeIndicators: regimeResult?.indicators ?? null,
        activeStrategies: activeStrategies.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
        inactiveStrategies,
        todaySignalCount: summary.todaySignalCount,
        lastRun: summary.lastRun,
        totalStrategiesInRegistry: STRATEGY_REGISTRY.length,
      },
    };
  }

  /**
   * GET /api/strategy-engine/signals
   */
  @Public()
  @Get('signals')
  async getSignals() {
    const signals = await this.signalGenerator.getTodaySignals();
    return {
      success: true,
      data: signals,
      meta: {
        total: signals.length,
        date: new Date().toISOString().split('T')[0],
      },
    };
  }

  /** POST /api/strategy-engine/run — Requires JWT. */
  @Post('run')
  async runManually() {
    this.logger.log('Manual strategy engine run triggered');
    const regime = await this.regimeService.detectMarketRegime();
    const signals = await this.signalGenerator.generateSignals('BEGINNER');
    return {
      success: true,
      data: {
        regime: regime.regime,
        regimeConfidence: regime.confidence,
        signalsGenerated: signals.length,
      },
    };
  }

  /** POST /api/strategy-engine/run-backtests — Requires JWT. */
  @Post('run-backtests')
  async runBacktests(@Query('strategy') strategyId?: string) {
    this.logger.log(
      strategyId
        ? `Strategy backtest triggered for: ${strategyId}`
        : 'Strategy backtest triggered for all strategies',
    );
    const results = strategyId
      ? [await this.backtester.runSingleBacktest(strategyId)]
      : await this.backtester.runAllBacktests();
    return {
      success: true,
      data: results.map((r) => ({
        strategyId: r.strategy_id,
        strategyName: r.strategy_name,
        totalTrades: r.total_trades,
        winRate: Number(r.win_rate),
        avgReturnPct: Number(r.avg_return_pct),
        sharpeRatio: r.sharpe_ratio !== null ? Number(r.sharpe_ratio) : null,
        totalReturnPct: Number(r.total_return_pct),
        maxDrawdown: Number(r.max_drawdown),
        isActive: r.is_active,
        notes: r.notes,
      })),
    };
  }

  /**
   * GET /api/strategy-engine/backtest-results
   */
  @Public()
  @Get('backtest-results')
  async getBacktestResults() {
    const results = await this.backtester.getLatestResults();
    return { success: true, data: results };
  }

  /**
   * GET /api/strategy-engine/backtest-results/:strategyId
   */
  @Public()
  @Get('backtest-results/:strategyId')
  async getBacktestResultsByStrategy(@Param('strategyId') strategyId: string) {
    const results = await this.backtester.getResultsByStrategy(strategyId);
    return { success: true, data: results };
  }
}
