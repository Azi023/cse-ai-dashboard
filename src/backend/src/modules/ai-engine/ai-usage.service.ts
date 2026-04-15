import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../cse-data/redis.service';

/**
 * Shared token-budget tracker.
 *
 * One Redis counter per calendar month: `ai:tokens:YYYY-MM`.
 * Every Claude / OpenAI call should call `track()` with the tokens it
 * consumed, so the budget guard at `shouldUseHaiku()` / `shouldFallbackToOpenAI()`
 * can make routing decisions.
 *
 * TTL is 35 days so the key always outlives its month.
 */
const REDIS_KEY_PREFIX = 'ai:tokens';
const DEFAULT_MONTHLY_LIMIT = 500_000;

export interface TokenUsage {
  month: string;
  tokens_used: number;
  limit: number;
  pct_used: number;
  over_budget: boolean;
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private readonly monthlyLimit: number;

  constructor(private readonly redisService: RedisService) {
    // Allow override via env for dev / testing without touching code.
    const envLimit = parseInt(process.env.AI_MONTHLY_TOKEN_LIMIT ?? '', 10);
    this.monthlyLimit =
      Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_MONTHLY_LIMIT;
  }

  private monthKey(): string {
    return `${REDIS_KEY_PREFIX}:${new Date().toISOString().slice(0, 7)}`;
  }

  async track(tokens: number): Promise<void> {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    const key = this.monthKey();
    const current = await this.redisService.get(key);
    const updated = (current ? parseInt(current, 10) : 0) + Math.round(tokens);
    await this.redisService.set(key, String(updated), 35 * 86_400);
  }

  async usage(): Promise<TokenUsage> {
    const month = new Date().toISOString().slice(0, 7);
    const raw = await this.redisService.get(`${REDIS_KEY_PREFIX}:${month}`);
    const tokensUsed = raw ? parseInt(raw, 10) : 0;
    const pctUsed = Math.round((tokensUsed / this.monthlyLimit) * 100);
    return {
      month,
      tokens_used: tokensUsed,
      limit: this.monthlyLimit,
      pct_used: pctUsed,
      over_budget: tokensUsed >= this.monthlyLimit,
    };
  }

  /**
   * True when we're above the monthly limit — callers that can tolerate
   * Haiku should downgrade.
   */
  async shouldUseHaiku(): Promise<boolean> {
    const { over_budget } = await this.usage();
    return over_budget;
  }

  /**
   * True when we're above the fallback threshold (default 85% of budget).
   * Phase-C OpenAI routing reads this.
   */
  async shouldFallbackToOpenAI(): Promise<boolean> {
    const threshold = parseInt(
      process.env.AI_PROVIDER_FALLBACK_THRESHOLD ?? '85',
      10,
    );
    const { pct_used } = await this.usage();
    return pct_used >= threshold;
  }
}
