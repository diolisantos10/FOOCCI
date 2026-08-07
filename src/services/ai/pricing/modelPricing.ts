/**
 * modelPricing — tabela de preços de modelos de IA.
 *
 * MÓDULO PURO DE PROPÓSITO: nenhum import de prisma, de rede ou de env.
 * A regra de preço precisa ser testável sozinha. Já nos queimou antes uma regra
 * correta ficar invisível porque o teste mockava o módulo inteiro que a continha.
 *
 * ── A regra que este arquivo existe para carregar ──────────────────────────────
 * "Não sei o preço" e "custou X" são coisas DIFERENTES. Um modelo que não está
 * nesta tabela sai como UNPRICED, com custo `null` — NUNCA cobrado ao preço de
 * outro modelo. O fallback silencioso anterior (`?? [0.0025, 0.01]`, o preço do
 * gpt-4o) transformava ausência de informação em informação — guardrail 1.
 *
 * ── Proveniência ──────────────────────────────────────────────────────────────
 * Cada linha carrega `source` e `asOf`. Valores são a tabela pública divulgada
 * pelo provedor, registrada na data indicada. NÃO são leitura de fatura: antes de
 * usar em decisão comercial, conferir contra o faturamento real. O campo existe
 * justamente para que essa conferência seja possível — guardrail 6.
 */

export type ModelProvider = "OPENAI" | "ANTHROPIC" | "GOOGLE" | "INTERNAL";

/**
 * Como o provedor cobra o modelo. Nem todo modelo é cobrado por token: whisper
 * é cobrado por minuto de áudio e gpt-image-1 por imagem gerada. Estimar custo
 * por token nesses casos daria um número errado com cara de certo.
 */
export type BillingUnit = "TOKENS" | "AUDIO_MINUTE" | "IMAGE" | "NONE";

export interface ModelPrice {
  /** Identificador exato gravado em AIInteractionLog.model. */
  readonly model: string;
  readonly provider: ModelProvider;
  readonly billingUnit: BillingUnit;
  /** USD por 1.000 tokens de entrada. Só quando billingUnit === "TOKENS". */
  readonly inputUsdPer1k?: number;
  /** USD por 1.000 tokens de saída. Só quando billingUnit === "TOKENS". */
  readonly outputUsdPer1k?: number;
  /** De onde veio o número. Proveniência é obrigatória. */
  readonly source: string;
  /** Data (ISO, YYYY-MM-DD) em que o valor foi registrado. */
  readonly asOf: string;
  /** Onde no código este modelo é efetivamente chamado. */
  readonly usedAt: string;
}

const OPENAI_SOURCE = "Tabela pública OpenAI, registrada pelo especialista cerebro — confirmar contra fatura antes de decisão comercial";
const ANTHROPIC_SOURCE = "Tabela pública Anthropic, registrada pelo especialista cerebro — confirmar contra fatura antes de decisão comercial";
const GOOGLE_SOURCE = "Tabela pública Google AI, registrada pelo especialista cerebro — confirmar contra fatura antes de decisão comercial";
const REGISTERED_ON = "2026-08-07";

/**
 * SOMENTE modelos que este projeto realmente chama. Cada linha aponta o arquivo
 * onde a chamada existe. Modelo que o projeto não chama não entra aqui —
 * inventar linha é criar a ilusão de cobertura.
 */
export const MODEL_PRICES: readonly ModelPrice[] = [
  {
    model: "gpt-4o-mini",
    provider: "OPENAI",
    billingUnit: "TOKENS",
    inputUsdPer1k: 0.00015,
    outputUsdPer1k: 0.0006,
    source: OPENAI_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/engines/AIEngineRouter.ts:16 (default de produção); src/services/ai/WhatsAppReceptionistService.ts:286",
  },
  {
    model: "gpt-4o",
    provider: "OPENAI",
    billingUnit: "TOKENS",
    inputUsdPer1k: 0.0025,
    outputUsdPer1k: 0.01,
    source: OPENAI_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/agent-training/AgentTrainingImprovementService.ts:16; src/services/agent-training/AgentTrainingEvaluatorService.ts:15",
  },
  {
    model: "text-embedding-3-small",
    provider: "OPENAI",
    billingUnit: "TOKENS",
    inputUsdPer1k: 0.00002,
    outputUsdPer1k: 0, // embeddings não têm tokens de saída faturáveis
    source: OPENAI_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/knowledge/KnowledgeEmbeddingService.ts:22",
  },
  {
    model: "claude-haiku-4-5-20251001",
    provider: "ANTHROPIC",
    billingUnit: "TOKENS",
    inputUsdPer1k: 0.001,
    outputUsdPer1k: 0.005,
    source: ANTHROPIC_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/engines/AIEngineRouter.ts:17 (default do provider CLAUDE)",
  },
  {
    model: "gemini-2.5-flash",
    provider: "GOOGLE",
    billingUnit: "TOKENS",
    inputUsdPer1k: 0.0003,
    outputUsdPer1k: 0.0025,
    source: GOOGLE_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/engines/AIEngineRouter.ts:18 (default do provider GEMINI)",
  },
  {
    // Cobrado por MINUTO de áudio. Estimar por token daria número errado com
    // cara de certo — sai como NOT_TOKEN_PRICED, não como zero.
    model: "whisper-1",
    provider: "OPENAI",
    billingUnit: "AUDIO_MINUTE",
    source: OPENAI_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/engines/TranscriptionAdapter.ts:135",
  },
  {
    // Cobrado por IMAGEM gerada, não por token.
    model: "gpt-image-1",
    provider: "OPENAI",
    billingUnit: "IMAGE",
    source: OPENAI_SOURCE,
    asOf: REGISTERED_ON,
    usedAt: "src/services/imageEnhancement/providers/openai.ts:17; src/services/demo/FoocciBakeryService.ts:767",
  },
  {
    // Motores determinísticos do router: custo ZERO CONHECIDO, que é diferente
    // de custo desconhecido.
    model: "mock",
    provider: "INTERNAL",
    billingUnit: "NONE",
    source: "Motor determinístico local — não chama API paga",
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/engines/AIEngineRouter.ts:20",
  },
  {
    model: "local",
    provider: "INTERNAL",
    billingUnit: "NONE",
    source: "Motor determinístico local — não chama API paga",
    asOf: REGISTERED_ON,
    usedAt: "src/services/brain/engines/AIEngineRouter.ts:19",
  },
];

const BY_MODEL: ReadonlyMap<string, ModelPrice> = new Map(
  MODEL_PRICES.map((p) => [p.model, p]),
);

/** Consulta crua. `null` = modelo desconhecido, e isso é uma resposta legítima. */
export function findModelPrice(model: string): ModelPrice | null {
  return BY_MODEL.get(normalizeModel(model)) ?? null;
}

export function normalizeModel(model: string): string {
  return (model ?? "").trim();
}

export function isKnownModel(model: string): boolean {
  return findModelPrice(model) !== null;
}

/**
 * Estado do custo de UMA chamada.
 * - PRICED             → sabemos o preço por token; `costUsd` é número.
 * - FREE               → motor interno, custo zero CONHECIDO.
 * - NOT_TOKEN_PRICED   → modelo conhecido, mas cobrado por outra unidade;
 *                        custo por token não se aplica → `costUsd` null.
 * - UNPRICED           → modelo fora da tabela → `costUsd` null.
 */
export type CostStatus = "PRICED" | "FREE" | "NOT_TOKEN_PRICED" | "UNPRICED";

export interface CostEstimate {
  readonly status: CostStatus;
  /** `null` sempre que o custo NÃO é conhecido. Nunca um chute. */
  readonly costUsd: number | null;
  readonly model: string;
  readonly provider: ModelProvider | null;
  readonly billingUnit: BillingUnit | null;
  /** Frase curta e legível para a tela explicar por que não há número. */
  readonly reason: string;
}

/**
 * A função que substitui o fallback silencioso.
 *
 * Contrato inegociável: modelo desconhecido devolve `costUsd: null` com status
 * UNPRICED. Ele NUNCA é precificado como gpt-4o nem como qualquer outro modelo.
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): CostEstimate {
  const name = normalizeModel(model);
  const price = findModelPrice(name);

  if (!price) {
    return {
      status: "UNPRICED",
      costUsd: null,
      model: name,
      provider: null,
      billingUnit: null,
      reason: `Modelo "${name || "(vazio)"}" não está na tabela de preços — custo indeterminado, não estimado`,
    };
  }

  if (price.billingUnit === "NONE") {
    return {
      status: "FREE",
      costUsd: 0,
      model: name,
      provider: price.provider,
      billingUnit: price.billingUnit,
      reason: "Motor interno — não gera custo de API",
    };
  }

  if (price.billingUnit !== "TOKENS") {
    return {
      status: "NOT_TOKEN_PRICED",
      costUsd: null,
      model: name,
      provider: price.provider,
      billingUnit: price.billingUnit,
      reason: `Modelo cobrado por ${price.billingUnit === "IMAGE" ? "imagem" : "minuto de áudio"} — custo por token não se aplica`,
    };
  }

  const inputRate = price.inputUsdPer1k ?? 0;
  const outputRate = price.outputUsdPer1k ?? 0;
  const cost =
    (safeTokens(promptTokens) / 1000) * inputRate +
    (safeTokens(completionTokens) / 1000) * outputRate;

  return {
    status: "PRICED",
    costUsd: cost,
    model: name,
    provider: price.provider,
    billingUnit: "TOKENS",
    reason: `Preço de ${price.asOf} — ${price.source}`,
  };
}

function safeTokens(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
