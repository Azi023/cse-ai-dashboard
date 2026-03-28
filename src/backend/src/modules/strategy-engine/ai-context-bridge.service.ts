import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketRegimeService } from './market-regime.service';
import { SignalGeneratorService } from './signal-generator.service';
import { StrategySelectorService } from './strategy-selector.service';
import { STRATEGY_REGISTRY } from './strategy-registry';
import { StrategyBacktestResult } from '../../entities/strategy-backtest-result.entity';
import type { StrategySignal } from '../../entities/strategy-signal.entity';

// ---------------------------------------------------------------------------
// AiContextBridgeService
//
// Translates strategy engine outputs into a structured text block injected
// into Claude prompts. Claude explains the signals — it does NOT decide them.
// ---------------------------------------------------------------------------

@Injectable()
export class AiContextBridgeService {
  private readonly logger = new Logger(AiContextBridgeService.name);

  constructor(
    private readonly regimeService: MarketRegimeService,
    private readonly signalGenerator: SignalGeneratorService,
    private readonly selectorService: StrategySelectorService,
    @InjectRepository(StrategyBacktestResult)
    private readonly backtestResultRepo: Repository<StrategyBacktestResult>,
  ) {}

  /**
   * Builds the strategy context block to inject into the signal generation prompt.
   * Returns an empty string if no data is available (graceful degradation).
   */
  async buildStrategyContext(): Promise<string> {
    try {
      const [regimeResult, signals] = await Promise.all([
        this.regimeService.getCurrentRegime(),
        this.signalGenerator.getTodaySignals(),
      ]);

      if (!regimeResult) return '';

      const lines: string[] = [];

      // -----------------------------------------------------------------------
      // 1. Market regime
      // -----------------------------------------------------------------------
      lines.push(
        `\n\nSTRATEGY ENGINE CONTEXT (use this to calibrate your signal selection):`,
      );
      lines.push(
        `MARKET REGIME: ${regimeResult.regime} (confidence: ${regimeResult.confidence}%)`,
      );
      lines.push(`Regime reasoning: ${regimeResult.reasoning}`);

      const ind = regimeResult.indicators;
      if (ind.aspi_current) {
        const indParts: string[] = [];
        if (ind.aspi_current)
          indParts.push(`ASPI ${ind.aspi_current.toFixed(0)}`);
        if (ind.sma_20) indParts.push(`SMA20 ${ind.sma_20.toFixed(0)}`);
        if (ind.sma_50) indParts.push(`SMA50 ${ind.sma_50.toFixed(0)}`);
        if (ind.breadth_advancing_pct)
          indParts.push(
            `breadth ${ind.breadth_advancing_pct.toFixed(0)}% advancing`,
          );
        if (indParts.length > 0)
          lines.push(`Indicators: ${indParts.join(', ')}`);
      }

      // -----------------------------------------------------------------------
      // 2. Active and inactive strategies for this regime
      // -----------------------------------------------------------------------
      const activeStrategies = this.selectorService.selectStrategies({
        regime: regimeResult.regime,
        tier: 'BEGINNER',
        availableDataDays: 250,
      });
      const inactiveStrategies = this.selectorService.getInactiveStrategies({
        regime: regimeResult.regime,
        tier: 'BEGINNER',
        availableDataDays: 250,
      });

      if (activeStrategies.length > 0) {
        lines.push(
          `\nACTIVE STRATEGIES: ${activeStrategies.map((s) => s.name).join(', ')}`,
        );
      }
      if (inactiveStrategies.length > 0) {
        const inactiveDesc = inactiveStrategies
          .map((s) => `${s.name} (${s.reason})`)
          .join('; ');
        lines.push(`Inactive: ${inactiveDesc}`);
      }

      // -----------------------------------------------------------------------
      // 3. Today's deterministic signals (if any)
      // -----------------------------------------------------------------------
      if (signals.length === 0) {
        lines.push(
          `\nSTRATEGY SIGNALS: No strategy engine signals triggered today — current market conditions don't meet entry criteria for active strategies.`,
        );
      } else {
        const topSignals = signals.slice(0, 5); // show top 5 by score
        lines.push(`\nSTRATEGY SIGNALS (today, sorted by score):`);

        topSignals.forEach((sig, i) => {
          lines.push(this.formatSignalLine(i + 1, sig));
        });

        if (signals.length > 5) {
          lines.push(`...and ${signals.length - 5} more signals`);
        }
      }

      // -----------------------------------------------------------------------
      // 4. Backtest validation results (cite real win rates)
      // -----------------------------------------------------------------------
      try {
        const backtestRows = await this.backtestResultRepo.find({
          order: { run_date: 'DESC' },
        });
        // Deduplicate: one per strategy
        const seen = new Set<string>();
        const latestResults = backtestRows.filter((r) => {
          if (seen.has(r.strategy_id)) return false;
          seen.add(r.strategy_id);
          return true;
        });

        if (latestResults.length > 0) {
          lines.push(
            `\nSTRATEGY BACKTEST VALIDATION (real historical win rates):`,
          );
          for (const r of latestResults) {
            const status = r.is_active ? '✓ ACTIVE' : '✗ INACTIVE';
            lines.push(
              `  ${r.strategy_name}: ${Number(r.win_rate).toFixed(1)}% win rate, ` +
                `${r.total_trades} trades, avg ${Number(r.avg_return_pct).toFixed(1)}% return ` +
                `[${status}]`,
            );
          }
        }
      } catch {
        // Non-fatal: backtest data may not exist yet
      }

      // -----------------------------------------------------------------------
      // 5. Instruction to Claude
      // -----------------------------------------------------------------------
      lines.push(`
YOUR ROLE with this context:
- If strategy engine signals exist, REFERENCE them by strategy name in your output (e.g., "Mean Reversion strategy triggered for TJL.N0000")
- Explain WHY the specific rules triggered and what they mean for an investor
- Use the entry/stop/target levels from the strategy engine as anchor points
- Do NOT override or contradict the direction/confidence from strategy engine signals
- When citing strategy performance, use the BACKTEST VALIDATION numbers above (real win rates)
- For stocks not covered by strategy signals, use your own analysis as before
- Always prioritize strategy engine signals over your own opinion when both exist`);

      return lines.join('\n');
    } catch (err) {
      this.logger.warn(
        `Strategy context build failed (non-fatal): ${String(err)}`,
      );
      return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Format one signal for the AI prompt
  // ---------------------------------------------------------------------------

  private formatSignalLine(index: number, sig: StrategySignal): string {
    const parts: string[] = [];

    parts.push(
      `${index}. ${sig.strategy_name} → ${sig.symbol} ${sig.direction} (${sig.confidence} confidence, score ${sig.score})`,
    );

    if (sig.rules_triggered && sig.rules_triggered.length > 0) {
      const rulesStr = sig.rules_triggered
        .map((r) => {
          const actualStr =
            typeof r.actual === 'number'
              ? (r.actual as number).toFixed(2)
              : String(r.actual);
          return `${r.rule}=${actualStr}`;
        })
        .join(', ');
      parts.push(`   Rules: ${rulesStr}`);
    }

    const priceParts: string[] = [];
    priceParts.push(`Entry: ${sig.entry_price.toFixed(2)}`);
    if (sig.stop_loss) priceParts.push(`Stop: ${sig.stop_loss.toFixed(2)}`);
    if (sig.take_profit)
      priceParts.push(`Target: ${sig.take_profit.toFixed(2)}`);
    if (sig.risk_reward_ratio)
      priceParts.push(`R:R 1:${sig.risk_reward_ratio.toFixed(1)}`);
    parts.push(`   Levels: ${priceParts.join(', ')}`);

    if (sig.position_size_shares && sig.position_size_lkr) {
      parts.push(
        `   Position: ${sig.position_size_shares} shares (LKR ${sig.position_size_lkr.toLocaleString()})`,
      );
    }

    return parts.join('\n');
  }

  /**
   * Quick summary for status endpoint
   */
  async getEngineSummary(): Promise<{
    regime: string | null;
    regimeConfidence: number | null;
    activeStrategyCount: number;
    todaySignalCount: number;
    lastRun: Date | null;
  }> {
    try {
      const [regimeResult, signals] = await Promise.all([
        this.regimeService.getCurrentRegime(),
        this.signalGenerator.getTodaySignals(),
      ]);

      if (!regimeResult) {
        return {
          regime: null,
          regimeConfidence: null,
          activeStrategyCount: 0,
          todaySignalCount: 0,
          lastRun: null,
        };
      }

      const activeStrategies = this.selectorService.selectStrategies({
        regime: regimeResult.regime,
        tier: 'BEGINNER',
        availableDataDays: 250,
      });

      return {
        regime: regimeResult.regime,
        regimeConfidence: regimeResult.confidence,
        activeStrategyCount: activeStrategies.length,
        todaySignalCount: signals.length,
        lastRun: regimeResult.detectedAt,
      };
    } catch {
      return {
        regime: null,
        regimeConfidence: null,
        activeStrategyCount: 0,
        todaySignalCount: 0,
        lastRun: null,
      };
    }
  }
}
