import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  MarketSnapshot,
  PortfolioSnapshot,
  WeeklyMetric,
  StockScore,
  AiRecommendation,
  Stock,
  DailyPrice,
  Alert,
} from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import {
  PortfolioService,
  HoldingWithPnL,
} from '../portfolio/portfolio.service';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TradeItem {
  symbol?: string;
  price?: number;
  change?: number;
  percentageChange?: number;
  volume?: number;
  turnover?: number;
}

interface MarketSummaryCache {
  aspiIndex?: number;
  aspiChange?: number;
  aspiChangePercent?: number;
  spSl20Index?: number;
  spSl20Change?: number;
  spSl20ChangePercent?: number;
  totalVolume?: number;
  totalTurnover?: number;
  totalTrades?: number;
}

const TOKEN_BUDGET_KEY = 'ai:tokens';
const MONTHLY_TOKEN_LIMIT = 500_000;

// ---------------------------------------------------------------------------

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @InjectRepository(MarketSnapshot)
    private readonly marketSnapshotRepo: Repository<MarketSnapshot>,
    @InjectRepository(PortfolioSnapshot)
    private readonly portfolioSnapshotRepo: Repository<PortfolioSnapshot>,
    @InjectRepository(WeeklyMetric)
    private readonly weeklyMetricRepo: Repository<WeeklyMetric>,
    @InjectRepository(StockScore)
    private readonly stockScoreRepo: Repository<StockScore>,
    @InjectRepository(AiRecommendation)
    private readonly aiRecommendationRepo: Repository<AiRecommendation>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    private readonly redisService: RedisService,
    private readonly portfolioService: PortfolioService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron jobs
  // ---------------------------------------------------------------------------

  /**
   * Save market + portfolio snapshots at 2:40 PM SLT (9:10 AM UTC) Mon-Fri.
   */
  @Cron('10 9 * * 1-5', { name: 'save-daily-snapshots' })
  async saveDailySnapshots(): Promise<void> {
    const today = this.todayStr();
    this.logger.log(`Saving daily snapshots for ${today}`);
    await Promise.allSettled([
      this.saveMarketSnapshot(today),
      this.savePortfolioSnapshot(today),
    ]);
  }

  /**
   * Run stock scoring at 2:42 PM SLT (9:12 AM UTC) Mon-Fri.
   */
  @Cron('12 9 * * 1-5', { name: 'run-stock-scoring' })
  async runStockScoring(): Promise<void> {
    const today = this.todayStr();
    this.logger.log(`Running stock scoring for ${today}`);
    try {
      const count = await this.scoreAllCompliantStocks(today);
      this.logger.log(`Scored ${count} stocks for ${today}`);
    } catch (err) {
      this.logger.error(`Stock scoring failed: ${String(err)}`);
    }
  }

  /**
   * Calculate weekly metrics at 2:50 PM SLT (9:20 AM UTC) on Fridays.
   */
  @Cron('20 9 * * 5', { name: 'calculate-weekly-metrics' })
  async calculateWeeklyMetrics(): Promise<void> {
    const { weekStart, weekEnd } = this.currentWeekRange();
    this.logger.log(`Calculating weekly metrics for ${weekStart} – ${weekEnd}`);

    try {
      // Get Mon and Fri snapshots for the week
      const monSnapshot = await this.marketSnapshotRepo.findOne({
        where: { date: weekStart },
      });
      const friSnapshot = await this.marketSnapshotRepo.findOne({
        where: { date: weekEnd },
      });

      const monPortfolio = await this.portfolioSnapshotRepo.findOne({
        where: { date: weekStart },
      });
      const friPortfolio = await this.portfolioSnapshotRepo.findOne({
        where: { date: weekEnd },
      });

      const aspiStart = monSnapshot?.aspi_close
        ? Number(monSnapshot.aspi_close)
        : null;
      const aspiEnd = friSnapshot?.aspi_close
        ? Number(friSnapshot.aspi_close)
        : null;
      const aspiReturnPct =
        aspiStart && aspiEnd && aspiStart > 0
          ? ((aspiEnd - aspiStart) / aspiStart) * 100
          : null;

      const portStart = monPortfolio?.total_value
        ? Number(monPortfolio.total_value)
        : null;
      const portEnd = friPortfolio?.total_value
        ? Number(friPortfolio.total_value)
        : null;
      const portReturnPct =
        portStart && portEnd && portStart > 0
          ? ((portEnd - portStart) / portStart) * 100
          : null;

      // Best/worst holding from Friday's portfolio snapshot
      const fridayHoldings = friPortfolio?.holdings as Array<{
        symbol: string;
        pnl_percent: number | null;
      }> | null;
      let bestHolding: string | null = null;
      let worstHolding: string | null = null;
      if (fridayHoldings && fridayHoldings.length > 0) {
        const sorted = [...fridayHoldings].sort(
          (a, b) => (b.pnl_percent ?? 0) - (a.pnl_percent ?? 0),
        );
        bestHolding = sorted[0]?.symbol ?? null;
        worstHolding = sorted[sorted.length - 1]?.symbol ?? null;
      }

      // Upsert
      const existing = await this.weeklyMetricRepo.findOne({
        where: { week_start: weekStart },
      });
      if (existing) {
        existing.week_end = weekEnd;
        existing.aspi_start = aspiStart;
        existing.aspi_end = aspiEnd;
        existing.aspi_return_pct = aspiReturnPct;
        existing.portfolio_start = portStart;
        existing.portfolio_end = portEnd;
        existing.portfolio_return_pct = portReturnPct;
        existing.best_holding = bestHolding;
        existing.worst_holding = worstHolding;
        await this.weeklyMetricRepo.save(existing);
      } else {
        await this.weeklyMetricRepo.save(
          this.weeklyMetricRepo.create({
            week_start: weekStart,
            week_end: weekEnd,
            aspi_start: aspiStart,
            aspi_end: aspiEnd,
            aspi_return_pct: aspiReturnPct,
            portfolio_start: portStart,
            portfolio_end: portEnd,
            portfolio_return_pct: portReturnPct,
            best_holding: bestHolding,
            worst_holding: worstHolding,
          }),
        );
      }
      this.logger.log(`Weekly metrics saved for ${weekStart}`);
    } catch (err) {
      this.logger.error(`Failed to calculate weekly metrics: ${String(err)}`);
    }
  }

  /**
   * Generate AI recommendation at 2:55 PM SLT (9:25 AM UTC) on Fridays.
   */
  @Cron('25 9 * * 5', { name: 'generate-ai-recommendation' })
  async generateWeeklyRecommendation(): Promise<void> {
    const { weekStart } = this.currentWeekRange();
    this.logger.log(`Generating AI recommendation for week ${weekStart}`);

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('No ANTHROPIC_API_KEY — skipping weekly recommendation');
      return;
    }

    try {
      // Check if already generated this week
      const existing = await this.aiRecommendationRepo.findOne({
        where: { week_start: weekStart },
      });
      if (existing) {
        this.logger.log(`Recommendation already exists for ${weekStart}`);
        return;
      }

      // Gather inputs
      const [weekSnaps, scores, holdings] = await Promise.all([
        this.marketSnapshotRepo.find({
          order: { date: 'ASC' },
          take: 5,
        }),
        this.stockScoreRepo.find({
          where: { date: this.todayStr() },
          order: { composite_score: 'DESC' },
          take: 10,
        }),
        this.portfolioService
          .getAllHoldings()
          .catch((): HoldingWithPnL[] => []),
      ]);

      if (scores.length === 0) {
        this.logger.warn(
          'No stock scores available — insufficient data for recommendation',
        );
        return;
      }

      // Pick model (budget guard)
      const month = new Date().toISOString().slice(0, 7);
      const rawTokens = await this.redisService.get(
        `${TOKEN_BUDGET_KEY}:${month}`,
      );
      const tokensUsed = rawTokens ? parseInt(rawTokens, 10) : 0;
      const model =
        tokensUsed >= MONTHLY_TOKEN_LIMIT
          ? 'claude-haiku-4-5-20251001'
          : 'claude-sonnet-4-6';

      const totalInvested = holdings.reduce((s, h) => s + h.invested_value, 0);
      const totalCurrent = holdings.reduce(
        (s, h) => s + (h.current_value ?? 0),
        0,
      );

      const context = [
        `Week ending: ${weekStart}`,
        `Recent ASPI trend: ${JSON.stringify(weekSnaps.map((s) => ({ date: s.date, aspi: s.aspi_close, chg_pct: s.aspi_change_pct })))}`,
        `Current portfolio: invested LKR ${Math.round(totalInvested).toLocaleString()}, current LKR ${Math.round(totalCurrent).toLocaleString()}, P&L ${totalInvested > 0 ? (((totalCurrent - totalInvested) / totalInvested) * 100).toFixed(1) : '0'}%`,
        `Holdings: ${JSON.stringify(holdings.map((h) => ({ symbol: h.symbol, qty: h.quantity, cost_basis: h.buy_price, shariah: h.shariah_status })))}`,
        `Top 10 Shariah-compliant stocks by composite score: ${JSON.stringify(scores.map((s) => ({ symbol: s.symbol, score: Number(s.composite_score).toFixed(1), data_days: s.data_days, is_placeholder: s.is_placeholder })))}`,
        `Upcoming known events: CBSL rate decision March 25 2026; watch quarterly earnings Q1 2026`,
      ].join('\n');

      const prompt =
        `You are an expert CSE equity analyst advising a Shariah-compliant conservative retail investor ` +
        `using Rupee Cost Averaging (LKR 10,000/month). Based on this week's market data and stock scores, ` +
        `provide a weekly stock recommendation.\n\n` +
        `Respond with ONLY a valid JSON object (no markdown, no explanation) with these exact fields:\n` +
        `{\n` +
        `  "recommended_stock": "SYMBOL.N0000",\n` +
        `  "confidence": "HIGH" | "MEDIUM" | "LOW",\n` +
        `  "reasoning": "2-3 sentence rationale",\n` +
        `  "price_outlook_3m": "brief 3-month price outlook",\n` +
        `  "risk_flags": ["risk1", "risk2"],\n` +
        `  "alternative": "SYMBOL.N0000 or null"\n` +
        `}\n\n` +
        `Context:\n${context}`;

      const { text, tokensConsumed } = await this.callClaude(
        model,
        prompt,
        600,
      );
      await this.trackTokens(tokensConsumed);

      if (!text) {
        this.logger.warn('Claude returned empty response for recommendation');
        return;
      }

      // Parse JSON safely
      let parsed: {
        recommended_stock?: string;
        confidence?: string;
        reasoning?: string;
        price_outlook_3m?: string;
        risk_flags?: string[];
        alternative?: string | null;
      };
      try {
        // Strip markdown fences if present
        const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        parsed = JSON.parse(clean) as typeof parsed;
      } catch {
        this.logger.error(`Failed to parse recommendation JSON: ${text}`);
        return;
      }

      const rec = this.aiRecommendationRepo.create({
        week_start: weekStart,
        recommended_stock: parsed.recommended_stock ?? scores[0].symbol,
        confidence: (parsed.confidence ?? 'MEDIUM').toUpperCase(),
        reasoning: parsed.reasoning ?? '',
        price_outlook_3m: parsed.price_outlook_3m ?? null,
        risk_flags: parsed.risk_flags ?? [],
        alternative: parsed.alternative ?? null,
        model_used: model,
        tokens_used: tokensConsumed,
      });
      await this.aiRecommendationRepo.save(rec);

      // Create notification alert
      const confidenceEmoji =
        rec.confidence === 'HIGH'
          ? '🟢'
          : rec.confidence === 'LOW'
            ? '🔴'
            : '🟡';
      await this.createAlert(
        'ai_recommendation',
        `${confidenceEmoji} Weekly Pick: ${rec.recommended_stock} (${rec.confidence} confidence)`,
        rec.reasoning,
      );

      this.logger.log(
        `AI recommendation saved: ${rec.recommended_stock} (${rec.confidence}) for week ${weekStart}`,
      );
    } catch (err) {
      this.logger.error(`Failed to generate AI recommendation: ${String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public GET methods
  // ---------------------------------------------------------------------------

  async getLatestMarketSnapshot(): Promise<MarketSnapshot | null> {
    const rows = await this.marketSnapshotRepo.find({
      order: { date: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async getMarketSnapshots(days = 30): Promise<MarketSnapshot[]> {
    return this.marketSnapshotRepo.find({
      order: { date: 'DESC' },
      take: days,
    });
  }

  async getPortfolioSnapshots(days = 30): Promise<PortfolioSnapshot[]> {
    return this.portfolioSnapshotRepo.find({
      order: { date: 'DESC' },
      take: days,
    });
  }

  async getTodayScores(limit = 20): Promise<StockScore[]> {
    const today = this.todayStr();
    const rows = await this.stockScoreRepo.find({
      where: { date: today },
      order: { composite_score: 'DESC' },
      take: limit,
    });
    // Fallback to most recent scoring day if nothing today
    if (rows.length === 0) {
      const latest = await this.stockScoreRepo.find({
        order: { date: 'DESC', composite_score: 'DESC' },
        take: limit,
      });
      return latest;
    }
    return rows;
  }

  async getLatestRecommendation(): Promise<AiRecommendation | null> {
    const rows = await this.aiRecommendationRepo.find({
      order: { week_start: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async getDataStatus(): Promise<{
    market_snapshot_days: number;
    portfolio_snapshot_days: number;
    scoring_ready: boolean;
    days_until_scoring_ready: number;
    last_snapshot_date: string | null;
    last_scoring_date: string | null;
  }> {
    const [snapCount, portCount, lastSnap, lastScore] = await Promise.all([
      this.marketSnapshotRepo.count(),
      this.portfolioSnapshotRepo.count(),
      this.marketSnapshotRepo
        .find({ order: { date: 'DESC' }, take: 1 })
        .then((r) => r[0] ?? null),
      this.stockScoreRepo
        .find({ order: { date: 'DESC' }, take: 1 })
        .then((r) => r[0] ?? null),
    ]);

    const scoringReady = snapCount >= 20;
    return {
      market_snapshot_days: snapCount,
      portfolio_snapshot_days: portCount,
      scoring_ready: scoringReady,
      days_until_scoring_ready: Math.max(0, 20 - snapCount),
      last_snapshot_date: lastSnap ? String(lastSnap.date) : null,
      last_scoring_date: lastScore ? String(lastScore.date) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: snapshot builders
  // ---------------------------------------------------------------------------

  private async saveMarketSnapshot(date: string): Promise<void> {
    const [marketSummary, topGainers, topLosers, allSectors] =
      await Promise.all([
        this.redisService.getJson<MarketSummaryCache>('cse:market_summary'),
        this.redisService.getJson<TradeItem[]>('cse:top_gainers'),
        this.redisService.getJson<TradeItem[]>('cse:top_losers'),
        this.redisService.getJson<unknown[]>('cse:all_sectors'),
      ]);

    if (!marketSummary) {
      this.logger.warn(`No market summary in Redis for ${date} — skipping`);
      return;
    }

    const snap: Partial<MarketSnapshot> = {
      date,
      aspi_close: marketSummary.aspiIndex ?? null,
      aspi_change_pct: marketSummary.aspiChangePercent ?? null,
      sp20_close: marketSummary.spSl20Index ?? null,
      sp20_change_pct: marketSummary.spSl20ChangePercent ?? null,
      total_volume: marketSummary.totalVolume ?? null,
      total_turnover: marketSummary.totalTurnover ?? null,
      total_trades: marketSummary.totalTrades ?? null,
      top_gainers: (topGainers ?? []).slice(0, 5),
      top_losers: (topLosers ?? []).slice(0, 5),
      sector_performance: allSectors ?? null,
    };

    const existing = await this.marketSnapshotRepo.findOne({ where: { date } });
    if (existing) {
      Object.assign(existing, snap);
      await this.marketSnapshotRepo.save(existing);
    } else {
      await this.marketSnapshotRepo.save(this.marketSnapshotRepo.create(snap));
    }
    this.logger.log(`Market snapshot saved for ${date}`);
  }

  private async savePortfolioSnapshot(date: string): Promise<void> {
    const holdings: HoldingWithPnL[] = await this.portfolioService
      .getAllHoldings()
      .catch((): HoldingWithPnL[] => []);
    const summary = await this.portfolioService.getSummary().catch(() => null);

    const snap: Partial<PortfolioSnapshot> = {
      date,
      total_value: summary?.total_value ?? 0,
      total_invested: summary?.total_invested ?? 0,
      unrealized_pl: summary?.total_pnl ?? 0,
      cash_balance: summary?.cash_balance ?? 0,
      holdings_count: holdings.length,
      holdings: holdings.map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
        buy_price: h.buy_price,
        current_price: h.current_price,
        pnl_percent: h.pnl_percent,
        current_value: h.current_value,
      })),
    };

    const existing = await this.portfolioSnapshotRepo.findOne({
      where: { date },
    });
    if (existing) {
      Object.assign(existing, snap);
      await this.portfolioSnapshotRepo.save(existing);
    } else {
      await this.portfolioSnapshotRepo.save(
        this.portfolioSnapshotRepo.create(snap),
      );
    }
    this.logger.log(`Portfolio snapshot saved for ${date}`);
  }

  // ---------------------------------------------------------------------------
  // Private: scoring engine
  // ---------------------------------------------------------------------------

  /**
   * Deterministic composite stock scoring.
   *
   * Weights:
   *   Momentum (price vs 20d avg):   20%
   *   Volume trend (vol vs 20d avg): 10%
   *   Volatility (inverse std dev):  15%
   *   Sector strength:               15%
   *   Liquidity (avg daily turnover): 10%
   *   Dividend placeholder:          30% → 50 (neutral) — no dividend data yet
   *
   * Returns count of stocks scored.
   */
  private async scoreAllCompliantStocks(date: string): Promise<number> {
    // Only score compliant + pending stocks
    const stocks = await this.stockRepo.find({
      where: [{ shariah_status: 'compliant' }, { shariah_status: 'pending' }],
    });

    if (stocks.length === 0) return 0;

    // Get sector performance from Redis for sector scoring
    const allSectors =
      (await this.redisService.getJson<
        Array<{ sector?: string; change?: number }>
      >('cse:all_sectors')) ?? [];
    const sectorScoreMap = this.buildSectorScoreMap(allSectors);

    // Get trade data from Redis
    const tradeSummary = await this.redisService.getJson<{
      reqTradeSummery?: TradeItem[];
    }>('cse:trade_summary');
    const tradeMap = new Map<
      string,
      { price: number; volume: number; turnover: number }
    >();
    for (const t of tradeSummary?.reqTradeSummery ?? []) {
      if (t.symbol) {
        tradeMap.set(t.symbol, {
          price: t.price ?? 0,
          volume: t.volume ?? 0,
          turnover: t.turnover ?? 0,
        });
      }
    }

    let scored = 0;
    for (const stock of stocks) {
      try {
        // Get last 30 days of daily prices
        const prices = await this.dailyPriceRepo
          .createQueryBuilder('dp')
          .where('dp.stock_id = :id', { id: stock.id })
          .orderBy('dp.trade_date', 'DESC')
          .take(30)
          .getMany();

        const dataDays = prices.length;
        const isPlaceholder = dataDays < 20;

        if (isPlaceholder && dataDays === 0) {
          // No data at all — skip
          continue;
        }

        const scoreResult = this.computeStockScore({
          stock,
          prices,
          tradeMap,
          sectorScoreMap,
          dataDays,
          isPlaceholder,
        });

        // Upsert score
        const existing = await this.stockScoreRepo.findOne({
          where: { date, symbol: stock.symbol },
        });
        if (existing) {
          Object.assign(existing, scoreResult);
          await this.stockScoreRepo.save(existing);
        } else {
          await this.stockScoreRepo.save(
            this.stockScoreRepo.create({
              date,
              symbol: stock.symbol,
              ...scoreResult,
            }),
          );
        }
        scored++;
      } catch (err) {
        this.logger.warn(`Score error for ${stock.symbol}: ${String(err)}`);
      }
    }

    return scored;
  }

  private computeStockScore(input: {
    stock: Stock;
    prices: DailyPrice[];
    tradeMap: Map<string, { price: number; volume: number; turnover: number }>;
    sectorScoreMap: Map<string, number>;
    dataDays: number;
    isPlaceholder: boolean;
  }): Partial<StockScore> {
    const { stock, prices, tradeMap, sectorScoreMap, dataDays, isPlaceholder } =
      input;

    const NEUTRAL = 50;

    if (isPlaceholder) {
      return {
        composite_score: NEUTRAL,
        data_days: dataDays,
        is_placeholder: true,
        momentum_score: NEUTRAL,
        volume_score: NEUTRAL,
        volatility_score: NEUTRAL,
        sector_score: sectorScoreMap.get(stock.sector ?? '') ?? NEUTRAL,
        liquidity_score: NEUTRAL,
        components: { note: `Only ${dataDays}/20 days of data` },
      };
    }

    // Close prices (most recent first)
    const closes = prices.map((p) => Number(p.close));
    const volumes = prices.map((p) => Number(p.volume));
    const turnovers = prices.map((p) => Number(p.turnover));

    const avg20Close = avg(closes);
    const avg20Volume = avg(volumes);
    const avg20Turnover = avg(turnovers);

    // Live price from Redis (fallback to latest DB close)
    const trade = tradeMap.get(stock.symbol);
    const currentPrice = trade?.price ?? closes[0] ?? 0;

    // ── Momentum score (20%): (current - avg20) / avg20, mapped 0-100 ──
    const momentumRaw =
      avg20Close > 0 ? (currentPrice - avg20Close) / avg20Close : 0;
    const momentumScore = clamp(50 + momentumRaw * 200, 0, 100);

    // ── Volume trend score (10%): today_vol / avg20_vol, mapped 0-100 ──
    const todayVolume = trade?.volume ?? volumes[0] ?? 0;
    const volumeRatio = avg20Volume > 0 ? todayVolume / avg20Volume : 1;
    const volumeScore = clamp(volumeRatio * 50, 0, 100);

    // ── Volatility score (15%): inverse of std dev of daily returns ──
    // Lower volatility → higher score
    const returns: number[] = [];
    for (let i = 0; i < closes.length - 1; i++) {
      if (closes[i + 1] > 0) {
        returns.push((closes[i] - closes[i + 1]) / closes[i + 1]);
      }
    }
    const volatility = stdDev(returns);
    // Scale: 0% vol → 100 score, 5%+ vol → 0 score
    const volatilityScore = clamp(100 - volatility * 2000, 0, 100);

    // ── Sector strength score (15%): from Redis sector data ──
    const sectorScore = sectorScoreMap.get(stock.sector ?? '') ?? NEUTRAL;

    // ── Liquidity score (10%): avg daily turnover, log scale ──
    // LKR 0 → 0; LKR 1M → ~50; LKR 10M+ → ~100
    const liquidityScore =
      avg20Turnover > 0
        ? clamp((Math.log10(avg20Turnover / 10_000) / 3) * 100, 0, 100)
        : 0;

    // ── Composite (no dividend yield data yet — 30% weight stays neutral 50) ──
    const composite =
      50 * 0.3 + // dividend yield placeholder
      momentumScore * 0.2 +
      volumeScore * 0.1 +
      volatilityScore * 0.15 +
      sectorScore * 0.15 +
      liquidityScore * 0.1;

    return {
      composite_score: Math.round(composite * 10) / 10,
      data_days: dataDays,
      is_placeholder: false,
      momentum_score: Math.round(momentumScore * 10) / 10,
      volume_score: Math.round(volumeScore * 10) / 10,
      volatility_score: Math.round(volatilityScore * 10) / 10,
      sector_score: Math.round(sectorScore * 10) / 10,
      liquidity_score: Math.round(liquidityScore * 10) / 10,
      components: {
        current_price: currentPrice,
        avg_20d_close: Math.round(avg20Close * 100) / 100,
        avg_20d_volume: Math.round(avg20Volume),
        avg_20d_turnover_m: Math.round((avg20Turnover / 1_000_000) * 100) / 100,
        volatility_pct: Math.round(volatility * 10000) / 100,
        weights: {
          dividend: '30% (neutral 50)',
          momentum: '20%',
          volume: '10%',
          volatility: '15%',
          sector: '15%',
          liquidity: '10%',
        },
      },
    };
  }

  private buildSectorScoreMap(
    sectors: Array<{ sector?: string; change?: number }>,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const s of sectors) {
      if (!s.sector) continue;
      const change = s.change ?? 0;
      // change is % — map to 0-100: 0% change = 50, +5% = 100, -5% = 0
      const score = clamp(50 + change * 10, 0, 100);
      map.set(s.sector, score);
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // Private: Claude API + token tracking
  // ---------------------------------------------------------------------------

  private async callClaude(
    model: string,
    prompt: string,
    maxTokens: number,
  ): Promise<{ text: string; tokensConsumed: number }> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Anthropic = (await import('@anthropic-ai/sdk' as any)).default;
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const first = response.content?.[0];
    const text: string = first?.type === 'text' ? (first.text as string) : '';
    const tokensConsumed: number =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);
    return { text, tokensConsumed };
  }

  private async trackTokens(tokens: number): Promise<void> {
    if (tokens <= 0) return;
    const month = new Date().toISOString().slice(0, 7);
    const key = `${TOKEN_BUDGET_KEY}:${month}`;
    const current = await this.redisService.get(key);
    const updated = (current ? parseInt(current, 10) : 0) + tokens;
    await this.redisService.set(key, String(updated), 35 * 86_400);
  }

  private async createAlert(
    alertType: string,
    title: string,
    content: string,
  ): Promise<void> {
    const alert = new Alert();
    alert.symbol = null;
    alert.alert_type = alertType;
    alert.title = title;
    alert.message =
      content.length > 490 ? content.slice(0, 487) + '...' : content;
    alert.is_triggered = true;
    alert.triggered_at = new Date();
    alert.is_active = false;
    alert.is_read = false;
    await this.alertRepo.save(alert);
  }

  // ---------------------------------------------------------------------------
  // Private: date helpers
  // ---------------------------------------------------------------------------

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private currentWeekRange(): { weekStart: string; weekEnd: string } {
    const now = new Date();
    const day = now.getUTCDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now);
    mon.setUTCDate(now.getUTCDate() + diffToMon);
    const fri = new Date(mon);
    fri.setUTCDate(mon.getUTCDate() + 4);
    return {
      weekStart: mon.toISOString().split('T')[0],
      weekEnd: fri.toISOString().split('T')[0],
    };
  }
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const variance =
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
