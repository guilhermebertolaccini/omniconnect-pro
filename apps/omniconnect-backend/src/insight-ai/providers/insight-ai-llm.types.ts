/**
 * LLM provider contract for InsightAI (Sprint 5 — multi-provider).
 * Callers build the user prompt (PII-redacted) and pass `modelRef` per deployment.
 */
export interface InsightAiCompletionRequest {
  tenantId: string;
  /** Full user message: pre-redacted analysis prompt. */
  userPrompt: string;
  /** Provider-specific model id (e.g. `gpt-4o-mini`). */
  modelRef: string;
  /** Optional system prompt; provider may apply a default. */
  systemPrompt?: string;
}

export interface InsightAiCompletionResult {
  rawText: string;
  promptTokens: number;
  completionTokens: number;
}

export interface InsightAiLlmProvider {
  readonly id: string;
  /** True when this deployment can call the vendor API (e.g. API key present). */
  isConfigured(): boolean;
  completeJson(req: InsightAiCompletionRequest): Promise<InsightAiCompletionResult>;
}