import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { RecommendationOutcome } from '../../entities/recommendation-outcome.entity';
import { AiRecommendation, DailyPrice, Stock } from '../../entities';
import { RedisService } from '../cse-data/redis.service';

const MODEL_PERF_KEY = 'ai:model_performance';

export interface ModelPerformance {
  total_recommendations: number;
  outcomes_tracked: number;
  win_rate_1w: number | null;
  win_rate_1m: number | null;
  avg_return_1w: number | null;
  avg_return_1m: number | null;
  best_pick: { symbol: string; return_1m: number } | null;
  worst_pick: { symbol: string; return_1m: number } | null;
  last_updated: string;
}

// ---------------------------------------------------------------------------

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    @InjectRepository(RecommendationOutcome)
    private readonly outcomeRepo: Repository<RecommendationOutcome>,
    @InjectRepository(AiRecommendation)
    private readonly recRepo: Repository<AiRecommendation>,
    @InjectRepository(DailyPrice)
    private readonly dailyPriceRepo: Repository<DailyPrice>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    private readonly redisService: RedisService,
  ) {}

  // ---------------------------------------------------------------------------
  // Cron — Monday 9:15 AM SLT (Monday 3:45 AM UTC)
  // ---------------------------------------------------------------------------

  @Cron('45 3 * * 1', { name: 'update-recommendation-outcomes' })
  async updateOutcomes(): Promise<void> {
    this.logger.log('Updating recommendation outcomes...');

    const recommendations = await this.recRepo.find({ order: { week_start: 'ASC' } });
    let updated = 0;

    for (const rec of recommendations) {
      try {
        await this.processRecommendation(rec);
        updated++;
      } catch (err) {
        this.logger.warn(`Outcome update failed for rec ${rec.id}: ${String(err)}`);
      }
    }

    await this.computeAndCachePerformance();
    this.logger.log(`Outcome update complete: ${updated}/${recommendations.length} processed`);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async runUpdateNow(): Promise<void> {
    await this.updateOutcomes();
  }

  async getModelPerformance(): Promise<ModelPerformance> {
    const cached = await this.redisService.getJson<ModelPerformance>(MODEL_PERF_KEY);
    if (cached) return cached;
    return this.computeAndCachePerformance();
  }

  async getAllOutcomes(): Promise<RecommendationOutcome[]> {
    return this.outcomeRepo.find({ order: { recommended_date: 'DESC' } });
  }

  // ---------------------------------------------------------------------------
  // Private: process one recommendation
  // ---------------------------------------------------------------------------

  private async processRecommendation(rec: AiRecommendation): Promise<void> {
    const symbol = rec.recommended_stock;
    const recDate = new Date(rec.week_start);

    // Find or create outcome record
    let outcome = await this.outcomeRepo.findOne({
      where: { recommendation_id: rec.id },
    });

    if (!outcome) {
      // Seed with price at recommendation date
      const recPrice = await this.getPriceNear(symbol, recDate);
      outcome = this.outcomeRepo.create({
        recommendation_id: rec.id,
        symbol,
        recommended_date: rec.week_start,
        recommended_price: recPrice,
      });
    }

    const now = new Date();
    const msSinceRec = now.getTime() - recDate.getTime();
    const daysSinceRec = msSinceRec / (1000 * 60 * 60 * 24);

    // Fill in 1W outcome (after 5 trading days ≈ 7 calendar days)
    if (daysSinceRec >= 7 && outcome.price_1w === null) {
      const target = new Date(recDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const price = await this.getPriceNear(symbol, target);
      if (price !== null && outcome.recommended_price !== null) {
        outcome.price_1w = price;
        outcome.return_1w = Math.round(((price - Number(outcome.recommended_price)) / Number(outcome.recommended_price)) * 10000) / 100;
      }
    }

    // Fill in 1M outcome (after 30 days)
    if (daysSinceRec >= 30 && outcome.price_1m === null) {
      const target = new Date(recDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const price = await this.getPriceNear(symbol, target);
      if (price !== null && outcome.recommended_price !== null) {
        outcome.price_1m = price;
        outcome.return_1m = Math.round(((price - Number(outcome.recommended_price)) / Number(outcome.recommended_price)) * 10000) / 100;
      }
    }

    // Fill in 3M outcome (after 90 days)
    if (daysSinceRec >= 90 && outcome.price_3m === null) {
      const target = new Date(recDate.getTime() + 90 * 24 * 60 * 60 * 1000);
      const price = await this.getPriceNear(symbol, target);
      if (price !== null && outcome.recommended_price !== null) {
        outcome.price_3m = price;
        outcome.return_3m = Math.round(((price - Number(outcome.recommended_price)) / Number(outcome.recommended_price)) * 10000) / 100;
      }
    }

    await this.outcomeRepo.save(outcome);
  }

  // ---------------------------------------------------------------------------
  // Private: get price for a symbol near a target date
  // ---------------------------------------------------------------------------

  private async getPriceNear(symbol: string, targetDate: Date): Promise<number | null> {
    const stock = await this.stockRepo.findOne({ where: { symbol } });
    if (!stock) return null;

    // Look for price within ±5 days of target
    const from = new Date(targetDate.getTime() - 5 * 24 * 60 * 60 * 1000);
    const to = new Date(targetDate.getTime() + 5 * 24 * 60 * 60 * 1000);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const prices = await this.dailyPriceRepo
      .createQueryBuilder('dp')
      .where('dp.stock_id = :id', { id: stock.id })
      .andWhere('dp.trade_date >= :from', { from: fromStr })
      .andWhere('dp.trade_date <= :to', { to: toStr })
      .orderBy('ABS(EXTRACT(EPOCH FROM (dp.trade_date::timestamp - :target::timestamp)))')
      .setParameter('target', targetDate.toISOString().split('T')[0])
      .take(1)
      .getMany();

    return prices[0] ? Number(prices[0].close) : null;
  }

  // ---------------------------------------------------------------------------
  // Private: compute and cache aggregate performance
  // ---------------------------------------------------------------------------

  private async computeAndCachePerformance(): Promise<ModelPerformance> {
    const [totalRecs, outcomes] = await Promise.all([
      this.recRepo.count(),
      this.outcomeRepo.find(),
    ]);

    const with1w = outcomes.filter((o) => o.return_1w !== null);
    const with1m = outcomes.filter((o) => o.return_1m !== null);

    const winRate1w = with1w.length > 0
      ? Math.round((with1w.filter((o) => Number(o.return_1w) > 0).length / with1w.length) * 100) / 100
      : null;

    const winRate1m = with1m.length > 0
      ? Math.round((with1m.filter((o) => Number(o.return_1m) > 0).length / with1m.length) * 100) / 100
      : null;

    const avgReturn1w = with1w.length > 0
      ? Math.round(with1w.reduce((s, o) => s + Number(o.return_1w), 0) / with1w.length * 100) / 100
      : null;

    const avgReturn1m = with1m.length > 0
      ? Math.round(with1m.reduce((s, o) => s + Number(o.return_1m), 0) / with1m.length * 100) / 100
      : null;

    let bestPick: { symbol: string; return_1m: number } | null = null;
    let worstPick: { symbol: string; return_1m: number } | null = null;
    if (with1m.length > 0) {
      const sorted = [...with1m].sort((a, b) => Number(b.return_1m) - Number(a.return_1m));
      bestPick = { symbol: sorted[0].symbol, return_1m: Number(sorted[0].return_1m) };
      worstPick = { symbol: sorted[sorted.length - 1].symbol, return_1m: Number(sorted[sorted.length - 1].return_1m) };
    }

    const perf: ModelPerformance = {
      total_recommendations: totalRecs,
      outcomes_tracked: outcomes.length,
      win_rate_1w: winRate1w,
      win_rate_1m: winRate1m,
      avg_return_1w: avgReturn1w,
      avg_return_1m: avgReturn1m,
      best_pick: bestPick,
      worst_pick: worstPick,
      last_updated: new Date().toISOString(),
    };

    await this.redisService.set(MODEL_PERF_KEY, JSON.stringify(perf), 7 * 24 * 3600);
    return perf;
  }
}
