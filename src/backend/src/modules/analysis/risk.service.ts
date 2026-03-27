import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { PositionRisk } from '../../entities/position-risk.entity';
import { TechnicalSignal } from '../../entities/technical-signal.entity';
import { Portfolio, Alert, Stock } from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import { PortfolioService } from '../portfolio/portfolio.service';

interface TradeItem {
  symbol?: string;
  price?: number;
}

// ---------------------------------------------------------------------------

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    @InjectRepository(PositionRisk)
    private readonly riskRepo: Repository<PositionRisk>,
    @InjectRepository(TechnicalSignal)
    private readonly techSignalRepo: Repository<TechnicalSignal>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    private readonly redisService: RedisService,
    private readonly portfolioService: PortfolioService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron — daily at 2:43 PM SLT (9:13 AM UTC)
  // ---------------------------------------------------------------------------

  @Cron('13 9 * * 1-5', { name: 'run-risk-analysis' })
  async runRiskAnalysis(): Promise<void> {
    const today = this.todayStr();
    this.logger.log(`Running risk analysis for ${today}`);

    const holdings = await this.portfolioRepo.find({
      where: { is_open: true },
    });
    if (holdings.length === 0) {
      this.logger.log('No open holdings — skipping risk analysis');
      return;
    }

    const [tradeMap, summary] = await Promise.all([
      this.buildTradeMap(),
      this.portfolioService.getSummary().catch(() => null),
    ]);

    const totalPortfolioValue = summary?.total_value ?? 0;
    const results: PositionRisk[] = [];

    for (const holding of holdings) {
      try {
        const risk = await this.computeRiskForHolding(
          holding,
          today,
          tradeMap,
          totalPortfolioValue,
        );
        if (risk) results.push(risk);
      } catch (err) {
        this.logger.warn(
          `Risk analysis failed for ${holding.symbol}: ${String(err)}`,
        );
      }
    }

    // Update portfolio_heat_pct on each row
    const totalHeat = results.reduce(
      (s, r) => s + Number(r.position_heat_pct),
      0,
    );
    for (const risk of results) {
      risk.portfolio_heat_pct = Math.round(totalHeat * 100) / 100;
      risk.risk_status =
        totalHeat < 3 ? 'SAFE' : totalHeat < 5 ? 'CAUTION' : 'DANGER';
      await this.riskRepo.save(risk);
    }

    this.logger.log(
      `Risk analysis complete: ${results.length} positions, total heat ${totalHeat.toFixed(1)}%`,
    );
  }

  // ---------------------------------------------------------------------------
  // Real-time stop monitor — every 5 min during market hours (9:30-2:25 PM SLT = 4:00-8:55 AM UTC)
  // ---------------------------------------------------------------------------

  @Cron('*/5 4-8 * * 1-5', { name: 'monitor-stops' })
  async monitorStopLosses(): Promise<void> {
    const holdings = await this.portfolioRepo.find({
      where: { is_open: true },
    });
    if (holdings.length === 0) return;

    const tradeMap = await this.buildTradeMap();
    const today = this.todayStr();

    for (const holding of holdings) {
      const trade = tradeMap.get(holding.symbol);
      if (!trade || !trade.price) continue;

      // Get latest risk record for this symbol
      const riskRows = await this.riskRepo.find({
        where: { symbol: holding.symbol },
        order: { date: 'DESC' },
        take: 1,
      });
      if (!riskRows[0]) continue;

      const risk = riskRows[0];
      const currentPrice = trade.price;
      const stop = Number(risk.recommended_stop);

      const distPct = (currentPrice - stop) / currentPrice;

      if (distPct <= 0) {
        // Hit stop-loss
        await this.createAlertIfNew(
          holding.symbol,
          today,
          'stop_hit',
          `🔴 ${holding.symbol} at LKR ${currentPrice.toFixed(2)} has hit your stop-loss at LKR ${stop.toFixed(2)}. ` +
            `Your exit plan: sell at market or set a tight limit order.`,
        );
      } else if (distPct <= 0.03) {
        // Within 3% of stop
        await this.createAlertIfNew(
          holding.symbol,
          today,
          'near_stop',
          `⚠️ ${holding.symbol} at LKR ${currentPrice.toFixed(2)} — only ${(distPct * 100).toFixed(1)}% ` +
            `above your stop-loss at LKR ${stop.toFixed(2)}. Consider reviewing your position.`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Exit signal checker — runs post-close daily at 2:44 PM SLT (9:14 AM UTC)
  // Also callable manually via analysis controller
  // ---------------------------------------------------------------------------

  @Cron('14 9 * * 1-5', { name: 'check-exit-signals' })
  async checkExitSignals(): Promise<{ alerts: number }> {
    const holdings = await this.portfolioRepo.find({
      where: { is_open: true },
    });
    if (holdings.length === 0) return { alerts: 0 };

    const [tradeMap, today] = [await this.buildTradeMap(), this.todayStr()];
    let alertCount = 0;

    for (const holding of holdings) {
      const costBasis =
        Number(holding.buy_price) +
        Number(holding.fees ?? 0) / Number(holding.quantity);
      const trade = tradeMap.get(holding.symbol);
      const currentPrice = trade?.price ?? costBasis;
      const plPct = ((currentPrice - costBasis) / costBasis) * 100;

      // 1. Stop-loss breach: price more than 8% below cost basis
      if (plPct <= -8) {
        await this.createExitAlertIfNew(
          holding.symbol,
          today,
          'exit_stoploss',
          `🔴 SELL SIGNAL — ${holding.symbol} is ${Math.abs(plPct).toFixed(1)}% below your cost basis ` +
            `(LKR ${costBasis.toFixed(2)}). Current: LKR ${currentPrice.toFixed(2)}. ` +
            `Stop-loss triggered. Consider exiting to protect capital.`,
        );
        alertCount++;
      }

      // 2. Profit target hit: +20% above cost basis
      if (plPct >= 20) {
        await this.createExitAlertIfNew(
          holding.symbol,
          today,
          'exit_target',
          `🟢 TARGET HIT — ${holding.symbol} is +${plPct.toFixed(1)}% above your cost basis ` +
            `(LKR ${costBasis.toFixed(2)}). Current: LKR ${currentPrice.toFixed(2)}. ` +
            `Consider taking partial profit (sell 50%) and trail the rest.`,
        );
        alertCount++;
      }

      // 3. RSI overbought: RSI > 70
      const techRows = await this.techSignalRepo.find({
        where: { symbol: holding.symbol },
        order: { date: 'DESC' },
        take: 1,
      });
      const tech = techRows[0] ?? null;
      if (tech?.rsi_14 != null && Number(tech.rsi_14) > 70) {
        await this.createExitAlertIfNew(
          holding.symbol,
          today,
          'exit_rsi_overbought',
          `⚠️ OVERBOUGHT — ${holding.symbol} RSI is ${Number(tech.rsi_14).toFixed(1)} (overbought above 70). ` +
            `Current: LKR ${currentPrice.toFixed(2)}. ` +
            `Consider reducing position or tightening your stop-loss.`,
        );
        alertCount++;
      }

      // 4. Shariah status change to non-compliant (mandatory exit)
      const stock = await this.stockRepo.findOne({
        where: { symbol: holding.symbol },
      });
      if (
        stock &&
        (stock.shariah_status === 'non_compliant' ||
          stock.shariah_status === 'blacklisted')
      ) {
        await this.createExitAlertIfNew(
          holding.symbol,
          today,
          'exit_mandatory_shariah',
          `🚫 MANDATORY EXIT — ${holding.symbol} is now ${stock.shariah_status.replace('_', ' ')}. ` +
            `Shariah compliance requires you to exit this position. ` +
            `Any profit from the non-compliant period must be donated (purification).`,
        );
        alertCount++;
      }
    }

    this.logger.log(
      `Exit signal check complete: ${alertCount} alerts generated`,
    );
    return { alerts: alertCount };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async runForSymbol(symbol: string): Promise<PositionRisk | null> {
    const holding = await this.portfolioRepo.findOne({
      where: { symbol, is_open: true },
    });
    if (!holding) return null;

    const [tradeMap, summary] = await Promise.all([
      this.buildTradeMap(),
      this.portfolioService.getSummary().catch(() => null),
    ]);
    const totalPortfolioValue = summary?.total_value ?? 0;
    return this.computeRiskForHolding(
      holding,
      this.todayStr(),
      tradeMap,
      totalPortfolioValue,
    );
  }

  async getPositionRisks(): Promise<PositionRisk[]> {
    const today = this.todayStr();
    const rows = await this.riskRepo.find({
      where: { date: today },
      order: { symbol: 'ASC' },
    });
    if (rows.length > 0) return rows;
    // Fall back to most recent
    return this.riskRepo.find({
      order: { date: 'DESC', symbol: 'ASC' },
      take: 20,
    });
  }

  async getPositionRiskForSymbol(symbol: string): Promise<PositionRisk | null> {
    const rows = await this.riskRepo.find({
      where: { symbol },
      order: { date: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async getPortfolioRiskSummary(): Promise<{
    positions: PositionRisk[];
    total_heat_pct: number;
    risk_status: string;
    max_loss_lkr: number;
    max_gain_lkr: number;
  }> {
    const positions = await this.getPositionRisks();
    const totalHeat = positions.reduce(
      (s, p) => s + Number(p.position_heat_pct),
      0,
    );
    const maxLoss = positions.reduce((s, p) => s + Number(p.max_loss_lkr), 0);
    const maxGain = positions.reduce((s, p) => s + Number(p.max_gain_lkr), 0);
    const riskStatus =
      totalHeat < 3 ? 'SAFE' : totalHeat < 5 ? 'CAUTION' : 'DANGER';
    return {
      positions,
      total_heat_pct: Math.round(totalHeat * 100) / 100,
      risk_status: riskStatus,
      max_loss_lkr: Math.round(maxLoss),
      max_gain_lkr: Math.round(maxGain),
    };
  }

  // Position sizing for a NEW purchase
  getSizing(input: {
    totalPortfolioValue: number;
    availableCash: number;
    suggestedEntry: number;
    recommendedStop: number;
  }): { max_risk_amount: number; max_shares: number; actual_shares: number } {
    const maxRiskAmount = input.totalPortfolioValue * 0.01;
    const riskPerShare = input.suggestedEntry - input.recommendedStop;
    if (riskPerShare <= 0)
      return {
        max_risk_amount: maxRiskAmount,
        max_shares: 0,
        actual_shares: 0,
      };
    const maxShares = Math.floor(maxRiskAmount / riskPerShare);
    const cashShares = Math.floor(input.availableCash / input.suggestedEntry);
    return {
      max_risk_amount: Math.round(maxRiskAmount),
      max_shares: maxShares,
      actual_shares: Math.min(maxShares, cashShares),
    };
  }

  // ---------------------------------------------------------------------------
  // Core computation
  // ---------------------------------------------------------------------------

  private async computeRiskForHolding(
    holding: Portfolio,
    date: string,
    tradeMap: Map<string, { price: number }>,
    totalPortfolioValue: number,
  ): Promise<PositionRisk | null> {
    const entryPrice = Number(holding.buy_price);
    const effectiveEntry =
      entryPrice + Number(holding.fees) / Number(holding.quantity);
    const sharesHeld = Number(holding.quantity);

    const trade = tradeMap.get(holding.symbol);
    const currentPrice = trade?.price ?? effectiveEntry;

    // Get latest technical signal for ATR + support
    const techRows = await this.techSignalRepo.find({
      where: { symbol: holding.symbol },
      order: { date: 'DESC' },
      take: 1,
    });
    const tech = techRows[0] ?? null;
    const atr = tech?.atr_14 ? Number(tech.atr_14) : null;
    const support = tech?.support_20d ? Number(tech.support_20d) : null;

    // Stop-loss calculations
    const atrStop = atr !== null ? round2(effectiveEntry - 2 * atr) : null;
    const supportStop =
      support !== null && atr !== null
        ? round2(support - 0.5 * atr)
        : support !== null
          ? round2(support * 0.995)
          : null;

    // Recommended stop = HIGHER of the two (tighter protection)
    let recommendedStop: number;
    if (atrStop !== null && supportStop !== null) {
      recommendedStop = Math.max(atrStop, supportStop);
    } else if (atrStop !== null) {
      recommendedStop = atrStop;
    } else if (supportStop !== null) {
      recommendedStop = supportStop;
    } else {
      // Fallback: 8% trailing from current price
      recommendedStop = round2(currentPrice * 0.92);
    }
    recommendedStop = round2(recommendedStop);

    // Take profit: 1:2 risk-reward
    const riskPerShare = round2(effectiveEntry - recommendedStop);
    const takeProfit = round2(effectiveEntry + 2 * riskPerShare);

    // Metrics
    const rewardPerShare = round2(takeProfit - currentPrice);
    const downside = currentPrice - recommendedStop;
    const riskRewardRatio =
      downside > 0 ? round2(rewardPerShare / downside) : 0;
    const distToStopPct = round2(
      ((currentPrice - recommendedStop) / currentPrice) * 100,
    );
    const maxLossLkr = round2(
      sharesHeld * Math.max(0, currentPrice - recommendedStop),
    );
    const maxGainLkr = round2(
      sharesHeld * Math.max(0, takeProfit - currentPrice),
    );
    const positionHeatPct =
      totalPortfolioValue > 0
        ? round2((maxLossLkr / totalPortfolioValue) * 100)
        : 0;

    const existing = await this.riskRepo.findOne({
      where: { date, symbol: holding.symbol },
    });
    const data: Partial<PositionRisk> = {
      date,
      symbol: holding.symbol,
      entry_price: round2(effectiveEntry),
      current_price: round2(currentPrice),
      shares_held: sharesHeld,
      stop_loss_atr: atrStop,
      stop_loss_support: supportStop,
      recommended_stop: recommendedStop,
      take_profit: takeProfit,
      risk_per_share: riskPerShare,
      reward_per_share: rewardPerShare,
      risk_reward_ratio: riskRewardRatio,
      max_loss_lkr: maxLossLkr,
      max_gain_lkr: maxGainLkr,
      distance_to_stop_pct: distToStopPct,
      position_heat_pct: positionHeatPct,
      portfolio_heat_pct: null, // set after all positions computed
      risk_status: 'SAFE', // updated after all positions
    };

    if (existing) {
      Object.assign(existing, data);
      return this.riskRepo.save(existing);
    }
    return this.riskRepo.save(this.riskRepo.create(data));
  }

  // ---------------------------------------------------------------------------
  // Alert dedup
  // ---------------------------------------------------------------------------

  private async createAlertIfNew(
    symbol: string,
    date: string,
    alertType: string,
    message: string,
  ): Promise<void> {
    const dedupKey = `risk:alert:${symbol}:${date}:${alertType}`;
    const exists = await this.redisService.get(dedupKey);
    if (exists) return;

    await this.redisService.set(dedupKey, '1', 4 * 3600); // 4h TTL

    const alert = new Alert();
    alert.symbol = symbol;
    alert.alert_type = 'risk_management';
    alert.title = `Risk Alert: ${symbol}`;
    alert.message = message;
    alert.is_triggered = true;
    alert.triggered_at = new Date();
    alert.is_active = false;
    alert.is_read = false;
    await this.alertRepo.save(alert);
    this.logger.log(`Risk alert created for ${symbol}: ${alertType}`);
  }

  private async createExitAlertIfNew(
    symbol: string,
    date: string,
    alertType: string,
    message: string,
  ): Promise<void> {
    const dedupKey = `risk:exit:${symbol}:${date}:${alertType}`;
    const exists = await this.redisService.get(dedupKey);
    if (exists) return;

    await this.redisService.set(dedupKey, '1', 24 * 3600); // 24h TTL — one per day

    const alert = new Alert();
    alert.symbol = symbol;
    alert.alert_type = 'exit_signal';
    alert.title = `Exit Signal: ${symbol}`;
    alert.message = message;
    alert.is_triggered = true;
    alert.triggered_at = new Date();
    alert.is_active = false;
    alert.is_read = false;
    await this.alertRepo.save(alert);
    this.logger.log(`Exit alert created for ${symbol}: ${alertType}`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async buildTradeMap(): Promise<Map<string, { price: number }>> {
    const tradeSummary = await this.redisService.getJson<{
      reqTradeSummery?: TradeItem[];
    }>('cse:trade_summary');
    const map = new Map<string, { price: number }>();
    for (const t of tradeSummary?.reqTradeSummery ?? []) {
      if (t.symbol && t.price) map.set(t.symbol, { price: t.price });
    }
    return map;
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
