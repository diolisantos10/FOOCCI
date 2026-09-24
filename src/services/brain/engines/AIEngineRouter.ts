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
// ⚠️ Import de TIPO zero e de função pura: este arquivo continua sem depender de
// SDK de laboratório nenhum (ver services/brain/architecture.test.ts).
import { portaoDeIaConfigurado } from "./ControlRoomEngineAdapter";

/** Today's production default — DO NOT change without a BrainChangeRequest. */
const DEFAULT_PROVIDER: AIEngineProvider = "OPENAI";
const DEFAULT_MODEL: Record<AIEngineProvider, string> = {
  OPENAI: "gpt-4o-mini",
  CLAUDE: "claude-haiku-4-5-20251001",
  GEMINI: "gemini-2.5-flash",
  LOCAL: "local",
  MOCK: "mock",
};

/**
 * ⭐ MODELO POR AGENTE — a regra de ouro da casa: o NOME DO MODELO mora AQUI, no
 * roteador, e nunca dentro do agente. Um agente sem linha aqui usa o
 * DEFAULT_MODEL do provider dele.
 *
 * `whatsapp` — ordem do CEO, 24/09/2026: *"põe uma inteligência artificial nele,
 * uma boa. Ele é tier 1."* O cargo é o agente que ANOTA PEDIDO do cliente final
 * do restaurante, no WhatsApp, ao vivo.
 *
 * A escolha seguiu D-101/D-102/D-0FC, nesta ordem e sem pular passo:
 *
 * 1. NÍVEL (D-101): Tier 1 ⇒ classe **A**. Isso sozinho já elimina o que estava
 *    aqui: `gpt-4o-mini` não é classe A, é um motor pequeno num cargo Tier 1.
 * 2. HABILIDADE (D-102 passo 2 / D-0FC): o trabalho é conversar com cliente
 *    final em linguagem solta e montar comanda **sem inventar item nem preço** —
 *    não é pesquisa e não é código. A linha Opus da Anthropic lidera a medição
 *    de conversa/escrita da prateleira de 23/09 (EQ-Bench Creative Writing, Elo
 *    2121, 1º) e o AA Intelligence Index.
 *    ⚠️ RESTRIÇÃO DURA, DECLARADA: é atendimento AO VIVO. Latência importa —
 *    modelo lento arruína a conversa. `claude-opus-5` é a única classe A que é
 *    GA hoje E expõe `output_config.effort`, então a profundidade (e com ela o
 *    tempo de resposta) é controlável: este agente roda em `effort: "low"`, o
 *    nível indicado para rota conversacional sensível a latência.
 *    ⛔ Por isso NÃO foi escolhido `claude-fable-5-1`: é a linha de raciocínio
 *    longo, com turnos declaradamente longos — capacidade que este cargo não usa
 *    e latência que ele não tolera.
 *    ⛔ E NÃO foi escolhido `claude-opus-5-5`: lançado em 22/09/2026, dois dias
 *    atrás. Estrear um modelo recém-lançado em cima de cliente real do Sushi
 *    Cazza, hoje, é risco sem ganho medido. Trocar depois é UMA LINHA aqui.
 * 3. PREÇO (D-102 passo 3): só desempatou entre equivalentes — $5/$25 do
 *    `claude-opus-5` contra $10/$50 do `claude-fable-5-1`. Não atravessou 1 nem 2.
 *
 * ⚠️ ATUALIZADO EM 24/09/2026 (D-105): o que liga esta escolha NÃO é mais uma
 * `ANTHROPIC_API_KEY` neste produto — ela não deve existir aqui. É o **Portão de
 * IA da Control Room** (`CONTROL_ROOM_IA_URL` / `_SEGREDO` / `_CRACHA`). Sem as
 * três, `configuredProviders` não lista CLAUDE e a seleção CAI para o default
 * OPENAI/`gpt-4o-mini` — ou seja, o cargo Tier 1 volta a ser atendido por um
 * motor que não é classe A. ⛔ Essa queda é declarada, não silenciosa: a razão
 * da seleção diz "não configurado".
 */
export const AGENT_MODEL_PREFERENCES: Partial<
  Record<string, { provider: AIEngineProvider; model: string }>
> = {
  whatsapp: { provider: "CLAUDE", model: "claude-opus-5" },
};

/** Por natureza da tarefa — um agente pode usar pilotos diferentes por função. */
export type EngineTaskProfile = "CLASSIFY" | "REASON" | "JUDGE" | "GENERATE";

/**
 * ⭐⭐⭐ QUANDO O LABORATÓRIO CONTA COMO ALCANÇÁVEL — e por que CLAUDE deixou de
 * depender de uma chave no ambiente DESTE produto (D-105, 24/09/2026).
 *
 * ⛔ O DEFEITO QUE ESTA FUNÇÃO TINHA, e que passava em qualquer revisão: o
 * cargo `whatsapp` foi promovido a Tier 1 no código (`claude-opus-5`), mas
 * `configuredProviders` só listava CLAUDE se houvesse `ANTHROPIC_API_KEY`
 * aqui. Como D-105 manda que a chave NÃO exista neste produto, a variável nunca
 * aparecia, o roteador caía sozinho no default `gpt-4o-mini` — **a troca estava
 * escrita e não valia no ar**. Duas regras certas sozinhas produzindo, juntas, o
 * motor pequeno atendendo o cliente do restaurante.
 *
 * ⭐ A correção diz a verdade nova: o que torna o laboratório alcançável não é
 * mais possuir a credencial dele, é **ter caminho até quem a possui**. Se o
 * Portão de IA da Control Room está configurado (as três CONTROL_ROOM_IA_*),
 * CLAUDE está disponível — a chave fica lá e nunca viaja.
 *
 * ⚠️ `ANTHROPIC_API_KEY` continua aceita **apenas como transição**, para os
 * ambientes antigos que ainda a têm. Ela não é o caminho preferido, e o
 * dispatcher já prefere o portão quando os dois existem.
 */
export function configuredProviders(env: NodeJS.ProcessEnv = process.env): AIEngineProvider[] {
  const providers: AIEngineProvider[] = ["MOCK"]; // MOCK is always available (tests)
  if (env.OPENAI_API_KEY) providers.push("OPENAI");
  if (portaoDeIaConfigurado(env) || env.ANTHROPIC_API_KEY) providers.push("CLAUDE");
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
  // Tier 1 (ordem do CEO, 24/09/2026) — ver AGENT_MODEL_PREFERENCES acima.
  whatsapp: "CLAUDE",
  "analytics-product": "OPENAI", // must match the profile registry slug
  quality: "OPENAI",
};

/**
 * O modelo do agente, quando o provider escolhido é o que o agente prefere.
 * ⛔ Se o roteamento CAIU para outro provider (chave ausente, fallback), o modelo
 * do agente NÃO se aplica — modelo é sempre do par (provider, agente), nunca um
 * nome solto carregado entre laboratórios.
 */
function modelForAgent(agentId: string, provider: AIEngineProvider): string {
  const escolha = AGENT_MODEL_PREFERENCES[agentId];
  // ⛔ O par (laboratório, modelo) anda junto. Nome de modelo de um laboratório
  // NUNCA viaja para outro: se o roteamento caiu para outro provider, vale o
  // default daquele provider, não o modelo escolhido para o cargo.
  if (escolha && escolha.provider === provider) return escolha.model;
  return DEFAULT_MODEL[provider];
}

export function selectEngine(
  agentId: string,
  opts: { env?: NodeJS.ProcessEnv; preferences?: AgentEngineConfig } = {},
): AIEngineSelection {
  const env = opts.env ?? process.env;
  const prefs = opts.preferences ?? AGENT_ENGINE_PREFERENCES;
  const available = configuredProviders(env);

  // Override isolado para a bateria de certificação: permite provar o runtime
  // com um provedor real já configurado no CI sem alterar o roteamento de produção.
  const forcedForAcademy = env.FOOCCI_AI_ACADEMY_FORCE_PROVIDER as AIEngineProvider | undefined;
  if (
    forcedForAcademy &&
    forcedForAcademy !== "MOCK" &&
    available.includes(forcedForAcademy)
  ) {
    return {
      provider: forcedForAcademy,
      model: DEFAULT_MODEL[forcedForAcademy],
      reason: `provedor real forçado exclusivamente pela certificação da Academy — ${agentId}`,
      fallbackProvider: "MOCK",
    };
  }

  const preferred = prefs[agentId] ?? DEFAULT_PROVIDER;
  if (available.includes(preferred)) {
    return {
      provider: preferred,
      model: modelForAgent(agentId, preferred),
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
        model: row.model ?? modelForAgent(agentId, provider),
        reason: `roteamento governado (DB) — ${agentId}/${taskProfile}`,
        fallbackProvider: "MOCK",
      };
    }
    // Linha aponta para provider sem chave → ignora e cai na lógica estática.
  }
  return selectEngine(agentId, { env });
}
