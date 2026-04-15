import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiChatRequest,
  AiGenerateRequest,
  AiProvider,
  AiResponse,
} from './ai-provider.interface';

/**
 * OpenAI adapter. Used when Claude budget is exhausted (see
 * AiUsageService.shouldFallbackToOpenAI). Prompt contracts match the
 * Claude adapter 1:1, just with different wire format.
 *
 * Cost anchor (2026): gpt-4o-mini input ≈ \$0.15/M, Haiku ≈ \$1.00/M.
 * Routing high-volume short prompts here saves ~6×.
 *
 * Model map prioritises gpt-4o-mini for cheap tasks, gpt-4o for
 * reasoning-heavy ones (synthesis + chat).
 */
const OPENAI_MODELS: Record<AiGenerateRequest['task'], string> = {
  'debate-agent': 'gpt-4o-mini',
  'debate-synthesis': 'gpt-4o-mini',
  'daily-brief': 'gpt-4o-mini',
  'stock-analysis': 'gpt-4o-mini',
  signals: 'gpt-4o-mini',
  chat: 'gpt-4o-mini',
};

@Injectable()
export class OpenAIProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly logger = new Logger(OpenAIProvider.name);

  constructor(private readonly configService: ConfigService) {}

  resolveModel(task: AiGenerateRequest['task']): string {
    const envOverride = this.configService.get<string>(
      task === 'debate-agent' || task === 'debate-synthesis'
        ? 'AI_DEBATE_MODEL_OPENAI'
        : 'AI_DEFAULT_MODEL_OPENAI',
    );
    return envOverride || OPENAI_MODELS[task];
  }

  async generate(req: AiGenerateRequest): Promise<AiResponse> {
    const client = await this.client();
    const model = this.resolveModel(req.task);
    const response = await client.chat.completions.create({
      model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      ...(req.expectJson ? { response_format: { type: 'json_object' } } : {}),
    });
    const text = response.choices[0]?.message?.content ?? '';
    const tokensUsed = response.usage?.total_tokens ?? 0;
    return { text, tokensUsed, provider: 'openai', model };
  }

  async chat(req: AiChatRequest): Promise<AiResponse> {
    const client = await this.client();
    const model = this.resolveModel('chat');
    const messages = [
      { role: 'system' as const, content: req.systemPrompt },
      ...req.history.map((m) => ({ role: m.role, content: m.content })),
    ];
    const response = await client.chat.completions.create({
      model,
      max_tokens: req.maxTokens,
      messages,
    });
    const text = response.choices[0]?.message?.content ?? '';
    const tokensUsed = response.usage?.total_tokens ?? 0;
    return { text, tokensUsed, provider: 'openai', model };
  }

  private async client() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    const OpenAI = (await import('openai')).default;
    return new OpenAI({ apiKey });
  }
}
