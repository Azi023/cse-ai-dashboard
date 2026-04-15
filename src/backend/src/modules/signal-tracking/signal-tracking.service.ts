import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SignalRecord, Stock } from '../../entities';

export interface PerformanceStats {
  totalSignals: number;
  completedSignals: number;
  pendingSignals: number;
  winRate7d: number | null;
  winRate14d: number | null;
  winRate30d: number | null;
  avgReturn7d: number | null;
  avgReturn14d: number | null;
  avgReturn30d: number | null;
  byConfidence: {
    HIGH: { count: number; winRate: number | null };
    MEDIUM: { count: number; winRate: number | null };
    LOW: { count: number; winRate: number | null };
  };
  byDirection: {
    BUY: { count: number; winRate: number | null; avgReturn: number | null };
    HOLD: { count: number; winRate: number | null; avgReturn: number | null };
    SELL: { count: number; winRate: number | null; avgReturn: number | null };
  };
  bestSignal: {
    symbol: string;
    direction: string;
    return_30d: number;
    signal_date: string;
  } | null;
  worstSignal: {
    symbol: string;
    direction: string;
    return_30d: number;
    signal_date: string;
  } | null;
}

@Injectable()
export class SignalTrackingService {
  private readonly logger = new Logger(SignalTrackingService.name);

  constructor(
    @InjectRepository(SignalRecord)
    private readonly signalRepository: Repository<SignalRecord>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  /**
   * Record a new signal for tracking.
   */
  async recordSignal(data: {
    symbol: string;
    direction: string;
    confidence: string;
    price_at_signal: number;
    reasoning?: string;
  }): Promise<SignalRecord> {
    const record = new SignalRecord();
    record.symbol = data.symbol.toUpperCase();
    record.direction = data.direction;
    record.confidence = data.confidence;
    record.price_at_signal = data.price_at_signal;
    record.reasoning = data.reasoning ?? null;
    record.signal_date = new Date();
    record.outcome = 'pending';
    return this.signalRepository.save(record);
  }

  /**
   * Check outcomes for signals that are 7/14/30 days old.
   * Runs daily at 15:30 SLT (after market close).
   */
  @Cron('0 30 15 * * 1-5', { name: 'signal-outcome-check' }) // 15:30 SLT (VPS is Asia/Colombo)
  async checkOutcomes(): Promise<void> {
    this.logger.log('Checking signal outcomes...');

    const pendingSignals = await this.signalRepository.find({
      where: { outcome: 'pending' },
    });

    const today = new Date();

    for (const signal of pendingSignals) {
      const signalDate = new Date(signal.signal_date);
      const daysSince = Math.floor(
        (today.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const stock = await this.stockRepository.findOne({
        where: { symbol: signal.symbol },
      });
      if (!stock || !stock.last_price) continue;

      const currentPrice = Number(stock.last_price);
      const signalPrice = Number(signal.price_at_signal);

      if (daysSince >= 7 && signal.price_after_7d == null) {
        signal.price_after_7d = currentPrice;
        signal.return_7d = ((currentPrice - signalPrice) / signalPrice) * 100;
      }

      if (daysSince >= 14 && signal.price_after_14d == null) {
        signal.price_after_14d = currentPrice;
        signal.return_14d = ((currentPrice - signalPrice) / signalPrice) * 100;
      }

      if (daysSince >= 30 && signal.price_after_30d == null) {
        signal.price_after_30d = currentPrice;
        signal.return_30d = ((currentPrice - signalPrice) / signalPrice) * 100;

        // Determine final outcome
        const ret = Number(signal.return_30d);
        if (signal.direction === 'BUY') {
          signal.outcome = ret > 1 ? 'win' : ret < -1 ? 'loss' : 'neutral';
        } else if (signal.direction === 'SELL') {
          signal.outcome = ret < -1 ? 'win' : ret > 1 ? 'loss' : 'neutral';
        } else {
          signal.outcome = Math.abs(ret) < 2 ? 'win' : 'neutral';
        }
      }

      await this.signalRepository.save(signal);
    }

    this.logger.log('Signal outcome check complete');
  }

  /**
   * Get performance statistics (Shariah-compliant signals only).
   */
  async getPerformanceStats(): Promise<PerformanceStats> {
    const [rawSignals, nonCompliantStocks] = await Promise.all([
      this.signalRepository.find({ order: { signal_date: 'DESC' } }),
      this.stockRepository.find({
        where: { shariah_status: 'non_compliant' },
        select: ['symbol'],
      }),
    ]);
    const nonCompliantSet = new Set(nonCompliantStocks.map((s) => s.symbol));
    const all = rawSignals.filter((s) => !nonCompliantSet.has(s.symbol));

    const completed = all.filter((s) => s.outcome !== 'pending');
    const pending = all.filter((s) => s.outcome === 'pending');

    const calcWinRate = (
      signals: SignalRecord[],
      returnField: 'return_7d' | 'return_14d' | 'return_30d',
    ) => {
      const withData = signals.filter((s) => s[returnField] != null);
      if (withData.length === 0) return null;
      const wins = withData.filter((s) => {
        const ret = Number(s[returnField]);
        return s.direction === 'BUY'
          ? ret > 0
          : s.direction === 'SELL'
            ? ret < 0
            : Math.abs(ret) < 2;
      });
      return Math.round((wins.length / withData.length) * 100);
    };

    const calcAvgReturn = (
      signals: SignalRecord[],
      returnField: 'return_7d' | 'return_14d' | 'return_30d',
    ) => {
      const withData = signals.filter((s) => s[returnField] != null);
      if (withData.length === 0) return null;
      const sum = withData.reduce((s, r) => s + Number(r[returnField]), 0);
      return Math.round((sum / withData.length) * 100) / 100;
    };

    const byConfidence = (conf: string) => {
      const filtered = all.filter((s) => s.confidence === conf);
      return {
        count: filtered.length,
        winRate: calcWinRate(filtered, 'return_30d'),
      };
    };

    const byDirection = (dir: string) => {
      const filtered = all.filter((s) => s.direction === dir);
      return {
        count: filtered.length,
        winRate: calcWinRate(filtered, 'return_7d'),
        avgReturn: calcAvgReturn(filtered, 'return_7d'),
      };
    };

    // Best and worst signals (by 30d return, falling back to 7d)
    const withReturn = all.filter(
      (s) => s.return_30d != null || s.return_7d != null,
    );
    const getReturn = (s: SignalRecord) =>
      Number(s.return_30d ?? s.return_7d ?? 0);
    const sorted = [...withReturn].sort((a, b) => getReturn(b) - getReturn(a));

    const toSignalSummary = (s: SignalRecord | undefined) =>
      s
        ? {
            symbol: s.symbol,
            direction: s.direction,
            return_30d: getReturn(s),
            signal_date: new Date(s.signal_date).toISOString().split('T')[0],
          }
        : null;

    return {
      totalSignals: all.length,
      completedSignals: completed.length,
      pendingSignals: pending.length,
      winRate7d: calcWinRate(all, 'return_7d'),
      winRate14d: calcWinRate(all, 'return_14d'),
      winRate30d: calcWinRate(all, 'return_30d'),
      avgReturn7d: calcAvgReturn(all, 'return_7d'),
      avgReturn14d: calcAvgReturn(all, 'return_14d'),
      avgReturn30d: calcAvgReturn(all, 'return_30d'),
      byConfidence: {
        HIGH: byConfidence('HIGH'),
        MEDIUM: byConfidence('MEDIUM'),
        LOW: byConfidence('LOW'),
      },
      byDirection: {
        BUY: byDirection('BUY'),
        HOLD: byDirection('HOLD'),
        SELL: byDirection('SELL'),
      },
      bestSignal: toSignalSummary(sorted[0]),
      worstSignal: toSignalSummary(sorted[sorted.length - 1]),
    };
  }

  /**
   * Get signal records (Shariah-compliant only).
   */
  async getAllSignals(limit = 100): Promise<SignalRecord[]> {
    const [rawSignals, nonCompliantStocks] = await Promise.all([
      this.signalRepository.find({
        order: { signal_date: 'DESC' },
        take: limit * 2, // fetch extra to account for filtered records
      }),
      this.stockRepository.find({
        where: { shariah_status: 'non_compliant' },
        select: ['symbol'],
      }),
    ]);
    const nonCompliantSet = new Set(nonCompliantStocks.map((s) => s.symbol));
    return rawSignals
      .filter((s) => !nonCompliantSet.has(s.symbol))
      .slice(0, limit);
  }
}
