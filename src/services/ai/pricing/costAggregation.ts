/**
 * costAggregation — soma custo de IA por modelo, por provedor e por agente.
 *
 * MÓDULO PURO: recebe linhas já lidas, não conhece prisma. Quem lê o banco passa
 * as linhas para cá.
 *
 * ── Por que recalcular em vez de somar a coluna do banco ──────────────────────
 * `AIInteractionLog.estimatedCostUsd` foi gravado com um fallback silencioso que
 * cobrava QUALQUER modelo desconhecido ao preço do gpt-4o. Somar aquela coluna é
 * herdar o erro. Aqui o custo é recalculado a partir dos tokens, que são fato
 * medido, com a tabela de preços auditável — e o histórico passa a poder ser
 * respondido sem depender do que já estava gravado errado.
 *
 * ── Os três estados que a tela precisa distinguir ─────────────────────────────
 * PRICED (tem número) · UNPRICED (usou, mas não sabemos o preço) · NO_USAGE
 * (não usou). Somar UNPRICED como zero apagaria a diferença entre "não gastou"
 * e "não sabemos quanto gastou" — guardrail 1.
 */

import {
  estimateCostUsd,
  findModelPrice,
  type CostStatus,
  type ModelProvider,
} from "./modelPricing";

/** Linha mínima vinda de AIInteractionLog. */
export interface UsageRow {
  readonly model: string;
  /** `null` quando o log não sabe de qual agente veio. Nunca chutar. */
  readonly agentSlug?: string | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** Rótulo do balde de logs sem agente atribuído. Nunca somado a um agente real. */
export const UNATTRIBUTED = "__unattributed__";
export const UNATTRIBUTED_LABEL = "Não atribuído";

/** Estado agregado — inclui NO_USAGE, que só existe no nível de agregação. */
export type UsageStatus = "PRICED" | "PARTIAL" | "UNPRICED" | "NO_USAGE";

export interface CostBucket {
  readonly key: string;
  readonly calls: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /** Custo das chamadas que SABEMOS precificar. */
  readonly knownCostUsd: number;
  /** Quantas chamadas ficaram sem preço conhecido. */
  readonly unpricedCalls: number;
  /** Modelos que caíram como não precificados, para o alerta carregar evidência. */
  readonly unpricedModels: readonly string[];
  readonly status: UsageStatus;
}

export interface CostReport {
  readonly byModel: readonly CostBucket[];
  readonly byProvider: readonly CostBucket[];
  readonly byAgent: readonly CostBucket[];
  readonly total: CostBucket;
}

interface Acc {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  knownCostUsd: number;
  unpricedCalls: number;
  unpricedModels: Set<string>;
}

function newAcc(): Acc {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    knownCostUsd: 0,
    unpricedCalls: 0,
    unpricedModels: new Set<string>(),
  };
}

/** Um status de chamada conta como "sem preço" quando não produziu número. */
function isUnpriced(status: CostStatus): boolean {
  return status === "UNPRICED" || status === "NOT_TOKEN_PRICED";
}

function bucketStatus(a: Acc): UsageStatus {
  if (a.calls === 0) return "NO_USAGE";
  if (a.unpricedCalls === 0) return "PRICED";
  if (a.unpricedCalls === a.calls) return "UNPRICED";
  return "PARTIAL";
}

function toBucket(key: string, a: Acc): CostBucket {
  return {
    key,
    calls: a.calls,
    promptTokens: a.promptTokens,
    completionTokens: a.completionTokens,
    totalTokens: a.promptTokens + a.completionTokens,
    knownCostUsd: round6(a.knownCostUsd),
    unpricedCalls: a.unpricedCalls,
    unpricedModels: [...a.unpricedModels].sort(),
    status: bucketStatus(a),
  };
}

/** Arredonda no mesmo grão da coluna Decimal(10,6) do banco. */
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function add(map: Map<string, Acc>, key: string, row: UsageRow, cost: ReturnType<typeof estimateCostUsd>): void {
  const a = map.get(key) ?? newAcc();
  a.calls += 1;
  a.promptTokens += row.promptTokens;
  a.completionTokens += row.completionTokens;
  if (isUnpriced(cost.status)) {
    a.unpricedCalls += 1;
    a.unpricedModels.add(cost.model || "(vazio)");
  } else {
    a.knownCostUsd += cost.costUsd ?? 0;
  }
  map.set(key, a);
}

function sortedBuckets(map: Map<string, Acc>): CostBucket[] {
  return [...map.entries()]
    .map(([k, a]) => toBucket(k, a))
    .sort((x, y) => y.knownCostUsd - x.knownCostUsd || x.key.localeCompare(y.key));
}

/**
 * Provedor de uma linha. Modelo desconhecido NÃO é atribuído a nenhum provedor
 * conhecido — vai para o balde "desconhecido", nunca para a OpenAI por padrão.
 */
export const UNKNOWN_PROVIDER = "DESCONHECIDO";

export function providerOf(model: string): ModelProvider | typeof UNKNOWN_PROVIDER {
  return findModelPrice(model)?.provider ?? UNKNOWN_PROVIDER;
}

/**
 * Agrega. Invariante que os testes travam: a soma dos baldes por provedor é
 * igual à soma das linhas, e igual ao total.
 */
export function aggregateCost(rows: readonly UsageRow[]): CostReport {
  const byModel = new Map<string, Acc>();
  const byProvider = new Map<string, Acc>();
  const byAgent = new Map<string, Acc>();
  const totalAcc = newAcc();

  for (const row of rows) {
    const cost = estimateCostUsd(row.model, row.promptTokens, row.completionTokens);

    add(byModel, cost.model || "(vazio)", row, cost);
    add(byProvider, providerOf(row.model), row, cost);

    // Log sem agentSlug vai para o balde "não atribuído". NUNCA para um agente.
    const slug = typeof row.agentSlug === "string" && row.agentSlug.trim() !== ""
      ? row.agentSlug.trim()
      : UNATTRIBUTED;
    add(byAgent, slug, row, cost);

    // total
    totalAcc.calls += 1;
    totalAcc.promptTokens += row.promptTokens;
    totalAcc.completionTokens += row.completionTokens;
    if (isUnpriced(cost.status)) {
      totalAcc.unpricedCalls += 1;
      totalAcc.unpricedModels.add(cost.model || "(vazio)");
    } else {
      totalAcc.knownCostUsd += cost.costUsd ?? 0;
    }
  }

  return {
    byModel: sortedBuckets(byModel),
    byProvider: sortedBuckets(byProvider),
    byAgent: sortedBuckets(byAgent),
    total: toBucket("__total__", totalAcc),
  };
}

/**
 * O que a tela mostra para UM agente. Agente que nunca chamou IA devolve
 * NO_USAGE — "não usou" e "usou e não sabemos o custo" são linhas diferentes.
 */
export function agentBucket(report: CostReport, agentSlug: string): CostBucket {
  return (
    report.byAgent.find((b) => b.key === agentSlug) ??
    toBucket(agentSlug, newAcc())
  );
}
