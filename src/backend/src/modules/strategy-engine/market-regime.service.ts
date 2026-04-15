import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { MarketRegimeRecord } from '../../entities/market-regime.entity';
import { MarketSnapshot, MacroData, DailyPrice, Stock } from '../../entities';
import { RedisService } from '../cse-data/redis.service';
import { TradingCalendarService } from '../cse-data/trading-calendar.service';
import { MarketRegimeType } from './strategy-registry';

// ---------------------------------------------------------------------------

export interface RegimeDetectionResult {
  regime: MarketRegimeType;
  confidence: number;
  reasoning: string;
  detectedAt: Date;
  indicators: {
    aspi_current: number | null;
    sma_20: number | null;
    sma_50: number | null;
    atr_14: number | null;
    atr_50: number | null;
    breadth_advancing_pct: number | null;
    foreign_net_buying_mtd: number | null;
    week52_high: number | null;
  };
}

const REDIS_KEY = 'strategy:market_regime';
const REDIS_TTL = 24 * 3600;

// ---------------------------------------------------------------------------

@Injectable()
export class MarketRegimeService {
  private readonly logger = new Logger(MarketRegimeService.name);

  constructor(
    @InjectRepository(MarketRegimeRecord)
    private readonly regimeRepo: Repository<MarketRegimeRecord>,
    @InjectRepository(MarketSnapshot)
    private readonly snapshotRepo: Repository<MarketSnapshot>,
    @InjectRepository(MacroData)
    private readonly macroRepo: Repository<MacroData>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    private readonly redisService: RedisService,
    private readonly calendar: TradingCalendarService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron: daily at 2:41 PM SLT, after technical analysis (14:39)
  // and after daily snapshots (14:40), before stock scoring (14:42)
  // VPS timezone is Asia/Colombo — cron times are SLT directly.
  // ---------------------------------------------------------------------------

  @Cron('41 14 * * 1-5', { name: 'detect-market-regime' })
  async detectMarketRegimeCron(): Promise<void> {
    if (this.calendar.skipIfNonTrading(this.logger, 'detectMarketRegime'))
      return;
    this.logger.log('Detecting market regime (scheduled)');
    try {
      const result = await this.detectMarketRegime();
      this.logger.log(
        `Market regime: ${result.regime} (confidence: ${result.confidence}%)`,
      );
    } catch (err) {
      this.logger.error(`Market regime detection failed: ${String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async getCurrentRegime(): Promise<RegimeDetectionResult | null> {
    const cached =
      await this.redisService.getJson<RegimeDetectionResult>(REDIS_KEY);
    if (cached) return cached;

    // On cache miss, run detection
    return this.detectMarketRegime();
  }

  async detectMarketRegime(): Promise<RegimeDetectionResult> {
    const snapshots = await this.snapshotRepo
      .createQueryBuilder('ms')
      .select(['ms.date', 'ms.aspi_close', 'ms.aspi_change_pct'])
      .where('ms.aspi_close IS NOT NULL')
      .orderBy('ms.date', 'DESC')
      .take(60)
      .getMany();

    if (snapshots.length < 5) {
      return this.buildFallbackRegime('Insufficient ASPI history');
    }

    // Reverse so index 0 = oldest, last = most recent
    const sorted = [...snapshots].reverse();
    const closes = sorted.map((s) => Number(s.aspi_close));
    const n = closes.length;

    const current = closes[n - 1];
    const sma20 = n >= 20 ? avg(closes.slice(n - 20)) : avg(closes);
    const sma50 = n >= 50 ? avg(closes.slice(n - 50)) : avg(closes);

    // ATR: absolute daily change
    const absChanges = closes.slice(1).map((c, i) => Math.abs(c - closes[i]));
    const atr14 =
      absChanges.length >= 14 ? avg(absChanges.slice(-14)) : avg(absChanges);
    const atr50 =
      absChanges.length >= 50 ? avg(absChanges.slice(-50)) : avg(absChanges);

    const week52High = Math.max(...closes);

    const breadthPct = await this.getMarketBreadthPct();
    const foreignNet = await this.getForeignNetBuying();

    const indicators: RegimeDetectionResult['indicators'] = {
      aspi_current: round(current),
      sma_20: round(sma20),
      sma_50: round(sma50),
      atr_14: round(atr14),
      atr_50: round(atr50),
      breadth_advancing_pct: breadthPct,
      foreign_net_buying_mtd: foreignNet,
      week52_high: round(week52High),
    };

    const { regime, confidence, reasoning } = this.classifyRegime(
      current,
      sma20,
      sma50,
      atr14,
      atr50,
      breadthPct,
      foreignNet,
      week52High,
      closes,
    );

    const result: RegimeDetectionResult = {
      regime,
      confidence,
      reasoning,
      detectedAt: new Date(),
      indicators,
    };

    // Persist to DB
    await this.regimeRepo.save({
      regime,
      confidence,
      indicators,
      reasoning,
      detected_at: new Date(),
    });

    // Cache in Redis
    await this.redisService.setJson(REDIS_KEY, result, REDIS_TTL);

    return result;
  }

  // ---------------------------------------------------------------------------
  // Classification logic — each rule checked in priority order
  // ---------------------------------------------------------------------------

  private classifyRegime(
    current: number,
    sma20: number,
    sma50: number,
    atr14: number,
    atr50: number,
    breadthPct: number | null,
    foreignNet: number | null,
    week52High: number,
    closes: number[],
  ): { regime: MarketRegimeType; confidence: number; reasoning: string } {
    const n = closes.length;

    // 1. CRISIS: >15% below 52-week high AND foreign selling
    const drawdown = (current - week52High) / week52High;
    if (drawdown < -0.15 && foreignNet !== null && foreignNet < -500) {
      return {
        regime: 'CRISIS',
        confidence: 85,
        reasoning: `ASPI ${(drawdown * 100).toFixed(1)}% below 52-week high of ${week52High.toFixed(0)} with foreign net selling LKR ${foreignNet.toFixed(0)}M MTD`,
      };
    }

    // 2. HIGH_VOLATILITY: ATR14 > 2× ATR50
    if (atr50 > 0 && atr14 > 2 * atr50) {
      const recentChangePcts = closes
        .slice(Math.max(0, n - 5))
        .map((c, i, arr) =>
          i > 0 ? Math.abs((c - arr[i - 1]) / arr[i - 1]) * 100 : 0,
        )
        .filter((p) => p > 0);
      const bigMoves = recentChangePcts.filter((p) => p > 2).length;
      return {
        regime: 'HIGH_VOLATILITY',
        confidence: 80,
        reasoning: `ATR14 (${atr14.toFixed(0)}) is ${(atr14 / atr50).toFixed(1)}× ATR50 (${atr50.toFixed(0)}). ${bigMoves} of last 5 sessions had >2% swings`,
      };
    }

    // 3. RECOVERY: current > SMA50, but was below SMA50 within last 10 sessions
    if (current > sma50 && n >= 10) {
      const tenAgo = closes[n - 10];
      const tenAgoSma50 = n >= 60 ? avg(closes.slice(n - 60, n - 10)) : sma50;
      if (tenAgo < tenAgoSma50) {
        return {
          regime: 'RECOVERY',
          confidence: 75,
          reasoning: `ASPI (${current.toFixed(0)}) crossed above SMA50 (${sma50.toFixed(0)}) within the last 10 sessions — early recovery phase`,
        };
      }
    }

    // 4. TRENDING_UP: above both SMAs, broad advancing breadth
    const advancingThreshold = breadthPct !== null ? breadthPct > 55 : true;
    if (current > sma50 && current > sma20 && advancingThreshold) {
      return {
        regime: 'TRENDING_UP',
        confidence: 72,
        reasoning: `ASPI (${current.toFixed(0)}) above both SMA20 (${sma20.toFixed(0)}) and SMA50 (${sma50.toFixed(0)})${breadthPct !== null ? `. Market breadth: ${breadthPct.toFixed(0)}% advancing` : ''}`,
      };
    }

    // 5. TRENDING_DOWN: below both SMAs, broad declining breadth
    const decliningThreshold = breadthPct !== null ? breadthPct < 45 : true;
    if (current < sma50 && current < sma20 && decliningThreshold) {
      return {
        regime: 'TRENDING_DOWN',
        confidence: 68,
        reasoning: `ASPI (${current.toFixed(0)}) below both SMA20 (${sma20.toFixed(0)}) and SMA50 (${sma50.toFixed(0)})${breadthPct !== null ? `. Market breadth: ${breadthPct.toFixed(0)}% advancing` : ''}`,
      };
    }

    // 6. Default: RANGING
    const upper = Math.max(sma20, sma50);
    const lower = Math.min(sma20, sma50);
    return {
      regime: 'RANGING',
      confidence: 60,
      reasoning: `ASPI (${current.toFixed(0)}) trading between SMA20 (${sma20.toFixed(0)}) and SMA50 (${sma50.toFixed(0)}), range: ${lower.toFixed(0)}–${upper.toFixed(0)}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Market breadth: % of stocks that advanced today vs yesterday
  // ---------------------------------------------------------------------------

  private async getMarketBreadthPct(): Promise<number | null> {
    try {
      // Get stocks with prices for the last 2 trading days via raw join
      const recentPrices = await this.dailyPriceRepo
        .createQueryBuilder('dp')
        .select('dp.trade_date', 'trade_date')
        .addSelect('dp.close', 'close')
        .addSelect('s.symbol', 'symbol')
        .innerJoin('dp.stock', 's')
        .where('dp.close IS NOT NULL')
        .orderBy('dp.trade_date', 'DESC')
        .take(800) // enough for 2 days × ~296 stocks
        .getRawMany<{ trade_date: string; close: string; symbol: string }>();

      if (recentPrices.length < 100) return null;

      // Group by date, take last 2
      const byDate = new Map<string, Map<string, number>>();
      for (const p of recentPrices) {
        const dateStr = String(p.trade_date).split('T')[0];
        if (!byDate.has(dateStr)) byDate.set(dateStr, new Map());
        byDate.get(dateStr)!.set(p.symbol, Number(p.close));
      }

      const dates = [...byDate.keys()].sort().slice(-2);
      if (dates.length < 2) return null;

      const [prevDate, todayDate] = dates;
      const prev = byDate.get(prevDate)!;
      const today = byDate.get(todayDate)!;

      let advancing = 0;
      let total = 0;

      for (const [symbol, todayPrice] of today) {
        const prevPrice = prev.get(symbol);
        if (prevPrice && prevPrice > 0) {
          total++;
          if (todayPrice > prevPrice) advancing++;
        }
      }

      return total > 0 ? round((advancing / total) * 100) : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Foreign net buying from macro_data
  // ---------------------------------------------------------------------------

  private async getForeignNetBuying(): Promise<number | null> {
    try {
      const row = await this.macroRepo
        .createQueryBuilder('md')
        .where("md.indicator = 'foreign_net_buying_mtd'")
        .orderBy('md.data_date', 'DESC')
        .limit(1)
        .getOne();
      return row ? Number(row.value) : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Fallback when insufficient data
  // ---------------------------------------------------------------------------

  private buildFallbackRegime(reason: string): RegimeDetectionResult {
    return {
      regime: 'RANGING',
      confidence: 30,
      reasoning: `Defaulting to RANGING — ${reason}`,
      detectedAt: new Date(),
      indicators: {
        aspi_current: null,
        sma_20: null,
        sma_50: null,
        atr_14: null,
        atr_50: null,
        breadth_advancing_pct: null,
        foreign_net_buying_mtd: null,
        week52_high: null,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function round(v: number | null, dp = 2): number | null {
  if (v === null || v === undefined || isNaN(v)) return null;
  return Math.round(v * 10 ** dp) / 10 ** dp;
}
