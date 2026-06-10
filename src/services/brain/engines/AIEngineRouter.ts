/**
 * AIEngineRouter — chooses which AI engine an agent uses, under Brain governance.
 *
 * v1 PRESERVES today's production behavior exactly: every agent that uses an LLM
 * today keeps OpenAI gpt-4o-mini. The router only formalizes the decision so that
 * a future change is a governed BrainChangeRequest (AI_ENGINE_ROUTING, HIGH risk),
 * not a code hunt. Providers without configuration fall back safely; logs carry
 * no secrets.
 */

import type { AIEngineProvider, AIEngineSelection, AgentEngineConfig } from "./AIEngineTypes";

/** Today's production default — DO NOT change without a BrainChangeRequest. */
const DEFAULT_PROVIDER: AIEngineProvider = "OPENAI";
const DEFAULT_MODEL: Record<AIEngineProvider, string> = {
  OPENAI: "gpt-4o-mini",
  CLAUDE: "claude-haiku-4-5-20251001",
  GEMINI: "gemini-flash",
  LOCAL: "local",
  MOCK: "mock",
};

/** Which providers are actually configured in this runtime (no secret values logged). */
export function configuredProviders(env: NodeJS.ProcessEnv = process.env): AIEngineProvider[] {
  const providers: AIEngineProvider[] = ["MOCK"]; // MOCK is always available (tests)
  if (env.OPENAI_API_KEY) providers.push("OPENAI");
  if (env.ANTHROPIC_API_KEY) providers.push("CLAUDE");
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) providers.push("GEMINI");
  return providers;
}

/**
 * Per-agent preference (future-facing). v1 keeps everyone on the current default
 * so NOTHING changes in production. A different mapping must arrive via a
 * governed BrainChangeRequest, never by an agent at runtime.
 */
export const AGENT_ENGINE_PREFERENCES: AgentEngineConfig = {
  waiter: "OPENAI",
  crm: "OPENAI",
  whatsapp: "OPENAI",
  analytics: "OPENAI",
  quality: "OPENAI",
};

export function selectEngine(
  agentId: string,
  opts: { env?: NodeJS.ProcessEnv; preferences?: AgentEngineConfig } = {},
): AIEngineSelection {
  const env = opts.env ?? process.env;
  const prefs = opts.preferences ?? AGENT_ENGINE_PREFERENCES;
  const available = configuredProviders(env);

  const preferred = prefs[agentId] ?? DEFAULT_PROVIDER;
  if (available.includes(preferred)) {
    return {
      provider: preferred,
      model: DEFAULT_MODEL[preferred],
      reason: prefs[agentId] ? `preferência do agente ${agentId}` : "default do Brain",
      fallbackProvider: "MOCK",
    };
  }

  // Preferred provider not configured → safe fallback chain: default → MOCK.
  if (preferred !== DEFAULT_PROVIDER && available.includes(DEFAULT_PROVIDER)) {
    return {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL[DEFAULT_PROVIDER],
      reason: `provider ${preferred} não configurado — fallback para o default`,
      fallbackProvider: "MOCK",
    };
  }
  return {
    provider: "MOCK",
    model: DEFAULT_MODEL.MOCK,
    reason: `nenhum provider configurado para ${agentId} — fallback determinístico seguro`,
  };
}
