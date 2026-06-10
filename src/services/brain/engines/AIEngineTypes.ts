/**
 * AI Engine types — the Brain treats AI models as interchangeable ENGINES.
 * The Brain decides WHAT to think; the router decides WHICH engine thinks it.
 */

export type AIEngineProvider = "OPENAI" | "CLAUDE" | "GEMINI" | "LOCAL" | "MOCK";

export interface AIEngineSelection {
  provider: AIEngineProvider;
  model: string;
  reason: string;
  fallbackProvider?: AIEngineProvider;
}

/** Per-agent engine preferences (future: persisted config; v1: code default). */
export type AgentEngineConfig = Partial<Record<string, AIEngineProvider>>;
