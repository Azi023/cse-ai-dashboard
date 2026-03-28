import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyBacktestResult } from '../../entities/strategy-backtest-result.entity';
import {
  DailyPrice,
  Stock,
  CompanyFinancial,
  Dividend,
  MacroData,
  Announcement,
} from '../../entities';
import { RedisService } from '../cse-data/redis.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TradeRecord {
  symbol: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  return_pct: number;
  hold_days: number;
  exit_reason: string;
}

interface PriceData {
  dates: string[];
  closes: number[];
}

// ---------------------------------------------------------------------------
// StrategyBacktesterService
//
// Simulates each of the 5 strategy engine strategies against historical price
// data. Results are stored in `strategy_backtest_results` and used to:
//   1. Report real win rates and performance stats
//   2. Set strategy:active:{id} Redis keys so only validated strategies run
//   3. Surface performance numbers in the AI context block
// ---------------------------------------------------------------------------

@Injectable()
export class StrategyBacktesterService {
  private readonly logger = new Logger(StrategyBacktesterService.name);
  private readonly INITIAL_CAPITAL = 1_000_000; // LKR 1M demo portfolio
  private readonly WIN_RATE_THRESHOLD = 50; // min % to mark a strategy active

  constructor(
    @InjectRepository(StrategyBacktestResult)
    private readonly resultRepo: Repository<StrategyBacktestResult>,
    @InjectRepository(DailyPrice)
    private readonly priceRepo: Repository<DailyPrice>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(CompanyFinancial)
    private readonly financialRepo: Repository<CompanyFinancial>,
    @InjectRepository(Dividend)
    private readonly dividendRepo: Repository<Dividend>,
    @InjectRepository(MacroData)
    private readonly macroRepo: Repository<MacroData>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    private readonly redisService: RedisService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async runAllBacktests(): Promise<StrategyBacktestResult[]> {
    this.logger.log('[BACKTEST] Starting validation for all 5 strategy engine strategies...');

    const results = await Promise.all([
      this.backtestMeanReversion(),
      this.backtestValueCatalyst(),
      this.backtestRcaDisciplined(),
      this.backtestDividendCapture(),
      this.backtestSectorRotation(),
    ]);

    // Publish activation keys to Redis (7-day TTL — refreshed on each run)
    for (const result of results) {
      const isActive = Number(result.win_rate) >= this.WIN_RATE_THRESHOLD;
      await this.redisService.set(
        `strategy:active:${result.strategy_id}`,
        isActive ? 'true' : 'false',
        86400 * 7,
      );
      this.logger.log(
        `[BACKTEST] ${result.strategy_id}: ${result.total_trades} trades, ` +
          `${Number(result.win_rate).toFixed(1)}% win rate, ` +
          `${Number(result.total_return_pct).toFixed(1)}% total return — ` +
          `${isActive ? 'ACTIVE ✓' : 'INACTIVE (below 50% win rate)'}`,
      );
    }

    return results;
  }

  async getLatestResults(): Promise<StrategyBacktestResult[]> {
    // One result per strategy (latest run)
    const rows = await this.resultRepo.find({
      order: { run_date: 'DESC' },
    });
    // Deduplicate: keep the most recent per strategy_id
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (seen.has(r.strategy_id)) return false;
      seen.add(r.strategy_id);
      return true;
    });
  }

  async getResultsByStrategy(strategyId: string): Promise<StrategyBacktestResult[]> {
    return this.resultRepo.find({
      where: { strategy_id: strategyId },
      order: { run_date: 'DESC' },
      take: 5,
    });
  }

  // ---------------------------------------------------------------------------
  // Strategy A: MEAN_REVERSION
  // Entry: RSI14 < 30 AND price > 8% below SMA20 AND no negative news
  // Exit: price returns to SMA20 | 30-day time limit | -12% stop
  // ---------------------------------------------------------------------------

  private async backtestMeanReversion(): Promise<StrategyBacktestResult> {
    const strategyId = 'MEAN_REVERSION';
    this.logger.log('[BACKTEST] Simulating MEAN_REVERSION...');

    const compliantStocks = await this.stockRepo.find({
      where: { shariah_status: 'compliant', is_active: true },
      select: ['id', 'symbol'],
    });

    const allTrades: TradeRecord[] = [];
    let stocksTested = 0;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;

    for (const stock of compliantStocks) {
      const prices = await this.priceRepo.find({
        where: { stock_id: stock.id },
        order: { trade_date: 'ASC' },
        select: ['trade_date', 'close'],
      });

      if (prices.length < 50) continue;
      stocksTested++;

      const closes = prices.map((p) => Number(p.close));
      const dates = prices.map((p) => String(p.trade_date));

      if (!periodStart || dates[0] < periodStart) periodStart = dates[0];
      if (!periodEnd || dates[dates.length - 1] > periodEnd) periodEnd = dates[dates.length - 1];

      const rsi14 = this.calcRSI(closes, 14);
      const sma20 = this.calcSMA(closes, 20);

      let positionOpen = false;
      let entryIdx = 0;
      let entryPrice = 0;

      // Start at index 20: ensures both rsi14[i-14] and sma20[i-20] are valid
      for (let i = 20; i < closes.length; i++) {
        const currentRSI = rsi14[i - 14];
        const currentSMA20 = sma20[i - 20];
        const close = closes[i];
        const priceVsSma20Pct = ((close - currentSMA20) / currentSMA20) * 100;

        if (!positionOpen) {
          if (currentRSI < 30 && priceVsSma20Pct < -8) {
            positionOpen = true;
            entryIdx = i;
            entryPrice = close;
          }
        } else {
          const holdDays = i - entryIdx;
          const returnPct = ((close - entryPrice) / entryPrice) * 100;
          const exitSMA20 = sma20[i - 20];

          let exitReason: string | null = null;
          if (close >= exitSMA20) exitReason = 'mean_reversion_target';
          else if (holdDays > 30) exitReason = 'time_exit';
          else if (returnPct < -12) exitReason = 'stop_loss';

          if (exitReason) {
            allTrades.push({
              symbol: stock.symbol,
              entry_date: dates[entryIdx],
              entry_price: entryPrice,
              exit_date: dates[i],
              exit_price: close,
              return_pct: Math.round(returnPct * 100) / 100,
              hold_days: holdDays,
              exit_reason: exitReason,
            });
            positionOpen = false;
          }
        }
      }

      // Close any still-open position at end of period
      if (positionOpen) {
        const lastClose = closes[closes.length - 1];
        const holdDays = closes.length - 1 - entryIdx;
        const returnPct = ((lastClose - entryPrice) / entryPrice) * 100;
        allTrades.push({
          symbol: stock.symbol,
          entry_date: dates[entryIdx],
          entry_price: entryPrice,
          exit_date: dates[closes.length - 1],
          exit_price: lastClose,
          return_pct: Math.round(returnPct * 100) / 100,
          hold_days: holdDays,
          exit_reason: 'period_end',
        });
      }
    }

    return this.persistResult(
      this.buildResult(strategyId, 'Mean Reversion', allTrades, stocksTested, periodStart, periodEnd),
    );
  }

  // ---------------------------------------------------------------------------
  // Strategy B: VALUE_CATALYST
  // Entry: P/E < 12 AND dividend_yield > 3% AND any announcement exists
  // Exit: 180-day time limit | -15% stop
  // Note: Uses current-day fundamental data as a static screen (no historical P/E series)
  // ---------------------------------------------------------------------------

  private async backtestValueCatalyst(): Promise<StrategyBacktestResult> {
    const strategyId = 'VALUE_CATALYST';
    this.logger.log('[BACKTEST] Simulating VALUE_CATALYST...');

    // Symbols with P/E < 12 AND div yield > 3% (latest record per symbol)
    const rawFinancials = await this.financialRepo
      .createQueryBuilder('cf')
      .select('cf.symbol', 'symbol')
      .addSelect('cf.pe_ratio', 'pe_ratio')
      .addSelect('cf.dividend_yield', 'dividend_yield')
      .where('cf.pe_ratio IS NOT NULL AND cf.pe_ratio > 0 AND cf.pe_ratio < 12')
      .andWhere('cf.dividend_yield IS NOT NULL AND cf.dividend_yield > 3')
      .orderBy('cf.created_at', 'DESC')
      .getRawMany<{ symbol: string; pe_ratio: string; dividend_yield: string }>();

    // Deduplicate: keep latest per symbol
    const qualifiedSymbols = new Map<string, boolean>();
    for (const f of rawFinancials) {
      if (!qualifiedSymbols.has(f.symbol)) qualifiedSymbols.set(f.symbol, true);
    }

    // Symbols that have any announcement (catalyst proxy)
    const announcedRaw = await this.announcementRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.symbol', 'symbol')
      .where('a.symbol IS NOT NULL')
      .getRawMany<{ symbol: string }>();
    const hasAnnouncement = new Set(announcedRaw.map((r) => r.symbol));

    // Compliant stock IDs
    const compliantStocks = await this.stockRepo.find({
      where: { shariah_status: 'compliant', is_active: true },
      select: ['id', 'symbol'],
    });

    const allTrades: TradeRecord[] = [];
    let stocksTested = 0;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;

    for (const stock of compliantStocks) {
      if (!qualifiedSymbols.has(stock.symbol)) continue;
      if (!hasAnnouncement.has(stock.symbol)) continue;

      const prices = await this.priceRepo.find({
        where: { stock_id: stock.id },
        order: { trade_date: 'ASC' },
        select: ['trade_date', 'close'],
      });

      if (prices.length < 60) continue;
      stocksTested++;

      const closes = prices.map((p) => Number(p.close));
      const dates = prices.map((p) => String(p.trade_date));

      if (!periodStart || dates[0] < periodStart) periodStart = dates[0];
      if (!periodEnd || dates[dates.length - 1] > periodEnd) periodEnd = dates[dates.length - 1];

      // One entry per stock: buy on day 60, hold until exit or 180 days
      const entryIdx = 60;
      const entryPrice = closes[entryIdx];

      let exited = false;
      for (let i = entryIdx + 1; i < closes.length; i++) {
        const holdDays = i - entryIdx;
        const returnPct = ((closes[i] - entryPrice) / entryPrice) * 100;

        let exitReason: string | null = null;
        if (holdDays > 180) exitReason = 'time_exit';
        else if (returnPct < -15) exitReason = 'stop_loss';

        if (exitReason) {
          allTrades.push({
            symbol: stock.symbol,
            entry_date: dates[entryIdx],
            entry_price: entryPrice,
            exit_date: dates[i],
            exit_price: closes[i],
            return_pct: Math.round(returnPct * 100) / 100,
            hold_days: holdDays,
            exit_reason: exitReason,
          });
          exited = true;
          break;
        }
      }

      if (!exited) {
        const lastClose = closes[closes.length - 1];
        const holdDays = closes.length - 1 - entryIdx;
        const returnPct = ((lastClose - entryPrice) / entryPrice) * 100;
        allTrades.push({
          symbol: stock.symbol,
          entry_date: dates[entryIdx],
          entry_price: entryPrice,
          exit_date: dates[closes.length - 1],
          exit_price: lastClose,
          return_pct: Math.round(returnPct * 100) / 100,
          hold_days: holdDays,
          exit_reason: 'period_end',
        });
      }
    }

    const notes =
      `${stocksTested} stocks passed P/E < 12 + dividend yield > 3% + catalyst screen. ` +
      `One entry per stock at day 60. Static fundamental screen (no historical P/E series).`;

    return this.persistResult(
      this.buildResult(strategyId, 'Value + Catalyst', allTrades, stocksTested, periodStart, periodEnd, notes),
    );
  }

  // ---------------------------------------------------------------------------
  // Strategy C: RCA_DISCIPLINED
  // Monthly LKR 10,000 on days 1–3 of each month, top stock by dividend yield
  // No sell — calculate portfolio return vs total invested
  // ---------------------------------------------------------------------------

  private async backtestRcaDisciplined(): Promise<StrategyBacktestResult> {
    const strategyId = 'RCA_DISCIPLINED';
    this.logger.log('[BACKTEST] Simulating RCA_DISCIPLINED...');

    // Get top compliant symbols by dividend yield
    const rawFinancials = await this.financialRepo
      .createQueryBuilder('cf')
      .select('cf.symbol', 'symbol')
      .addSelect('MAX(cf.dividend_yield)', 'max_yield')
      .where('cf.dividend_yield IS NOT NULL AND cf.dividend_yield > 0')
      .groupBy('cf.symbol')
      .orderBy('max_yield', 'DESC')
      .limit(20)
      .getRawMany<{ symbol: string; max_yield: string }>();

    const compliantSymbols = new Set(
      (await this.stockRepo.find({
        where: { shariah_status: 'compliant', is_active: true },
        select: ['symbol'],
      })).map((s) => s.symbol),
    );

    const topSymbols = rawFinancials
      .filter((f) => compliantSymbols.has(f.symbol))
      .slice(0, 5)
      .map((f) => f.symbol);

    if (topSymbols.length === 0) {
      return this.persistResult(
        this.buildEmptyResult(strategyId, 'Rupee Cost Averaging', 'No compliant stocks with dividend yield data'),
      );
    }

    // Use the top-yield stock as the primary target
    const primarySymbol = topSymbols[0];
    const primaryStock = await this.stockRepo.findOne({ where: { symbol: primarySymbol } });
    if (!primaryStock) {
      return this.persistResult(
        this.buildEmptyResult(strategyId, 'Rupee Cost Averaging', `Stock not found: ${primarySymbol}`),
      );
    }

    const prices = await this.priceRepo.find({
      where: { stock_id: primaryStock.id },
      order: { trade_date: 'ASC' },
      select: ['trade_date', 'close'],
    });

    if (prices.length < 20) {
      return this.persistResult(
        this.buildEmptyResult(strategyId, 'Rupee Cost Averaging', `Insufficient price data for ${primarySymbol}`),
      );
    }

    const closes = prices.map((p) => Number(p.close));
    const dates = prices.map((p) => String(p.trade_date));
    const MONTHLY_BUDGET = 10_000;

    const allTrades: TradeRecord[] = [];
    let lastBuyMonth = -1;
    let totalShares = 0;
    let totalInvested = 0;
    const periodStart = dates[0];
    const periodEnd = dates[dates.length - 1];
    const finalPrice = closes[closes.length - 1];

    for (let i = 0; i < closes.length; i++) {
      const d = new Date(dates[i]);
      const dayOfMonth = d.getDate();
      const month = d.getMonth() + d.getFullYear() * 12; // unique monthly key

      if (dayOfMonth <= 3 && month !== lastBuyMonth) {
        const price = closes[i];
        const shares = Math.floor(MONTHLY_BUDGET / price);
        if (shares > 0) {
          totalShares += shares;
          totalInvested += shares * price;
          lastBuyMonth = month;

          const returnPct = ((finalPrice - price) / price) * 100;
          allTrades.push({
            symbol: primarySymbol,
            entry_date: dates[i],
            entry_price: price,
            exit_date: periodEnd,
            exit_price: finalPrice,
            return_pct: Math.round(returnPct * 100) / 100,
            hold_days: closes.length - 1 - i,
            exit_reason: 'period_end',
          });
        }
      }
    }

    const finalValue = totalShares * finalPrice;
    const portfolioReturnPct = totalInvested > 0
      ? ((finalValue - totalInvested) / totalInvested) * 100
      : 0;

    const notes =
      `Target: ${primarySymbol} (top-yield compliant stock). ` +
      `Invested LKR ${totalInvested.toFixed(0)}, final value LKR ${finalValue.toFixed(0)} ` +
      `(${portfolioReturnPct.toFixed(1)}% total portfolio return). ` +
      `${allTrades.length} monthly buys over ${dates.length} trading days.`;

    return this.persistResult(
      this.buildResult(strategyId, 'Rupee Cost Averaging', allTrades, 1, periodStart, periodEnd, notes),
    );
  }

  // ---------------------------------------------------------------------------
  // Strategy D: DIVIDEND_CAPTURE
  // Buy 10–15 days before ex-date, exit 10 days after; skip if no dividend data
  // ---------------------------------------------------------------------------

  private async backtestDividendCapture(): Promise<StrategyBacktestResult> {
    const strategyId = 'DIVIDEND_CAPTURE';
    this.logger.log('[BACKTEST] Simulating DIVIDEND_CAPTURE...');

    const compliantSymbols = (await this.stockRepo.find({
      where: { shariah_status: 'compliant', is_active: true },
      select: ['symbol'],
    })).map((s) => s.symbol);

    const dividends = await this.dividendRepo
      .createQueryBuilder('d')
      .where('d.symbol IN (:...symbols)', { symbols: compliantSymbols })
      .andWhere('d.ex_date IS NOT NULL')
      .andWhere('d.amount_per_share > 0')
      .orderBy('d.ex_date', 'ASC')
      .getMany();

    if (dividends.length === 0) {
      this.logger.warn('[BACKTEST] DIVIDEND_CAPTURE: skipped — no ex-date data available');
      return this.persistResult(
        this.buildEmptyResult(
          strategyId,
          'Dividend Capture',
          'DIVIDEND_CAPTURE: skipped — no ex-date data available for compliant stocks',
        ),
      );
    }

    const allTrades: TradeRecord[] = [];
    let stocksTested = 0;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;

    for (const div of dividends) {
      const stock = await this.stockRepo.findOne({ where: { symbol: div.symbol } });
      if (!stock) continue;

      const exDate = new Date(div.ex_date);
      const targetEntry = new Date(exDate);
      targetEntry.setDate(targetEntry.getDate() - 12);
      const targetExit = new Date(exDate);
      targetExit.setDate(targetExit.getDate() + 10);

      const prices = await this.priceRepo.find({
        where: { stock_id: stock.id },
        order: { trade_date: 'ASC' },
        select: ['trade_date', 'close'],
      });

      if (prices.length < 20) continue;

      const entryPoint = this.getPriceOnOrAfter(prices, targetEntry);
      const exitPoint = this.getPriceOnOrAfter(prices, targetExit);
      if (!entryPoint || !exitPoint) continue;

      stocksTested++;

      if (!periodStart || entryPoint.date < periodStart) periodStart = entryPoint.date;
      if (!periodEnd || exitPoint.date > periodEnd) periodEnd = exitPoint.date;

      const divAmount = Number(div.amount_per_share);
      const priceReturn = exitPoint.close - entryPoint.close;
      const totalReturn = priceReturn + divAmount;
      const returnPct = (totalReturn / entryPoint.close) * 100;
      const holdDays = Math.round(
        (new Date(exitPoint.date).getTime() - new Date(entryPoint.date).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      allTrades.push({
        symbol: div.symbol,
        entry_date: entryPoint.date,
        entry_price: entryPoint.close,
        exit_date: exitPoint.date,
        exit_price: exitPoint.close,
        return_pct: Math.round(returnPct * 100) / 100,
        hold_days: holdDays,
        exit_reason: `post_div_exit (div LKR ${divAmount.toFixed(2)}/share)`,
      });
    }

    return this.persistResult(
      this.buildResult(strategyId, 'Dividend Capture', allTrades, stocksTested, periodStart, periodEnd),
    );
  }

  // ---------------------------------------------------------------------------
  // Strategy E: SECTOR_ROTATION
  // Rate-cutting cycle → overweight construction stocks vs equal-weight benchmark
  // Monthly rebalance; win = rotated portfolio outperforms benchmark that month
  // ---------------------------------------------------------------------------

  private async backtestSectorRotation(): Promise<StrategyBacktestResult> {
    const strategyId = 'SECTOR_ROTATION';
    this.logger.log('[BACKTEST] Simulating SECTOR_ROTATION...');

    // Macro data to detect rate-cutting cycle
    const rateData = await this.macroRepo.find({
      where: { indicator: 'interest_rate' },
      order: { data_date: 'ASC' },
    });
    const isRateCutting = this.detectRateCuttingCycle(rateData);

    // Construction / infrastructure stocks (construction sector or AEL proxy)
    const sectorStocks = await this.stockRepo.find({
      where: { shariah_status: 'compliant', is_active: true, sector: 'Construction' },
      select: ['id', 'symbol'],
    });
    const ael = await this.stockRepo.findOne({ where: { symbol: 'AEL.N0000' } });
    if (ael && !sectorStocks.find((s) => s.symbol === 'AEL.N0000')) {
      sectorStocks.push(ael);
    }

    // All compliant stocks for benchmark
    const allCompliant = await this.stockRepo.find({
      where: { shariah_status: 'compliant', is_active: true },
      select: ['id', 'symbol'],
    });

    if (allCompliant.length === 0) {
      return this.persistResult(
        this.buildEmptyResult(strategyId, 'Sector Rotation', 'No compliant stocks found'),
      );
    }

    // Load price data for target and benchmark stocks
    const priceDataMap = new Map<string, PriceData>();
    const stocksToLoad = [
      ...sectorStocks,
      ...allCompliant.slice(0, 25),
    ];

    for (const stock of stocksToLoad) {
      if (priceDataMap.has(stock.symbol)) continue;
      const prices = await this.priceRepo.find({
        where: { stock_id: stock.id },
        order: { trade_date: 'ASC' },
        select: ['trade_date', 'close'],
      });
      if (prices.length >= 30) {
        priceDataMap.set(stock.symbol, {
          dates: prices.map((p) => String(p.trade_date)),
          closes: prices.map((p) => Number(p.close)),
        });
      }
    }

    if (priceDataMap.size === 0) {
      return this.persistResult(
        this.buildEmptyResult(strategyId, 'Sector Rotation', 'No price data available'),
      );
    }

    // Build date-indexed price lookup for O(1) access
    const datePriceIndex = this.buildDatePriceIndex(priceDataMap);

    // Collect all trading dates
    const allDates = new Set<string>();
    for (const data of priceDataMap.values()) {
      for (const d of data.dates) allDates.add(d);
    }
    const sortedDates = Array.from(allDates).sort();

    const targetSymbols = (isRateCutting && sectorStocks.length > 0)
      ? sectorStocks.map((s) => s.symbol).filter((s) => priceDataMap.has(s))
      : allCompliant.slice(0, 10).map((s) => s.symbol).filter((s) => priceDataMap.has(s));

    const benchmarkSymbols = allCompliant
      .filter((s) => priceDataMap.has(s.symbol))
      .map((s) => s.symbol)
      .slice(0, 20);

    const allTrades: TradeRecord[] = [];
    let lastRebalanceMonth = -1;
    let rotatedCapital = this.INITIAL_CAPITAL;
    let benchmarkCapital = this.INITIAL_CAPITAL;
    let rotatedPositions: Map<string, { shares: number; entryPrice: number }> = new Map();
    let benchmarkPositions: Map<string, { shares: number; entryPrice: number }> = new Map();
    const periodStart = sortedDates[0];
    const periodEnd = sortedDates[sortedDates.length - 1];

    for (const dateStr of sortedDates) {
      const d = new Date(dateStr);
      const dayOfMonth = d.getDate();
      const month = d.getMonth() + d.getFullYear() * 12;

      if (dayOfMonth <= 3 && month !== lastRebalanceMonth) {
        lastRebalanceMonth = month;

        const rotatedValue = this.calcPortfolioValue(rotatedPositions, datePriceIndex, dateStr);
        const benchmarkValue = this.calcPortfolioValue(benchmarkPositions, datePriceIndex, dateStr);

        // Record monthly rebalance trade (did rotated beat benchmark?)
        if (rotatedPositions.size > 0 && benchmarkPositions.size > 0) {
          const rotatedReturn = ((rotatedValue - rotatedCapital) / rotatedCapital) * 100;
          const benchmarkReturn = ((benchmarkValue - benchmarkCapital) / benchmarkCapital) * 100;
          const outperformed = rotatedReturn > benchmarkReturn;

          allTrades.push({
            symbol: targetSymbols.slice(0, 3).join(','),
            entry_date: dateStr,
            entry_price: rotatedCapital,
            exit_date: dateStr,
            exit_price: rotatedValue,
            return_pct: Math.round(rotatedReturn * 100) / 100,
            hold_days: 30,
            exit_reason: outperformed
              ? `outperformed benchmark (+${(rotatedReturn - benchmarkReturn).toFixed(1)}%)`
              : `underperformed benchmark (${(rotatedReturn - benchmarkReturn).toFixed(1)}%)`,
          });

          rotatedCapital = rotatedValue;
          benchmarkCapital = benchmarkValue;
        }

        // Rebuild equal-weight portfolios
        rotatedPositions = this.buildEqualWeight(targetSymbols, rotatedCapital, datePriceIndex, dateStr);
        benchmarkPositions = this.buildEqualWeight(benchmarkSymbols, benchmarkCapital, datePriceIndex, dateStr);
      }
    }

    // Final portfolio value
    const finalRotated = this.calcPortfolioValue(rotatedPositions, datePriceIndex, periodEnd);
    const totalReturnPct = ((finalRotated - this.INITIAL_CAPITAL) / this.INITIAL_CAPITAL) * 100;

    const notes =
      `Macro regime: ${isRateCutting ? 'RATE_CUTTING → construction overweight' : 'NEUTRAL → equal-weight'}. ` +
      `Target: [${targetSymbols.slice(0, 5).join(', ')}]. ` +
      `Total portfolio return: ${totalReturnPct.toFixed(1)}%.`;

    return this.persistResult(
      this.buildResult(
        strategyId,
        'Sector Rotation',
        allTrades,
        targetSymbols.length,
        periodStart,
        periodEnd,
        notes,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private calcRSI(prices: number[], period: number): number[] {
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi.push(100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)));

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
      rsi.push(100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)));
    }

    return rsi;
  }

  private calcSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += prices[j];
      sma.push(sum / period);
    }
    return sma;
  }

  private detectRateCuttingCycle(rateData: MacroData[]): boolean {
    if (rateData.length < 2) return false;
    const recent = rateData.slice(-6);
    if (recent.length < 2) return false;
    return Number(recent[recent.length - 1].value) < Number(recent[0].value);
  }

  private getPriceOnOrAfter(
    prices: DailyPrice[],
    targetDate: Date,
  ): { date: string; close: number } | null {
    const targetStr = targetDate.toISOString().split('T')[0];
    for (const p of prices) {
      const dateStr = String(p.trade_date);
      if (dateStr >= targetStr) return { date: dateStr, close: Number(p.close) };
    }
    return null;
  }

  private buildDatePriceIndex(
    priceDataMap: Map<string, PriceData>,
  ): Map<string, Map<string, number>> {
    const index = new Map<string, Map<string, number>>();
    for (const [symbol, data] of priceDataMap) {
      const dateMap = new Map<string, number>();
      data.dates.forEach((d, i) => dateMap.set(d, data.closes[i]));
      index.set(symbol, dateMap);
    }
    return index;
  }

  private buildEqualWeight(
    symbols: string[],
    capital: number,
    datePriceIndex: Map<string, Map<string, number>>,
    dateStr: string,
  ): Map<string, { shares: number; entryPrice: number }> {
    const positions = new Map<string, { shares: number; entryPrice: number }>();
    if (symbols.length === 0) return positions;

    const perSymbol = capital / symbols.length;
    for (const symbol of symbols) {
      const priceMap = datePriceIndex.get(symbol);
      if (!priceMap) continue;
      const close = priceMap.get(dateStr) ?? this.getLatestKnownPrice(priceMap, dateStr);
      if (!close || close <= 0) continue;
      const shares = Math.floor(perSymbol / close);
      if (shares > 0) positions.set(symbol, { shares, entryPrice: close });
    }
    return positions;
  }

  private calcPortfolioValue(
    positions: Map<string, { shares: number; entryPrice: number }>,
    datePriceIndex: Map<string, Map<string, number>>,
    dateStr: string,
  ): number {
    if (positions.size === 0) return this.INITIAL_CAPITAL;
    let total = 0;
    for (const [symbol, pos] of positions) {
      const priceMap = datePriceIndex.get(symbol);
      const close = priceMap
        ? (priceMap.get(dateStr) ?? this.getLatestKnownPrice(priceMap, dateStr) ?? pos.entryPrice)
        : pos.entryPrice;
      total += pos.shares * close;
    }
    return total;
  }

  /** Returns the most recent price up to (and including) the given date */
  private getLatestKnownPrice(
    priceMap: Map<string, number>,
    dateStr: string,
  ): number | null {
    let best: number | null = null;
    for (const [d, price] of priceMap) {
      if (d <= dateStr) best = price;
    }
    return best;
  }

  private calcSharpeFromTrades(trades: TradeRecord[]): number | null {
    if (trades.length < 5) return null;
    const returns = trades.map((t) => t.return_pct / 100);
    const n = returns.length;
    const mean = returns.reduce((s, r) => s + r, 0) / n;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return null;
    // Annualise using ~52 periods (assuming avg hold ~1 week)
    const rfPerPeriod = 0.085 / 52;
    return Math.round(((mean - rfPerPeriod) / stdDev) * Math.sqrt(52) * 100) / 100;
  }

  private buildResult(
    strategyId: string,
    strategyName: string,
    trades: TradeRecord[],
    stocksTested: number,
    periodStart: string | null,
    periodEnd: string | null,
    notes?: string,
  ): StrategyBacktestResult {
    const winningTrades = trades.filter((t) => t.return_pct > 0).length;
    const losingTrades = trades.filter((t) => t.return_pct <= 0).length;
    const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
    const avgReturn =
      trades.length > 0
        ? trades.reduce((sum, t) => sum + t.return_pct, 0) / trades.length
        : 0;

    // Simulate 1% position sizing on 1M capital
    let capital = this.INITIAL_CAPITAL;
    let peak = capital;
    let maxDrawdown = 0;

    for (const trade of trades) {
      const positionSize = capital * 0.01;
      capital += (trade.return_pct / 100) * positionSize;
      capital = Math.max(0, capital);
      if (capital > peak) peak = capital;
      const dd = peak > 0 ? ((peak - capital) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const totalReturnPct = ((capital - this.INITIAL_CAPITAL) / this.INITIAL_CAPITAL) * 100;
    const sharpeRatio = this.calcSharpeFromTrades(trades);
    const isActive = winRate >= this.WIN_RATE_THRESHOLD;

    return this.resultRepo.create({
      strategy_id: strategyId,
      strategy_name: strategyName,
      run_date: new Date(),
      total_trades: trades.length,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: Math.round(winRate * 100) / 100,
      avg_return_pct: Math.round(avgReturn * 100) / 100,
      max_drawdown: Math.round(maxDrawdown * 100) / 100,
      sharpe_ratio: sharpeRatio,
      total_return_pct: Math.round(totalReturnPct * 100) / 100,
      stocks_tested: stocksTested,
      trades_detail: trades.slice(0, 50) as object,
      period_start: periodStart ? new Date(periodStart) : null,
      period_end: periodEnd ? new Date(periodEnd) : null,
      notes: notes ?? null,
      is_active: isActive,
    });
  }

  private buildEmptyResult(
    strategyId: string,
    strategyName: string,
    notes: string,
  ): StrategyBacktestResult {
    return this.resultRepo.create({
      strategy_id: strategyId,
      strategy_name: strategyName,
      run_date: new Date(),
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_return_pct: 0,
      max_drawdown: 0,
      sharpe_ratio: null,
      total_return_pct: 0,
      stocks_tested: 0,
      trades_detail: null,
      period_start: null,
      period_end: null,
      notes,
      is_active: false,
    });
  }

  private async persistResult(result: StrategyBacktestResult): Promise<StrategyBacktestResult> {
    try {
      const today = new Date().toISOString().split('T')[0];
      await this.resultRepo
        .createQueryBuilder()
        .delete()
        .from(StrategyBacktestResult)
        .where('strategy_id = :id AND CAST(run_date AS TEXT) = :date', {
          id: result.strategy_id,
          date: today,
        })
        .execute();
      return await this.resultRepo.save(result);
    } catch (err) {
      this.logger.error(`[BACKTEST] Failed to save result for ${result.strategy_id}: ${String(err)}`);
      return result;
    }
  }
}
