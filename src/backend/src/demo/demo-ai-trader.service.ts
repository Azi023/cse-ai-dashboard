import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DemoAccount } from './entities/demo-account.entity';
import { DemoHolding } from './entities/demo-holding.entity';
import { DemoTrade } from './entities/demo-trade.entity';
import { Stock } from '../entities/stock.entity';
import { StockScore } from '../entities/stock-score.entity';
import { RedisService } from '../modules/cse-data/redis.service';
import { DemoService } from './demo.service';

// Guardrails
const MAX_DAILY_TRADES = 10;
const MAX_POSITION_PCT = 0.2;
const MAX_CONCENTRATION = 0.4;
const MIN_SCORE_THRESHOLD = 7.0;
const STOP_LOSS_PCT = 0.15;

const AI_LOG_KEY = (id: number) => `demo:ai-log:${id}`;
const MONTHLY_TOKEN_CAP = 500_000;
const AI_LOG_MAX = 200;

interface CachedSignal {
  symbol: string;
  name: string;
  currentPrice: number;
  direction: 'BUY' | 'HOLD' | 'SELL';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  shariahStatus: string;
  reasoning: string;
  rationale_simple: string;
}

export interface AIDecision {
  timestamp: string;
  account_id: number;
  action: 'BUY' | 'SELL' | 'NO_TRADE';
  symbol?: string;
  quantity?: number;
  price?: number;
  reasoning: string;
  signal_confidence?: string;
  trade_id?: number;
}

@Injectable()
export class DemoAITraderService {
  private readonly logger = new Logger(DemoAITraderService.name);

  constructor(
    @InjectRepository(DemoAccount)
    private readonly accountRepo: Repository<DemoAccount>,
    @InjectRepository(DemoHolding)
    private readonly holdingRepo: Repository<DemoHolding>,
    @InjectRepository(DemoTrade)
    private readonly tradeRepo: Repository<DemoTrade>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(StockScore)
    private readonly stockScoreRepo: Repository<StockScore>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly demoService: DemoService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  async evaluateAndTrade(accountId: number): Promise<AIDecision[]> {
    const decisions: AIDecision[] = [];

    const account = await this.accountRepo.findOneBy({
      id: accountId,
      is_active: true,
    });
    if (!account) {
      this.logger.warn(`Demo account ${accountId} not found or inactive`);
      return decisions;
    }

    // Check daily trade count
    const today = new Date().toISOString().split('T')[0];
    const tradesToday = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.demo_account_id = :id', { id: accountId })
      .andWhere("DATE(t.executed_at AT TIME ZONE 'UTC') = :date", {
        date: today,
      })
      .getCount();

    if (tradesToday >= MAX_DAILY_TRADES) {
      return this.noTrade(
        accountId,
        `Daily trade limit reached (${tradesToday}/${MAX_DAILY_TRADES}).`,
        decisions,
      );
    }

    const holdings = await this.holdingRepo.find({
      where: { demo_account_id: accountId },
    });
    const cashBalance = parseFloat(String(account.cash_balance));

    // ── Stop-loss checks ───────────────────────────────────────────────────
    for (const holding of holdings) {
      if (tradesToday + decisions.filter((d) => d.action !== 'NO_TRADE').length >= MAX_DAILY_TRADES) break;

      const price = await this.getPrice(holding.symbol);
      if (!price) continue;

      const avgCost = parseFloat(String(holding.avg_cost_basis));
      if (price >= avgCost * (1 - STOP_LOSS_PCT)) continue;

      const qty = Math.floor(parseFloat(String(holding.quantity)));
      const dropPct = ((avgCost - price) / avgCost) * 100;
      const reasoning =
        `STOP-LOSS: ${holding.symbol} at LKR ${price.toFixed(2)} is ` +
        `${dropPct.toFixed(1)}% below cost basis LKR ${avgCost.toFixed(2)}. ` +
        `Selling all ${qty} shares to limit further loss.`;

      try {
        const trade = await this.demoService.executeTrade({
          demo_account_id: accountId,
          symbol: holding.symbol,
          direction: 'SELL',
          quantity: qty,
          source: 'AI_AUTO',
          ai_reasoning: reasoning,
        });
        const decision: AIDecision = {
          timestamp: new Date().toISOString(),
          account_id: accountId,
          action: 'SELL',
          symbol: holding.symbol,
          quantity: qty,
          price,
          reasoning,
          trade_id: trade.id,
        };
        decisions.push(decision);
        await this.appendLog(accountId, decision);
        this.logger.log(`Stop-loss SELL: ${holding.symbol} × ${qty} @ LKR ${price.toFixed(2)}`);
      } catch (err) {
        this.logger.error(`Stop-loss sell failed for ${holding.symbol}: ${err}`);
      }
    }

    // ── BUY signal evaluation ──────────────────────────────────────────────
    const signals = await this.getQualifyingSignals();

    if (signals.length === 0) {
      return this.noTrade(
        accountId,
        'No qualifying BUY signals above threshold.',
        decisions,
      );
    }

    // Portfolio value for position sizing
    let holdingsValue = 0;
    for (const h of holdings) {
      const p = await this.getPrice(h.symbol);
      holdingsValue +=
        (p ?? parseFloat(String(h.avg_cost_basis))) *
        parseFloat(String(h.quantity));
    }
    const portfolioValue = cashBalance + holdingsValue;

    const maxNewTrades = Math.min(
      2,
      MAX_DAILY_TRADES -
        tradesToday -
        decisions.filter((d) => d.action !== 'NO_TRADE').length,
    );
    let tradesExecuted = 0;

    for (const signal of signals) {
      if (tradesExecuted >= maxNewTrades) break;

      const price = await this.getPrice(signal.symbol);
      if (!price || price <= 0) {
        await this.appendLog(accountId, {
          timestamp: new Date().toISOString(),
          account_id: accountId,
          action: 'NO_TRADE',
          symbol: signal.symbol,
          reasoning: `${signal.symbol}: No price data available.`,
        });
        continue;
      }

      // Position sizing: up to MAX_POSITION_PCT of portfolio, limited to 90% of cash
      const maxTradeValue = Math.min(
        portfolioValue * MAX_POSITION_PCT,
        cashBalance * 0.9,
      );
      if (maxTradeValue < price) {
        await this.appendLog(accountId, {
          timestamp: new Date().toISOString(),
          account_id: accountId,
          action: 'NO_TRADE',
          symbol: signal.symbol,
          reasoning: `${signal.symbol}: Insufficient cash for even 1 share.`,
        });
        continue;
      }

      // Quantity (floor to integer, accounting for ~1.012 fee multiplier)
      const quantity = Math.max(1, Math.floor(maxTradeValue / price / 1.012));

      // Concentration cap check
      const existingHolding = holdings.find((h) => h.symbol === signal.symbol);
      const existingValue = existingHolding
        ? price * parseFloat(String(existingHolding.quantity))
        : 0;
      if (
        portfolioValue > 0 &&
        (existingValue + quantity * price) / portfolioValue > MAX_CONCENTRATION
      ) {
        const decision: AIDecision = {
          timestamp: new Date().toISOString(),
          account_id: accountId,
          action: 'NO_TRADE',
          symbol: signal.symbol,
          reasoning: `${signal.symbol}: Would exceed 40% concentration cap. Skipping.`,
        };
        decisions.push(decision);
        await this.appendLog(accountId, decision);
        continue;
      }

      const reasoning = await this.generateReasoning(
        signal,
        portfolioValue,
        quantity,
        price,
        cashBalance,
      );

      try {
        const trade = await this.demoService.executeTrade({
          demo_account_id: accountId,
          symbol: signal.symbol,
          direction: 'BUY',
          quantity,
          source: 'AI_AUTO',
          ai_reasoning: reasoning,
        });
        const decision: AIDecision = {
          timestamp: new Date().toISOString(),
          account_id: accountId,
          action: 'BUY',
          symbol: signal.symbol,
          quantity,
          price,
          reasoning,
          signal_confidence: signal.confidence,
          trade_id: trade.id,
        };
        decisions.push(decision);
        await this.appendLog(accountId, decision);
        tradesExecuted++;
        this.logger.log(
          `AI BUY: ${signal.symbol} × ${quantity} @ LKR ${price.toFixed(2)}`,
        );
      } catch (err) {
        const reason = `Trade execution failed: ${String(err).substring(0, 120)}`;
        const decision: AIDecision = {
          timestamp: new Date().toISOString(),
          account_id: accountId,
          action: 'NO_TRADE',
          symbol: signal.symbol,
          reasoning: reason,
        };
        decisions.push(decision);
        await this.appendLog(accountId, decision);
        this.logger.error(`AI trade failed for ${signal.symbol}: ${err}`);
      }
    }

    if (tradesExecuted === 0 && decisions.every((d) => d.action === 'NO_TRADE')) {
      this.logger.log(
        `Account ${accountId}: No trades executed this cycle — all signals failed constraints.`,
      );
    }

    return decisions;
  }

  async getAILog(
    accountId: number,
    limit = 100,
  ): Promise<{ decisions: AIDecision[]; total: number }> {
    const raw =
      (await this.redisService.getJson<AIDecision[]>(AI_LOG_KEY(accountId))) ??
      [];
    return { decisions: raw.slice(0, limit), total: raw.length };
  }

  // ─── Signal Retrieval ──────────────────────────────────────────────────────

  private async getQualifyingSignals(): Promise<CachedSignal[]> {
    // 1. Try Redis AI signals cache
    const cached = await this.redisService.getJson<CachedSignal[]>(
      'ai:signals:cache',
    );
    if (cached && cached.length > 0) {
      return cached
        .filter((s) => s.direction === 'BUY')
        .filter((s) => this.normalizeShariahStatus(s.shariahStatus) === 'COMPLIANT')
        .filter((s) => this.confidenceToScore(s.confidence) >= MIN_SCORE_THRESHOLD)
        .sort(
          (a, b) =>
            this.confidenceToScore(b.confidence) -
            this.confidenceToScore(a.confidence),
        );
    }

    // 2. Fallback: top-scored compliant stocks from stock_scores table
    const today = new Date().toISOString().split('T')[0];
    const scores = await this.stockScoreRepo
      .createQueryBuilder('ss')
      .innerJoin(Stock, 'st', 'st.symbol = ss.symbol')
      .where('st.shariah_status = :status', { status: 'compliant' })
      .andWhere('ss.date = :date', { date: today })
      .andWhere('ss.composite_score >= :threshold', {
        threshold: MIN_SCORE_THRESHOLD,
      })
      .orderBy('ss.composite_score', 'DESC')
      .take(5)
      .getMany();

    return scores.map((s) => ({
      symbol: s.symbol,
      name: s.symbol,
      currentPrice: 0,
      direction: 'BUY' as const,
      confidence: (Number(s.composite_score) >= 8 ? 'HIGH' : 'MEDIUM') as
        | 'HIGH'
        | 'MEDIUM',
      shariahStatus: 'compliant',
      reasoning: `Score-based signal: composite ${s.composite_score}/100`,
      rationale_simple: `High composite score (${s.composite_score}/100)`,
    }));
  }

  // ─── Reasoning Generation ──────────────────────────────────────────────────

  private async generateReasoning(
    signal: CachedSignal,
    portfolioValue: number,
    quantity: number,
    price: number,
    cashBalance: number,
  ): Promise<string> {
    const positionPct =
      portfolioValue > 0
        ? ((quantity * price) / portfolioValue) * 100
        : 0;
    const aspiValue = await this.getAspi();
    const template =
      `BUY ${signal.symbol}: Confidence ${signal.confidence} — ` +
      `${signal.rationale_simple || signal.reasoning}. ` +
      `Shariah: ${this.normalizeShariahStatus(signal.shariahStatus)}. ` +
      `ASPI: ${aspiValue > 0 ? aspiValue.toFixed(2) : 'N/A'}. ` +
      `Position: ${positionPct.toFixed(1)}% of portfolio ` +
      `(${quantity} shares @ LKR ${price.toFixed(2)}). ` +
      `Cash remaining: LKR ${(cashBalance - quantity * price * 1.012).toFixed(2)}.`;

    try {
      const enhanced = await this.enhanceWithHaiku(template, signal);
      if (enhanced) return enhanced;
    } catch {
      // fall back to template
    }
    return template;
  }

  private async enhanceWithHaiku(
    template: string,
    signal: CachedSignal,
  ): Promise<string | null> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) return null;

    // Token budget guard
    const month = new Date().toISOString().slice(0, 7);
    const raw = await this.redisService.get(`ai:tokens:${month}`);
    if (raw && parseInt(raw, 10) >= MONTHLY_TOKEN_CAP) return null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [
          {
            role: 'user',
            content:
              `Write a concise 1–2 sentence professional AI trade reasoning for this CSE demo trade: ${template} ` +
              `Stock: ${signal.symbol}. Be specific and factual. No filler.`,
          },
        ],
      });

      const enhanced =
        (msg.content[0] as { text?: string }).text?.trim() ?? null;

      // Update token counter
      const used = parseInt(raw ?? '0', 10);
      const newTotal =
        used +
        (msg.usage?.input_tokens ?? 0) +
        (msg.usage?.output_tokens ?? 0);
      await this.redisService.set(`ai:tokens:${month}`, String(newTotal));

      return enhanced;
    } catch (err) {
      this.logger.warn(`Haiku reasoning enhancement failed: ${err}`);
      return null;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async getPrice(symbol: string): Promise<number | null> {
    try {
      const ts = await this.redisService.getJson<{
        reqTradeSummery?: Array<{ symbol?: string; price?: number }>;
      }>('cse:trade_summary');
      const match = ts?.reqTradeSummery?.find((t) => t.symbol === symbol);
      if (match?.price && Number(match.price) > 0) return Number(match.price);
    } catch {
      // ignore
    }
    const stock = await this.stockRepo.findOneBy({ symbol });
    if (stock?.last_price && Number(stock.last_price) > 0) {
      return parseFloat(String(stock.last_price));
    }
    return null;
  }

  private async getAspi(): Promise<number> {
    try {
      const d = await this.redisService.getJson<{ value?: number }>(
        'cse:aspi_data',
      );
      return Number(d?.value ?? 0);
    } catch {
      return 0;
    }
  }

  private confidenceToScore(confidence: string): number {
    if (confidence === 'HIGH') return 9.0;
    if (confidence === 'MEDIUM') return 7.0;
    return 5.0;
  }

  private normalizeShariahStatus(status: string): string {
    const s = (status ?? '').toLowerCase().replace(/[_\s-]/g, '');
    if (s === 'compliant') return 'COMPLIANT';
    if (s === 'noncompliant' || s === 'blacklisted') return 'NON_COMPLIANT';
    return 'PENDING';
  }

  private async noTrade(
    accountId: number,
    reasoning: string,
    decisions: AIDecision[],
  ): Promise<AIDecision[]> {
    const decision: AIDecision = {
      timestamp: new Date().toISOString(),
      account_id: accountId,
      action: 'NO_TRADE',
      reasoning,
    };
    decisions.push(decision);
    await this.appendLog(accountId, decision);
    this.logger.log(`Account ${accountId} NO_TRADE: ${reasoning}`);
    return decisions;
  }

  private async appendLog(
    accountId: number,
    decision: AIDecision,
  ): Promise<void> {
    const key = AI_LOG_KEY(accountId);
    const existing =
      (await this.redisService.getJson<AIDecision[]>(key)) ?? [];
    existing.unshift(decision); // newest first
    await this.redisService.setJson(
      key,
      existing.slice(0, AI_LOG_MAX),
      30 * 24 * 3600,
    );
  }
}
