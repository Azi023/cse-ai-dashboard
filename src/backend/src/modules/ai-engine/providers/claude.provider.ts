import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiChatRequest,
  AiGenerateRequest,
  AiProvider,
  AiResponse,
} from './ai-provider.interface';

/**
 * Claude adapter. Wraps the existing Anthropic SDK usage so callers
 * can swap to OpenAI without touching the prompt layer.
 *
 * Model map (keep in sync with auth-service cost notes):
 *   debate-agent      → Haiku   (cheap, high-volume)
 *   debate-synthesis  → Sonnet  (reasoning-heavy)
 *   daily-brief       → Haiku   (reporting)
 *   stock-analysis    → Haiku   (summarisation)
 *   signals           → Sonnet  (structured JSON quality)
 *   chat              → Sonnet  (multi-turn reasoning)
 */
const CLAUDE_MODELS: Record<AiGenerateRequest['task'], string> = {
  'debate-agent': 'claude-haiku-4-5-20251001',
  'debate-synthesis': 'claude-sonnet-4-6',
  'daily-brief': 'claude-haiku-4-5-20251001',
  'stock-analysis': 'claude-haiku-4-5-20251001',
  signals: 'claude-sonnet-4-6',
  chat: 'claude-sonnet-4-6',
};

@Injectable()
export class ClaudeProvider implements AiProvider {
  readonly name = 'claude' as const;
  private readonly logger = new Logger(ClaudeProvider.name);

  constructor(private readonly configService: ConfigService) {}

  resolveModel(task: AiGenerateRequest['task']): string {
    return CLAUDE_MODELS[task];
  }

  async generate(req: AiGenerateRequest): Promise<AiResponse> {
    const client = await this.client();
    const model = this.resolveModel(req.task);
    const response = await client.messages.create({
      model,
      max_tokens: req.maxTokens,
      system: req.systemPrompt,
      messages: [{ role: 'user', content: req.userPrompt }],
    });
    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    const tokensUsed =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);
    return { text, tokensUsed, provider: 'claude', model };
  }

  async chat(req: AiChatRequest): Promise<AiResponse> {
    const client = await this.client();
    const model = this.resolveModel('chat');
    const response = await client.messages.create({
      model,
      max_tokens: req.maxTokens,
      system: req.systemPrompt,
      messages: req.history
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
    });
    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    const tokensUsed =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);
    return { text, tokensUsed, provider: 'claude', model };
  }

  private async client() {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    return new Anthropic({ apiKey });
  }
}
