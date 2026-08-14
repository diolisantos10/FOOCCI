// ═══════════════════════════════════════════════════════════════════════════
//  A FRONTEIRA ENTRE O PAINEL DA AGÊNCIA E O PORTAL DO CLIENTE
//
//  O `CLAUDE_HANDOFF.md` (14/08/2026) impõe: o cliente PODE ver solicitações,
//  chat com o Project Manager, projetos, aprovações, entregas, resultados,
//  Brand Hub e as próprias integrações. O cliente NÃO PODE ver custo, margem,
//  prompt, log, tarefa interna nem o cascateamento operacional entre agentes.
//
//  Guardrail 4 da casa — "prompt é aviso; código é trava". Uma regra escrita só
//  no perfil de um agente já falhou em produção neste projeto. Então a fronteira
//  mora AQUI, em tipos e num seletor, e não numa recomendação de tela:
//
//   • `AgencyClientView`  — o que a AGÊNCIA vê. Superconjunto.
//   • `ClientPortalView`  — o que o CLIENTE vê. Construído SÓ por
//                           `toClientPortalView()`, campo a campo.
//   • `INTERNAL_ONLY_KEYS` — a lista das chaves proibidas, varrida em
//                           profundidade por `assertNoInternalLeak()` e pelo
//                           teste `views.test.ts`. Campo interno novo que
//                           escorregue para o DTO do portal derruba o teste.
//
//  O seletor é ALLOWLIST, não denylist: ele monta o objeto do portal do zero.
//  Um campo interno novo em `AgencyClientView` simplesmente não aparece no
//  portal — o esquecimento vira ausência, nunca vazamento (guardrail 2).
// ═══════════════════════════════════════════════════════════════════════════

/** Um número que a tela mostra. `null` = não existe dado conectado — e a tela
 *  desenha o estado vazio honesto, nunca um número inventado (guardrail 1). */
export type Metric = {
  label: string;
  /** `null` quando não há fonte de dado ligada. */
  value: string | null;
  /** Nota de apoio. `null` junto com `value` quando não há dado. */
  hint: string | null;
};

export type MetricTone = "" | "ok" | "warn" | "partial" | "off";

// ── Blocos que o cliente TAMBÉM vê ─────────────────────────────────────────

export type ClientIdentity = {
  id: string;
  name: string;
  initial: string;
  category: string | null;
  /** ISO. `null` quando desconhecido. */
  activeSince: string | null;
  isActive: boolean;
};

export type ProjectView = {
  id: string;
  name: string;
  kind: string;
  /** 0–100, ou `null` quando o projeto não tem progresso medido. */
  progress: number | null;
  statusLabel: string;
  /** Quem toca o projeto, em nome de agente. Visível ao cliente. */
  agents: string[];
  deliverableCount: number;
  decisionCount: number;
};

export type RequestView = {
  id: string;
  code: string;
  title: string;
  /** Agentes envolvidos — nome público, sem etapa operacional. */
  routedTo: string;
  statusLabel: string;
  when: string;
  priority: "high" | "medium" | "low" | "done";
};

export type DeliverableView = {
  id: string;
  title: string;
  projectName: string | null;
  statusLabel: string;
  when: string | null;
};

export type ApprovalView = {
  id: string;
  title: string;
  context: string;
  statusLabel: string;
  /** Quem decide. "Cliente" ou "Agência". */
  decidesIt: "Cliente" | "Agência";
  when: string | null;
};

export type IntegrationView = {
  glyph: string;
  name: string;
  scopes: string;
  statusLabel: string;
  tone: MetricTone;
  lastSync: string | null;
  /** Quantos agentes consomem essa fonte. */
  consumers: string | null;
  /** A agência VÊ; só o cliente conecta, reconecta, altera ou remove. */
  agencyAccess: "Somente leitura";
};

export type BrandView = {
  /** 0–100 ou `null` sem dado. */
  health: number | null;
  headline: string;
  tagline: string | null;
  /** Módulos do Brand OS com percentual de prontidão, ou `null`. */
  knowledge: { area: string; pct: number | null; state: "confirmed" | "mixed" | "missing" }[];
};

export type ChatMessageView = {
  id: string;
  author: string;
  /** "client" | "pm" — o cascateamento NÃO entra aqui. */
  side: "client" | "pm";
  when: string;
  body: string;
};

// ── Blocos EXCLUSIVOS da agência ───────────────────────────────────────────

/** Nada daqui pode alcançar o portal do cliente. */
export type InternalOnly = {
  /** Custo e margem do atendimento. */
  cost: { label: string; value: string | null }[];
  margin: { label: string; value: string | null }[];
  /** Prompts operacionais dos agentes. */
  prompts: { agent: string; prompt: string }[];
  /** Logs de execução. */
  logs: { at: string; line: string }[];
  /** Tarefas internas — não são solicitações do cliente. O handoff separa as
   *  duas coisas explicitamente: "o painel interno nunca deve confundir
   *  solicitações do cliente com tarefas operacionais dos agentes". */
  internalTasks: { id: string; title: string; owner: string; state: string }[];
  /** O cascateamento entre agentes montado pelo Agente Project Manager. */
  cascade: { requestId: string; chain: string[] }[];
};

export const INTERNAL_ONLY_KEYS = [
  "cost",
  "margin",
  "prompts",
  "logs",
  "internalTasks",
  "cascade",
] as const;

// ── As duas vistas ─────────────────────────────────────────────────────────

/** As áreas que têm faixa de KPI própria. Cada uma pode estar vazia. */
export type AreaKey =
  | "overview"
  | "requests"
  | "projects"
  | "social"
  | "design"
  | "traffic"
  | "intel"
  | "integrations";

export type AreaMetrics = Record<AreaKey, Metric[]>;

export function emptyAreaMetrics(): AreaMetrics {
  return {
    overview: [], requests: [], projects: [], social: [],
    design: [], traffic: [], intel: [], integrations: [],
  };
}

export type AgencyClientView = {
  client: ClientIdentity;
  projects: ProjectView[];
  requests: RequestView[];
  deliverables: DeliverableView[];
  approvals: ApprovalView[];
  integrations: IntegrationView[];
  brand: BrandView;
  chat: ChatMessageView[];
  /** Métricas de resultado — as mesmas que o cliente vê. */
  results: Metric[];
  /** KPI por área. Vazio = sem fonte ligada. */
  areaMetrics: AreaMetrics;
  /** SÓ AGÊNCIA. */
  internal: InternalOnly;
};

export type ClientPortalView = {
  client: ClientIdentity;
  projects: ProjectView[];
  requests: RequestView[];
  deliverables: DeliverableView[];
  approvals: ApprovalView[];
  integrations: IntegrationView[];
  brand: BrandView;
  chat: ChatMessageView[];
  results: Metric[];
  areaMetrics: AreaMetrics;
};

/**
 * O ÚNICO caminho de uma vista interna para o portal do cliente.
 *
 * É allowlist deliberada: monta o objeto campo a campo em vez de apagar o que
 * é proibido. Campo interno novo que apareça em `AgencyClientView` não chega
 * aqui por esquecimento — chega por decisão explícita de quem editar esta
 * função, e aí o teste de vazamento cobra o motivo.
 */
export function toClientPortalView(v: AgencyClientView): ClientPortalView {
  return {
    client:       v.client,
    projects:     v.projects,
    requests:     v.requests,
    deliverables: v.deliverables,
    approvals:    v.approvals,
    integrations: v.integrations,
    brand:        v.brand,
    chat:         v.chat,
    results:      v.results,
    areaMetrics:  v.areaMetrics,
  };
}

/**
 * Varredura em profundidade: nenhuma chave da lista proibida pode existir em
 * lugar nenhum do objeto entregue ao portal. Roda no teste e pode rodar em
 * runtime antes de qualquer resposta de API do portal.
 *
 * Devolve o CAMINHO do vazamento, não só "vazou" — guardrail 6: o alerta
 * carrega a própria evidência.
 */
export function findInternalLeak(value: unknown, path = "$"): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findInternalLeak(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, val] of Object.entries(value as Record<string, unknown>)) {
    if ((INTERNAL_ONLY_KEYS as readonly string[]).includes(k)) return `${path}.${k}`;
    const hit = findInternalLeak(val, `${path}.${k}`);
    if (hit) return hit;
  }
  return null;
}

export function assertNoInternalLeak(v: ClientPortalView): ClientPortalView {
  const leak = findInternalLeak(v);
  if (leak) {
    throw new Error(
      `Portal do cliente recebeu dado interno da agência em ${leak}. ` +
        `Só passa pelo seletor toClientPortalView(); veja src/lib/agencia/views.ts.`,
    );
  }
  return v;
}

/** Vista vazia — o esqueleto honesto quando ainda não há fonte ligada. */
export function emptyAgencyClientView(client: ClientIdentity): AgencyClientView {
  return {
    client,
    projects:     [],
    requests:     [],
    deliverables: [],
    approvals:    [],
    integrations: [],
    brand:        { health: null, headline: client.name, tagline: null, knowledge: [] },
    chat:         [],
    results:      [],
    areaMetrics:  emptyAreaMetrics(),
    internal:     { cost: [], margin: [], prompts: [], logs: [], internalTasks: [], cascade: [] },
  };
}
