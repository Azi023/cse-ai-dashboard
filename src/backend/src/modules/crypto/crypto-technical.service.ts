import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CryptoOHLCV } from '../../entities/crypto-ohlcv.entity';
import { CryptoTechnicalSignal } from '../../entities/crypto-technical-signal.entity';

// ── Constants ──────────────────────────────────────────────────────────────

const TRACKED_SYMBOLS = ['BTC/USDT', 'ETH/USDT'] as const;
const MIN_CANDLES = 20;
const FETCH_LIMIT = 60;

// Scoring weights
const SCORE_RSI_OVERSOLD = 30;
const SCORE_RSI_OVERBOUGHT = -30;
const SCORE_PRICE_ABOVE_SMA20 = 20;
const SCORE_PRICE_BELOW_SMA20 = -20;
const SCORE_MACD_POSITIVE = 20;
const SCORE_MACD_NEGATIVE = -20;
const SCORE_BELOW_LOWER_BB = 15;
const SCORE_ABOVE_UPPER_BB = -15;
const SCORE_THRESHOLD_BULLISH = 25;
const SCORE_THRESHOLD_BEARISH = -25;

// ── Interfaces ─────────────────────────────────────────────────────────────

interface MacdResult {
  line: number;
  signal: number;
  histogram: number;
}

interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
}

interface OhlcCandle {
  high: number;
  low: number;
  close: number;
}

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Computes technical indicators (SMA, RSI, MACD, Bollinger Bands, ATR) from
 * stored CryptoOHLCV candles and persists results to crypto_technical_signals.
 */
@Injectable()
export class CryptoTechnicalService {
  private readonly logger = new Logger(CryptoTechnicalService.name);

  constructor(
    @InjectRepository(CryptoOHLCV)
    private readonly ohlcvRepo: Repository<CryptoOHLCV>,
    @InjectRepository(CryptoTechnicalSignal)
    private readonly signalRepo: Repository<CryptoTechnicalSignal>,
  ) {}

  // ── Cron Jobs ──────────────────────────────────────────────────────────

  /** Hourly at :05 — compute 1h signals. */
  @Cron('5 * * * *', { name: 'crypto-technical-1h' })
  async runHourlySignals(): Promise<void> {
    for (const symbol of TRACKED_SYMBOLS) {
      try {
        await this.computeAndSave(symbol, '1h');
      } catch (err) {
        this.logger.warn(
          `1h signal failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** Daily at 00:05 — compute 1d signals. */
  @Cron('5 0 * * *', { name: 'crypto-technical-1d' })
  async runDailySignals(): Promise<void> {
    for (const symbol of TRACKED_SYMBOLS) {
      try {
        await this.computeAndSave(symbol, '1d');
      } catch (err) {
        this.logger.warn(
          `1d signal failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Fetch candles from the DB, compute all indicators, and upsert the result.
   *
   * @param symbol    Normalized trading pair, e.g. 'BTC/USDT'
   * @param timeframe Timeframe string, e.g. '1d', '1h'
   * @returns The saved signal record, or null when there is insufficient data.
   */
  async computeAndSave(
    symbol: string,
    timeframe: string,
  ): Promise<CryptoTechnicalSignal | null> {
    // Fetch newest FETCH_LIMIT candles then reverse to chronological order.
    const rows = await this.ohlcvRepo.find({
      where: { symbol, timeframe },
      order: { timestamp: 'DESC' },
      take: FETCH_LIMIT,
    });
    rows.reverse();

    if (rows.length < MIN_CANDLES) {
      this.logger.debug(
        `${symbol}/${timeframe}: only ${rows.length} candles — skipping`,
      );
      return null;
    }

    const closes = rows.map((r) => Number(r.close));
    const candles: OhlcCandle[] = rows.map((r) => ({
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));
    const volumes = rows.map((r) => Number(r.volume));
    const n = closes.length;

    const closePrice = closes[n - 1];
    const date = this.todayStr();

    // ── Indicators ──────────────────────────────────────────────────────
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const rsi14 = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    const atr14 = this.calculateATR(candles, 14);
    const volumeAvg20 = n >= 20 ? avg(volumes.slice(-20)) : avg(volumes);

    // ── Signal Score ────────────────────────────────────────────────────
    let score = 0;

    if (rsi14 !== null) {
      if (rsi14 < 30) score += SCORE_RSI_OVERSOLD;
      else if (rsi14 > 70) score += SCORE_RSI_OVERBOUGHT;
    }

    if (sma20 !== null) {
      score += closePrice > sma20 ? SCORE_PRICE_ABOVE_SMA20 : SCORE_PRICE_BELOW_SMA20;
    }

    if (macd !== null) {
      score += macd.histogram > 0 ? SCORE_MACD_POSITIVE : SCORE_MACD_NEGATIVE;
    }

    if (bollinger !== null) {
      if (closePrice > bollinger.upper) score += SCORE_ABOVE_UPPER_BB;
      else if (closePrice < bollinger.lower) score += SCORE_BELOW_LOWER_BB;
      // Price between bands contributes 0 — neutral
    }

    const overallSignal =
      score > SCORE_THRESHOLD_BULLISH
        ? 'BULLISH'
        : score < SCORE_THRESHOLD_BEARISH
          ? 'BEARISH'
          : 'NEUTRAL';

    // ── Upsert ──────────────────────────────────────────────────────────
    const existing = await this.signalRepo.findOne({
      where: { symbol, timeframe, date },
    });

    const payload: Partial<CryptoTechnicalSignal> = {
      symbol,
      timeframe,
      date,
      close_price: closePrice,
      sma_20: sma20 !== null ? round8(sma20) : null,
      sma_50: sma50 !== null ? round8(sma50) : null,
      rsi_14: rsi14 !== null ? round2(rsi14) : null,
      macd_line: macd !== null ? round8(macd.line) : null,
      macd_signal: macd !== null ? round8(macd.signal) : null,
      macd_histogram: macd !== null ? round8(macd.histogram) : null,
      bollinger_upper: bollinger !== null ? round8(bollinger.upper) : null,
      bollinger_middle: bollinger !== null ? round8(bollinger.middle) : null,
      bollinger_lower: bollinger !== null ? round8(bollinger.lower) : null,
      atr_14: atr14 !== null ? round8(atr14) : null,
      volume_avg_20: round2(volumeAvg20),
      overall_signal: overallSignal,
      signal_score: score,
    };

    if (existing) {
      const updated = { ...existing, ...payload };
      return this.signalRepo.save(updated);
    }
    return this.signalRepo.save(this.signalRepo.create(payload));
  }

  /**
   * Return the latest 1d and 1h signals for a symbol as a combined object.
   *
   * @param symbol Normalized trading pair, e.g. 'BTC/USDT'
   */
  async getAnalysis(symbol: string): Promise<{
    symbol: string;
    daily: CryptoTechnicalSignal | null;
    hourly: CryptoTechnicalSignal | null;
  }> {
    const [daily, hourly] = await Promise.all([
      this.getLatestSignal(symbol, '1d'),
      this.getLatestSignal(symbol, '1h'),
    ]);
    return { symbol, daily, hourly };
  }

  /**
   * Return historical signals for a symbol/timeframe combination.
   *
   * @param symbol    Normalized trading pair
   * @param timeframe Timeframe string
   * @param days      Number of most-recent records to fetch (capped at 90)
   */
  async getSignalHistory(
    symbol: string,
    timeframe: string,
    days: number,
  ): Promise<CryptoTechnicalSignal[]> {
    const rows = await this.signalRepo.find({
      where: { symbol, timeframe },
      order: { date: 'DESC' },
      take: days,
    });
    return rows.reverse();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async getLatestSignal(
    symbol: string,
    timeframe: string,
  ): Promise<CryptoTechnicalSignal | null> {
    const rows = await this.signalRepo.find({
      where: { symbol, timeframe },
      order: { date: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ── Indicator math ─────────────────────────────────────────────────────

  /**
   * Simple Moving Average.
   *
   * @param closes Array of close prices in chronological order.
   * @param period SMA period.
   * @returns SMA value, or null when there are insufficient data points.
   */
  calculateSMA(closes: number[], period: number): number | null {
    if (closes.length < period) return null;
    return avg(closes.slice(-period));
  }

  /**
   * Relative Strength Index using Wilder's smoothing.
   *
   * @param closes Array of close prices in chronological order.
   * @param period RSI period (typically 14).
   * @returns RSI value 0–100, or null when there are insufficient data points.
   */
  calculateRSI(closes: number[], period: number): number | null {
    if (closes.length < period + 1) return null;

    const changes = closes.slice(1).map((c, i) => c - closes[i]);

    let avgGain =
      changes
        .slice(0, period)
        .filter((c) => c > 0)
        .reduce((s, v) => s + v, 0) / period;

    let avgLoss =
      changes
        .slice(0, period)
        .filter((c) => c < 0)
        .reduce((s, v) => s + Math.abs(v), 0) / period;

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

  /**
   * MACD(12, 26, 9) using exponential moving averages.
   *
   * @param closes Array of close prices in chronological order.
   * @returns MACD line, signal line, and histogram; or null when insufficient data.
   */
  calculateMACD(closes: number[]): MacdResult | null {
    const ema12 = this.computeEMA(closes, 12);
    const ema26 = this.computeEMA(closes, 26);
    if (ema12.length === 0 || ema26.length === 0) return null;

    const minLen = Math.min(ema12.length, ema26.length);
    const macdSeries = ema12
      .slice(-minLen)
      .map((v, i) => v - ema26.slice(-minLen)[i]);

    if (macdSeries.length < 9) return null;

    const signalSeries = this.computeEMA(macdSeries, 9);
    if (signalSeries.length === 0) return null;

    const line = macdSeries[macdSeries.length - 1];
    const signal = signalSeries[signalSeries.length - 1];
    return {
      line: Math.round(line * 100_000_000) / 100_000_000,
      signal: Math.round(signal * 100_000_000) / 100_000_000,
      histogram: Math.round((line - signal) * 100_000_000) / 100_000_000,
    };
  }

  /**
   * Bollinger Bands.
   *
   * @param closes Array of close prices in chronological order.
   * @param period Rolling window period (typically 20).
   * @param stdDev  Standard deviation multiplier (typically 2).
   * @returns Upper, middle (SMA), and lower bands; or null when insufficient data.
   */
  calculateBollingerBands(
    closes: number[],
    period: number,
    stdDev: number,
  ): BollingerResult | null {
    if (closes.length < period) return null;

    const window = closes.slice(-period);
    const middle = avg(window);
    const variance =
      window.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
    const sd = Math.sqrt(variance);

    return {
      upper: middle + stdDev * sd,
      middle,
      lower: middle - stdDev * sd,
    };
  }

  /**
   * Average True Range using Wilder's smoothing.
   *
   * @param candles Array of OHLC candles in chronological order.
   * @param period  ATR period (typically 14).
   * @returns ATR value, or null when there are insufficient data points.
   */
  calculateATR(candles: OhlcCandle[], period: number): number | null {
    if (candles.length < period + 1) return null;

    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const { high, low } = candles[i];
      const prevClose = candles[i - 1].close;
      trs.push(
        Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose),
        ),
      );
    }

    if (trs.length < period) return null;

    let atr = avg(trs.slice(0, period));
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }

  /**
   * Exponential Moving Average seeded with an SMA.
   *
   * @param prices Array of prices in chronological order.
   * @param period EMA period.
   * @returns Array of EMA values (shorter than input by `period - 1` entries).
   */
  private computeEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let ema = avg(prices.slice(0, period));
    result.push(ema);
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }
}

// ── Pure math helpers ──────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round8(n: number): number {
  return Math.round(n * 100_000_000) / 100_000_000;
}
