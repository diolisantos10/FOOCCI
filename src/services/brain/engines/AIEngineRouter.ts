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
  GEMINI: "gemini-2.5-flash",
  LOCAL: "local",
  MOCK: "mock",
};

/** Por natureza da tarefa — um agente pode usar pilotos diferentes por função. */
export type EngineTaskProfile = "CLASSIFY" | "REASON" | "JUDGE" | "GENERATE";

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
  "analytics-product": "OPENAI", // must match the profile registry slug
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

// ── Roteamento PERSISTIDO e governado (Fase 4) ──────────────────────────────────
// Linhas em brain_engine_routing são escritas SOMENTE pelo ChangeRequestApplier
// (CR AI_ENGINE_ROUTING aprovado por humano). O router lê com cache curto e cai
// com segurança na lógica estática quando não há linha ou o provider da linha
// não está configurado — nunca pior do que hoje.

interface RoutingRow {
  businessId: string | null;
  agentId: string;
  taskProfile: string;
  provider: string;
  model: string | null;
}

let routingCache: { rows: RoutingRow[]; fetchedAt: number } | null = null;
const ROUTING_TTL_MS = 60_000;

/** Test/apply hook: força releitura do DB na próxima seleção. */
export function __clearEngineRoutingCache(): void {
  routingCache = null;
}

async function loadRoutingRows(): Promise<RoutingRow[]> {
  const now = Date.now();
  if (routingCache && now - routingCache.fetchedAt < ROUTING_TTL_MS) return routingCache.rows;
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.brainEngineRouting.findMany({
      where: { enabled: true },
      select: { businessId: true, agentId: true, taskProfile: true, provider: true, model: true },
    });
    routingCache = { rows, fetchedAt: now };
    return rows;
  } catch {
    // DB indisponível / tabela ainda não migrada → roteamento estático (seguro).
    routingCache = { rows: [], fetchedAt: now };
    return [];
  }
}

export interface RoutedSelectionOptions {
  businessId?: string;
  taskProfile?: EngineTaskProfile;
  env?: NodeJS.ProcessEnv;
}

/**
 * Seleção com governança persistida: linha específica do negócio > linha global
 * > lógica estática (preferências de código → default → MOCK).
 */
export async function selectEngineRouted(
  agentId: string,
  opts: RoutedSelectionOptions = {},
): Promise<AIEngineSelection> {
  const env = opts.env ?? process.env;
  const taskProfile = opts.taskProfile ?? "REASON";
  const rows = await loadRoutingRows();

  const row =
    rows.find((r) => r.businessId === (opts.businessId ?? null) && r.agentId === agentId && r.taskProfile === taskProfile) ??
    rows.find((r) => r.businessId === null && r.agentId === agentId && r.taskProfile === taskProfile);

  if (row) {
    const provider = row.provider as AIEngineProvider;
    if (configuredProviders(env).includes(provider)) {
      return {
        provider,
        model: row.model ?? DEFAULT_MODEL[provider],
        reason: `roteamento governado (DB) — ${agentId}/${taskProfile}`,
        fallbackProvider: "MOCK",
      };
    }
    // Linha aponta para provider sem chave → ignora e cai na lógica estática.
  }
  return selectEngine(agentId, { env });
}
