import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiUsageService } from '../ai-usage.service';
import { AiProvider } from './ai-provider.interface';
import { ClaudeProvider } from './claude.provider';
import { OpenAIProvider } from './openai.provider';

/**
 * Selects the provider for each call. Rule:
 *   - default → Claude
 *   - if OPENAI_API_KEY is set AND monthly Claude tokens
 *     ≥ AI_PROVIDER_FALLBACK_THRESHOLD (%), route to OpenAI
 *   - if OPENAI_API_KEY is missing, always stick with Claude
 *
 * Callers also receive the selected provider so they can hand the
 * returned tokens back to AiUsageService — tokens count against the
 * same monthly counter regardless of provider, giving us a unified
 * budget view.
 */
@Injectable()
export class AiProviderFactory {
  private readonly logger = new Logger(AiProviderFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiUsage: AiUsageService,
    private readonly claude: ClaudeProvider,
    private readonly openai: OpenAIProvider,
  ) {}

  async pick(): Promise<AiProvider> {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!openaiKey) return this.claude;

    const shouldFallback = await this.aiUsage.shouldFallbackToOpenAI();
    if (!shouldFallback) return this.claude;

    this.logger.warn(
      'Claude budget threshold exceeded — routing this call to OpenAI',
    );
    return this.openai;
  }

  /** Escape hatch: explicitly request a provider (debate experiments, tests). */
  force(name: 'claude' | 'openai'): AiProvider {
    return name === 'openai' ? this.openai : this.claude;
  }
}
