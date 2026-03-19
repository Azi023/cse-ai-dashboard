import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { TechnicalSignal } from '../../entities/technical-signal.entity';
import { Stock, DailyPrice } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

interface TradeItem {
  symbol?: string;
  price?: number;
  volume?: number;
}

interface MacdResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

// ---------------------------------------------------------------------------

@Injectable()
export class TechnicalService {
  private readonly logger = new Logger(TechnicalService.name);

  constructor(
    @InjectRepository(TechnicalSignal)
    private readonly techSignalRepo: Repository<TechnicalSignal>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    private readonly redisService: RedisService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron — daily at 2:41 PM SLT (9:11 AM UTC)
  // ---------------------------------------------------------------------------

  @Cron('11 9 * * 1-5', { name: 'run-technical-analysis' })
  async runTechnicalAnalysis(): Promise<void> {
    const today = this.todayStr();
    this.logger.log(`Running technical analysis for ${today}`);

    const stocks = await this.stockRepo.find({
      where: [{ shariah_status: 'compliant' }, { shariah_status: 'pending_review' }],
    });

    const tradeMap = await this.buildTradeMap();

    let computed = 0;
    for (const stock of stocks) {
      try {
        await this.computeAndSave(stock, today, tradeMap);
        computed++;
      } catch (err) {
        this.logger.warn(`Technical analysis failed for ${stock.symbol}: ${String(err)}`);
      }
    }
    this.logger.log(`Technical analysis complete: ${computed}/${stocks.length} stocks`);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async runForSymbol(symbol: string): Promise<TechnicalSignal | null> {
    const stock = await this.stockRepo.findOne({ where: { symbol } });
    if (!stock) return null;
    const tradeMap = await this.buildTradeMap();
    return this.computeAndSave(stock, this.todayStr(), tradeMap);
  }

  async getLatestSignals(limit = 20): Promise<TechnicalSignal[]> {
    const today = this.todayStr();
    const rows = await this.techSignalRepo.find({
      where: { date: today },
      order: { signal_score: 'DESC' },
      take: limit,
    });
    if (rows.length > 0) return rows;
    // Fall back to most recent date
    return this.techSignalRepo.find({
      order: { date: 'DESC', signal_score: 'DESC' },
      take: limit,
    });
  }

  async getLatestSignalForSymbol(symbol: string): Promise<TechnicalSignal | null> {
    const rows = await this.techSignalRepo.find({
      where: { symbol },
      order: { date: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async getSignalsForSymbols(symbols: string[]): Promise<Map<string, TechnicalSignal>> {
    const today = this.todayStr();
    const result = new Map<string, TechnicalSignal>();
    for (const symbol of symbols) {
      const rows = await this.techSignalRepo.find({
        where: [{ symbol, date: today }, { symbol }],
        order: { date: 'DESC' },
        take: 1,
      });
      if (rows[0]) result.set(symbol, rows[0]);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Core computation
  // ---------------------------------------------------------------------------

  private async computeAndSave(
    stock: Stock,
    date: string,
    tradeMap: Map<string, { price: number; volume: number }>,
  ): Promise<TechnicalSignal | null> {
    // Fetch last 60 days in chronological order (oldest first)
    const prices = await this.dailyPriceRepo
      .createQueryBuilder('dp')
      .where('dp.stock_id = :id', { id: stock.id })
      .orderBy('dp.trade_date', 'ASC')
      .take(60)
      .getMany();

    if (prices.length === 0) return null;

    const closes = prices.map((p) => Number(p.close));
    const highs = prices.map((p) => Number(p.high));
    const lows = prices.map((p) => Number(p.low));
    const volumes = prices.map((p) => Number(p.volume));
    const opens = prices.map((p) => Number(p.open));
    const n = closes.length;

    const trade = tradeMap.get(stock.symbol);
    const currentPrice = trade?.price ?? closes[n - 1] ?? 0;
    const todayVolume = trade?.volume ?? volumes[n - 1] ?? 0;

    // ── SMA ──────────────────────────────────────────────────────────────────
    const sma20 = n >= 20 ? round2(avg(closes.slice(-20))) : null;
    const sma50 = n >= 50 ? round2(avg(closes.slice(-50))) : null;

    let smaTrend: string | null = null;
    if (sma20 !== null) {
      if (sma50 !== null) {
        const prevSma20 = n >= 21 ? avg(closes.slice(-21, -1)) : null;
        const prevSma50 = n >= 51 ? avg(closes.slice(-51, -1)) : null;
        if (prevSma20 !== null && prevSma50 !== null) {
          const prevAbove = prevSma20 > prevSma50;
          const currAbove = sma20 > sma50;
          if (!prevAbove && currAbove) smaTrend = 'GOLDEN_CROSS';
          else if (prevAbove && !currAbove) smaTrend = 'DEATH_CROSS';
          else smaTrend = currentPrice > sma20 && sma20 > sma50 ? 'BULLISH' : currentPrice < sma20 && sma20 < sma50 ? 'BEARISH' : 'NEUTRAL';
        } else {
          smaTrend = currentPrice > sma20 ? 'BULLISH' : 'BEARISH';
        }
      } else {
        smaTrend = currentPrice > sma20 ? 'BULLISH' : 'BEARISH';
      }
    }

    // ── RSI(14) ──────────────────────────────────────────────────────────────
    const rsi14Raw = this.computeRSI(closes, 14);
    const rsi14 = rsi14Raw !== null ? round2(rsi14Raw) : null;
    const rsiSignal = rsi14 !== null ? (rsi14 < 30 ? 'OVERSOLD' : rsi14 > 70 ? 'OVERBOUGHT' : 'NEUTRAL') : null;

    // ── MACD(12,26,9) ────────────────────────────────────────────────────────
    const macdResult = this.computeMACD(closes);
    let macdCrossover: string | null = null;
    if (macdResult !== null) {
      const prevMacd = this.computeMACD(closes.slice(0, -1));
      if (prevMacd !== null) {
        const prevAbove = prevMacd.macdLine > prevMacd.signalLine;
        const currAbove = macdResult.macdLine > macdResult.signalLine;
        if (!prevAbove && currAbove) macdCrossover = 'BULLISH';
        else if (prevAbove && !currAbove) macdCrossover = 'BEARISH';
        else macdCrossover = macdResult.macdLine > 0 ? 'POSITIVE' : 'NEGATIVE';
      } else {
        macdCrossover = macdResult.macdLine > 0 ? 'POSITIVE' : 'NEGATIVE';
      }
    }

    // ── Support & Resistance (20-day) ────────────────────────────────────────
    const last20Highs = highs.slice(-20);
    const last20Lows = lows.slice(-20);
    const support20d = last20Lows.length > 0 ? round2(Math.min(...last20Lows)) : null;
    const resistance20d = last20Highs.length > 0 ? round2(Math.max(...last20Highs)) : null;

    // ── ATR(14) — Wilder's smoothing ─────────────────────────────────────────
    const atr14Raw = this.computeATR(prices, 14);
    const atr14 = atr14Raw !== null ? round2(atr14Raw) : null;

    // ── Volume Analysis ──────────────────────────────────────────────────────
    const avg20Vol = n >= 20 ? avg(volumes.slice(-20)) : avg(volumes);
    const volumeRatio = avg20Vol > 0 ? todayVolume / avg20Vol : 1;
    const latestClose = closes[n - 1];
    const latestOpen = opens[n - 1];
    let volumeTrend = 'NEUTRAL';
    if (volumeRatio > 1.2) {
      volumeTrend = latestClose > latestOpen ? 'ACCUMULATION' : 'DISTRIBUTION';
    }

    // ── Candlestick pattern ──────────────────────────────────────────────────
    const candlestickPattern = this.detectCandlestick(prices, support20d, resistance20d);

    // ── Signal Score ─────────────────────────────────────────────────────────
    let score = 0;
    if (rsi14 !== null) {
      if (rsi14 < 30) score += 2;
      else if (rsi14 < 45) score += 1;
      else if (rsi14 > 70) score -= 2;
      else if (rsi14 > 55) score -= 1;
    }
    if (sma20 !== null) score += currentPrice > sma20 ? 1 : -1;
    if (macdResult !== null) {
      if (macdCrossover === 'BULLISH') score += 2;
      else if (macdCrossover === 'BEARISH') score -= 2;
      else score += macdResult.macdLine > 0 ? 1 : -1;
    }
    if (support20d !== null && currentPrice > 0) {
      if ((currentPrice - support20d) / currentPrice <= 0.03) score += 1;
    }
    if (resistance20d !== null && currentPrice > 0) {
      if ((resistance20d - currentPrice) / currentPrice <= 0.03) score -= 1;
    }
    if (volumeTrend === 'ACCUMULATION') score += 1;
    else if (volumeTrend === 'DISTRIBUTION') score -= 1;
    if (candlestickPattern?.startsWith('BULLISH')) score += 1;
    else if (candlestickPattern?.startsWith('BEARISH')) score -= 1;

    const overallSignal =
      score >= 4 ? 'STRONG_BUY' :
      score >= 2 ? 'BUY' :
      score >= -1 ? 'NEUTRAL' :
      score >= -3 ? 'SELL' : 'STRONG_SELL';

    const signalSummary = this.buildSummary(n, rsi14, rsiSignal, smaTrend, macdCrossover, volumeTrend, volumeRatio, candlestickPattern);

    const signal: Partial<TechnicalSignal> = {
      date,
      symbol: stock.symbol,
      close_price: round2(currentPrice),
      sma_20: sma20,
      sma_50: sma50,
      sma_trend: smaTrend,
      rsi_14: rsi14,
      rsi_signal: rsiSignal,
      macd_line: macdResult?.macdLine ?? null,
      macd_signal_line: macdResult?.signalLine ?? null,
      macd_histogram: macdResult?.histogram ?? null,
      macd_crossover: macdCrossover,
      support_20d: support20d,
      resistance_20d: resistance20d,
      atr_14: atr14,
      volume_avg_20d: Math.round(avg20Vol),
      volume_ratio: Math.round(volumeRatio * 100) / 100,
      volume_trend: volumeTrend,
      candlestick_pattern: candlestickPattern,
      overall_signal: overallSignal,
      signal_score: score,
      signal_summary: signalSummary,
    };

    const existing = await this.techSignalRepo.findOne({ where: { date, symbol: stock.symbol } });
    if (existing) {
      Object.assign(existing, signal);
      return this.techSignalRepo.save(existing);
    }
    return this.techSignalRepo.save(this.techSignalRepo.create(signal));
  }

  // ---------------------------------------------------------------------------
  // Indicator math
  // ---------------------------------------------------------------------------

  private computeRSI(closes: number[], period: number): number | null {
    if (closes.length < period + 1) return null;
    // changes[i] = closes[i+1] - closes[i]
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    // Initial averages over first 'period' changes
    let avgGain = changes.slice(0, period).filter((c) => c > 0).reduce((s, v) => s + v, 0) / period;
    let avgLoss = changes.slice(0, period).filter((c) => c < 0).reduce((s, v) => s + Math.abs(v), 0) / period;
    // Wilder's smoothing for remaining changes
    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] > 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private computeEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let ema = avg(prices.slice(0, period)); // seed = SMA
    result.push(ema);
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }

  private computeMACD(closes: number[]): MacdResult | null {
    const ema12 = this.computeEMA(closes, 12);
    const ema26 = this.computeEMA(closes, 26);
    if (ema12.length === 0 || ema26.length === 0) return null;

    // Align: both arrays end at the same close price
    const minLen = Math.min(ema12.length, ema26.length);
    const macdSeries = ema12.slice(-minLen).map((v, i) => v - ema26.slice(-minLen)[i]);

    if (macdSeries.length < 9) return null;

    const signalSeries = this.computeEMA(macdSeries, 9);
    if (signalSeries.length === 0) return null;

    const macdLine = macdSeries[macdSeries.length - 1];
    const signalLine = signalSeries[signalSeries.length - 1];
    return {
      macdLine: Math.round(macdLine * 10000) / 10000,
      signalLine: Math.round(signalLine * 10000) / 10000,
      histogram: Math.round((macdLine - signalLine) * 10000) / 10000,
    };
  }

  private computeATR(prices: DailyPrice[], period: number): number | null {
    if (prices.length < period + 1) return null;
    const trs: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const high = Number(prices[i].high);
      const low = Number(prices[i].low);
      const prevClose = Number(prices[i - 1].close);
      trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    if (trs.length < period) return null;
    // Wilder's smoothing ATR
    let atr = avg(trs.slice(0, period));
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }

  private detectCandlestick(
    prices: DailyPrice[],
    support: number | null,
    _resistance: number | null,
  ): string | null {
    const n = prices.length;
    if (n < 1) return null;
    const today = prices[n - 1];
    const todayOpen = Number(today.open);
    const todayClose = Number(today.close);
    const todayHigh = Number(today.high);
    const todayLow = Number(today.low);
    const body = Math.abs(todayClose - todayOpen);
    const range = todayHigh - todayLow;

    if (range > 0 && body < 0.1 * range) return 'DOJI';

    const lowerWick = Math.min(todayOpen, todayClose) - todayLow;
    const upperWick = todayHigh - Math.max(todayOpen, todayClose);
    const nearSupport = support !== null && todayClose > 0 && (todayClose - support) / todayClose < 0.05;
    if (body > 0 && lowerWick > 2 * body && upperWick < body && nearSupport) return 'BULLISH_HAMMER';

    if (n < 2) return null;
    const prev = prices[n - 2];
    const prevOpen = Number(prev.open);
    const prevClose = Number(prev.close);
    if (!( prevClose > prevOpen) && todayClose > todayOpen && todayOpen < prevClose && todayClose > prevOpen) return 'BULLISH_ENGULFING';
    if (prevClose > prevOpen && !(todayClose > todayOpen) && todayOpen > prevClose && todayClose < prevOpen) return 'BEARISH_ENGULFING';

    return null;
  }

  private buildSummary(
    n: number,
    rsi: number | null,
    rsiSignal: string | null,
    smaTrend: string | null,
    macdCrossover: string | null,
    volumeTrend: string,
    volumeRatio: number,
    pattern: string | null,
  ): string {
    const parts: string[] = [];
    if (n < 15) parts.push(`Only ${n} days of data`);
    if (rsi !== null && rsiSignal) parts.push(`RSI ${rsi.toFixed(1)} (${rsiSignal})`);
    if (smaTrend) parts.push(`Trend: ${smaTrend}`);
    if (macdCrossover) parts.push(`MACD: ${macdCrossover}`);
    parts.push(`Vol: ${volumeTrend} (${(volumeRatio * 100).toFixed(0)}%)`);
    if (pattern) parts.push(`Pattern: ${pattern}`);
    return parts.join(' | ');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async buildTradeMap(): Promise<Map<string, { price: number; volume: number }>> {
    const tradeSummary = await this.redisService.getJson<{ reqTradeSummery?: TradeItem[] }>('cse:trade_summary');
    const map = new Map<string, { price: number; volume: number }>();
    for (const t of tradeSummary?.reqTradeSummery ?? []) {
      if (t.symbol) map.set(t.symbol, { price: t.price ?? 0, volume: t.volume ?? 0 });
    }
    return map;
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
