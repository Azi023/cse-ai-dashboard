import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockGenerator } from './mock-generator';
import { SYSTEM_PROMPTS } from './prompts';
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
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  shariahStatus: string;
  generatedAt: Date;
}

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly isLive: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockGenerator: MockGenerator,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.isLive = !!apiKey && apiKey.length > 0;
    // Look for pre-generated AI content in project data directory
    // Works from both src/ (dev) and dist/ (prod) since we go up to backend root then to project root
    this.aiContentDir = path.resolve(process.cwd(), '..', '..', 'data', 'ai-generated');
    this.logger.log(`AI Engine initialized in ${this.isLive ? 'LIVE' : 'MOCK'} mode`);
    this.logger.log(`AI content directory: ${this.aiContentDir}`);
  }

  private readonly aiContentDir: string;

  private getTodayDateStr(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
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

  async getDailyBrief(): Promise<DailyBrief> {
    // Check for pre-generated content first
    const dateStr = this.getTodayDateStr();
    const saved = this.loadSavedContent<DailyBrief>(
      `daily-brief-${dateStr}.json`,
    );
    if (saved) return saved;

    if (this.isLive) {
      return this.getLiveDailyBrief();
    }
    return this.mockGenerator.generateDailyBrief();
  }

  async analyzeStock(symbol: string): Promise<StockAnalysis> {
    // Check for pre-generated content first
    const dateStr = this.getTodayDateStr();
    const saved = this.loadSavedContent<StockAnalysis[]>(
      `stock-analyses-${dateStr}.json`,
    );
    if (saved) {
      const match = saved.find(
        (a) => a.symbol.toUpperCase() === symbol.toUpperCase(),
      );
      if (match) return match;
    }

    if (this.isLive) {
      return this.getLiveStockAnalysis(symbol);
    }
    return this.mockGenerator.generateStockAnalysis(symbol);
  }

  async chat(
    message: string,
    history: ChatMessage[],
  ): Promise<{ role: 'assistant'; content: string; timestamp: Date }> {
    let content: string;

    if (this.isLive) {
      content = await this.getLiveChatResponse(message, history);
    } else {
      content = await this.mockGenerator.generateChatResponse(
        message,
        history.map((h) => ({ role: h.role, content: h.content })),
      );
    }

    return {
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
  }

  async getSignals(): Promise<TradingSignal[]> {
    if (this.isLive) {
      return this.getLiveSignals();
    }
    return this.mockGenerator.generateSignals();
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

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPTS.dailyBrief,
        messages: [
          {
            role: 'user',
            content: `Here is today's CSE market data. Generate a comprehensive daily brief:\n\n${dataContext}`,
          },
        ],
      });

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';

      const sentiment =
        (marketData.aspiPercent ?? 0) > 1
          ? 'BULLISH'
          : (marketData.aspiPercent ?? 0) < -1
            ? 'BEARISH'
            : (marketData.aspiPercent ?? 0) < -0.3
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

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';

      return {
        ...mockResult,
        analysis: text,
      };
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
    // Signals still use mock generator with live data — full AI signal generation
    // would require more sophisticated prompting and backtesting
    return this.mockGenerator.generateSignals();
  }
}
