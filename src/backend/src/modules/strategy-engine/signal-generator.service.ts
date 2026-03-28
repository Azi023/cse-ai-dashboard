import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { StrategySignal } from '../../entities/strategy-signal.entity';
import {
  Stock,
  TechnicalSignal,
  CompanyFinancial,
  Dividend,
  Announcement,
  MacroData,
  DailyPrice,
} from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import { MarketRegimeService } from './market-regime.service';
import { StrategySelectorService } from './strategy-selector.service';
import { StrategyConfig, PortfolioTier } from './strategy-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StockIndicators {
  symbol: string;
  stockName: string;
  sector: string | null;
  close_price: number | null;
  rsi_14: number | null;
  sma_20: number | null;
  sma_50: number | null;
  atr_14: number | null;
  price_vs_sma20_pct: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  has_upcoming_catalyst: boolean;
  no_negative_announcement_7d: boolean;
  days_to_ex_dividend: number | null;
  sector_macro_alignment: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  sector_relative_strength: number | null;
  day_of_month: number;
  monthly_budget_available: boolean;
  data_days: number;
}

interface RuleEvalResult {
  passed: boolean;
  rule: string;
  actual: unknown;
  threshold: unknown;
}

// Sector → macro condition mapping
// Returns 'FAVORABLE' when current macro conditions suit this sector
type MacroContext = {
  slfr: number | null; // CBSL lending rate
  slfrDirection: 'up' | 'down' | 'stable';
  usdLkr: number | null;
  inflation: number | null;
};

const SECTOR_MACRO_RULES: Record<
  string,
  (m: MacroContext) => 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL'
> = {
  Construction: (m) => (m.slfrDirection === 'down' ? 'FAVORABLE' : 'NEUTRAL'),
  Manufacturing: (m) =>
    m.usdLkr !== null && m.usdLkr > 290 ? 'FAVORABLE' : 'NEUTRAL',
  Textile: (m) =>
    m.usdLkr !== null && m.usdLkr > 290 ? 'FAVORABLE' : 'NEUTRAL',
  'Information Technology': (m) =>
    m.usdLkr !== null && m.usdLkr > 290 ? 'FAVORABLE' : 'NEUTRAL',
  Plantations: (m) =>
    m.usdLkr !== null && m.usdLkr > 290 ? 'FAVORABLE' : 'NEUTRAL',
  'Consumer Goods': (m) =>
    m.inflation !== null && m.inflation > 8 ? 'FAVORABLE' : 'NEUTRAL',
  Healthcare: () => 'NEUTRAL',
  Telecom: () => 'NEUTRAL',
  Finance: (m) => (m.slfrDirection === 'up' ? 'FAVORABLE' : 'NEUTRAL'),
};

// ---------------------------------------------------------------------------
// Portfolio size assumptions for position sizing
// ---------------------------------------------------------------------------
const PORTFOLIO_LKR: Record<PortfolioTier, number> = {
  BEGINNER: 20_000,
  INTERMEDIATE: 1_000_000,
  ADVANCED: 10_000_000,
  INSTITUTIONAL: 100_000_000,
};

const REDIS_SIGNALS_KEY = (date: string) => `strategy:signals:${date}`;
const REDIS_TTL = 24 * 3600;

// ---------------------------------------------------------------------------

@Injectable()
export class SignalGeneratorService {
  private readonly logger = new Logger(SignalGeneratorService.name);

  constructor(
    @InjectRepository(StrategySignal)
    private readonly signalRepo: Repository<StrategySignal>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(TechnicalSignal)
    private readonly techRepo: Repository<TechnicalSignal>,
    @InjectRepository(CompanyFinancial)
    private readonly financialRepo: Repository<CompanyFinancial>,
    @InjectRepository(Dividend)
    private readonly dividendRepo: Repository<Dividend>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(MacroData)
    private readonly macroRepo: Repository<MacroData>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    private readonly redisService: RedisService,
    private readonly regimeService: MarketRegimeService,
    private readonly selectorService: StrategySelectorService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron: 2:43 PM SLT (9:13 AM UTC), after regime detection (9:12)
  // ---------------------------------------------------------------------------

  @Cron('13 9 * * 1-5', { name: 'generate-strategy-signals' })
  async generateSignalsCron(): Promise<void> {
    this.logger.log('Generating strategy signals (scheduled)');
    try {
      const signals = await this.generateSignals();
      this.logger.log(`Strategy signals generated: ${signals.length}`);
    } catch (err) {
      this.logger.error(`Strategy signal generation failed: ${String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async getTodaySignals(): Promise<StrategySignal[]> {
    const today = todayStr();
    const cached = await this.redisService.getJson<StrategySignal[]>(
      REDIS_SIGNALS_KEY(today),
    );
    if (cached && cached.length > 0) return cached;

    return this.signalRepo.find({
      where: { signal_date: today },
      order: { score: 'DESC' },
    });
  }

  async generateSignals(
    tier: PortfolioTier = 'BEGINNER',
  ): Promise<StrategySignal[]> {
    // 1. Get current market regime
    const regimeResult = await this.regimeService.getCurrentRegime();
    if (!regimeResult) {
      this.logger.warn(
        'No market regime available — skipping signal generation',
      );
      return [];
    }

    // 2. Determine available data days (from price history)
    const datadays = await this.getAvailableDataDays();

    // 3. Select applicable strategies
    const strategies = this.selectorService.selectStrategies({
      regime: regimeResult.regime,
      tier,
      availableDataDays: datadays,
    });

    if (strategies.length === 0) {
      this.logger.log(
        `No strategies applicable for regime=${regimeResult.regime} tier=${tier} data=${datadays}d`,
      );
      return [];
    }

    this.logger.log(
      `Active strategies: ${strategies.map((s) => s.name).join(', ')}`,
    );

    // 4. Build indicator map for all compliant stocks
    const indicatorMap = await this.buildIndicatorMap();

    if (indicatorMap.size === 0) {
      this.logger.warn(
        'Indicator map is empty — no compliant stocks with data',
      );
      return [];
    }

    // 5. Evaluate each stock × each strategy
    const today = todayStr();
    const results: StrategySignal[] = [];

    for (const strategy of strategies) {
      for (const [symbol, indicators] of indicatorMap) {
        const signal = this.evaluateStrategy(
          strategy,
          indicators,
          regimeResult.regime,
          tier,
        );

        if (!signal) continue;

        // Upsert to DB (unique on date + symbol + strategy_id)
        try {
          const existing = await this.signalRepo.findOne({
            where: { signal_date: today, symbol, strategy_id: strategy.id },
          });

          const entity = this.signalRepo.create({
            ...signal,
            id: existing?.id,
          });
          const saved = await this.signalRepo.save(entity);
          results.push(saved);
        } catch (err) {
          this.logger.warn(
            `Failed to save signal for ${symbol}/${strategy.id}: ${String(err)}`,
          );
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Cache in Redis
    await this.redisService.setJson(
      REDIS_SIGNALS_KEY(today),
      results,
      REDIS_TTL,
    );

    this.logger.log(
      `Generated ${results.length} strategy signals across ${strategies.length} strategies`,
    );
    return results;
  }

  // ---------------------------------------------------------------------------
  // Evaluate one strategy against one stock's indicators
  // Returns null if any entry rule fails
  // ---------------------------------------------------------------------------

  private evaluateStrategy(
    strategy: StrategyConfig,
    indicators: StockIndicators,
    regime: string,
    tier: PortfolioTier,
  ): Omit<StrategySignal, 'id' | 'created_at'> | null {
    const rulesTriggered: Array<{
      rule: string;
      actual: unknown;
      threshold: unknown;
    }> = [];

    // Evaluate all entry rules
    for (const rule of strategy.entryRules) {
      const result = this.evalRule(
        rule.indicator,
        rule.condition,
        rule.value,
        indicators,
      );

      if (!result.passed) return null; // ALL rules must pass

      rulesTriggered.push({
        rule: rule.label ?? rule.indicator,
        actual: result.actual,
        threshold: result.threshold,
      });
    }

    const entryPrice = indicators.close_price;
    if (!entryPrice || entryPrice <= 0) return null;

    const { stopLoss, takeProfit } = this.computeExitLevels(
      strategy,
      indicators,
      entryPrice,
    );

    const rrRatio =
      takeProfit !== null && stopLoss !== null && stopLoss < entryPrice
        ? round((takeProfit - entryPrice) / (entryPrice - stopLoss), 2)
        : null;

    const { shares, lkr } = this.computePositionSize(
      strategy,
      entryPrice,
      indicators.atr_14,
      tier,
    );

    const score = this.computeScore(strategy, indicators);
    const dataConfidence = this.computeDataConfidence(strategy, indicators);
    const confidence =
      dataConfidence >= 0.75 && score >= 65
        ? 'HIGH'
        : dataConfidence >= 0.5 && score >= 50
          ? 'MEDIUM'
          : 'LOW';

    const reasoning = this.buildReasoning(strategy, rulesTriggered, indicators);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3); // valid 3 trading days

    return {
      signal_date: todayStr(),
      symbol: indicators.symbol,
      strategy_id: strategy.id,
      strategy_name: strategy.name,
      direction: 'BUY',
      confidence,
      score,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      risk_reward_ratio: rrRatio,
      position_size_shares: shares,
      position_size_lkr: lkr,
      reasoning,
      rules_triggered: rulesTriggered,
      market_regime: regime,
      expires_at: expiresAt,
      data_confidence: round(dataConfidence, 2),
    };
  }

  // ---------------------------------------------------------------------------
  // Rule evaluation
  // ---------------------------------------------------------------------------

  private evalRule(
    indicator: string,
    condition: StrategyConfig['entryRules'][0]['condition'],
    threshold: StrategyConfig['entryRules'][0]['value'],
    indicators: StockIndicators,
  ): RuleEvalResult {
    const actual = this.getIndicatorValue(indicator, indicators);

    if (actual === null || actual === undefined) {
      // Missing data = rule fails
      return { passed: false, rule: indicator, actual: null, threshold };
    }

    let passed = false;

    switch (condition) {
      case 'ABOVE':
        passed = typeof actual === 'number' && actual > (threshold as number);
        break;
      case 'BELOW':
        passed = typeof actual === 'number' && actual < (threshold as number);
        break;
      case 'ABOVE_PCT':
        passed = typeof actual === 'number' && actual > (threshold as number);
        break;
      case 'BELOW_PCT':
        passed = typeof actual === 'number' && actual < (threshold as number);
        break;
      case 'BETWEEN': {
        const [lo, hi] = threshold as [number, number];
        passed = typeof actual === 'number' && actual >= lo && actual <= hi;
        break;
      }
      case 'EQUALS':
        passed = actual === threshold;
        break;
      case 'NOT_EQUALS':
        passed = actual !== threshold;
        break;
    }

    return { passed, rule: indicator, actual, threshold };
  }

  private getIndicatorValue(indicator: string, ind: StockIndicators): unknown {
    switch (indicator) {
      case 'pe_ratio':
        return ind.pe_ratio;
      case 'dividend_yield':
        return ind.dividend_yield;
      case 'rsi_14':
        return ind.rsi_14;
      case 'price_vs_sma20':
        return ind.price_vs_sma20_pct;
      case 'has_upcoming_catalyst':
        return ind.has_upcoming_catalyst;
      case 'no_negative_announcement_7d':
        return ind.no_negative_announcement_7d;
      case 'day_of_month':
        return ind.day_of_month;
      case 'monthly_budget_available':
        return ind.monthly_budget_available;
      case 'days_to_ex_dividend':
        return ind.days_to_ex_dividend;
      case 'sector_macro_alignment':
        return ind.sector_macro_alignment;
      case 'sector_relative_strength':
        return ind.sector_relative_strength;
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Stop / take-profit calculations per strategy
  // ---------------------------------------------------------------------------

  private computeExitLevels(
    strategy: StrategyConfig,
    ind: StockIndicators,
    entry: number,
  ): { stopLoss: number | null; takeProfit: number | null } {
    const atr = ind.atr_14 ?? entry * 0.02; // fallback: 2% of price

    const stopLoss = round(entry - 2 * atr);

    let takeProfit: number | null = null;

    switch (strategy.id) {
      case 'MEAN_REVERSION':
        // Target: return to SMA20
        takeProfit = ind.sma_20 ? round(ind.sma_20) : round(entry * 1.1);
        break;

      case 'VALUE_CATALYST':
        // Target: PE normalization from current to 18
        if (ind.pe_ratio && ind.pe_ratio > 0 && ind.pe_ratio < 18) {
          takeProfit = round(entry * (18 / ind.pe_ratio));
          // Cap at 100% upside
          if (takeProfit !== null && takeProfit > entry * 2)
            takeProfit = round(entry * 2);
        } else {
          takeProfit = round(entry * 1.3); // 30% default
        }
        break;

      case 'DIVIDEND_CAPTURE':
        // Target: recover the dividend drop
        if (ind.dividend_yield && ind.dividend_yield > 0) {
          const annualDiv = entry * (ind.dividend_yield / 100);
          const quarterlyDiv = annualDiv / 4;
          // After 14% withholding tax
          takeProfit = round(entry + quarterlyDiv * 0.86);
        } else {
          takeProfit = round(entry * 1.02);
        }
        break;

      case 'SECTOR_ROTATION':
        takeProfit = round(entry * 1.15); // 15% target
        break;

      case 'RCA_DISCIPLINED':
        takeProfit = null; // hold forever
        break;
    }

    return { stopLoss: stopLoss ?? null, takeProfit };
  }

  // ---------------------------------------------------------------------------
  // Position sizing
  // ---------------------------------------------------------------------------

  private computePositionSize(
    strategy: StrategyConfig,
    entryPrice: number,
    atr: number | null,
    tier: PortfolioTier,
  ): { shares: number | null; lkr: number | null } {
    const portfolioSize = PORTFOLIO_LKR[tier];

    let lkr: number;

    switch (strategy.positionSizeMethod) {
      case 'fixed_amount':
        lkr = strategy.fixedAmountLkr ?? 10_000;
        break;

      case 'atr_based': {
        // Risk 2% of portfolio per trade; risk per share = 2 × ATR
        const riskPerShare = atr ? 2 * atr : entryPrice * 0.04;
        const riskAmount = portfolioSize * 0.02;
        const theoreticalShares = Math.floor(riskAmount / riskPerShare);
        lkr = theoreticalShares * entryPrice;
        // Cap at maxPositionPct
        const maxLkr = portfolioSize * (strategy.maxPositionPct / 100);
        if (lkr > maxLkr) lkr = maxLkr;
        break;
      }

      case 'pct_portfolio':
      default:
        lkr = portfolioSize * (strategy.maxPositionPct / 100);
        break;
    }

    // Enforce minimum (LKR 5,000 — below this CSE costs eat too much)
    if (lkr < 5_000) lkr = 5_000;

    const shares = entryPrice > 0 ? Math.floor(lkr / entryPrice) : null;
    const actualLkr = shares && shares > 0 ? round(shares * entryPrice) : null;

    return { shares: shares && shares > 0 ? shares : null, lkr: actualLkr };
  }

  // ---------------------------------------------------------------------------
  // Score (0-100)
  // ---------------------------------------------------------------------------

  private computeScore(strategy: StrategyConfig, ind: StockIndicators): number {
    let score = 50; // base when all rules pass

    switch (strategy.id) {
      case 'MEAN_REVERSION':
        if (ind.rsi_14 !== null) {
          if (ind.rsi_14 < 20) score += 20;
          else if (ind.rsi_14 < 25) score += 15;
          else if (ind.rsi_14 < 30) score += 10;
        }
        if (ind.price_vs_sma20_pct !== null) {
          if (ind.price_vs_sma20_pct < -15) score += 10;
          else if (ind.price_vs_sma20_pct < -10) score += 5;
        }
        if (!ind.rsi_14) score -= 15;
        if (!ind.sma_20) score -= 10;
        break;

      case 'VALUE_CATALYST':
        if (ind.pe_ratio !== null) {
          if (ind.pe_ratio < 6) score += 20;
          else if (ind.pe_ratio < 8) score += 12;
          else if (ind.pe_ratio < 10) score += 6;
        }
        if (ind.dividend_yield !== null) {
          if (ind.dividend_yield > 8) score += 15;
          else if (ind.dividend_yield > 5) score += 8;
          else if (ind.dividend_yield > 3) score += 3;
        }
        if (!ind.pe_ratio) score -= 10;
        break;

      case 'DIVIDEND_CAPTURE':
        if (ind.dividend_yield !== null) {
          if (ind.dividend_yield > 8) score += 20;
          else if (ind.dividend_yield > 6) score += 12;
          else if (ind.dividend_yield > 4) score += 6;
        }
        if (ind.days_to_ex_dividend !== null) {
          // Closer to 12-day ideal window = higher score
          const ideal = 12;
          const diff = Math.abs((ind.days_to_ex_dividend ?? ideal) - ideal);
          score += Math.max(0, 10 - diff * 2);
        }
        break;

      case 'SECTOR_ROTATION':
        if (
          ind.sector_relative_strength !== null &&
          ind.sector_relative_strength > 2
        )
          score += 15;
        else if (
          ind.sector_relative_strength !== null &&
          ind.sector_relative_strength > 1
        )
          score += 8;
        break;

      case 'RCA_DISCIPLINED':
        score = 55; // fixed modest score — RCA is about discipline, not timing
        break;
    }

    return Math.min(100, Math.max(0, score));
  }

  // ---------------------------------------------------------------------------
  // Data confidence (0-1)
  // ---------------------------------------------------------------------------

  private computeDataConfidence(
    strategy: StrategyConfig,
    ind: StockIndicators,
  ): number {
    let points = 0;
    let maxPoints = 0;

    // Price data
    maxPoints += 2;
    if (ind.close_price) points += 1;
    if (ind.data_days >= strategy.minDataDays * 2) points += 1;
    else if (ind.data_days >= strategy.minDataDays) points += 0.5;

    // Technical indicators
    if (strategy.id === 'MEAN_REVERSION') {
      maxPoints += 3;
      if (ind.rsi_14) points += 1;
      if (ind.sma_20) points += 1;
      if (ind.atr_14) points += 1;
    }

    // Fundamental data
    if (
      strategy.id === 'VALUE_CATALYST' ||
      strategy.id === 'DIVIDEND_CAPTURE'
    ) {
      maxPoints += 2;
      if (ind.pe_ratio) points += 1;
      if (ind.dividend_yield) points += 1;
    }

    // Sector data
    if (strategy.id === 'SECTOR_ROTATION') {
      maxPoints += 2;
      if (ind.sector_macro_alignment !== 'NEUTRAL') points += 1;
      if (ind.sector_relative_strength !== null) points += 1;
    }

    return maxPoints > 0 ? points / maxPoints : 0;
  }

  // ---------------------------------------------------------------------------
  // Build human-readable reasoning list
  // ---------------------------------------------------------------------------

  private buildReasoning(
    strategy: StrategyConfig,
    rules: Array<{ rule: string; actual: unknown; threshold: unknown }>,
    ind: StockIndicators,
  ): string[] {
    const lines: string[] = [];

    lines.push(`Strategy: ${strategy.name}`);

    for (const r of rules) {
      const actualStr =
        typeof r.actual === 'number' ? r.actual.toFixed(2) : String(r.actual);
      lines.push(`✓ ${r.rule}: ${actualStr}`);
    }

    if (strategy.id === 'MEAN_REVERSION' && ind.sma_20 && ind.close_price) {
      lines.push(
        `Target: return to SMA20 (LKR ${ind.sma_20.toFixed(2)}) — ${(((ind.sma_20 - ind.close_price) / ind.close_price) * 100).toFixed(1)}% upside`,
      );
    }

    if (strategy.id === 'VALUE_CATALYST' && ind.pe_ratio) {
      lines.push(
        `Valuation target: P/E 18 implies ${((18 / ind.pe_ratio - 1) * 100).toFixed(0)}% upside from current P/E ${ind.pe_ratio.toFixed(1)}`,
      );
    }

    return lines;
  }

  // ---------------------------------------------------------------------------
  // Build indicator map for all compliant stocks
  // ---------------------------------------------------------------------------

  private async buildIndicatorMap(): Promise<Map<string, StockIndicators>> {
    const map = new Map<string, StockIndicators>();

    // 1. Fetch all compliant stocks
    const stocks = await this.stockRepo.find({
      where: { shariah_status: 'compliant' },
      select: ['symbol', 'name', 'sector'],
    });

    if (stocks.length === 0) return map;

    const today = todayStr();
    const dayDelta = 7; // look back 7 days for "today's" technical signal

    // 2. Latest technical signals (by symbol, recent window)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayDelta);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const techSignals = await this.techRepo
      .createQueryBuilder('ts')
      .where('ts.date >= :cutoff', { cutoff: cutoffStr })
      .orderBy('ts.date', 'DESC')
      .getMany();

    const latestTech = new Map<string, TechnicalSignal>();
    for (const t of techSignals) {
      if (!latestTech.has(t.symbol)) latestTech.set(t.symbol, t);
    }

    // 3. Latest company financials (most recent per symbol)
    const financials = await this.financialRepo
      .createQueryBuilder('cf')
      .distinctOn(['cf.symbol'])
      .orderBy('cf.symbol')
      .addOrderBy('cf.fiscal_year', 'DESC')
      .addOrderBy('cf.quarter', 'DESC')
      .getMany();

    const latestFinancials = new Map<string, CompanyFinancial>(
      financials.map((f) => [f.symbol, f]),
    );

    // 4. Upcoming dividends (ex_date within next 20 days)
    const upcoming = new Date();
    upcoming.setDate(upcoming.getDate() + 20);
    const upcomingStr = upcoming.toISOString().split('T')[0];

    const dividends = await this.dividendRepo
      .createQueryBuilder('d')
      .where('d.ex_date >= :today AND d.ex_date <= :upcoming', {
        today,
        upcoming: upcomingStr,
      })
      .getMany();

    const nextDividend = new Map<string, Dividend>();
    for (const d of dividends) {
      const existing = nextDividend.get(d.symbol);
      if (!existing || new Date(d.ex_date) < new Date(existing.ex_date)) {
        nextDividend.set(d.symbol, d);
      }
    }

    // 5. Recent announcements (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const announcements = await this.announcementRepo
      .createQueryBuilder('a')
      .where('a.symbol IS NOT NULL AND a.announced_at >= :since', {
        since: thirtyDaysAgo,
      })
      .getMany();

    // Group by symbol
    const announcementsBySymbol = new Map<string, Announcement[]>();
    for (const a of announcements) {
      if (!a.symbol) continue;
      if (!announcementsBySymbol.has(a.symbol))
        announcementsBySymbol.set(a.symbol, []);
      announcementsBySymbol.get(a.symbol)!.push(a);
    }

    // 6. Macro context for sector rotation
    const macroCtx = await this.buildMacroContext();

    // 7. Sector relative strength
    const sectorStrength = await this.computeSectorRelativeStrength();

    // 8. Count available data days per stock
    const dataDayCounts = await this.getDataDayCounts(
      stocks.map((s) => s.symbol),
    );

    const dayOfMonth = new Date().getDate();

    // 9. Build indicators for each stock
    for (const stock of stocks) {
      const tech = latestTech.get(stock.symbol);
      const fin = latestFinancials.get(stock.symbol);
      const div = nextDividend.get(stock.symbol);
      const stockAnnouncements = announcementsBySymbol.get(stock.symbol) ?? [];

      const closePrice = tech ? Number(tech.close_price) : null;
      const sma20 = tech ? Number(tech.sma_20) : null;
      const sma50 = tech ? Number(tech.sma_50) : null;
      const rsi14 = tech ? Number(tech.rsi_14) : null;
      const atr14 = tech ? Number(tech.atr_14) : null;

      const priceVsSma20 =
        closePrice && sma20 && sma20 > 0
          ? ((closePrice - sma20) / sma20) * 100
          : null;

      // Catalyst = any announcement in last 30 days
      const hasUpcomingCatalyst = stockAnnouncements.length > 0;

      // Negative announcement in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const negativeKeywords = [
        'non_compliance',
        'suspension',
        'loss',
        'default',
        'lawsuit',
        'investigation',
      ];
      const hasNegative7d = stockAnnouncements.some((a) => {
        if (!a.announced_at || new Date(a.announced_at) < sevenDaysAgo)
          return false;
        const text = `${a.title} ${a.type}`.toLowerCase();
        return (
          negativeKeywords.some((kw) => text.includes(kw)) ||
          a.type === 'non_compliance'
        );
      });

      // Days to ex-dividend
      const daysToExDiv = div
        ? daysBetween(new Date(), new Date(div.ex_date))
        : null;

      // Sector macro alignment
      const sector = stock.sector ?? '';
      const sectorAlignFn = Object.entries(SECTOR_MACRO_RULES).find(([key]) =>
        sector.toLowerCase().includes(key.toLowerCase()),
      );
      const sectorMacroAlignment = sectorAlignFn
        ? sectorAlignFn[1](macroCtx)
        : 'NEUTRAL';

      // Sector relative strength
      const sectorRS = sectorStrength.get(sector) ?? null;

      map.set(stock.symbol, {
        symbol: stock.symbol,
        stockName: stock.name,
        sector,
        close_price: closePrice,
        rsi_14: rsi14,
        sma_20: sma20,
        sma_50: sma50,
        atr_14: atr14,
        price_vs_sma20_pct:
          priceVsSma20 !== null ? round(priceVsSma20, 2) : null,
        pe_ratio: fin?.pe_ratio ? Number(fin.pe_ratio) : null,
        dividend_yield: fin?.dividend_yield ? Number(fin.dividend_yield) : null,
        has_upcoming_catalyst: hasUpcomingCatalyst,
        no_negative_announcement_7d: !hasNegative7d,
        days_to_ex_dividend: daysToExDiv,
        sector_macro_alignment: sectorMacroAlignment,
        sector_relative_strength: sectorRS,
        day_of_month: dayOfMonth,
        monthly_budget_available: true, // always assume budget available
        data_days: dataDayCounts.get(stock.symbol) ?? 0,
      });
    }

    return map;
  }

  // ---------------------------------------------------------------------------
  // Macro context for sector rotation
  // ---------------------------------------------------------------------------

  private async buildMacroContext(): Promise<MacroContext> {
    try {
      const rows = await this.macroRepo
        .createQueryBuilder('md')
        .where('md.indicator IN (:...keys)', {
          keys: ['slfr', 'usd_lkr', 'inflation_ccpi_yoy'],
        })
        .orderBy('md.data_date', 'DESC')
        .take(6)
        .getMany();

      const map = new Map<string, number[]>();
      for (const r of rows) {
        if (!map.has(r.indicator)) map.set(r.indicator, []);
        map.get(r.indicator)!.push(Number(r.value));
      }

      const slfrValues = map.get('slfr') ?? [];
      const slfr = slfrValues[0] ?? null;
      // Rate direction: compare latest vs second-latest
      const slfrDirection: MacroContext['slfrDirection'] =
        slfrValues.length >= 2
          ? slfrValues[0] < slfrValues[1]
            ? 'down'
            : slfrValues[0] > slfrValues[1]
              ? 'up'
              : 'stable'
          : 'stable';

      return {
        slfr,
        slfrDirection,
        usdLkr: map.get('usd_lkr')?.[0] ?? null,
        inflation: map.get('inflation_ccpi_yoy')?.[0] ?? null,
      };
    } catch {
      return {
        slfr: null,
        slfrDirection: 'stable',
        usdLkr: null,
        inflation: null,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Sector relative strength vs market (30-day avg return)
  // ---------------------------------------------------------------------------

  private async computeSectorRelativeStrength(): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get stocks with sector data
      const stocks = await this.stockRepo.find({
        where: { shariah_status: 'compliant' },
        select: ['symbol', 'sector'],
      });

      if (stocks.length === 0) return result;

      const symbols = stocks.map((s) => s.symbol);

      // Get price data for last 30 days via join
      const prices = await this.dailyPriceRepo
        .createQueryBuilder('dp')
        .select('s.symbol', 'symbol')
        .addSelect('dp.close', 'close')
        .innerJoin('dp.stock', 's')
        .where('s.symbol IN (:...symbols) AND dp.close IS NOT NULL', {
          symbols,
        })
        .orderBy('dp.trade_date', 'ASC')
        .getRawMany<{ symbol: string; close: string }>();

      // Compute 30d return per stock
      const priceBySymbol = new Map<string, number[]>();
      for (const p of prices) {
        if (!priceBySymbol.has(p.symbol)) priceBySymbol.set(p.symbol, []);
        priceBySymbol.get(p.symbol)!.push(Number(p.close));
      }

      const returnBySymbol = new Map<string, number>();
      for (const [symbol, closes] of priceBySymbol) {
        if (closes.length < 2) continue;
        const ret = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
        returnBySymbol.set(symbol, ret);
      }

      // Market average return
      const allReturns = [...returnBySymbol.values()];
      const marketAvgReturn =
        allReturns.length > 0
          ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length
          : 0;

      // Sector average return vs market
      const sectorMap = new Map<string, string>();
      for (const s of stocks) {
        if (s.sector) sectorMap.set(s.symbol, s.sector);
      }

      const sectorReturns = new Map<string, number[]>();
      for (const [symbol, ret] of returnBySymbol) {
        const sector = sectorMap.get(symbol);
        if (!sector) continue;
        if (!sectorReturns.has(sector)) sectorReturns.set(sector, []);
        sectorReturns.get(sector)!.push(ret);
      }

      for (const [sector, rets] of sectorReturns) {
        const sectorAvg = rets.reduce((a, b) => a + b, 0) / rets.length;
        result.set(sector, round(sectorAvg - marketAvgReturn, 2) ?? 0);
      }
    } catch {
      // Non-fatal
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getAvailableDataDays(): Promise<number> {
    try {
      const count = await this.dailyPriceRepo
        .createQueryBuilder('dp')
        .select('dp.trade_date')
        .distinct(true)
        .getCount();
      return count;
    } catch {
      return 0;
    }
  }

  private async getDataDayCounts(
    symbols: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (symbols.length === 0) return map;

    try {
      const rows = await this.dailyPriceRepo
        .createQueryBuilder('dp')
        .select('s.symbol', 'symbol')
        .addSelect('COUNT(dp.trade_date)', 'cnt')
        .innerJoin('dp.stock', 's')
        .where('s.symbol IN (:...symbols)', { symbols })
        .groupBy('s.symbol')
        .getRawMany<{ symbol: string; cnt: string }>();

      for (const r of rows) {
        map.set(r.symbol, parseInt(r.cnt, 10));
      }
    } catch {
      // Non-fatal
    }

    return map;
  }
}

// ---------------------------------------------------------------------------
// Module-level utilities
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function round(v: number | null | undefined, dp = 2): number | null {
  if (v === null || v === undefined || isNaN(v)) return null;
  return Math.round(v * 10 ** dp) / 10 ** dp;
}
