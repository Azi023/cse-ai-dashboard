import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockScore } from '../../entities/stock-score.entity';
import { TechnicalSignal } from '../../entities/technical-signal.entity';
import { CompanyFinancial } from '../../entities/company-financial.entity';
import { Stock } from '../../entities/stock.entity';
import { RedisService } from '../cse-data/redis.service';
import { DemoService } from '../../demo/demo.service';
import { CreateDemoTradeDto } from '../../demo/dto/create-demo-trade.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAILY_BUDGET_PCT = 5.0;
const RISK_PER_TRADE_PCT = 1.0;
const DEFAULT_PORTFOLIO_LKR = 1_000_000;
const DAILY_RISK_KEY_PREFIX = 'opportunities:daily_risk:';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TradeItem {
  symbol?: string;
  price?: number;
}

export interface StrengthInfo {
  score: number;
  label: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  factors: string[];
}

export interface TradeOpportunity {
  rank: number;
  symbol: string;
  company_name: string;
  sector: string | null;
  direction: 'BUY';
  current_price: number;
  suggested_entry: number;
  stop_loss: number;
  take_profit: number;
  risk_reward_ratio: string;
  position_size_shares: number;
  position_value_lkr: number;
  risk_per_trade_lkr: number;
  risk_per_trade_pct: number;
  strength: StrengthInfo;
  shariah_status: string;
  composite_score: number;
  technical_signal: string;
  reasoning: string;
}

interface DailyRiskState {
  used_lkr: number;
  trades: string[];
}

export interface RiskSummary {
  daily_budget_pct: number;
  daily_budget_lkr: number;
  used_pct: number;
  used_lkr: number;
  remaining_pct: number;
  remaining_lkr: number;
  selected_trades: string[];
  selected_risk_total_pct: number;
}

export interface SelectionPreview {
  valid: boolean;
  trades: Array<{
    symbol: string;
    quantity: number;
    entry_price: number;
    risk_lkr: number;
    risk_pct: number;
  }>;
  total_risk_lkr: number;
  total_risk_pct: number;
  budget_remaining_after_lkr: number;
  exceeds_budget: boolean;
  message: string;
}

// ---------------------------------------------------------------------------

@Injectable()
export class TradeOpportunitiesService {
  private readonly logger = new Logger(TradeOpportunitiesService.name);

  constructor(
    @InjectRepository(StockScore)
    private readonly scoreRepo: Repository<StockScore>,
    @InjectRepository(TechnicalSignal)
    private readonly techRepo: Repository<TechnicalSignal>,
    @InjectRepository(CompanyFinancial)
    private readonly financialRepo: Repository<CompanyFinancial>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    private readonly redisService: RedisService,
    private readonly demoService: DemoService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /api/trade-opportunities
  // ---------------------------------------------------------------------------

  async getOpportunities(): Promise<TradeOpportunity[]> {
    const today = this.todayStr();

    // 1. Get stock scores — prefer today, fall back to most recent
    const scores = await this.getLatestScores();
    if (scores.length === 0) return [];

    const symbols = scores.map((s) => s.symbol);

    // 2. Fetch technical signals, live prices, stocks, financials in parallel
    const [techMap, liveMap, stockMap, financialMap] = await Promise.all([
      this.getTechSignals(symbols),
      this.getLivePrices(),
      this.getStockMap(symbols),
      this.getFinancialMap(symbols),
    ]);

    // 3. Get portfolio value for position sizing
    const portfolioValue = await this.getPortfolioValue();

    // 4. Build opportunity for each stock that has BUY/STRONG_BUY signal
    const opportunities: Array<TradeOpportunity & { _strengthScore: number }> =
      [];

    for (const score of scores) {
      const tech = techMap.get(score.symbol);
      if (!tech) continue;

      // Only consider BUY or STRONG_BUY signals
      if (tech.overall_signal !== 'BUY' && tech.overall_signal !== 'STRONG_BUY')
        continue;

      const stock = stockMap.get(score.symbol);
      if (!stock) continue;

      const financial = financialMap.get(score.symbol) ?? null;
      const livePrice = liveMap.get(score.symbol);

      const currentPrice = livePrice ?? Number(tech.close_price) ?? 0;
      if (currentPrice <= 0) continue;

      const atr = tech.atr_14 ? Number(tech.atr_14) : currentPrice * 0.03; // fallback: 3% of price
      const stopLoss = r2(
        Math.max(currentPrice * 0.85, currentPrice - 2 * atr),
      );
      const riskPerShare = r2(currentPrice - stopLoss);
      const takeProfit = r2(currentPrice + 2 * riskPerShare);

      if (riskPerShare <= 0) continue;

      // Position sizing: 1% risk rule
      const riskPerTradeLkr = r2(portfolioValue * (RISK_PER_TRADE_PCT / 100));
      const positionShares = Math.max(
        1,
        Math.floor(riskPerTradeLkr / riskPerShare),
      );
      const positionValueLkr = r2(positionShares * currentPrice);
      const actualRiskLkr = r2(positionShares * riskPerShare);
      const actualRiskPct = r2((actualRiskLkr / portfolioValue) * 100);

      // Strength score (1-10 scale)
      const strength = this.calculateStrength(
        score,
        tech,
        financial,
        stock.shariah_status,
      );

      const rrText = `1:${r2((2 * riskPerShare) / riskPerShare).toFixed(1)}`;

      opportunities.push({
        rank: 0,
        symbol: score.symbol,
        company_name: stock.name,
        sector: stock.sector,
        direction: 'BUY',
        current_price: currentPrice,
        suggested_entry: currentPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_reward_ratio: rrText,
        position_size_shares: positionShares,
        position_value_lkr: positionValueLkr,
        risk_per_trade_lkr: actualRiskLkr,
        risk_per_trade_pct: actualRiskPct,
        strength,
        shariah_status: stock.shariah_status.toUpperCase(),
        composite_score: r2(Number(score.composite_score)),
        technical_signal: tech.overall_signal ?? 'BUY',
        reasoning:
          tech.signal_summary ?? `${tech.overall_signal} signal on ${today}`,
        _strengthScore: strength.score,
      });
    }

    // Sort by strength score DESC, assign ranks
    opportunities.sort((a, b) => b._strengthScore - a._strengthScore);
    const top20 = opportunities.slice(0, 20);

    return top20.map((opp, i) => {
      const { _strengthScore: _, ...rest } = opp;
      return { ...rest, rank: i + 1 };
    });
  }

  // ---------------------------------------------------------------------------
  // GET /api/trade-opportunities/risk-summary
  // ---------------------------------------------------------------------------

  async getRiskSummary(accountId = 1): Promise<RiskSummary> {
    const portfolioValue = await this.getPortfolioValue(accountId);
    const dailyBudgetLkr = Math.round(
      portfolioValue * (DAILY_BUDGET_PCT / 100),
    );

    const today = this.todayStr();
    const riskKey = `${DAILY_RISK_KEY_PREFIX}${today}`;
    const riskState = await this.redisService.getJson<DailyRiskState>(riskKey);
    const usedLkr = riskState?.used_lkr ?? 0;
    const executedTrades = riskState?.trades ?? [];

    const usedPct = portfolioValue > 0 ? (usedLkr / portfolioValue) * 100 : 0;
    const remainingLkr = Math.max(0, dailyBudgetLkr - usedLkr);
    const remainingPct = Math.max(0, DAILY_BUDGET_PCT - usedPct);

    return {
      daily_budget_pct: DAILY_BUDGET_PCT,
      daily_budget_lkr: dailyBudgetLkr,
      used_pct: r2(usedPct),
      used_lkr: Math.round(usedLkr),
      remaining_pct: r2(remainingPct),
      remaining_lkr: Math.round(remainingLkr),
      selected_trades: executedTrades,
      selected_risk_total_pct: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // POST /api/trade-opportunities/select — validate + preview
  // ---------------------------------------------------------------------------

  async selectTrades(
    symbols: string[],
    _accountType: string,
  ): Promise<SelectionPreview> {
    if (!symbols || symbols.length === 0) {
      throw new BadRequestException('symbols array is required');
    }

    const opportunities = await this.getOpportunities();
    const oppMap = new Map(opportunities.map((o) => [o.symbol, o]));

    const portfolio = await this.getPortfolioValue();
    const riskSummary = await this.getRiskSummary();
    const remainingLkr = riskSummary.remaining_lkr;

    const trades: SelectionPreview['trades'] = [];
    let totalRiskLkr = 0;

    for (const symbol of symbols) {
      const opp = oppMap.get(symbol);
      if (!opp) {
        this.logger.warn(`Symbol ${symbol} not in current opportunities`);
        continue;
      }
      trades.push({
        symbol: opp.symbol,
        quantity: opp.position_size_shares,
        entry_price: opp.suggested_entry,
        risk_lkr: opp.risk_per_trade_lkr,
        risk_pct: opp.risk_per_trade_pct,
      });
      totalRiskLkr += opp.risk_per_trade_lkr;
    }

    const totalRiskPct = portfolio > 0 ? (totalRiskLkr / portfolio) * 100 : 0;
    const exceedsBudget = totalRiskLkr > remainingLkr;
    const budgetRemainingAfter = Math.max(0, remainingLkr - totalRiskLkr);

    return {
      valid: !exceedsBudget && trades.length > 0,
      trades,
      total_risk_lkr: Math.round(totalRiskLkr),
      total_risk_pct: r2(totalRiskPct),
      budget_remaining_after_lkr: Math.round(budgetRemainingAfter),
      exceeds_budget: exceedsBudget,
      message: exceedsBudget
        ? `Total risk LKR ${Math.round(totalRiskLkr).toLocaleString()} exceeds remaining daily budget LKR ${Math.round(remainingLkr).toLocaleString()}`
        : `${trades.length} trade(s) ready to execute. Total risk: LKR ${Math.round(totalRiskLkr).toLocaleString()} (${r2(totalRiskPct)}%)`,
    };
  }

  // ---------------------------------------------------------------------------
  // POST /api/trade-opportunities/execute
  // ---------------------------------------------------------------------------

  async executeTrades(
    symbols: string[],
    accountId: number,
  ): Promise<{ executed: string[]; failed: string[]; total_risk_lkr: number }> {
    if (!symbols || symbols.length === 0) {
      throw new BadRequestException('symbols array is required');
    }

    const opportunities = await this.getOpportunities();
    const oppMap = new Map(opportunities.map((o) => [o.symbol, o]));

    const executed: string[] = [];
    const failed: string[] = [];
    let totalRiskUsed = 0;

    for (const symbol of symbols) {
      const opp = oppMap.get(symbol);
      if (!opp) {
        failed.push(symbol);
        continue;
      }

      try {
        const dto: CreateDemoTradeDto = {
          demo_account_id: accountId,
          symbol: opp.symbol,
          direction: 'BUY',
          quantity: opp.position_size_shares,
          source: 'AI_SIGNAL',
          ai_reasoning: `Opportunity: ${opp.strength.label} signal (${opp.strength.score}/10). ${opp.reasoning}`,
        };

        await this.demoService.executeTrade(dto);
        executed.push(symbol);
        totalRiskUsed += opp.risk_per_trade_lkr;

        this.logger.log(
          `Executed opportunity trade: ${symbol} x${opp.position_size_shares} @ LKR ${opp.suggested_entry}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to execute trade for ${symbol}: ${String(err)}`,
        );
        failed.push(symbol);
      }
    }

    // Track daily risk usage in Redis
    if (totalRiskUsed > 0) {
      await this.updateDailyRisk(executed, totalRiskUsed);
    }

    return {
      executed,
      failed,
      total_risk_lkr: Math.round(totalRiskUsed),
    };
  }

  // ---------------------------------------------------------------------------
  // Strength score calculation
  // ---------------------------------------------------------------------------

  private calculateStrength(
    score: StockScore,
    tech: TechnicalSignal,
    financial: CompanyFinancial | null,
    shariahStatus: string,
  ): StrengthInfo {
    const factors: string[] = [];

    // ── Component 1: Composite score (40%) → 0-4 points ──────────────────────
    const compositeNorm = Number(score.composite_score) / 100;
    const compositePoints = compositeNorm * 4;

    // ── Component 2: Technical signal (30%) → 0-3 points ─────────────────────
    const techScore = tech.overall_signal;
    const techPoints =
      techScore === 'STRONG_BUY'
        ? 3.0
        : techScore === 'BUY'
          ? 2.1
          : techScore === 'NEUTRAL'
            ? 1.2
            : techScore === 'SELL'
              ? 0.6
              : 0;

    // Technical factors
    const rsi = tech.rsi_14 ? Number(tech.rsi_14) : null;
    if (rsi !== null) {
      if (rsi < 35)
        factors.push(`RSI ${rsi.toFixed(0)} — oversold, potential reversal`);
      else if (rsi < 50)
        factors.push(`RSI ${rsi.toFixed(0)} — approaching oversold`);
    }
    if (tech.macd_crossover === 'BULLISH')
      factors.push('MACD bullish crossover');
    else if (tech.macd_crossover === 'POSITIVE')
      factors.push('MACD positive momentum');
    if (tech.sma_trend === 'GOLDEN_CROSS')
      factors.push('Golden cross (20/50 SMA)');
    else if (tech.sma_trend === 'BULLISH')
      factors.push('Price above 20-day SMA');

    // ── Component 3: Fundamental quality (20%) → 0-2 points ──────────────────
    let fundamentalPoints = 0;

    const pe = financial?.pe_ratio ? Number(financial.pe_ratio) : null;
    const roe = financial?.return_on_equity
      ? Number(financial.return_on_equity)
      : null;
    const divYield = financial?.dividend_yield
      ? Number(financial.dividend_yield)
      : null;

    if (pe !== null && pe > 0 && pe < 15) {
      fundamentalPoints += 1.0;
      factors.push(`P/E ${pe.toFixed(2)} — below market average (undervalued)`);
    } else if (pe !== null && pe > 0 && pe < 25) {
      fundamentalPoints += 0.5;
      factors.push(`P/E ${pe.toFixed(2)} — reasonable valuation`);
    }

    if (roe !== null && roe > 0.1) {
      fundamentalPoints += 1.0;
      factors.push(`ROE ${(roe * 100).toFixed(1)}% — strong profitability`);
    } else if (roe !== null && roe > 0.05) {
      fundamentalPoints += 0.5;
      factors.push(`ROE ${(roe * 100).toFixed(1)}% — positive profitability`);
    }

    if (divYield !== null && divYield > 3) {
      factors.push(`Dividend yield ${divYield.toFixed(2)}%`);
    }

    // ── Component 4: Shariah bonus (10%) → 0-1 points ────────────────────────
    const shariahPoints = shariahStatus === 'compliant' ? 1.0 : 0;
    if (shariahStatus === 'compliant') factors.push('Shariah compliant');

    // Total score (max = 4 + 3 + 2 + 1 = 10)
    const raw =
      compositePoints + techPoints + fundamentalPoints + shariahPoints;
    const finalScore = Math.min(10, Math.max(0, Math.round(raw * 10) / 10));

    const label: StrengthInfo['label'] =
      finalScore >= 8
        ? 'VERY_STRONG'
        : finalScore >= 6
          ? 'STRONG'
          : finalScore >= 4
            ? 'MODERATE'
            : 'WEAK';

    // Ensure at least one factor
    if (factors.length === 0) factors.push(`${techScore} technical signal`);

    return { score: finalScore, label, factors };
  }

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------

  private async getLatestScores(): Promise<StockScore[]> {
    const today = this.todayStr();
    let scores = await this.scoreRepo.find({
      where: { date: today },
      order: { composite_score: 'DESC' },
    });

    if (scores.length === 0) {
      // Fall back to most recent scored date
      scores = await this.scoreRepo.find({
        order: { date: 'DESC', composite_score: 'DESC' },
        take: 100,
      });
    }

    return scores;
  }

  private async getTechSignals(
    symbols: string[],
  ): Promise<Map<string, TechnicalSignal>> {
    const today = this.todayStr();
    const result = new Map<string, TechnicalSignal>();

    for (const symbol of symbols) {
      const rows = await this.techRepo.find({
        where: [{ symbol, date: today }, { symbol }],
        order: { date: 'DESC' },
        take: 1,
      });
      if (rows[0]) result.set(symbol, rows[0]);
    }

    return result;
  }

  private async getLivePrices(): Promise<Map<string, number>> {
    const tradeSummary = await this.redisService.getJson<{
      reqTradeSummery?: TradeItem[];
    }>('cse:trade_summary');
    const map = new Map<string, number>();
    for (const t of tradeSummary?.reqTradeSummery ?? []) {
      if (t.symbol && t.price) map.set(t.symbol, t.price);
    }
    return map;
  }

  private async getStockMap(symbols: string[]): Promise<Map<string, Stock>> {
    const map = new Map<string, Stock>();
    if (symbols.length === 0) return map;
    const stocks = await this.stockRepo
      .createQueryBuilder('s')
      .where('s.symbol IN (:...symbols)', { symbols })
      .getMany();
    for (const s of stocks) map.set(s.symbol, s);
    return map;
  }

  private async getFinancialMap(
    symbols: string[],
  ): Promise<Map<string, CompanyFinancial>> {
    const map = new Map<string, CompanyFinancial>();
    for (const symbol of symbols) {
      const row = await this.financialRepo.findOne({
        where: { symbol },
        order: { fiscal_year: 'DESC', quarter: 'DESC' },
      });
      if (row) map.set(symbol, row);
    }
    return map;
  }

  private async getPortfolioValue(accountId = 1): Promise<number> {
    try {
      const account = await this.demoService.getAccount(accountId);
      const total = Number(account.total_value);
      return total > 0 ? total : DEFAULT_PORTFOLIO_LKR;
    } catch {
      return DEFAULT_PORTFOLIO_LKR;
    }
  }

  private async updateDailyRisk(
    symbols: string[],
    additionalRiskLkr: number,
  ): Promise<void> {
    const today = this.todayStr();
    const key = `${DAILY_RISK_KEY_PREFIX}${today}`;
    const existing = await this.redisService.getJson<DailyRiskState>(key);
    const newState: DailyRiskState = {
      used_lkr: (existing?.used_lkr ?? 0) + additionalRiskLkr,
      trades: [...(existing?.trades ?? []), ...symbols],
    };
    // TTL: 30 hours (persists through end of next trading day)
    await this.redisService.setJson(key, newState, 30 * 3600);
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
