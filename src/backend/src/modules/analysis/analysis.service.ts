import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  CompanyFinancial,
  NewsItem,
} from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import {
  PortfolioService,
  HoldingWithPnL,
} from '../portfolio/portfolio.service';
import { CseApiService } from '../cse-data/cse-api.service';
import { TechnicalService } from './technical.service';
import { RiskService } from './risk.service';
import { LearningService } from './learning.service';

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
  // Raw CSE marketSummery endpoint fields
  shareVolume?: number;
  tradeVolume?: number;
  trades?: number;
  // Normalised fields (used by older snapshot code — kept for compat)
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

interface IndexDataCache {
  value?: number;
  change?: number;
  percentage?: number;
}

interface FinancialFactors {
  earnings_growth_score: number;
  debt_health_score: number;
  roe_score: number;
  revenue_trend_score: number;
  pe_score: number;
  pb_score: number;
  dividend_score: number;
}

const TOKEN_BUDGET_KEY = 'ai:tokens';
const MONTHLY_TOKEN_LIMIT = 500_000;
const NEUTRAL = 50;

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
    @InjectRepository(CompanyFinancial)
    private readonly companyFinancialRepo: Repository<CompanyFinancial>,
    @InjectRepository(NewsItem)
    private readonly newsItemRepo: Repository<NewsItem>,
    private readonly redisService: RedisService,
    private readonly portfolioService: PortfolioService,
    private readonly configService: ConfigService,
    private readonly cseApiService: CseApiService,
    private readonly technicalService: TechnicalService,
    private readonly riskService: RiskService,
    private readonly learningService: LearningService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron jobs
  // ---------------------------------------------------------------------------

  /**
   * Weekly company profile sync — Sunday 2 AM SLT (Saturday 20:30 UTC).
   * Fetches PE, PB, dividend yield, 52-week high/low for all Shariah-compliant stocks.
   */
  @Cron('30 20 * * 6', { name: 'sync-company-profiles' })
  async syncCompanyProfiles(): Promise<void> {
    this.logger.log('Starting weekly company profile sync...');
    const stocks = await this.stockRepo.find({
      where: [
        { shariah_status: 'compliant' },
        { shariah_status: 'pending_review' },
      ],
    });

    let synced = 0;
    for (const stock of stocks) {
      try {
        await this.syncOneCompanyProfile(stock);
        synced++;
        // Throttle: 200ms between requests to be polite to the CSE API
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        this.logger.warn(
          `Profile sync failed for ${stock.symbol}: ${String(err)}`,
        );
      }
    }
    this.logger.log(
      `Company profile sync complete: ${synced}/${stocks.length} stocks updated`,
    );
  }

  private async syncOneCompanyProfile(stock: Stock): Promise<void> {
    const raw = (await this.cseApiService.getCompanyProfile(stock.symbol)) as {
      reqComSumInfo?: Array<{
        peRatio?: number | string;
        pbRatio?: number | string;
        dividendYield?: number | string;
        high52Week?: number | string;
        low52Week?: number | string;
        earningsPerShare?: number | string;
        marketCapitalization?: number | string;
        bookValuePerShare?: number | string;
        debtToEquityRatio?: number | string;
        returnOnEquity?: number | string;
        sector?: string;
      }>;
    } | null;

    const info = raw?.reqComSumInfo?.[0];
    if (!info) return;

    const toNum = (v: unknown): number | null => {
      const n = parseFloat(String(v ?? ''));
      return isFinite(n) ? n : null;
    };

    // Update 52-week range on Stock entity
    const w52High = toNum(info.high52Week);
    const w52Low = toNum(info.low52Week);
    if (w52High !== null || w52Low !== null) {
      stock.week52_high = w52High ?? stock.week52_high;
      stock.week52_low = w52Low ?? stock.week52_low;
      await this.stockRepo.save(stock);
    }

    // Upsert CompanyFinancial for current year with valuation ratios
    const currentYear = String(new Date().getFullYear());
    const existing = await this.companyFinancialRepo.findOne({
      where: {
        symbol: stock.symbol,
        fiscal_year: currentYear,
        quarter: 'ANNUAL',
      },
    });

    const financialData = {
      pe_ratio: toNum(info.peRatio),
      pb_ratio: toNum(info.pbRatio),
      dividend_yield: toNum(info.dividendYield),
      earnings_per_share: toNum(info.earningsPerShare),
      return_on_equity: toNum(info.returnOnEquity),
      debt_to_equity: toNum(info.debtToEquityRatio),
      source: 'CSE_PROFILE',
      report_date: new Date(),
    };

    if (existing) {
      // Only update non-null values from API
      for (const [k, v] of Object.entries(financialData)) {
        if (v !== null) {
          (existing as unknown as Record<string, unknown>)[k] = v;
        }
      }
      await this.companyFinancialRepo.save(existing);
    } else {
      await this.companyFinancialRepo.save(
        this.companyFinancialRepo.create({
          symbol: stock.symbol,
          fiscal_year: currentYear,
          quarter: 'ANNUAL',
          ...Object.fromEntries(
            Object.entries(financialData).filter(([, v]) => v !== null),
          ),
          source: 'CSE_PROFILE',
          report_date: new Date(),
        }),
      );
    }
  }

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
    this.logger.log(`Running 12-factor stock scoring for ${today}`);
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
      const existing = await this.aiRecommendationRepo.findOne({
        where: { week_start: weekStart },
      });
      if (existing) {
        this.logger.log(`Recommendation already exists for ${weekStart}`);
        return;
      }

      // Gather all inputs in parallel
      const [weekSnaps, scores, holdings, modelPerf] = await Promise.all([
        this.marketSnapshotRepo.find({ order: { date: 'ASC' }, take: 5 }),
        this.stockScoreRepo.find({
          where: { date: this.todayStr() },
          order: { composite_score: 'DESC' },
          take: 10,
        }),
        this.portfolioService
          .getAllHoldings()
          .catch((): HoldingWithPnL[] => []),
        this.learningService.getModelPerformance().catch(() => null),
      ]);

      if (scores.length === 0) {
        this.logger.warn(
          'No stock scores available — insufficient data for recommendation',
        );
        return;
      }

      // Fetch tech signals and risk data in parallel
      const topSymbols = scores.map((s) => s.symbol);
      const [
        techSignals,
        positionRisks,
        recentNews,
        scoredWithFinancials,
        portfolioRisk,
        portfolioSummary,
      ] = await Promise.all([
        this.technicalService.getSignalsForSymbols(topSymbols),
        this.riskService.getPositionRisks(),
        this.fetchRelevantNews(topSymbols.map((s) => s.split('.')[0])),
        this.enrichScoresWithFinancials(scores),
        this.riskService.getPortfolioRiskSummary().catch(() => null),
        this.portfolioService.getSummary().catch(() => null),
      ]);

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
      const portfolioReturnPct =
        totalInvested > 0
          ? (((totalCurrent - totalInvested) / totalInvested) * 100).toFixed(1)
          : '0';
      const availableCash = portfolioSummary?.cash_balance ?? 0;
      const totalPortfolioValue = portfolioSummary?.total_value ?? totalCurrent;

      // ASPI trend
      const aspiTrend = weekSnaps
        .map(
          (s) =>
            `${s.date}: ASPI ${s.aspi_close ?? '?'} (${s.aspi_change_pct != null ? (Number(s.aspi_change_pct) > 0 ? '+' : '') + Number(s.aspi_change_pct).toFixed(2) + '%' : '?'})`,
        )
        .join(', ');

      // Top 10 stocks section with technical overlays
      const top10Section = scoredWithFinancials
        .map((item) => {
          const s = item.score;
          const fin = item.financial;
          const tech = techSignals.get(s.symbol);
          const techLine = tech
            ? `  Technical signals: ${tech.overall_signal} (score ${tech.signal_score}) | RSI ${tech.rsi_14 != null ? Number(tech.rsi_14).toFixed(1) : 'N/A'} (${tech.rsi_signal ?? 'N/A'}) | SMA trend: ${tech.sma_trend ?? 'N/A'} | MACD: ${tech.macd_crossover ?? 'N/A'} | Vol: ${tech.volume_trend ?? 'N/A'} | ATR: ${tech.atr_14 != null ? Number(tech.atr_14).toFixed(2) : 'N/A'} | Support: ${tech.support_20d != null ? Number(tech.support_20d).toFixed(2) : 'N/A'} | Resistance: ${tech.resistance_20d != null ? Number(tech.resistance_20d).toFixed(2) : 'N/A'}${tech.candlestick_pattern ? ` | Pattern: ${tech.candlestick_pattern}` : ''}`
            : '  Technical signals: Insufficient data for chart indicators';
          return [
            `${s.symbol}: Composite ${Number(s.composite_score).toFixed(1)}/100`,
            `  Fundamentals: EPS Growth=${Number(s.earnings_growth_score).toFixed(0)} Debt=${Number(s.debt_health_score).toFixed(0)} ROE=${Number(s.roe_score).toFixed(0)} RevTrend=${Number(s.revenue_trend_score).toFixed(0)}`,
            `  Valuation: PE=${Number(s.pe_score).toFixed(0)} PB=${Number(s.pb_score).toFixed(0)} DivYield=${Number(s.dividend_score).toFixed(0)}`,
            `  Scoring tech: Momentum=${Number(s.momentum_score).toFixed(0)} Volume=${Number(s.volume_score).toFixed(0)} 52wPos=${Number(s.week52_position_score).toFixed(0)} Volatility=${Number(s.volatility_score).toFixed(0)}`,
            `  Market: SectorStrength=${Number(s.sector_score).toFixed(0)} Liquidity=${Number(s.liquidity_score).toFixed(0)}`,
            techLine,
            fin
              ? `  Raw data: PE=${fin.pe_ratio ?? '?'} PB=${fin.pb_ratio ?? '?'} DivYield=${fin.dividend_yield != null ? fin.dividend_yield + '%' : '?'} ROE=${fin.return_on_equity != null ? fin.return_on_equity + '%' : '?'} D/E=${fin.debt_to_equity ?? '?'}`
              : '  Raw data: No financial data on record',
          ].join('\n');
        })
        .join('\n\n');

      // Portfolio section with risk overlay
      const portfolioSection =
        holdings.length > 0
          ? holdings
              .map((h) => {
                const risk = positionRisks.find((r) => r.symbol === h.symbol);
                const riskLine = risk
                  ? ` | Stop: LKR ${Number(risk.recommended_stop).toFixed(2)} | TP: LKR ${Number(risk.take_profit).toFixed(2)} | R:R ${Number(risk.risk_reward_ratio).toFixed(1)} | Heat: ${Number(risk.position_heat_pct).toFixed(1)}%`
                  : '';
                return `${h.symbol}: ${h.quantity} shares @ LKR ${Number(h.buy_price).toFixed(2)} cost | Current: LKR ${Number(h.current_price ?? 0).toFixed(2)} | P&L: ${Number(h.pnl_percent ?? 0).toFixed(1)}%${riskLine}`;
              })
              .join('\n')
          : 'No holdings yet (accumulating cash for first/next purchase)';

      // Position sizing context
      const maxRiskPerTrade = Math.round(totalPortfolioValue * 0.01);
      const sizingContext = `Available cash: LKR ${Math.round(availableCash).toLocaleString()}. Max risk per trade (1% rule): LKR ${maxRiskPerTrade.toLocaleString()}. Portfolio total: LKR ${Math.round(totalPortfolioValue).toLocaleString()}.`;

      // News section
      const newsSection =
        recentNews.length > 0
          ? recentNews
              .map(
                (n) =>
                  `- [${n.impact_level}] ${n.title} (${n.source}, ${new Date(n.published_at).toLocaleDateString('en-GB')})`,
              )
              .join('\n')
          : 'No stock-specific news this week';

      // Model performance (past track record)
      const perfSection =
        modelPerf && modelPerf.outcomes_tracked > 0
          ? `${modelPerf.total_recommendations} recommendations made, ${modelPerf.outcomes_tracked} outcomes tracked. ` +
            (modelPerf.win_rate_1m !== null
              ? `1-month win rate: ${(modelPerf.win_rate_1m * 100).toFixed(0)}%. `
              : '') +
            (modelPerf.avg_return_1m !== null
              ? `Avg 1M return: ${modelPerf.avg_return_1m.toFixed(1)}%. `
              : '') +
            (modelPerf.best_pick
              ? `Best pick: ${modelPerf.best_pick.symbol} (+${modelPerf.best_pick.return_1m.toFixed(1)}%). `
              : '') +
            (modelPerf.worst_pick
              ? `Worst pick: ${modelPerf.worst_pick.symbol} (${modelPerf.worst_pick.return_1m.toFixed(1)}%). `
              : '') +
            'Use this track record to calibrate confidence levels.'
          : 'No recommendation history yet — this is the first or early recommendation.';

      const prompt =
        `You are a senior equity research analyst with 20 years of experience on the Colombo Stock Exchange. ` +
        `You have personally navigated multiple market cycles including the 2008 crash, 2019 Easter bombings selloff, ` +
        `and 2022 sovereign debt crisis — generating consistent returns through all of them.\n\n` +
        `You are advising a Shariah-compliant retail investor using Rupee Cost Averaging (LKR 10,000/month).\n` +
        `Risk tolerance: Conservative (capital preservation first)\n` +
        `Strategy: Long-term wealth building via dividends + capital appreciation\n` +
        `Constraints: Shariah-compliant only (AAOIFI standards)\n` +
        `Order type: Always LIMIT orders (never market orders on CSE)\n\n` +
        `PORTFOLIO STATUS:\n` +
        `Invested: LKR ${Math.round(totalInvested).toLocaleString()}, Current: LKR ${Math.round(totalCurrent).toLocaleString()}, P&L: ${portfolioReturnPct}%\n` +
        `Holdings:\n${portfolioSection}\n` +
        (portfolioRisk
          ? `Portfolio heat: ${portfolioRisk.total_heat_pct.toFixed(1)}% (${portfolioRisk.risk_status})\n`
          : '') +
        `\nMARKET OVERVIEW (week of ${weekStart}):\n${aspiTrend}\n\n` +
        `TOP 10 SHARIAH-COMPLIANT STOCKS BY COMPOSITE SCORE:\n` +
        `(12-factor scores 0-100; 50 = neutral/no data. Technical indicators appended below each stock)\n\n` +
        `${top10Section}\n\n` +
        `POSITION SIZING (1% RISK RULE):\n${sizingContext}\n` +
        `To calculate suggested_shares: (entry_price - stop_loss) × shares = LKR ${maxRiskPerTrade.toLocaleString()}\n\n` +
        `STOCK-SPECIFIC NEWS THIS WEEK:\n${newsSection}\n\n` +
        `YOUR PAST TRACK RECORD:\n${perfSection}\n\n` +
        `UPCOMING EVENTS:\nCBSL rate decision March 25 2026; watch Q1 2026 earnings releases; IMF quarterly review\n\n` +
        `Based on ALL of this data, provide your recommendation.\n` +
        `For suggested_entry_price: use the nearest support level or current price if oversold.\n` +
        `For suggested_stop_loss: use ATR-based stop or support minus buffer — must be below entry.\n` +
        `For suggested_take_profit: at minimum 2:1 risk-reward ratio above entry.\n` +
        `For suggested_shares: use the 1% rule calculation above.\n\n` +
        `Output as valid JSON (no markdown, no explanation outside JSON) matching this exact schema:\n` +
        `{\n` +
        `  "recommended_stock": "SYMBOL.N0000",\n` +
        `  "confidence": "HIGH" | "MEDIUM" | "LOW",\n` +
        `  "reasoning": "Exactly 3 paragraphs: (1) Why this stock fundamentals+valuation (2) Why now: technical+market context (3) Risk factors and what would change your mind",\n` +
        `  "technical_summary": "1-2 sentences on current chart picture and timing",\n` +
        `  "price_outlook_3m": {\n` +
        `    "bear": {"price": <number>, "scenario": "<string>"},\n` +
        `    "base": {"price": <number>, "scenario": "<string>"},\n` +
        `    "bull": {"price": <number>, "scenario": "<string>"}\n` +
        `  },\n` +
        `  "risk_flags": ["<string>", ...],\n` +
        `  "alternative_stock": "SYMBOL.N0000",\n` +
        `  "portfolio_action": "BUY" | "HOLD" | "WAIT",\n` +
        `  "suggested_allocation_lkr": <number>,\n` +
        `  "suggested_entry_price": <number>,\n` +
        `  "suggested_stop_loss": <number>,\n` +
        `  "suggested_take_profit": <number>,\n` +
        `  "suggested_shares": <integer>,\n` +
        `  "order_type": "LIMIT"\n` +
        `}`;

      const { text, tokensConsumed } = await this.callClaude(
        model,
        prompt,
        1500,
      );
      await this.trackTokens(tokensConsumed);

      if (!text) {
        this.logger.warn('Claude returned empty response for recommendation');
        return;
      }

      let parsed: {
        recommended_stock?: string;
        confidence?: string;
        reasoning?: string;
        technical_summary?: string;
        price_outlook_3m?: unknown;
        risk_flags?: string[];
        alternative_stock?: string;
        alternative?: string;
        portfolio_action?: string;
        suggested_allocation_lkr?: number;
        suggested_entry_price?: number;
        suggested_stop_loss?: number;
        suggested_take_profit?: number;
        suggested_shares?: number;
        order_type?: string;
      };
      try {
        const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        parsed = JSON.parse(clean) as typeof parsed;
      } catch {
        this.logger.error(`Failed to parse recommendation JSON: ${text}`);
        return;
      }

      // Serialize price_outlook_3m as JSON string for the text column
      const outlook3m =
        parsed.price_outlook_3m != null
          ? JSON.stringify(parsed.price_outlook_3m)
          : null;

      const rec = this.aiRecommendationRepo.create({
        week_start: weekStart,
        recommended_stock: parsed.recommended_stock ?? scores[0].symbol,
        confidence: (parsed.confidence ?? 'MEDIUM').toUpperCase(),
        reasoning: parsed.reasoning ?? '',
        price_outlook_3m: outlook3m,
        risk_flags: parsed.risk_flags ?? [],
        alternative: parsed.alternative_stock ?? parsed.alternative ?? null,
        portfolio_action: parsed.portfolio_action ?? null,
        suggested_allocation_lkr: parsed.suggested_allocation_lkr ?? null,
        suggested_entry_price: parsed.suggested_entry_price ?? null,
        suggested_stop_loss: parsed.suggested_stop_loss ?? null,
        suggested_take_profit: parsed.suggested_take_profit ?? null,
        suggested_shares: parsed.suggested_shares ?? null,
        order_type: parsed.order_type ?? 'LIMIT',
        technical_summary: parsed.technical_summary ?? null,
        model_used: model,
        tokens_used: tokensConsumed,
      });
      await this.aiRecommendationRepo.save(rec);

      // Build actionable alert
      const confidenceEmoji =
        rec.confidence === 'HIGH'
          ? '🟢'
          : rec.confidence === 'LOW'
            ? '🔴'
            : '🟡';
      const tradeParams = rec.suggested_entry_price
        ? ` | Entry: LKR ${Number(rec.suggested_entry_price).toFixed(2)} | Stop: LKR ${Number(rec.suggested_stop_loss ?? 0).toFixed(2)} | TP: LKR ${Number(rec.suggested_take_profit ?? 0).toFixed(2)} | ${rec.suggested_shares ?? '?'} shares`
        : '';
      await this.createAlert(
        'ai_recommendation',
        `${confidenceEmoji} Weekly Pick: ${rec.recommended_stock} (${rec.confidence})${tradeParams}`,
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

    // Only return Shariah-compliant stocks — JOIN with stocks table to filter.
    const rows = await this.stockScoreRepo
      .createQueryBuilder('ss')
      .innerJoin(
        'stocks',
        's',
        "s.symbol = ss.symbol AND s.shariah_status = 'compliant'",
      )
      .where('ss.date = :date', { date: today })
      .orderBy('ss.composite_score', 'DESC')
      .take(limit)
      .getMany();

    if (rows.length === 0) {
      // Fallback: most recent scoring run, still compliant only
      return this.stockScoreRepo
        .createQueryBuilder('ss')
        .innerJoin(
          'stocks',
          's',
          "s.symbol = ss.symbol AND s.shariah_status = 'compliant'",
        )
        .orderBy('ss.date', 'DESC')
        .addOrderBy('ss.composite_score', 'DESC')
        .take(limit)
        .getMany();
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
    // Use distinct trade dates in daily_prices — this is what the scoring
    // engine actually reads, not market_snapshots (which accumulate slowly).
    const [dailyPriceDays, portCount, lastSnap, lastScore] = await Promise.all([
      this.dailyPriceRepo
        .createQueryBuilder('dp')
        .select('COUNT(DISTINCT dp.trade_date)', 'cnt')
        .getRawOne<{ cnt: string }>()
        .then((r) => parseInt(r?.cnt ?? '0', 10)),
      this.portfolioSnapshotRepo.count(),
      this.marketSnapshotRepo
        .find({ order: { date: 'DESC' }, take: 1 })
        .then((r) => r[0] ?? null),
      this.stockScoreRepo
        .find({ order: { date: 'DESC' }, take: 1 })
        .then((r) => r[0] ?? null),
    ]);

    const scoringReady = dailyPriceDays >= 20;
    return {
      market_snapshot_days: dailyPriceDays,
      portfolio_snapshot_days: portCount,
      scoring_ready: scoringReady,
      days_until_scoring_ready: Math.max(0, 20 - dailyPriceDays),
      last_snapshot_date: lastSnap ? String(lastSnap.date) : null,
      last_scoring_date: lastScore ? String(lastScore.date) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: snapshot builders
  // ---------------------------------------------------------------------------

  private async saveMarketSnapshot(date: string): Promise<void> {
    const [
      marketSummary,
      aspiData,
      snpData,
      topGainers,
      topLosers,
      allSectors,
    ] = await Promise.all([
      this.redisService.getJson<MarketSummaryCache>('cse:market_summary'),
      this.redisService.getJson<IndexDataCache>('cse:aspi_data'),
      this.redisService.getJson<IndexDataCache>('cse:snp_data'),
      this.redisService.getJson<TradeItem[]>('cse:top_gainers'),
      this.redisService.getJson<TradeItem[]>('cse:top_losers'),
      this.redisService.getJson<unknown[]>('cse:all_sectors'),
    ]);

    // ASPI: prefer dedicated aspi_data cache, fall back to legacy aspiIndex field,
    // finally fall back to the most recent MarketSummary DB row.
    let aspiClose: number | null =
      aspiData?.value ?? marketSummary?.aspiIndex ?? null;
    let aspiChangePct: number | null =
      aspiData?.percentage ?? marketSummary?.aspiChangePercent ?? null;
    let sp20Close: number | null =
      snpData?.value ?? marketSummary?.spSl20Index ?? null;
    let sp20ChangePct: number | null =
      snpData?.percentage ?? marketSummary?.spSl20ChangePercent ?? null;

    // Volume/turnover: raw CSE fields first, then normalised fields
    const totalVolume: number | null =
      marketSummary?.shareVolume ?? marketSummary?.totalVolume ?? null;
    const totalTurnover: number | null =
      marketSummary?.tradeVolume ?? marketSummary?.totalTurnover ?? null;
    const totalTrades: number | null =
      marketSummary?.trades ?? marketSummary?.totalTrades ?? null;

    // If Redis is empty (off-hours/restart), carry ASPI forward from the most
    // recent snapshot that has a value — avoids null gaps on weekends.
    if (aspiClose == null) {
      const lastSnap = await this.marketSnapshotRepo
        .createQueryBuilder('snap')
        .where('snap.aspi_close IS NOT NULL')
        .orderBy('snap.date', 'DESC')
        .take(1)
        .getOne()
        .catch(() => null);
      if (lastSnap) {
        aspiClose = lastSnap.aspi_close ? Number(lastSnap.aspi_close) : null;
        sp20Close = lastSnap.sp20_close ? Number(lastSnap.sp20_close) : null;
        // Change % is date-specific — leave null when carrying forward
        this.logger.warn(
          `Redis empty — carried ASPI ${aspiClose} from last snapshot (${lastSnap.date}) to ${date}`,
        );
      }
    }

    if (aspiClose == null && !marketSummary && !topGainers) {
      this.logger.warn(
        `No market data available for ${date} — skipping snapshot`,
      );
      return;
    }

    const snap: Partial<MarketSnapshot> = {
      date,
      aspi_close: aspiClose,
      aspi_change_pct: aspiChangePct,
      sp20_close: sp20Close,
      sp20_change_pct: sp20ChangePct,
      total_volume: totalVolume,
      total_turnover: totalTurnover,
      total_trades: totalTrades,
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
  // Private: 12-factor scoring engine
  // ---------------------------------------------------------------------------

  /**
   * Score all Shariah-compliant and pending stocks using the 12-factor model.
   *
   * CATEGORY 1 — Fundamentals (35%)
   *   earnings_growth  10%
   *   debt_health      10%
   *   roe               8%
   *   revenue_trend     7%
   *
   * CATEGORY 2 — Valuation (25%)
   *   pe_value         10%
   *   pb_value          5%
   *   dividend_yield   10%
   *
   * CATEGORY 3 — Technical/Momentum (25%)
   *   price_momentum    8%
   *   volume_trend      5%
   *   week52_position   7%
   *   volatility        5%
   *
   * CATEGORY 4 — Market Context (15%)
   *   sector_strength   8%
   *   liquidity         7%
   */
  private async scoreAllCompliantStocks(date: string): Promise<number> {
    const stocks = await this.stockRepo.find({
      where: [
        { shariah_status: 'compliant' },
        { shariah_status: 'pending_review' },
      ],
    });

    if (stocks.length === 0) return 0;

    const allSectors =
      (await this.redisService.getJson<
        Array<{ sector?: string; change?: number }>
      >('cse:all_sectors')) ?? [];
    const sectorScoreMap = this.buildSectorScoreMap(allSectors);

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

        if (dataDays === 0) continue;

        // Get latest CompanyFinancial (most recent ANNUAL record)
        const financials = await this.companyFinancialRepo.find({
          where: { symbol: stock.symbol, quarter: In(['ANNUAL', 'Q4']) },
          order: { fiscal_year: 'DESC' },
          take: 2,
        });
        const latestFin = financials[0] ?? null;
        const priorFin = financials[1] ?? null;

        const isPlaceholder = dataDays < 20;

        const scoreResult = this.computeStockScore({
          stock,
          prices,
          tradeMap,
          sectorScoreMap,
          dataDays,
          isPlaceholder,
          latestFin,
          priorFin,
        });

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
    latestFin: CompanyFinancial | null;
    priorFin: CompanyFinancial | null;
  }): Partial<StockScore> {
    const {
      stock,
      prices,
      tradeMap,
      sectorScoreMap,
      dataDays,
      isPlaceholder,
      latestFin,
      priorFin,
    } = input;

    if (isPlaceholder) {
      const sectorScore = sectorScoreMap.get(stock.sector ?? '') ?? NEUTRAL;
      const fundamentals = this.computeFundamentalsScores(latestFin, priorFin);
      return {
        composite_score: NEUTRAL,
        data_days: dataDays,
        is_placeholder: true,
        // Even placeholders get real fundamentals if data is available
        earnings_growth_score: fundamentals.earnings_growth_score,
        debt_health_score: fundamentals.debt_health_score,
        roe_score: fundamentals.roe_score,
        revenue_trend_score: fundamentals.revenue_trend_score,
        pe_score: fundamentals.pe_score,
        pb_score: fundamentals.pb_score,
        dividend_score: fundamentals.dividend_score,
        // Technical placeholders
        momentum_score: NEUTRAL,
        volume_score: NEUTRAL,
        week52_position_score: NEUTRAL,
        volatility_score: NEUTRAL,
        sector_score: sectorScore,
        liquidity_score: NEUTRAL,
        components: { note: `Only ${dataDays}/20 days of price data` },
      };
    }

    // ── Price data ──────────────────────────────────────────────────────────
    const closes = prices.map((p) => Number(p.close));
    const volumes = prices.map((p) => Number(p.volume));
    const turnovers = prices.map((p) => Number(p.turnover));

    const avg20Close = avg(closes);
    const avg20Volume = avg(volumes);
    const avg20Turnover = avg(turnovers);

    const trade = tradeMap.get(stock.symbol);
    const currentPrice = trade?.price ?? closes[0] ?? 0;

    // ── CATEGORY 3: Technical/Momentum (25%) ──────────────────────────────

    // Price Momentum (8%): current vs 20-day SMA
    const momentumRaw =
      avg20Close > 0 ? (currentPrice - avg20Close) / avg20Close : 0;
    const momentumPct = momentumRaw * 100;
    const momentumScore =
      momentumPct > 5 ? 90 : momentumPct > 0 ? 70 : momentumPct > -5 ? 50 : 30;

    // Volume Trend (5%): today vs 20-day avg
    const todayVolume = trade?.volume ?? volumes[0] ?? 0;
    const volumeRatio =
      avg20Volume > 0 ? (todayVolume / avg20Volume) * 100 : 100;
    const volumeScore =
      volumeRatio > 150
        ? 90
        : volumeRatio > 100
          ? 70
          : volumeRatio > 50
            ? 50
            : 30;

    // 52-Week Position (7%)
    const w52High = stock.week52_high ? Number(stock.week52_high) : null;
    const w52Low = stock.week52_low ? Number(stock.week52_low) : null;
    let week52PositionScore = NEUTRAL;
    let week52PositionPct: number | null = null;
    if (
      w52High !== null &&
      w52Low !== null &&
      w52High > w52Low &&
      currentPrice > 0
    ) {
      const range = w52High - w52Low;
      const posInRange = ((currentPrice - w52Low) / range) * 100;
      week52PositionPct = posInRange;
      // Near low = value opportunity, near high = potentially extended
      week52PositionScore = posInRange < 20 ? 80 : posInRange <= 80 ? 60 : 40;
    }

    // Volatility (5%): inverse std dev of daily returns — lower vol = higher score
    const returns: number[] = [];
    for (let i = 0; i < closes.length - 1; i++) {
      if (closes[i + 1] > 0) {
        returns.push((closes[i] - closes[i + 1]) / closes[i + 1]);
      }
    }
    const volatilityStdDev = stdDev(returns);
    const volatilityPct = volatilityStdDev * 100;
    const volatilityScore =
      volatilityPct < 2
        ? 90
        : volatilityPct < 3
          ? 70
          : volatilityPct < 5
            ? 50
            : 30;

    // ── CATEGORY 4: Market Context (15%) ─────────────────────────────────

    // Sector Strength (8%)
    const sectorScore = sectorScoreMap.get(stock.sector ?? '') ?? NEUTRAL;

    // Liquidity (7%): avg daily turnover LKR
    let liquidityScore: number;
    if (avg20Turnover > 10_000_000) liquidityScore = 100;
    else if (avg20Turnover > 5_000_000) liquidityScore = 80;
    else if (avg20Turnover > 1_000_000) liquidityScore = 60;
    else if (avg20Turnover > 100_000) liquidityScore = 40;
    else liquidityScore = 20;

    // ── CATEGORY 1 + 2: Fundamentals + Valuation ─────────────────────────
    const fundamentals = this.computeFundamentalsScores(latestFin, priorFin);

    // ── Composite (weighted sum) ──────────────────────────────────────────
    const composite =
      // Fundamentals 35%
      fundamentals.earnings_growth_score * 0.1 +
      fundamentals.debt_health_score * 0.1 +
      fundamentals.roe_score * 0.08 +
      fundamentals.revenue_trend_score * 0.07 +
      // Valuation 25%
      fundamentals.pe_score * 0.1 +
      fundamentals.pb_score * 0.05 +
      fundamentals.dividend_score * 0.1 +
      // Technical 25%
      momentumScore * 0.08 +
      volumeScore * 0.05 +
      week52PositionScore * 0.07 +
      volatilityScore * 0.05 +
      // Market 15%
      sectorScore * 0.08 +
      liquidityScore * 0.07;

    return {
      composite_score: Math.round(composite * 10) / 10,
      data_days: dataDays,
      is_placeholder: false,
      // Fundamentals
      earnings_growth_score: fundamentals.earnings_growth_score,
      debt_health_score: fundamentals.debt_health_score,
      roe_score: fundamentals.roe_score,
      revenue_trend_score: fundamentals.revenue_trend_score,
      // Valuation
      pe_score: fundamentals.pe_score,
      pb_score: fundamentals.pb_score,
      dividend_score: fundamentals.dividend_score,
      // Technical
      momentum_score: momentumScore,
      volume_score: volumeScore,
      week52_position_score: week52PositionScore,
      volatility_score: volatilityScore,
      // Market context
      sector_score: sectorScore,
      liquidity_score: liquidityScore,
      components: {
        current_price: currentPrice,
        avg_20d_close: Math.round(avg20Close * 100) / 100,
        avg_20d_volume: Math.round(avg20Volume),
        avg_20d_turnover_lkr: Math.round(avg20Turnover),
        volatility_pct: Math.round(volatilityPct * 100) / 100,
        momentum_pct: Math.round(momentumPct * 100) / 100,
        volume_ratio_pct: Math.round(volumeRatio),
        week52_position_pct:
          week52PositionPct !== null ? Math.round(week52PositionPct) : null,
        week52_high: w52High,
        week52_low: w52Low,
        pe_ratio: latestFin?.pe_ratio ?? null,
        pb_ratio: latestFin?.pb_ratio ?? null,
        dividend_yield: latestFin?.dividend_yield ?? null,
        roe: latestFin?.return_on_equity ?? null,
        debt_to_equity: latestFin?.debt_to_equity ?? null,
        financial_data_available: latestFin !== null,
        weights: {
          fundamentals: '35% (earnings10+debt10+roe8+rev7)',
          valuation: '25% (pe10+pb5+div10)',
          technical: '25% (momentum8+volume5+week52pos7+volatility5)',
          market_context: '15% (sector8+liquidity7)',
        },
      },
    };
  }

  /**
   * Score the 7 financial factors (Categories 1 + 2) from CompanyFinancial data.
   * Returns NEUTRAL (50) for any factor where data is unavailable.
   */
  private computeFundamentalsScores(
    latest: CompanyFinancial | null,
    prior: CompanyFinancial | null,
  ): FinancialFactors {
    const result: FinancialFactors = {
      earnings_growth_score: NEUTRAL,
      debt_health_score: NEUTRAL,
      roe_score: NEUTRAL,
      revenue_trend_score: NEUTRAL,
      pe_score: NEUTRAL,
      pb_score: NEUTRAL,
      dividend_score: NEUTRAL,
    };

    if (!latest) return result;

    // Earnings Growth (10%): compare EPS year-over-year
    const latestEps =
      latest.earnings_per_share != null
        ? Number(latest.earnings_per_share)
        : null;
    const priorEps =
      prior?.earnings_per_share != null
        ? Number(prior.earnings_per_share)
        : null;
    if (latestEps !== null && priorEps !== null && priorEps !== 0) {
      const growthPct = ((latestEps - priorEps) / Math.abs(priorEps)) * 100;
      result.earnings_growth_score =
        growthPct > 30
          ? 100
          : growthPct > 15
            ? 85
            : growthPct > 5
              ? 70
              : growthPct > 0
                ? 60
                : growthPct > -10
                  ? 40
                  : 20;
    } else if (latestEps !== null) {
      // Only one year of data — positive EPS is mildly good
      result.earnings_growth_score = latestEps > 0 ? 65 : 35;
    }

    // Debt Health (10%)
    const de =
      latest.debt_to_equity != null ? Number(latest.debt_to_equity) : null;
    if (de !== null) {
      result.debt_health_score =
        de < 0.3 ? 100 : de < 0.5 ? 80 : de < 1.0 ? 60 : de < 2.0 ? 30 : 10;
    }

    // ROE Quality (8%)
    const roe =
      latest.return_on_equity != null ? Number(latest.return_on_equity) : null;
    if (roe !== null) {
      result.roe_score =
        roe > 20 ? 100 : roe > 15 ? 85 : roe > 10 ? 70 : roe > 5 ? 50 : 30;
    }

    // Revenue Trend (7%)
    const latestRev =
      latest.total_revenue != null ? Number(latest.total_revenue) : null;
    const priorRev =
      prior?.total_revenue != null ? Number(prior.total_revenue) : null;
    if (latestRev !== null && priorRev !== null && priorRev > 0) {
      const revGrowthPct = ((latestRev - priorRev) / priorRev) * 100;
      result.revenue_trend_score =
        revGrowthPct > 20
          ? 100
          : revGrowthPct > 10
            ? 80
            : revGrowthPct > 0
              ? 60
              : 30;
    }

    // P/E Value (10%)
    const pe = latest.pe_ratio != null ? Number(latest.pe_ratio) : null;
    if (pe !== null) {
      if (pe <= 0) {
        result.pe_score = 10; // Negative earnings
      } else {
        result.pe_score =
          pe < 5
            ? 95
            : pe < 10
              ? 90
              : pe < 15
                ? 75
                : pe < 20
                  ? 60
                  : pe < 30
                    ? 40
                    : 20;
      }
    }

    // P/B Value (5%)
    const pb = latest.pb_ratio != null ? Number(latest.pb_ratio) : null;
    if (pb !== null && pb > 0) {
      result.pb_score = pb < 1.0 ? 90 : pb < 2.0 ? 75 : pb < 3.0 ? 60 : 40;
    }

    // Dividend Yield (10%)
    const divYield =
      latest.dividend_yield != null ? Number(latest.dividend_yield) : null;
    if (divYield !== null) {
      result.dividend_score =
        divYield > 8
          ? 100
          : divYield > 5
            ? 85
            : divYield > 3
              ? 70
              : divYield > 1
                ? 50
                : divYield > 0
                  ? 30
                  : 20;
    }

    return result;
  }

  private buildSectorScoreMap(
    sectors: Array<{ sector?: string; change?: number }>,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const s of sectors) {
      if (!s.sector) continue;
      const change = s.change ?? 0;
      // Sector strength vs ASPI: +2% above = 90, -2% below = 30
      const score = change > 2 ? 90 : change > 0 ? 70 : change > -2 ? 50 : 30;
      map.set(s.sector, score);
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // Private: news fetching for AI recommendation context
  // ---------------------------------------------------------------------------

  private async fetchRelevantNews(stockTickers: string[]): Promise<NewsItem[]> {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Get recent news items
      const allRecent = await this.newsItemRepo
        .createQueryBuilder('n')
        .where('n.published_at >= :cutoff', { cutoff: oneWeekAgo })
        .orderBy('n.published_at', 'DESC')
        .take(100)
        .getMany();

      // Filter for items mentioning any of our top stocks
      const relevant = allRecent.filter((item) => {
        const titleLower = item.title.toLowerCase();
        return stockTickers.some((ticker) => {
          const shortName = ticker.toLowerCase();
          return (
            titleLower.includes(shortName) ||
            (item.affected_symbols ?? []).some((s) => s.includes(ticker))
          );
        });
      });

      // Return top 10 relevant items, falling back to top 5 recent news if none match
      return relevant.length > 0
        ? relevant.slice(0, 10)
        : allRecent.slice(0, 5);
    } catch {
      return [];
    }
  }

  private async enrichScoresWithFinancials(
    scores: StockScore[],
  ): Promise<Array<{ score: StockScore; financial: CompanyFinancial | null }>> {
    const symbols = scores.map((s) => s.symbol);
    const financials = await this.companyFinancialRepo.find({
      where: { symbol: In(symbols), quarter: In(['ANNUAL', 'Q4']) },
      order: { fiscal_year: 'DESC' },
    });

    const latestBySymbol = new Map<string, CompanyFinancial>();
    for (const fin of financials) {
      if (!latestBySymbol.has(fin.symbol)) {
        latestBySymbol.set(fin.symbol, fin);
      }
    }

    return scores.map((score) => ({
      score,
      financial: latestBySymbol.get(score.symbol) ?? null,
    }));
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
