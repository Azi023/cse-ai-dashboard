import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyPrice, Stock } from '../../entities';

export interface BacktestTrade {
  date: string;
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  reason: string;
}

export interface BacktestResult {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  trades: BacktestTrade[];
  equityCurve: Array<{ date: string; equity: number }>;
  buyAndHoldReturn: number;
}

@Injectable()
export class BacktestService {
  private readonly logger = new Logger(BacktestService.name);

  constructor(
    @InjectRepository(DailyPrice)
    private readonly priceRepo: Repository<DailyPrice>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
  ) {}

  private async getPricesForSymbol(symbol: string, limit: number): Promise<DailyPrice[]> {
    const stock = await this.stockRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!stock) return [];

    return this.priceRepo.find({
      where: { stock_id: stock.id },
      order: { trade_date: 'ASC' },
      take: limit,
    });
  }

  async runBacktest(params: {
    strategy: string;
    symbol: string;
    days?: number;
    initialCapital?: number;
  }): Promise<BacktestResult> {
    const { strategy, symbol, days = 365, initialCapital = 10000 } = params;

    const prices = await this.getPricesForSymbol(symbol, days);

    if (prices.length < 30) {
      return this.emptyResult(strategy, symbol, initialCapital);
    }

    const closePrices = prices.map((p) => Number(p.close));
    const dates = prices.map((p) => String(p.trade_date));

    switch (strategy) {
      case 'RSI_OVERSOLD':
        return this.strategyRsiOversold(symbol, closePrices, dates, initialCapital);
      case 'SMA_CROSSOVER':
        return this.strategySmaCrossover(symbol, closePrices, dates, initialCapital);
      case 'VALUE_SCREEN':
        return this.strategyValueScreen(symbol, closePrices, dates, initialCapital);
      default:
        return this.emptyResult(strategy, symbol, initialCapital);
    }
  }

  private strategyRsiOversold(
    symbol: string,
    prices: number[],
    dates: string[],
    capital: number,
  ): BacktestResult {
    const rsi = this.calculateRSI(prices, 14);
    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ date: string; equity: number }> = [];
    let cash = capital;
    let shares = 0;
    let entryPrice = 0;
    let wins = 0;
    let losses = 0;

    for (let i = 14; i < prices.length; i++) {
      const currentRsi = rsi[i - 14];
      const price = prices[i];

      if (shares === 0 && currentRsi < 30) {
        const qty = Math.floor(cash / price);
        if (qty > 0) {
          shares = qty;
          entryPrice = price;
          cash -= qty * price;
          trades.push({
            date: dates[i],
            type: 'BUY',
            price,
            quantity: qty,
            reason: `RSI ${currentRsi.toFixed(1)} < 30 (oversold)`,
          });
        }
      } else if (shares > 0 && (currentRsi > 70 || price < entryPrice * 0.92)) {
        cash += shares * price;
        const pnl = (price - entryPrice) * shares;
        if (pnl > 0) wins++;
        else losses++;
        trades.push({
          date: dates[i],
          type: 'SELL',
          price,
          quantity: shares,
          reason:
            currentRsi > 70
              ? `RSI ${currentRsi.toFixed(1)} > 70 (overbought)`
              : `Stop-loss hit at ${((price / entryPrice - 1) * 100).toFixed(1)}%`,
        });
        shares = 0;
      }

      equityCurve.push({ date: dates[i], equity: cash + shares * price });
    }

    if (shares > 0) {
      cash += shares * prices[prices.length - 1];
      const pnl = (prices[prices.length - 1] - entryPrice) * shares;
      if (pnl > 0) wins++;
      else losses++;
      shares = 0;
    }

    const buyAndHoldReturn =
      ((prices[prices.length - 1] - prices[14]) / prices[14]) * 100;

    return this.buildResult(
      'RSI_OVERSOLD', symbol, dates[14], dates[dates.length - 1],
      capital, cash, trades, wins, losses, equityCurve, buyAndHoldReturn,
    );
  }

  private strategySmaCrossover(
    symbol: string,
    prices: number[],
    dates: string[],
    capital: number,
  ): BacktestResult {
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ date: string; equity: number }> = [];
    let cash = capital;
    let shares = 0;
    let entryPrice = 0;
    let wins = 0;
    let losses = 0;
    let prevAbove = false;

    for (let i = 50; i < prices.length; i++) {
      const s20 = sma20[i - 20];
      const s50 = sma50[i - 50];
      const price = prices[i];
      const above = s20 > s50;

      if (shares === 0 && above && !prevAbove) {
        const qty = Math.floor(cash / price);
        if (qty > 0) {
          shares = qty;
          entryPrice = price;
          cash -= qty * price;
          trades.push({
            date: dates[i], type: 'BUY', price, quantity: qty,
            reason: `SMA20 (${s20.toFixed(2)}) crossed above SMA50 (${s50.toFixed(2)})`,
          });
        }
      } else if (shares > 0 && ((!above && prevAbove) || price < entryPrice * 0.90)) {
        cash += shares * price;
        const pnl = (price - entryPrice) * shares;
        if (pnl > 0) wins++;
        else losses++;
        trades.push({
          date: dates[i], type: 'SELL', price, quantity: shares,
          reason: !above && prevAbove
            ? `SMA20 (${s20.toFixed(2)}) crossed below SMA50 (${s50.toFixed(2)})`
            : `Stop-loss hit at ${((price / entryPrice - 1) * 100).toFixed(1)}%`,
        });
        shares = 0;
      }

      prevAbove = above;
      equityCurve.push({ date: dates[i], equity: cash + shares * price });
    }

    if (shares > 0) {
      cash += shares * prices[prices.length - 1];
      const pnl = (prices[prices.length - 1] - entryPrice) * shares;
      if (pnl > 0) wins++;
      else losses++;
    }

    const startIdx = 50;
    const buyAndHoldReturn =
      ((prices[prices.length - 1] - prices[startIdx]) / prices[startIdx]) * 100;

    return this.buildResult(
      'SMA_CROSSOVER', symbol, dates[startIdx], dates[dates.length - 1],
      capital, cash, trades, wins, losses, equityCurve, buyAndHoldReturn,
    );
  }

  private strategyValueScreen(
    symbol: string,
    prices: number[],
    dates: string[],
    capital: number,
  ): BacktestResult {
    const sma50 = this.calculateSMA(prices, 50);
    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ date: string; equity: number }> = [];
    let cash = capital;
    let shares = 0;
    let entryPrice = 0;
    let wins = 0;
    let losses = 0;

    for (let i = 50; i < prices.length; i++) {
      const avg50 = sma50[i - 50];
      const price = prices[i];
      const discountPct = ((price - avg50) / avg50) * 100;

      if (shares === 0 && discountPct < -10) {
        const qty = Math.floor(cash / price);
        if (qty > 0) {
          shares = qty;
          entryPrice = price;
          cash -= qty * price;
          trades.push({
            date: dates[i], type: 'BUY', price, quantity: qty,
            reason: `Price ${discountPct.toFixed(1)}% below 50-day SMA (${avg50.toFixed(2)})`,
          });
        }
      } else if (shares > 0) {
        const returnPct = ((price - entryPrice) / entryPrice) * 100;
        if (returnPct >= 5 || returnPct <= -8) {
          cash += shares * price;
          if (returnPct > 0) wins++;
          else losses++;
          trades.push({
            date: dates[i], type: 'SELL', price, quantity: shares,
            reason: returnPct >= 5
              ? `Target hit: +${returnPct.toFixed(1)}%`
              : `Stop-loss: ${returnPct.toFixed(1)}%`,
          });
          shares = 0;
        }
      }

      equityCurve.push({ date: dates[i], equity: cash + shares * price });
    }

    if (shares > 0) {
      cash += shares * prices[prices.length - 1];
      const pnl = (prices[prices.length - 1] - entryPrice) * shares;
      if (pnl > 0) wins++;
      else losses++;
    }

    const startIdx = 50;
    const buyAndHoldReturn =
      ((prices[prices.length - 1] - prices[startIdx]) / prices[startIdx]) * 100;

    return this.buildResult(
      'VALUE_SCREEN', symbol, dates[startIdx], dates[dates.length - 1],
      capital, cash, trades, wins, losses, equityCurve, buyAndHoldReturn,
    );
  }

  async getAvailableSymbols(): Promise<string[]> {
    const results = await this.priceRepo
      .createQueryBuilder('p')
      .select('s.symbol', 'symbol')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('p.stock', 's')
      .groupBy('s.symbol')
      .having('COUNT(*) >= 30')
      .orderBy('s.symbol', 'ASC')
      .getRawMany();

    return results.map((r: { symbol: string }) => r.symbol);
  }

  // --- Helpers ---

  private calculateRSI(prices: number[], period: number): number[] {
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
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rsVal = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rsVal));
    }

    return rsi;
  }

  private calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += prices[j];
      }
      sma.push(sum / period);
    }
    return sma;
  }

  private buildResult(
    strategy: string, symbol: string, startDate: string, endDate: string,
    initialCapital: number, finalCapital: number, trades: BacktestTrade[],
    wins: number, losses: number,
    equityCurve: Array<{ date: string; equity: number }>,
    buyAndHoldReturn: number,
  ): BacktestResult {
    const totalReturn = finalCapital - initialCapital;
    const totalReturnPercent = (totalReturn / initialCapital) * 100;
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    let peak = initialCapital;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      if (point.equity > peak) peak = point.equity;
      const drawdown = ((peak - point.equity) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      strategy, symbol, startDate, endDate, initialCapital,
      finalCapital: Math.round(finalCapital * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
      totalTrades, winningTrades: wins, losingTrades: losses,
      winRate: Math.round(winRate * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: null, trades, equityCurve,
      buyAndHoldReturn: Math.round(buyAndHoldReturn * 100) / 100,
    };
  }

  private emptyResult(strategy: string, symbol: string, capital: number): BacktestResult {
    return {
      strategy, symbol, startDate: '', endDate: '',
      initialCapital: capital, finalCapital: capital,
      totalReturn: 0, totalReturnPercent: 0,
      totalTrades: 0, winningTrades: 0, losingTrades: 0,
      winRate: 0, maxDrawdown: 0, sharpeRatio: null,
      trades: [], equityCurve: [], buyAndHoldReturn: 0,
    };
  }
}
