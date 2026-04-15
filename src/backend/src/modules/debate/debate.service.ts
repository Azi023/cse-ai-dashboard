import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  AiDebate,
  Stock,
  StrategySignal,
  TechnicalSignal,
  CompanyFinancial,
} from '../../entities';
import { AiProviderFactory } from '../ai-engine/providers/provider.factory';
import { AiUsageService } from '../ai-engine/ai-usage.service';
import { TradingCalendarService } from '../cse-data/trading-calendar.service';
import {
  BULL_SYSTEM_PROMPT,
  BEAR_SYSTEM_PROMPT,
  SYNTHESIS_SYSTEM_PROMPT,
  buildUserPrompt,
} from './debate.prompts';

/**
 * 3-agent debate system.
 *
 * Weekly (Friday 3:15 PM SLT) the cron reads signal-triggered stocks
 * from the past 7 days, and for each one runs a parallel bull/bear
 * debate + a synthesis call. Output is cached for 7 days.
 *
 * Cost target: <$1/month. Stays inside budget via:
 *   - 3 agents per stock, not 30.
 *   - Haiku-only for bull/bear (cheap).
 *   - Synthesis on Sonnet unless budget is tight.
 *   - Skips entirely when monthly Claude budget ≥ 80% used.
 *   - 7-day cache on (symbol, debate_date).
 */

interface SynthesisOutput {
  synthesis: string;
  price_target_p10: number;
  price_target_p50: number;
  price_target_p90: number;
  confidence_score: number;
  key_risks: string[];
  catalysts: string[];
}

export interface DebateResult {
  symbol: string;
  bull_thesis: string;
  bear_thesis: string;
  synthesis: string;
  price_target_p10: number | null;
  price_target_p50: number | null;
  price_target_p90: number | null;
  confidence_score: number | null;
  key_risks: string[] | null;
  catalysts: string[] | null;
  debate_date: string;
  price_at_debate: number;
  provider: 'claude' | 'openai';
  tokens_used: number;
  cached: boolean;
}

const CACHE_DAYS = 7;
const SKIP_AT_USAGE_PCT = 80;

@Injectable()
export class DebateService {
  private readonly logger = new Logger(DebateService.name);

  constructor(
    @InjectRepository(AiDebate)
    private readonly debateRepo: Repository<AiDebate>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(StrategySignal)
    private readonly signalRepo: Repository<StrategySignal>,
    @InjectRepository(TechnicalSignal)
    private readonly techRepo: Repository<TechnicalSignal>,
    @InjectRepository(CompanyFinancial)
    private readonly financialRepo: Repository<CompanyFinancial>,
    private readonly providerFactory: AiProviderFactory,
    private readonly aiUsage: AiUsageService,
    private readonly calendar: TradingCalendarService,
  ) {}

  // ── Cron: Friday 3:15 PM SLT ────────────────────────────────────────

  @Cron('15 15 * * 5', { name: 'weekly-debate' })
  async runWeeklyDebates(): Promise<void> {
    if (this.calendar.skipIfNonTrading(this.logger, 'runWeeklyDebates')) return;

    const usage = await this.aiUsage.usage();
    if (usage.pct_used >= SKIP_AT_USAGE_PCT) {
      this.logger.warn(
        `Skipping debate — Claude budget ${usage.pct_used}% used (>= ${SKIP_AT_USAGE_PCT}%)`,
      );
      return;
    }

    // Stocks that triggered a signal in the last 7 days.
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);

    const recent = await this.signalRepo.find({
      where: { signal_date: MoreThanOrEqual(sinceStr) },
      order: { score: 'DESC' },
      take: 50,
    });
    const symbols = Array.from(new Set(recent.map((r) => r.symbol))).slice(
      0,
      10,
    );

    if (symbols.length === 0) {
      this.logger.log('No signal-triggered stocks this week — no debates');
      return;
    }

    this.logger.log(`Running debates for ${symbols.length} stocks`);
    const today = new Date().toISOString().slice(0, 10);
    let produced = 0;
    let cached = 0;
    let failed = 0;

    for (const symbol of symbols) {
      try {
        const existing = await this.debateRepo.findOne({
          where: { symbol, debate_date: today },
        });
        if (existing) {
          cached++;
          continue;
        }
        await this.runDebateForSymbol(symbol);
        produced++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Debate failed for ${symbol}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    this.logger.log(
      `Weekly debate complete: ${produced} produced, ${cached} cached, ${failed} failed`,
    );
  }

  // ── Public API ──────────────────────────────────────────────────────

  async getLatestForSymbol(symbol: string): Promise<DebateResult | null> {
    const row = await this.debateRepo.findOne({
      where: { symbol },
      order: { debate_date: 'DESC' },
    });
    if (!row) return null;
    return this.toResult(row, true);
  }

  async getThisWeek(): Promise<DebateResult[]> {
    const since = new Date();
    since.setDate(since.getDate() - CACHE_DAYS);
    const rows = await this.debateRepo.find({
      where: { debate_date: MoreThanOrEqual(since.toISOString().slice(0, 10)) },
      order: { created_at: 'DESC' },
      take: 10,
    });
    return rows.map((r) => this.toResult(r, true));
  }

  /**
   * Manually trigger a debate for a single symbol.
   * Respects the 7-day cache — returns cached result if recent.
   */
  async runDebateForSymbol(symbol: string): Promise<DebateResult> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.debateRepo.findOne({
      where: { symbol, debate_date: today },
    });
    if (existing) return this.toResult(existing, true);

    const context = await this.buildContext(symbol);
    const userPrompt = buildUserPrompt(context);
    const provider = await this.providerFactory.pick();

    // Bull + bear in parallel — they don't see each other
    const [bull, bear] = await Promise.all([
      provider.generate({
        task: 'debate-agent',
        systemPrompt: BULL_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 800,
      }),
      provider.generate({
        task: 'debate-agent',
        systemPrompt: BEAR_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 800,
      }),
    ]);
    await this.aiUsage.track(bull.tokensUsed + bear.tokensUsed);

    // Synthesis gets both theses
    const synthesisPrompt = `Bull thesis:\n${bull.text}\n\n----\n\nBear thesis:\n${bear.text}\n\n----\n\nStock: ${context.symbol}. Current price: LKR ${context.currentPrice.toFixed(2)}.`;
    const synth = await provider.generate({
      task: 'debate-synthesis',
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      userPrompt: synthesisPrompt,
      maxTokens: 900,
      expectJson: true,
    });
    await this.aiUsage.track(synth.tokensUsed);

    let parsed: SynthesisOutput | null = null;
    try {
      const jsonMatch = synth.text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as SynthesisOutput) : null;
    } catch {
      this.logger.warn(
        `Synthesis for ${symbol} did not return valid JSON — storing raw text only`,
      );
    }

    const entity = this.debateRepo.create({
      symbol,
      debate_date: today,
      bull_thesis: bull.text,
      bear_thesis: bear.text,
      synthesis: parsed?.synthesis ?? synth.text,
      price_target_p10: parsed?.price_target_p10 ?? null,
      price_target_p50: parsed?.price_target_p50 ?? null,
      price_target_p90: parsed?.price_target_p90 ?? null,
      confidence_score: parsed?.confidence_score ?? null,
      key_risks: parsed?.key_risks ?? null,
      catalysts: parsed?.catalysts ?? null,
      price_at_debate: context.currentPrice,
      tokens_used: bull.tokensUsed + bear.tokensUsed + synth.tokensUsed,
      provider: provider.name,
    });
    const saved = await this.debateRepo.save(entity);

    return this.toResult(saved, false);
  }

  // ── Internal helpers ────────────────────────────────────────────────

  private toResult(row: AiDebate, cached: boolean): DebateResult {
    return {
      symbol: row.symbol,
      bull_thesis: row.bull_thesis,
      bear_thesis: row.bear_thesis,
      synthesis: row.synthesis,
      price_target_p10:
        row.price_target_p10 != null ? Number(row.price_target_p10) : null,
      price_target_p50:
        row.price_target_p50 != null ? Number(row.price_target_p50) : null,
      price_target_p90:
        row.price_target_p90 != null ? Number(row.price_target_p90) : null,
      confidence_score: row.confidence_score,
      key_risks: row.key_risks,
      catalysts: row.catalysts,
      debate_date: row.debate_date,
      price_at_debate: Number(row.price_at_debate),
      provider: row.provider,
      tokens_used: row.tokens_used,
      cached,
    };
  }

  private async buildContext(symbol: string): Promise<{
    symbol: string;
    name: string;
    currentPrice: number;
    shariahStatus: string;
    technical: Record<string, unknown>;
    fundamentals: Record<string, unknown>;
  }> {
    const stock = await this.stockRepo.findOne({ where: { symbol } });
    if (!stock) throw new Error(`Stock ${symbol} not found`);

    const [tech, fin] = await Promise.all([
      this.techRepo.findOne({
        where: { symbol },
        order: { date: 'DESC' },
      }),
      this.financialRepo.findOne({
        where: { symbol },
        order: { fiscal_year: 'DESC' },
      }),
    ]);

    return {
      symbol,
      name: stock.name ?? symbol,
      currentPrice: Number(stock.last_price ?? 0),
      shariahStatus: stock.shariah_status ?? 'pending_review',
      technical: tech
        ? {
            rsi_14: tech.rsi_14,
            sma_20: tech.sma_20,
            sma_50: tech.sma_50,
            macd_line: tech.macd_line,
            atr_14: tech.atr_14,
            close_price: tech.close_price,
          }
        : { note: 'No recent technical data' },
      fundamentals: fin
        ? {
            pe_ratio: fin.pe_ratio,
            pb_ratio: fin.pb_ratio,
            dividend_yield: fin.dividend_yield,
            debt_to_equity: fin.debt_to_equity,
            return_on_equity: fin.return_on_equity,
            fiscal_year: fin.fiscal_year,
          }
        : { note: 'No recent financials' },
    };
  }
}
