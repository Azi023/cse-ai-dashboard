/**
 * Minimal multi-provider AI contract.
 *
 * Two shapes chosen deliberately:
 *   - `generate()` for one-shot structured output (debate agents,
 *     summarisation). System+user prompt, no history.
 *   - `chat()` for multi-turn conversations (strategy chat).
 *
 * Providers self-report tokensUsed so the caller can forward to
 * AiUsageService without the caller needing to know which SDK ran.
 */
export type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface AiGenerateRequest {
  /** Logical capability, NOT a wire-level model id. The provider maps it. */
  task:
    | 'debate-agent'
    | 'debate-synthesis'
    | 'daily-brief'
    | 'stock-analysis'
    | 'signals'
    | 'chat';
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /** If true, requests JSON-only output (mode varies per provider). */
  expectJson?: boolean;
}

export interface AiChatRequest {
  task: 'chat';
  systemPrompt: string;
  history: AiMessage[];
  maxTokens: number;
}

export interface AiResponse {
  text: string;
  tokensUsed: number;
  provider: 'claude' | 'openai';
  model: string;
}

export interface AiProvider {
  readonly name: 'claude' | 'openai';
  generate(req: AiGenerateRequest): Promise<AiResponse>;
  chat(req: AiChatRequest): Promise<AiResponse>;
  /** Model id this provider would use for the given task (for logging). */
  resolveModel(task: AiGenerateRequest['task']): string;
}
