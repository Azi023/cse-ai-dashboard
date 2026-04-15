import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategySignal } from '../../entities/strategy-signal.entity';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { TradingCalendarService } from '../cse-data/trading-calendar.service';

/**
 * AI paper-trading cron.
 *
 * Reads today's strategy signals and executes corresponding BUY/SELL
 * trades against the `ai_demo` paper portfolio. No real money, no
 * ATrad orders — this is the transparent feedback loop that lets the
 * user compare AI performance vs manual paper trading.
 *
 * Runs at 2:49 PM SLT (after signals generated 2:43, risk run 2:44,
 * exit signals checked 2:46, TP/SL suggested 2:47, buy queue 2:48).
 * Skipped on non-trading days via TradingCalendarService.
 *
 * Sizing rules (conservative, hardcoded for now — move to config later):
 *   - Per BUY signal: 5% of current cash
 *   - Hard cap: no single symbol > 15% of total portfolio value
 *   - Min order: LKR 1,000 (below that, skip — too small to matter)
 *   - SELL on exit signal: close entire position
 */
const PER_SIGNAL_CASH_PCT = 0.05;
const MAX_SYMBOL_PCT = 0.15;
const MIN_ORDER_LKR = 1000;

@Injectable()
export class AiDemoTradingService {
  private readonly logger = new Logger(AiDemoTradingService.name);

  constructor(
    @InjectRepository(StrategySignal)
    private readonly signalRepo: Repository<StrategySignal>,
    private readonly paperTrading: PaperTradingService,
    private readonly calendar: TradingCalendarService,
  ) {}

  @Cron('49 14 * * 1-5', { name: 'ai-demo-trading' })
  async runAiDemoTrades(): Promise<void> {
    if (this.calendar.skipIfNonTrading(this.logger, 'aiDemoTrading')) return;

    const today = new Date().toISOString().slice(0, 10);
    this.logger.log(`Running AI demo trades for ${today}`);

    const signals = await this.signalRepo.find({
      where: { signal_date: today },
      order: { score: 'DESC' },
    });

    if (signals.length === 0) {
      this.logger.log('No strategy signals for today — nothing to trade');
      return;
    }

    const portfolio = await this.paperTrading.getOrCreatePortfolio(
      'ai_demo',
      'stock',
    );
    let executed = 0;
    let skipped = 0;

    const buySignals = signals.filter((s) => s.direction === 'BUY');
    const sellSignals = signals.filter((s) => s.direction === 'SELL');

    // SELLs first — free up cash before buying
    for (const sig of sellSignals) {
      try {
        const held = await this.paperTrading.getHeldQuantity(
          sig.symbol,
          'ai_demo',
          'stock',
        );
        if (held <= 0) {
          skipped++;
          continue;
        }
        await this.paperTrading.executeTrade({
          portfolio_type: 'ai_demo',
          asset_type: 'stock',
          symbol: sig.symbol,
          direction: 'SELL',
          quantity: held,
          notes: `AI demo SELL from strategy=${sig.strategy_id} score=${sig.score}`,
        });
        executed++;
      } catch (err) {
        this.logger.warn(
          `AI SELL ${sig.symbol} failed: ${err instanceof Error ? err.message : err}`,
        );
        skipped++;
      }
    }

    // Refresh cash after sells
    const refreshed = await this.paperTrading.getOrCreatePortfolio(
      'ai_demo',
      'stock',
    );
    let availableCash = Number(refreshed.current_cash);

    for (const sig of buySignals) {
      try {
        const price = Number(sig.entry_price ?? 0);
        if (!price || price <= 0) {
          skipped++;
          continue;
        }

        const budget = availableCash * PER_SIGNAL_CASH_PCT;
        if (budget < MIN_ORDER_LKR) {
          this.logger.log(
            `Skipping BUY ${sig.symbol} — budget ${budget.toFixed(2)} below min ${MIN_ORDER_LKR}`,
          );
          skipped++;
          continue;
        }

        // Enforce per-symbol concentration cap.
        const summary = await this.paperTrading.getPortfolio(
          'ai_demo',
          'stock',
        );
        const held = summary.holdings.find((h) => h.symbol === sig.symbol);
        const heldValue = held?.market_value ?? 0;
        const totalValue = summary.total_value;
        const capValue = totalValue * MAX_SYMBOL_PCT;
        const headroom = Math.max(0, capValue - heldValue);
        const effectiveBudget = Math.min(budget, headroom);
        if (effectiveBudget < MIN_ORDER_LKR) {
          this.logger.log(
            `Skipping BUY ${sig.symbol} — concentration cap hit (held ${heldValue.toFixed(0)} / cap ${capValue.toFixed(0)})`,
          );
          skipped++;
          continue;
        }

        const quantity = Math.floor(effectiveBudget / price);
        if (quantity < 1) {
          skipped++;
          continue;
        }

        await this.paperTrading.executeTrade({
          portfolio_type: 'ai_demo',
          asset_type: 'stock',
          symbol: sig.symbol,
          direction: 'BUY',
          quantity,
          price,
          notes: `AI demo BUY from strategy=${sig.strategy_id} score=${sig.score}`,
        });
        availableCash -= quantity * price;
        executed++;
      } catch (err) {
        this.logger.warn(
          `AI BUY ${sig.symbol} failed: ${err instanceof Error ? err.message : err}`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `AI demo trading complete: ${executed} executed, ${skipped} skipped (${buySignals.length} BUY + ${sellSignals.length} SELL signals)`,
    );
  }
}
