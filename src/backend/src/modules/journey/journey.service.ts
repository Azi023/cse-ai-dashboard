import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MonthlyDeposit,
  InvestmentGoal,
  Portfolio,
  Stock,
  MarketSummary,
} from '../../entities';
import { RedisService } from '../cse-data/redis.service';

interface RecordDepositDto {
  month: string;
  depositAmount: number;
  depositDate: string;
  notes?: string;
}

interface CreateGoalDto {
  targetAmount: number;
  targetDate?: string;
  label?: string;
}

interface UpdateGoalDto {
  targetAmount?: number;
  targetDate?: string;
  label?: string;
  is_active?: boolean;
}

export interface InvestmentKPIs {
  totalDeposited: number;
  currentPortfolioValue: number;
  totalProfitLoss: number;
  totalProfitLossPct: number;
  thisMonthReturn: number;
  thisMonthReturnPct: number;
  bestMonth: { month: string; returnPct: number } | null;
  worstMonth: { month: string; returnPct: number } | null;
  monthsInvested: number;
  positiveMonths: number;
  consecutiveDeposits: number;
  portfolioReturnPct: number;
  aspiReturnSamePeriod: number;
  beatingMarket: boolean;
  shariahCompliantPct: number;
  totalPurificationDue: number;
  totalDividendsReceived: number;
}

export interface PortfolioHealthScore {
  overallScore: number; // 0-100
  grade: string; // A, B, C, D, F
  diversification: { score: number; label: string };
  shariahCompliance: { score: number; label: string };
  riskLevel: { score: number; label: string };
  costEfficiency: { score: number; label: string };
  consistency: { score: number; label: string };
  suggestion: string;
}

@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    @InjectRepository(MonthlyDeposit)
    private readonly depositRepository: Repository<MonthlyDeposit>,
    @InjectRepository(InvestmentGoal)
    private readonly goalRepository: Repository<InvestmentGoal>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(MarketSummary)
    private readonly marketSummaryRepository: Repository<MarketSummary>,
    private readonly redisService: RedisService,
  ) {}

  // ─── Deposits ───────────────────────────────────────────────

  /**
   * Record a monthly deposit. Calculates cumulative_deposited
   * and snapshots the current portfolio value.
   */
  async recordDeposit(dto: RecordDepositDto): Promise<MonthlyDeposit> {
    // Get previous cumulative total
    const previousDeposits = await this.depositRepository.find({
      order: { month: 'DESC' },
      take: 1,
    });
    const previousCumulative =
      previousDeposits.length > 0
        ? Number(previousDeposits[0].cumulative_deposited)
        : 0;

    const cumulativeDeposited = previousCumulative + dto.depositAmount;

    // Snapshot current portfolio value
    const portfolioValue = await this.calculatePortfolioValue();

    const deposit = this.depositRepository.create({
      month: dto.month,
      deposit_amount: dto.depositAmount,
      deposit_date: new Date(dto.depositDate),
      cumulative_deposited: cumulativeDeposited,
      portfolio_value_at_deposit: portfolioValue,
      source: 'manual',
      notes: dto.notes ?? null,
    });

    const saved = await this.depositRepository.save(deposit);
    this.logger.log(
      `Recorded deposit: LKR ${dto.depositAmount} for ${dto.month} (cumulative: LKR ${cumulativeDeposited})`,
    );
    return saved;
  }

  // ─── Journey Timeline ───────────────────────────────────────

  /**
   * Full journey timeline — all monthly deposits with running totals.
   */
  async getJourneyData(): Promise<
    Array<{
      id: number;
      month: string;
      deposit_amount: number;
      deposit_date: Date;
      portfolio_value_at_deposit: number;
      cumulative_deposited: number;
      source: string;
      notes: string | null;
      created_at: Date;
      profitLoss: number;
      profitLossPct: number;
    }>
  > {
    const deposits = await this.depositRepository.find({
      order: { month: 'ASC' },
    });

    return deposits.map((d) => {
      const cumulative = Number(d.cumulative_deposited);
      const portfolioVal = Number(d.portfolio_value_at_deposit);
      const profitLoss = portfolioVal - cumulative;
      const profitLossPct =
        cumulative > 0 ? (profitLoss / cumulative) * 100 : 0;

      return {
        id: d.id,
        month: d.month,
        deposit_amount: Number(d.deposit_amount),
        deposit_date: d.deposit_date,
        portfolio_value_at_deposit: portfolioVal,
        cumulative_deposited: cumulative,
        source: d.source,
        notes: d.notes,
        created_at: d.created_at,
        profitLoss,
        profitLossPct,
      };
    });
  }

  // ─── KPIs ───────────────────────────────────────────────────

  /**
   * Calculate all beginner-friendly investment KPIs.
   */
  async getKPIs(): Promise<InvestmentKPIs> {
    // Total deposited
    const deposits = await this.depositRepository.find({
      order: { month: 'ASC' },
    });
    const totalDeposited = deposits.reduce(
      (sum, d) => sum + Number(d.deposit_amount),
      0,
    );

    // Current portfolio value (live)
    const currentPortfolioValue = await this.calculatePortfolioValue();

    // Total P&L
    const totalProfitLoss = currentPortfolioValue - totalDeposited;
    const totalProfitLossPct =
      totalDeposited > 0 ? (totalProfitLoss / totalDeposited) * 100 : 0;

    // This month's return
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const lastMonthDeposit = deposits.find((d) => d.month === lastMonth);
    const lastMonthPortfolioValue = lastMonthDeposit
      ? Number(lastMonthDeposit.portfolio_value_at_deposit)
      : totalDeposited;

    // This month's deposits
    const thisMonthDepositAmount = deposits
      .filter((d) => d.month === currentMonth)
      .reduce((sum, d) => sum + Number(d.deposit_amount), 0);

    // Return = current value - (last month value + this month deposits)
    const baselineForMonth = lastMonthPortfolioValue + thisMonthDepositAmount;
    const thisMonthReturn = currentPortfolioValue - baselineForMonth;
    const thisMonthReturnPct =
      baselineForMonth > 0 ? (thisMonthReturn / baselineForMonth) * 100 : 0;

    // Monthly returns for best/worst calculation
    const monthlyReturns: Array<{ month: string; returnPct: number }> = [];
    for (let i = 1; i < deposits.length; i++) {
      const prev = deposits[i - 1];
      const curr = deposits[i];
      const prevVal = Number(prev.portfolio_value_at_deposit);
      const currVal = Number(curr.portfolio_value_at_deposit);
      const depositInMonth = Number(curr.deposit_amount);
      // Return excluding the deposit made that month
      const returnVal = currVal - prevVal - depositInMonth;
      const returnPct = prevVal > 0 ? (returnVal / prevVal) * 100 : 0;
      monthlyReturns.push({ month: curr.month, returnPct });
    }

    const bestMonth =
      monthlyReturns.length > 0
        ? monthlyReturns.reduce((best, m) =>
            m.returnPct > best.returnPct ? m : best,
          )
        : null;

    const worstMonth =
      monthlyReturns.length > 0
        ? monthlyReturns.reduce((worst, m) =>
            m.returnPct < worst.returnPct ? m : worst,
          )
        : null;

    // Months invested
    const monthsInvested = deposits.length;

    // Positive months
    const positiveMonths = monthlyReturns.filter(
      (m) => m.returnPct > 0,
    ).length;

    // Consecutive deposit streak (from most recent)
    const consecutiveDeposits = this.calculateDepositStreak(deposits);

    // Portfolio return %
    const portfolioReturnPct = totalProfitLossPct;

    // ASPI return over same period
    const aspiReturnSamePeriod = await this.calculateAspiReturn(deposits);

    // Beating market?
    const beatingMarket = portfolioReturnPct > aspiReturnSamePeriod;

    // Shariah compliance %
    const shariahCompliantPct = await this.calculateShariahCompliantPct();

    // Purification and dividends from portfolio
    const { totalPurificationDue, totalDividendsReceived } =
      await this.calculatePurificationAndDividends();

    return {
      totalDeposited,
      currentPortfolioValue,
      totalProfitLoss,
      totalProfitLossPct,
      thisMonthReturn,
      thisMonthReturnPct,
      bestMonth,
      worstMonth,
      monthsInvested,
      positiveMonths,
      consecutiveDeposits,
      portfolioReturnPct,
      aspiReturnSamePeriod,
      beatingMarket,
      shariahCompliantPct,
      totalPurificationDue,
      totalDividendsReceived,
    };
  }

  // ─── Goals ──────────────────────────────────────────────────

  /**
   * Get all active goals with progress calculations.
   */
  async getGoals(): Promise<
    Array<{
      id: number;
      label: string | null;
      targetAmount: number;
      targetDate: Date | null;
      currentProgress: number;
      progressPercent: number;
      estimatedCompletionDate: string | null;
      monthlyDepositNeeded: number;
      onTrack: boolean;
      milestones: Array<{
        percent: number;
        label: string;
        reached: boolean;
      }>;
      createdAt: Date;
    }>
  > {
    const goals = await this.goalRepository.find({
      where: { is_active: true },
      order: { created_at: 'ASC' },
    });

    const currentValue = await this.calculatePortfolioValue();

    // Average monthly growth for projections
    const deposits = await this.depositRepository.find({
      order: { month: 'ASC' },
    });
    const avgMonthlyDeposit = await this.calculateAvgMonthlyDeposit(deposits);
    const avgMonthlyGrowthRate = this.calculateAvgMonthlyGrowthRate(deposits);

    return goals.map((goal) => {
      const targetAmount = Number(goal.target_amount);
      const progressPercent =
        targetAmount > 0
          ? Math.min((currentValue / targetAmount) * 100, 100)
          : 0;

      // Estimate completion date based on average monthly deposit + growth
      const remaining = targetAmount - currentValue;
      let estimatedCompletionDate: string | null = null;
      let monthlyDepositNeeded = 0;
      let onTrack = false;

      if (remaining <= 0) {
        // Goal already reached
        onTrack = true;
        estimatedCompletionDate = new Date().toISOString().slice(0, 10);
      } else if (avgMonthlyDeposit > 0 || avgMonthlyGrowthRate > 0) {
        // Project months to reach goal
        const monthsToGoal = this.estimateMonthsToGoal(
          currentValue,
          targetAmount,
          avgMonthlyDeposit,
          avgMonthlyGrowthRate,
        );

        if (monthsToGoal !== null && monthsToGoal < 600) {
          const estDate = new Date();
          estDate.setMonth(estDate.getMonth() + monthsToGoal);
          estimatedCompletionDate = estDate.toISOString().slice(0, 10);

          if (goal.target_date) {
            onTrack = estDate <= new Date(goal.target_date);
          } else {
            onTrack = true; // No deadline = always on track if progressing
          }
        }

        // Monthly deposit needed to hit target by target date
        if (goal.target_date) {
          const monthsLeft = this.monthsBetween(
            new Date(),
            new Date(goal.target_date),
          );
          if (monthsLeft > 0) {
            // Simple: remaining / months, ignoring growth for conservative estimate
            monthlyDepositNeeded = remaining / monthsLeft;
          }
        }
      }

      // Milestones
      const milestones = [25, 50, 75, 100].map((pct) => ({
        percent: pct,
        label: `${pct}% — LKR ${((targetAmount * pct) / 100).toLocaleString()}`,
        reached: progressPercent >= pct,
      }));

      return {
        id: goal.id,
        label: goal.label,
        targetAmount,
        targetDate: goal.target_date,
        currentProgress: currentValue,
        progressPercent,
        estimatedCompletionDate,
        monthlyDepositNeeded,
        onTrack,
        milestones,
        createdAt: goal.created_at,
      };
    });
  }

  /**
   * Create a new investment goal.
   */
  async createGoal(dto: CreateGoalDto): Promise<InvestmentGoal> {
    const goal = this.goalRepository.create({
      target_amount: dto.targetAmount,
      target_date: dto.targetDate ? new Date(dto.targetDate) : null,
      label: dto.label ?? null,
      is_active: true,
    });

    const saved = await this.goalRepository.save(goal);
    this.logger.log(
      `Created investment goal: LKR ${dto.targetAmount}${dto.label ? ` (${dto.label})` : ''}`,
    );
    return saved;
  }

  /**
   * Update an existing goal.
   */
  async updateGoal(id: number, dto: UpdateGoalDto): Promise<InvestmentGoal> {
    const goal = await this.goalRepository.findOne({ where: { id } });
    if (!goal) {
      throw new NotFoundException(`Goal with id ${id} not found`);
    }

    if (dto.targetAmount !== undefined) goal.target_amount = dto.targetAmount;
    if (dto.targetDate !== undefined)
      goal.target_date = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.label !== undefined) goal.label = dto.label ?? null;
    if (dto.is_active !== undefined) goal.is_active = dto.is_active;

    return this.goalRepository.save(goal);
  }

  /**
   * Delete a goal.
   */
  async deleteGoal(id: number): Promise<{ deleted: boolean }> {
    const goal = await this.goalRepository.findOne({ where: { id } });
    if (!goal) {
      throw new NotFoundException(`Goal with id ${id} not found`);
    }

    await this.goalRepository.remove(goal);
    return { deleted: true };
  }

  // ─── Portfolio Health ───────────────────────────────────────

  /**
   * Calculate a portfolio health score across multiple dimensions.
   */
  async getPortfolioHealthScore(): Promise<PortfolioHealthScore> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    if (holdings.length === 0) {
      return {
        overallScore: 0,
        grade: 'F',
        diversification: { score: 0, label: 'No holdings' },
        shariahCompliance: { score: 0, label: 'No holdings' },
        riskLevel: { score: 0, label: 'No holdings' },
        costEfficiency: { score: 0, label: 'No holdings' },
        consistency: { score: 0, label: 'No holdings' },
        suggestion: 'Start by adding your first stock to the portfolio.',
      };
    }

    const tradeData = await this.getTradeData();

    // 1. Diversification score (0-100)
    const diversification = this.scoreDiversification(holdings, tradeData);

    // 2. Shariah compliance score (0-100)
    const shariahCompliance = await this.scoreShariahCompliance(holdings);

    // 3. Risk level score (0-100, higher = lower risk = better)
    const riskLevel = await this.scoreRiskLevel(holdings, tradeData);

    // 4. Cost efficiency score (0-100)
    const costEfficiency = this.scoreCostEfficiency(holdings, tradeData);

    // 5. Consistency score (0-100) — based on deposit streak
    const consistency = await this.scoreConsistency();

    // Weighted overall score
    const overallScore = Math.round(
      diversification.score * 0.2 +
        shariahCompliance.score * 0.25 +
        riskLevel.score * 0.2 +
        costEfficiency.score * 0.15 +
        consistency.score * 0.2,
    );

    const grade = this.scoreToGrade(overallScore);
    const suggestion = this.generateSuggestion(
      diversification,
      shariahCompliance,
      riskLevel,
      costEfficiency,
      consistency,
    );

    return {
      overallScore,
      grade,
      diversification,
      shariahCompliance,
      riskLevel,
      costEfficiency,
      consistency,
      suggestion,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────

  /**
   * Get trade data from Redis cache for live prices.
   */
  private async getTradeData(): Promise<
    Map<string, { price: number; change: number }>
  > {
    const map = new Map<string, { price: number; change: number }>();
    const cached = await this.redisService.getJson<{
      reqTradeSummery?: Array<{
        symbol?: string;
        lastTradedPrice?: number;
        priceChange?: number;
      }>;
    }>('cse:trade_summary');

    const trades = cached?.reqTradeSummery ?? [];
    for (const t of trades) {
      if (t.symbol) {
        map.set(t.symbol, {
          price: t.lastTradedPrice ?? 0,
          change: t.priceChange ?? 0,
        });
      }
    }
    return map;
  }

  /**
   * Calculate total current portfolio value using live prices.
   */
  private async calculatePortfolioValue(): Promise<number> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    if (holdings.length === 0) return 0;

    const tradeData = await this.getTradeData();
    let totalValue = 0;

    for (const h of holdings) {
      const trade = tradeData.get(h.symbol);
      let currentPrice = trade?.price ?? null;

      if (currentPrice == null || currentPrice === 0) {
        const stock = await this.stockRepository.findOne({
          where: { symbol: h.symbol },
        });
        currentPrice = stock?.last_price
          ? Number(stock.last_price)
          : Number(h.buy_price);
      }

      totalValue += Number(h.quantity) * currentPrice;
    }

    return totalValue;
  }

  /**
   * Calculate consecutive deposit streak counting back from
   * the current month.
   */
  private calculateDepositStreak(deposits: MonthlyDeposit[]): number {
    if (deposits.length === 0) return 0;

    // Get unique months sorted descending
    const months = [
      ...new Set(deposits.map((d) => d.month)),
    ].sort((a, b) => b.localeCompare(a));

    let streak = 0;
    const now = new Date();
    let checkDate = new Date(now.getFullYear(), now.getMonth(), 1);

    for (let i = 0; i < 120; i++) {
      const checkMonth = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`;
      if (months.includes(checkMonth)) {
        streak++;
        checkDate.setMonth(checkDate.getMonth() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Calculate ASPI return over the same period as the user's deposits.
   */
  private async calculateAspiReturn(
    deposits: MonthlyDeposit[],
  ): Promise<number> {
    if (deposits.length === 0) return 0;

    const firstMonth = deposits[0].month; // e.g., '2026-01'
    const startDate = `${firstMonth}-01`;

    // Get earliest market summary near the start date
    const earliest = await this.marketSummaryRepository
      .createQueryBuilder('ms')
      .where('ms.summary_date >= :startDate', { startDate })
      .orderBy('ms.summary_date', 'ASC')
      .getOne();

    // Get latest market summary
    const latest = await this.marketSummaryRepository
      .createQueryBuilder('ms')
      .orderBy('ms.summary_date', 'DESC')
      .getOne();

    if (
      !earliest?.aspi_value ||
      !latest?.aspi_value ||
      Number(earliest.aspi_value) === 0
    ) {
      return 0;
    }

    return (
      ((Number(latest.aspi_value) - Number(earliest.aspi_value)) /
        Number(earliest.aspi_value)) *
      100
    );
  }

  /**
   * Calculate Shariah-compliant percentage of portfolio by value.
   */
  private async calculateShariahCompliantPct(): Promise<number> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    if (holdings.length === 0) return 0;

    const tradeData = await this.getTradeData();
    let totalValue = 0;
    let compliantValue = 0;

    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const trade = tradeData.get(h.symbol);
      const currentPrice =
        trade?.price ?? (stock?.last_price ? Number(stock.last_price) : 0);
      const value = Number(h.quantity) * currentPrice;

      totalValue += value;
      if (stock?.shariah_status === 'compliant') {
        compliantValue += value;
      }
    }

    return totalValue > 0 ? (compliantValue / totalValue) * 100 : 0;
  }

  /**
   * Calculate total purification due and total dividends received.
   */
  private async calculatePurificationAndDividends(): Promise<{
    totalPurificationDue: number;
    totalDividendsReceived: number;
  }> {
    const holdings = await this.portfolioRepository.find({
      where: { is_open: true },
    });

    let totalPurificationDue = 0;
    let totalDividendsReceived = 0;

    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const dividends = Number(h.dividends_received);
      const rate = Number(h.purification_rate);
      const status = stock?.shariah_status ?? 'unknown';

      totalDividendsReceived += dividends;
      // Purification applies to non-blacklisted stocks
      if (status !== 'non_compliant') {
        totalPurificationDue += dividends * rate;
      }
    }

    return { totalPurificationDue, totalDividendsReceived };
  }

  /**
   * Calculate average monthly deposit amount.
   */
  private async calculateAvgMonthlyDeposit(
    deposits: MonthlyDeposit[],
  ): Promise<number> {
    if (deposits.length === 0) return 0;
    const total = deposits.reduce(
      (sum, d) => sum + Number(d.deposit_amount),
      0,
    );
    return total / deposits.length;
  }

  /**
   * Calculate average monthly growth rate from deposit snapshots.
   */
  private calculateAvgMonthlyGrowthRate(deposits: MonthlyDeposit[]): number {
    if (deposits.length < 2) return 0;

    let totalGrowthRate = 0;
    let count = 0;

    for (let i = 1; i < deposits.length; i++) {
      const prevVal = Number(deposits[i - 1].portfolio_value_at_deposit);
      const currVal = Number(deposits[i].portfolio_value_at_deposit);
      const depositInMonth = Number(deposits[i].deposit_amount);

      if (prevVal > 0) {
        // Growth rate excluding the deposit contribution
        const growthRate = (currVal - prevVal - depositInMonth) / prevVal;
        totalGrowthRate += growthRate;
        count++;
      }
    }

    return count > 0 ? totalGrowthRate / count : 0;
  }

  /**
   * Estimate months needed to reach a target amount given
   * current value, monthly deposit, and average growth rate.
   */
  private estimateMonthsToGoal(
    currentValue: number,
    targetAmount: number,
    monthlyDeposit: number,
    monthlyGrowthRate: number,
  ): number | null {
    if (currentValue >= targetAmount) return 0;

    let value = currentValue;
    for (let month = 1; month <= 600; month++) {
      value = value * (1 + monthlyGrowthRate) + monthlyDeposit;
      if (value >= targetAmount) return month;
    }

    return null; // Unreachable within 50 years
  }

  /**
   * Months between two dates.
   */
  private monthsBetween(from: Date, to: Date): number {
    return (
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth())
    );
  }

  // ─── Health Score Helpers ───────────────────────────────────

  /**
   * Score diversification based on number of unique stocks and sectors,
   * and concentration (Herfindahl index).
   */
  private scoreDiversification(
    holdings: Portfolio[],
    tradeData: Map<string, { price: number; change: number }>,
  ): { score: number; label: string } {
    const uniqueSymbols = new Set(holdings.map((h) => h.symbol));
    const stockCount = uniqueSymbols.size;

    // Calculate weight concentration (Herfindahl-Hirschman Index)
    let totalValue = 0;
    const valueBySymbol = new Map<string, number>();

    for (const h of holdings) {
      const trade = tradeData.get(h.symbol);
      const price = trade?.price ?? Number(h.buy_price);
      const value = Number(h.quantity) * price;
      totalValue += value;
      valueBySymbol.set(
        h.symbol,
        (valueBySymbol.get(h.symbol) ?? 0) + value,
      );
    }

    let hhi = 0;
    if (totalValue > 0) {
      for (const value of valueBySymbol.values()) {
        const weight = value / totalValue;
        hhi += weight * weight;
      }
    }

    // Score: more stocks + lower concentration = better
    let score = 0;

    // Stock count component (0-50 points)
    if (stockCount >= 10) score += 50;
    else if (stockCount >= 7) score += 40;
    else if (stockCount >= 5) score += 30;
    else if (stockCount >= 3) score += 20;
    else score += 10;

    // HHI component (0-50 points) — lower HHI is better
    // HHI of 1 = single stock, HHI of 0.1 = well diversified
    if (hhi <= 0.1) score += 50;
    else if (hhi <= 0.15) score += 40;
    else if (hhi <= 0.25) score += 30;
    else if (hhi <= 0.4) score += 20;
    else score += 10;

    let label: string;
    if (score >= 80) label = 'Well diversified';
    else if (score >= 60) label = 'Moderately diversified';
    else if (score >= 40) label = 'Needs improvement';
    else label = 'Highly concentrated';

    return { score, label };
  }

  /**
   * Score Shariah compliance based on portfolio value compliance %.
   */
  private async scoreShariahCompliance(
    holdings: Portfolio[],
  ): Promise<{ score: number; label: string }> {
    let compliantCount = 0;

    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      if (stock?.shariah_status === 'compliant') {
        compliantCount++;
      }
    }

    const uniqueSymbols = new Set(holdings.map((h) => h.symbol)).size;
    const compliancePct =
      uniqueSymbols > 0 ? (compliantCount / uniqueSymbols) * 100 : 0;

    let score: number;
    let label: string;

    if (compliancePct >= 100) {
      score = 100;
      label = 'Fully Shariah compliant';
    } else if (compliancePct >= 80) {
      score = 80;
      label = 'Mostly compliant';
    } else if (compliancePct >= 50) {
      score = 50;
      label = 'Partially compliant';
    } else {
      score = 20;
      label = 'Needs attention';
    }

    return { score, label };
  }

  /**
   * Score risk level based on portfolio beta and concentration.
   * Higher score = lower risk = better.
   */
  private async scoreRiskLevel(
    holdings: Portfolio[],
    tradeData: Map<string, { price: number; change: number }>,
  ): Promise<{ score: number; label: string }> {
    let totalValue = 0;
    let weightedBeta = 0;

    for (const h of holdings) {
      const stock = await this.stockRepository.findOne({
        where: { symbol: h.symbol },
      });
      const trade = tradeData.get(h.symbol);
      const price = trade?.price ?? Number(h.buy_price);
      const value = Number(h.quantity) * price;
      totalValue += value;

      const beta = stock?.beta ? Number(stock.beta) : 1.0;
      weightedBeta += beta * value;
    }

    const portfolioBeta = totalValue > 0 ? weightedBeta / totalValue : 1.0;

    let score: number;
    let label: string;

    if (portfolioBeta <= 0.8) {
      score = 90;
      label = 'Low risk';
    } else if (portfolioBeta <= 1.0) {
      score = 75;
      label = 'Moderate risk';
    } else if (portfolioBeta <= 1.3) {
      score = 50;
      label = 'Above average risk';
    } else {
      score = 25;
      label = 'High risk';
    }

    return { score, label };
  }

  /**
   * Score cost efficiency — are holdings profitable?
   */
  private scoreCostEfficiency(
    holdings: Portfolio[],
    tradeData: Map<string, { price: number; change: number }>,
  ): { score: number; label: string } {
    let totalInvested = 0;
    let totalCurrentValue = 0;
    let profitableCount = 0;

    const uniqueSymbols = new Set<string>();

    for (const h of holdings) {
      const trade = tradeData.get(h.symbol);
      const currentPrice = trade?.price ?? Number(h.buy_price);
      const invested = Number(h.quantity) * Number(h.buy_price);
      const current = Number(h.quantity) * currentPrice;

      totalInvested += invested;
      totalCurrentValue += current;

      if (!uniqueSymbols.has(h.symbol)) {
        uniqueSymbols.add(h.symbol);
        if (current >= invested) profitableCount++;
      }
    }

    const overallReturnPct =
      totalInvested > 0
        ? ((totalCurrentValue - totalInvested) / totalInvested) * 100
        : 0;

    let score: number;
    let label: string;

    if (overallReturnPct >= 10) {
      score = 90;
      label = 'Excellent returns';
    } else if (overallReturnPct >= 5) {
      score = 75;
      label = 'Good returns';
    } else if (overallReturnPct >= 0) {
      score = 55;
      label = 'Breaking even';
    } else if (overallReturnPct >= -5) {
      score = 35;
      label = 'Slight loss';
    } else {
      score = 15;
      label = 'Significant loss';
    }

    return { score, label };
  }

  /**
   * Score consistency based on deposit streak.
   */
  private async scoreConsistency(): Promise<{ score: number; label: string }> {
    const deposits = await this.depositRepository.find({
      order: { month: 'ASC' },
    });
    const streak = this.calculateDepositStreak(deposits);

    let score: number;
    let label: string;

    if (streak >= 12) {
      score = 100;
      label = 'Excellent — 12+ month streak';
    } else if (streak >= 6) {
      score = 80;
      label = `Great — ${streak} month streak`;
    } else if (streak >= 3) {
      score = 60;
      label = `Good start — ${streak} month streak`;
    } else if (streak >= 1) {
      score = 30;
      label = `Building habit — ${streak} month streak`;
    } else {
      score = 0;
      label = 'No deposits yet';
    }

    return { score, label };
  }

  /**
   * Convert numeric score to letter grade.
   */
  private scoreToGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  /**
   * Generate a suggestion based on the lowest-scoring dimension.
   */
  private generateSuggestion(
    diversification: { score: number; label: string },
    shariahCompliance: { score: number; label: string },
    riskLevel: { score: number; label: string },
    costEfficiency: { score: number; label: string },
    consistency: { score: number; label: string },
  ): string {
    const dimensions = [
      {
        name: 'diversification',
        score: diversification.score,
        suggestion:
          'Consider adding more stocks from different sectors to reduce concentration risk.',
      },
      {
        name: 'shariahCompliance',
        score: shariahCompliance.score,
        suggestion:
          'Review your holdings for Shariah compliance. Consider replacing non-compliant stocks.',
      },
      {
        name: 'riskLevel',
        score: riskLevel.score,
        suggestion:
          'Your portfolio has higher risk. Consider adding some lower-beta defensive stocks.',
      },
      {
        name: 'costEfficiency',
        score: costEfficiency.score,
        suggestion:
          'Some holdings are underperforming. Review your entry prices and consider averaging down or rebalancing.',
      },
      {
        name: 'consistency',
        score: consistency.score,
        suggestion:
          'Build your investing habit by making regular monthly deposits. Consistency is key to long-term wealth.',
      },
    ];

    const weakest = dimensions.reduce((min, d) =>
      d.score < min.score ? d : min,
    );

    return weakest.suggestion;
  }
}
