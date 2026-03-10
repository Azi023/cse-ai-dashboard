import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockGenerator } from './mock-generator';
import { SYSTEM_PROMPTS } from './prompts';
import { RedisService } from '../cse-data/redis.service';
import * as fs from 'fs';
import * as path from 'path';

export interface StockAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  fundamentalScore: number;
  technicalSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  shariahStatus: string;
  analysis: string;
  riskFactors: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  generatedAt: Date;
}

export interface DailyBrief {
  date: Date;
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTIOUS';
  summary: string;
  topOpportunities: string[];
  keyRisks: string[];
  sectorOutlook: { sector: string; outlook: string }[];
  generatedAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface TradingSignal {
  symbol: string;
  name: string;
  currentPrice: number;
  direction: 'BUY' | 'HOLD' | 'SELL';
  reasoning: string;
  rationale_simple: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  shariahStatus: string;
  suggested_holding_period: string;
  generatedAt: Date;
}

// Redis cache keys
const CACHE_KEYS = {
  DAILY_BRIEF: 'ai:daily-brief:cache',
  stockAnalysis: (symbol: string) => `ai:stock-analysis:${symbol.toUpperCase()}`,
  SIGNALS: 'ai:signals:cache',
};

// Cache TTLs in seconds
const TTL = {
  DAILY_BRIEF: 4 * 3600,    // 4 hours
  STOCK_ANALYSIS: 2 * 3600, // 2 hours
  SIGNALS: 20 * 3600,        // 20 hours — generated once at EOD (2:30 PM), valid until next EOD
};

// Rate limits: max calls per hour (after cache miss)
const RATE_LIMITS: Record<string, number> = {
  'daily-brief': 3,
  'analyze': 20,
  'chat': 30,
  'signals': 6,
};

const MAX_CHAT_HISTORY = 10;

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly isLive: boolean;
  private readonly aiContentDir: string;

  // In-memory rate limiter: endpoint -> array of call timestamps
  private readonly rateLimiter = new Map<string, number[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly mockGenerator: MockGenerator,
    private readonly redisService: RedisService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.isLive = !!apiKey && apiKey.length > 0;
    this.aiContentDir = path.resolve(process.cwd(), '..', '..', 'data', 'ai-generated');
    this.logger.log(`AI Engine initialized in ${this.isLive ? 'LIVE' : 'MOCK'} mode`);
    this.logger.log(`AI content directory: ${this.aiContentDir}`);
  }

  // --- Rate limiter ---

  private checkRateLimit(endpoint: string): boolean {
    const maxCalls = RATE_LIMITS[endpoint] ?? 20;
    const now = Date.now();
    const windowMs = 3_600_000; // 1 hour

    const timestamps = this.rateLimiter.get(endpoint) ?? [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxCalls) {
      this.rateLimiter.set(endpoint, recent);
      this.logger.warn(`Rate limit reached for ${endpoint}: ${recent.length}/${maxCalls} calls/hr`);
      return true; // rate limited
    }

    recent.push(now);
    this.rateLimiter.set(endpoint, recent);
    return false;
  }

  // --- File-based pre-generated content ---

  private getTodayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private loadSavedContent<T>(filename: string): T | null {
    try {
      const filePath = path.join(this.aiContentDir, filename);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        this.logger.log(`Loaded saved AI content from ${filename}`);
        return JSON.parse(raw) as T;
      }
    } catch (error) {
      this.logger.warn(`Failed to load saved AI content ${filename}: ${error}`);
    }
    return null;
  }

  getStatus(): { mode: 'live' | 'mock'; model: string | null } {
    return {
      mode: this.isLive ? 'live' : 'mock',
      model: this.isLive ? 'claude-sonnet-4-6' : null,
    };
  }

  // --- Daily Brief ---

  async getDailyBrief(forceRefresh = false): Promise<DailyBrief> {
    // 1. Check file-based pre-generated content (always takes priority)
    const dateStr = this.getTodayDateStr();
    const saved = this.loadSavedContent<DailyBrief>(`daily-brief-${dateStr}.json`);
    if (saved && !forceRefresh) return saved;

    // 2. Check Redis cache (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = await this.redisService.getJson<DailyBrief>(CACHE_KEYS.DAILY_BRIEF);
      if (cached) {
        this.logger.log('Daily brief served from Redis cache');
        return cached;
      }
    }

    // 3. Rate limit check — if rate limited, return stale cache or mock
    if (this.isLive && this.checkRateLimit('daily-brief')) {
      const stale = await this.redisService.getJson<DailyBrief>(CACHE_KEYS.DAILY_BRIEF);
      if (stale) {
        this.logger.log('Rate limited — serving stale daily brief cache');
        return stale;
      }
      return this.mockGenerator.generateDailyBrief();
    }

    // 4. Generate fresh content
    let brief: DailyBrief;
    if (this.isLive) {
      brief = await this.getLiveDailyBrief();
    } else {
      brief = await this.mockGenerator.generateDailyBrief();
    }

    // 5. Cache in Redis
    await this.redisService.setJson(CACHE_KEYS.DAILY_BRIEF, brief, TTL.DAILY_BRIEF);
    this.logger.log(`Daily brief cached for ${TTL.DAILY_BRIEF / 3600}h`);

    return brief;
  }

  // --- Stock Analysis ---

  async analyzeStock(symbol: string, forceRefresh = false): Promise<StockAnalysis> {
    // 1. Check file-based pre-generated content
    const dateStr = this.getTodayDateStr();
    const saved = this.loadSavedContent<StockAnalysis[]>(`stock-analyses-${dateStr}.json`);
    if (saved && !forceRefresh) {
      const match = saved.find((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
      if (match) return match;
    }

    // 2. Check Redis cache
    const cacheKey = CACHE_KEYS.stockAnalysis(symbol);
    if (!forceRefresh) {
      const cached = await this.redisService.getJson<StockAnalysis>(cacheKey);
      if (cached) {
        this.logger.log(`Stock analysis for ${symbol} served from cache`);
        return cached;
      }
    }

    // 3. Rate limit check
    if (this.isLive && this.checkRateLimit('analyze')) {
      const stale = await this.redisService.getJson<StockAnalysis>(cacheKey);
      if (stale) {
        this.logger.log(`Rate limited — serving stale analysis for ${symbol}`);
        return stale;
      }
      return this.mockGenerator.generateStockAnalysis(symbol);
    }

    // 4. Generate fresh content
    let analysis: StockAnalysis;
    if (this.isLive) {
      analysis = await this.getLiveStockAnalysis(symbol);
    } else {
      analysis = await this.mockGenerator.generateStockAnalysis(symbol);
    }

    // 5. Cache in Redis
    await this.redisService.setJson(cacheKey, analysis, TTL.STOCK_ANALYSIS);
    this.logger.log(`Stock analysis for ${symbol} cached for ${TTL.STOCK_ANALYSIS / 3600}h`);

    return analysis;
  }

  // --- Chat ---

  async chat(
    message: string,
    history: ChatMessage[],
  ): Promise<{ role: 'assistant'; content: string; timestamp: Date }> {
    // Trim history to last MAX_CHAT_HISTORY messages to control token growth
    const trimmedHistory = history.slice(-MAX_CHAT_HISTORY);

    let content: string;

    if (this.isLive && !this.checkRateLimit('chat')) {
      content = await this.getLiveChatResponse(message, trimmedHistory);
    } else if (this.isLive) {
      // Rate limited — still try with mock
      this.logger.warn('Chat rate limited — falling back to mock');
      content = await this.mockGenerator.generateChatResponse(
        message,
        trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
      );
    } else {
      content = await this.mockGenerator.generateChatResponse(
        message,
        trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
      );
    }

    return { role: 'assistant', content, timestamp: new Date() };
  }

  // --- Signals ---

  async getSignals(forceRefresh = false): Promise<TradingSignal[]> {
    // 1. Check Redis cache
    if (!forceRefresh) {
      const cached = await this.redisService.getJson<TradingSignal[]>(CACHE_KEYS.SIGNALS);
      if (cached && cached.length > 0) {
        this.logger.log('Signals served from Redis cache');
        return cached;
      }
    }

    // 2. Rate limit check
    if (this.isLive && this.checkRateLimit('signals')) {
      const stale = await this.redisService.getJson<TradingSignal[]>(CACHE_KEYS.SIGNALS);
      if (stale && stale.length > 0) {
        this.logger.log('Signals rate limited — serving stale cache');
        return stale;
      }
      return this.mockGenerator.generateSignals();
    }

    // 3. Generate fresh signals
    let signals: TradingSignal[];
    if (this.isLive) {
      signals = await this.getLiveSignals();
    } else {
      signals = await this.mockGenerator.generateSignals();
    }

    // 4. Cache in Redis
    await this.redisService.setJson(CACHE_KEYS.SIGNALS, signals, TTL.SIGNALS);
    this.logger.log(`Signals cached for ${TTL.SIGNALS / 3600}h`);

    return signals;
  }

  // --- Live mode methods (Claude API) ---

  private async getLiveDailyBrief(): Promise<DailyBrief> {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({
        apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      });

      const marketData = await this.mockGenerator.getMarketData();
      const dataContext = JSON.stringify(marketData, null, 2);

      const todayStr = new Date().toLocaleDateString('en-GB', {
        timeZone: 'Asia/Colombo',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPTS.dailyBrief,
        messages: [
          {
            role: 'user',
            content: `Today's date in Colombo, Sri Lanka is: ${todayStr}\n\nHere is today's CSE market data. Generate a comprehensive daily brief with the exact date "${todayStr}" in the MARKET PULSE header:\n\n${dataContext}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const aspiPercent = marketData.aspiPercent ?? 0;
      const sentiment =
        aspiPercent > 1
          ? 'BULLISH'
          : aspiPercent < -1
            ? 'BEARISH'
            : aspiPercent < -0.3
              ? 'CAUTIOUS'
              : 'NEUTRAL';

      return {
        date: new Date(),
        marketSentiment: sentiment as DailyBrief['marketSentiment'],
        summary: text,
        topOpportunities: ['See analysis above for opportunities'],
        keyRisks: ['See analysis above for risks'],
        sectorOutlook: [],
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Live daily brief failed, falling back to mock: ${error}`);
      return this.mockGenerator.generateDailyBrief();
    }
  }

  private async getLiveStockAnalysis(symbol: string): Promise<StockAnalysis> {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({
        apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      });

      const mockResult = await this.mockGenerator.generateStockAnalysis(symbol);
      const marketData = await this.mockGenerator.getMarketData();

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPTS.stockAnalysis,
        messages: [
          {
            role: 'user',
            content: `Analyze this CSE stock:\n\nStock: ${mockResult.symbol} (${mockResult.name})\nPrice: LKR ${mockResult.currentPrice}\nShariah Status: ${mockResult.shariahStatus}\nMarket Cap: Available in data\n\nMarket Context:\n${JSON.stringify(marketData, null, 2)}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      return { ...mockResult, analysis: text };
    } catch (error) {
      this.logger.error(`Live stock analysis failed, falling back to mock: ${error}`);
      return this.mockGenerator.generateStockAnalysis(symbol);
    }
  }

  private async getLiveChatResponse(
    message: string,
    history: ChatMessage[],
  ): Promise<string> {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({
        apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      });

      const marketData = await this.mockGenerator.getMarketData();
      const systemPrompt = `${SYSTEM_PROMPTS.chat}\n\nCurrent market data:\n${JSON.stringify(marketData, null, 2)}`;

      const messages = [
        ...history.map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        { role: 'user' as const, content: message },
      ];

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      });

      return response.content[0].type === 'text'
        ? response.content[0].text
        : 'I was unable to generate a response. Please try again.';
    } catch (error) {
      this.logger.error(`Live chat failed, falling back to mock: ${error}`);
      return this.mockGenerator.generateChatResponse(
        message,
        history.map((h) => ({ role: h.role, content: h.content })),
      );
    }
  }

  private async getLiveSignals(): Promise<TradingSignal[]> {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({
        apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      });

      const marketData = await this.mockGenerator.getMarketData();

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPTS.signalGenerator,
        messages: [
          {
            role: 'user',
            content: `Generate trading signals based on today's CSE market data. Output ONLY a valid JSON array (no markdown, no explanation outside the array) matching this structure per signal:\n{\n  "symbol": "SYMBOL.N0000",\n  "name": "Company Name",\n  "currentPrice": 100.00,\n  "direction": "BUY|HOLD|SELL",\n  "reasoning": "2-3 technical sentences for analysts",\n  "rationale_simple": "One plain-English sentence a beginner investor can understand",\n  "confidence": "HIGH|MEDIUM|LOW",\n  "shariahStatus": "compliant|non_compliant|pending_review",\n  "suggested_holding_period": "e.g. 12-24 months, 3-6 months, Short-term: 1-4 weeks"\n}\n\nIMPORTANT: Never say 'buy' or 'sell' as direct instructions. Use 'worth considering' or 'may warrant attention'. Always include suggested_holding_period and rationale_simple.\n\nMarket data:\n${JSON.stringify(marketData, null, 2)}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '[]';

      // Extract JSON array from the response (strip any surrounding text)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('Signals response contained no JSON array, falling back to mock');
        return this.mockGenerator.generateSignals();
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        symbol?: string;
        name?: string;
        currentPrice?: number;
        direction?: string;
        reasoning?: string;
        rationale_simple?: string;
        confidence?: string;
        shariahStatus?: string;
        suggested_holding_period?: string;
      }>;

      const validDirections = new Set(['BUY', 'HOLD', 'SELL']);
      const validConfidences = new Set(['HIGH', 'MEDIUM', 'LOW']);
      const now = new Date();

      const signals: TradingSignal[] = parsed
        .filter((s) => s.symbol && validDirections.has(s.direction ?? ''))
        .map((s) => ({
          symbol: s.symbol!,
          name: s.name ?? s.symbol!,
          currentPrice: s.currentPrice ?? 0,
          direction: s.direction as TradingSignal['direction'],
          reasoning: s.reasoning ?? '',
          rationale_simple: s.rationale_simple ?? 'Research recommended before investing.',
          confidence: validConfidences.has(s.confidence ?? '')
            ? (s.confidence as TradingSignal['confidence'])
            : 'MEDIUM',
          shariahStatus: s.shariahStatus ?? 'pending_review',
          suggested_holding_period: s.suggested_holding_period ?? 'Duration: Research recommended',
          generatedAt: now,
        }));

      if (signals.length === 0) {
        this.logger.warn('No valid signals parsed from Claude response, using mock');
        return this.mockGenerator.generateSignals();
      }

      this.logger.log(`Live signals generated: ${signals.length} signals`);
      return signals;
    } catch (error) {
      this.logger.error(`Live signals failed, falling back to mock: ${error}`);
      return this.mockGenerator.generateSignals();
    }
  }
}
