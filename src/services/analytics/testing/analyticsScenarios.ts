/**
 * analyticsScenarios — Deterministic test cases for the Analytics engine (W5).
 *
 * Mirrors the CRM / Waiter Test Centers in spirit: every scenario feeds a FIXED
 * fixture into a PURE analytics function (no DB, no LLM, no network, no sends,
 * no mutation) and the analyticsEvaluator grades the result against the
 * scenario's expectation.
 *
 * 5 groups (cockpit only because W4 / DashboardCockpitService exists):
 *  1. diagnosis  — AnalyticsDiagnosisService.diagnose
 *  2. retention  — AnalyticsRetentionService.computeRetentionReport
 *  3. operations — AnalyticsOperationalEfficiencyService.computeEfficiencyReport
 *  4. analyst    — AnalyticsAgentService.routeIntent + buildGroundedAnswer
 *  5. cockpit    — DashboardCockpitService.buildAlerts/buildActions/buildHealth
 *
 * NOTHING here touches the database, calls an LLM, sends a message, or runs a
 * campaign. Fixtures are hand-built so every verdict is reproducible.
 */

import type {
  DiagnosisInput,
  DiagnosisPeriodMeta,
  DiagnosisSeverity,
  DiagnosisDataQuality,
} from "../AnalyticsDiagnosisService";
import type {
  AnalyticsOverview,
  KpiOverview,
  ProductRow,
  AttachRate,
  ChannelRow,
  UpsellRevenue,
  ZeroSalesProduct,
} from "../AnalyticsService";
import type { RawCohortRow } from "../AnalyticsRetentionService";
import type {
  RawTimingRow,
  RawKpiHints,
  BottleneckStage,
} from "../AnalyticsOperationalEfficiencyService";
import type {
  AnalyticsIntent,
  AgentServiceData,
} from "../AnalyticsAgentService";
import type {
  CockpitRawData,
  AlertSeverity,
  ActionSource,
  HealthStatus,
  CockpitReport,
} from "@/services/dashboard/DashboardCockpitService";

// ─── shared ─────────────────────────────────────────────────────────────────

export type Severity = "P0" | "P1" | "P2";

export type AnalyticsScenarioGroupId =
  | "diagnosis"
  | "retention"
  | "operations"
  | "analyst"
  | "cockpit";

export const GROUP_LABELS: Record<AnalyticsScenarioGroupId, string> = {
  diagnosis:  "Diagnóstico",
  retention:  "Retenção / Cohort",
  operations: "Operação",
  analyst:    "Analista Conversacional",
  cockpit:    "Dashboard Cockpit",
};

/** Fixed "now" so every relative date in fixtures is deterministic. */
export const SCENARIO_NOW = "2026-06-04";

const PERIOD: DiagnosisPeriodMeta      = { from: "2026-05-01", to: "2026-05-31", label: "Últimos 30 dias" };
const PREV_PERIOD: DiagnosisPeriodMeta = { from: "2026-04-01", to: "2026-04-30", label: "período anterior" };

// ─── fixture builders (mirror the existing analytics test fixtures) ───────────

function kpi(p: Partial<KpiOverview> = {}): KpiOverview {
  return {
    revenue:              p.revenue              ?? 0,
    orders:               p.orders               ?? 0,
    avgTicket:            p.avgTicket            ?? 0,
    newCustomers:         p.newCustomers         ?? 0,
    cancelledOrders:      p.cancelledOrders      ?? 0,
    cancellationRate:     p.cancellationRate     ?? 0,
    awaitingPaymentCount: p.awaitingPaymentCount ?? 0,
    awaitingPaymentTotal: p.awaitingPaymentTotal ?? 0,
  };
}

function product(name: string, revenue: number, extra: Partial<ProductRow> = {}): ProductRow {
  return {
    name,
    category:   extra.category   ?? "Geral",
    revenue,
    qty:        extra.qty        ?? Math.max(1, Math.round(revenue / 10)),
    orderCount: extra.orderCount ?? Math.max(1, Math.round(revenue / 20)),
    share:      extra.share      ?? 0,
  };
}

function attach(label: string, rate: number, total: number, addedRevenue = 0): AttachRate {
  return { label, keywords: [], withCount: Math.round((rate / 100) * total), total, rate, addedRevenue };
}

function upsell(p: Partial<UpsellRevenue> = {}): UpsellRevenue {
  return {
    revenue:          p.revenue          ?? 0,
    revenueShare:     p.revenueShare     ?? 0,
    ordersWithUpsell: p.ordersWithUpsell ?? 0,
    avgPerOrder:      p.avgPerOrder      ?? 0,
  };
}

function overview(p: {
  kpi?: Partial<KpiOverview>;
  topProducts?: ProductRow[];
  attachRates?: AttachRate[];
  channels?: ChannelRow[];
  upsellRevenue?: Partial<UpsellRevenue>;
  zeroSalesProducts?: ZeroSalesProduct[];
} = {}): AnalyticsOverview {
  return {
    range:                    { from: new Date(PERIOD.from), to: new Date(PERIOD.to) },
    kpi:                      kpi(p.kpi),
    salesByDay:               [],
    topProducts:              p.topProducts ?? [],
    categories:               [],
    attachRates:              p.attachRates ?? [],
    topCustomers:             [],
    segments:                 [],
    tiers:                    [],
    channels:                 p.channels ?? [],
    insights:                 [],
    zeroSalesProducts:        p.zeroSalesProducts ?? [],
    upsellRevenue:            upsell(p.upsellRevenue),
  };
}

function diagInput(o: {
  current: AnalyticsOverview;
  previous: AnalyticsOverview | null;
  campaign?: DiagnosisInput["campaign"];
}): DiagnosisInput {
  return {
    current:          o.current,
    previous:         o.previous,
    period:           PERIOD,
    comparisonPeriod: o.previous ? PREV_PERIOD : null,
    ...(o.campaign ? { campaign: o.campaign } : {}),
  };
}

function cohort(p: Partial<RawCohortRow> & { cohortMonth: string; newCustomers: number }): RawCohortRow {
  return {
    cohortMonth:        p.cohortMonth,
    newCustomers:       p.newCustomers,
    returned30d:        p.returned30d        ?? 0,
    returned60d:        p.returned60d        ?? 0,
    returned90d:        p.returned90d        ?? 0,
    avgSecondOrderDays: p.avgSecondOrderDays ?? null,
    totalRevenue:       p.totalRevenue       ?? 0,
    repeatRevenue:      p.repeatRevenue      ?? 0,
  };
}

function timingRows(type: string, minutes: number[]): RawTimingRow[] {
  return minutes.map((m) => ({ type, fulfillmentMinutes: m }));
}

function opsKpi(p: Partial<RawKpiHints> = {}): RawKpiHints {
  return {
    totalOrders:          p.totalOrders          ?? 0,
    cancelledOrders:      p.cancelledOrders       ?? 0,
    cancellationRate:     p.cancellationRate      ?? 0,
    awaitingPaymentCount: p.awaitingPaymentCount  ?? 0,
    awaitingPaymentTotal: p.awaitingPaymentTotal  ?? 0,
  };
}

function cockpitRaw(p: Partial<CockpitRawData> = {}): CockpitRawData {
  return {
    todayRevenue:           p.todayRevenue           ?? 0,
    todayOrders:            p.todayOrders            ?? 0,
    cancelledToday:         p.cancelledToday         ?? 0,
    avg7DayRevenue:         p.avg7DayRevenue         ?? 0,
    hasSevenDayData:        p.hasSevenDayData        ?? false,
    pendingPayments:        p.pendingPayments        ?? 0,
    delayedOrders:          p.delayedOrders          ?? 0,
    crmFrio:                p.crmFrio                ?? 0,
    crmTotal:               p.crmTotal               ?? 0,
    vipCustomers:           p.vipCustomers           ?? 0,
    pendingRecovery:        p.pendingRecovery        ?? 0,
    mpWebhookSecretMissing: p.mpWebhookSecretMissing ?? false,
  };
}

// ─── expectation shapes (per group) ───────────────────────────────────────────

export interface DiagnosisExpect {
  findingId?:          string;            // a finding that must be present
  findingSeverity?:    DiagnosisSeverity; // severity of that finding
  metricDirection?:    "down" | "up";     // sign of the finding's deltaPct
  likelyCauseMatch?:   string;            // substring expected in the finding's likelyCauses
  relatedProduct?:     string;            // must appear in finding.relatedEntities.products
  anomalyId?:          string;            // an anomaly that must be present
  anomalySeverity?:    DiagnosisSeverity;
  dataQuality?:        DiagnosisDataQuality;
  noCriticalFindings?: boolean;           // tiny-sample noise guard
  limitationMatch?:    string;            // substring expected in limitations
  forbiddenFindingIds?: string[];         // findings that must NOT appear (no baseline)
}

export interface RetentionExpect {
  hasData?:               boolean;
  avgRetention30dAtLeast?: number;
  avgRetention30dEquals?:  number;
  smallSampleLimitation?:  boolean;       // a "< 5 novos clientes" limitation must appear
  limitationMatch?:        string;
  insightMatch?:           string;
}

export interface OperationsExpect {
  avgFulfillmentPositive?:  boolean;
  avgFulfillmentEquals?:    number;
  missingTimingLimitation?: boolean;      // "timestamps completos" limitation present
  perStageLimitation?:      boolean;      // "estágio individual" limitation always present
  bottleneckStage?:         BottleneckStage;
  cancelledOrdersEquals?:   number;
  awaitingPaymentEquals?:   number;
}

export interface AnalystExpect {
  intent?:            AnalyticsIntent;     // routeIntent(question) must equal this
  intentOneOf?:       AnalyticsIntent[];   // …or be one of these
  limitationMatch?:   string;              // substring expected in answer.limitations
  hasLimitations?:    boolean;
  noMetrics?:         boolean;             // metrics must be empty (nothing fabricated)
  hasFollowUps?:      boolean;
  confidenceNotHigh?: boolean;             // confidence must not be HIGH on weak evidence
}

export interface CockpitExpect {
  alertId?:       string;        // an alert that must be present
  alertSeverity?: AlertSeverity; // its severity
  actionSource?:  ActionSource;  // a recommended action with this source must be present
  healthKey?:     keyof CockpitReport["health"];
  healthStatus?:  HealthStatus;
  noAlerts?:      boolean;       // missing data → no fabricated alerts
}

interface BaseScenario {
  id:          string;
  groupLabel:  string;
  title:       string;
  description: string;
  severity:    Severity;
}

export type AnalyticsScenario =
  | (BaseScenario & { group: "diagnosis";  input: DiagnosisInput; expect: DiagnosisExpect })
  | (BaseScenario & { group: "retention";  input: { rows: RawCohortRow[]; from: string; to: string; now: string }; expect: RetentionExpect })
  | (BaseScenario & { group: "operations"; input: { rows: RawTimingRow[]; kpi: RawKpiHints; from: string; to: string }; expect: OperationsExpect })
  | (BaseScenario & { group: "analyst";    input: { question: string; agentData?: AgentServiceData }; expect: AnalystExpect })
  | (BaseScenario & { group: "cockpit";    input: CockpitRawData; expect: CockpitExpect });

const L = GROUP_LABELS;
const FROM = PERIOD.from;
const TO   = PERIOD.to;

// ─── 1. Diagnosis scenarios ────────────────────────────────────────────────────

const DIAGNOSIS_SCENARIOS: AnalyticsScenario[] = [
  {
    id: "diag-revenue-drop-orders", group: "diagnosis", groupLabel: L.diagnosis, severity: "P0",
    title: "Queda de receita por queda de pedidos",
    description: "Receita cai 50% com metade dos pedidos e ticket estável → revenue_drop crítico apontando volume de pedidos.",
    input: diagInput({
      previous: overview({ kpi: { revenue: 10_000, orders: 100, avgTicket: 100, newCustomers: 30 } }),
      current:  overview({ kpi: { revenue: 5_000,  orders: 50,  avgTicket: 100, newCustomers: 10 } }),
    }),
    expect: { findingId: "revenue_drop", findingSeverity: "CRITICAL", metricDirection: "down", likelyCauseMatch: "pedidos" },
  },
  {
    id: "diag-revenue-drop-ticket", group: "diagnosis", groupLabel: L.diagnosis, severity: "P1",
    title: "Queda de receita por queda de ticket médio",
    description: "Pedidos estáveis, ticket cai pela metade → revenue_drop apontando ticket médio como fator principal.",
    input: diagInput({
      previous: overview({ kpi: { revenue: 10_000, orders: 100, avgTicket: 100 } }),
      current:  overview({ kpi: { revenue: 5_000,  orders: 98,  avgTicket: 51 } }),
    }),
    expect: { findingId: "revenue_drop", metricDirection: "down", likelyCauseMatch: "ticket" },
  },
  {
    id: "diag-top-product-disappeared", group: "diagnosis", groupLabel: L.diagnosis, severity: "P1",
    title: "Produto campeão sumiu do cardápio",
    description: "O produto que liderava vendas zera no período atual e está indisponível → top_product_drop nomeando o produto.",
    input: diagInput({
      previous: overview({
        kpi: { revenue: 10_000, orders: 100, avgTicket: 100 },
        topProducts: [product("X-Tudo", 4000), product("Batata", 1000)],
      }),
      current: overview({
        kpi: { revenue: 9_000, orders: 95, avgTicket: 94.7 },
        topProducts: [product("Batata", 1000)],
        zeroSalesProducts: [{ id: "p1", name: "X-Tudo", category: "Lanches", price: 40, isAvailable: false }],
      }),
    }),
    expect: { findingId: "top_product_drop", relatedProduct: "X-Tudo" },
  },
  {
    id: "diag-cancellation-spike", group: "diagnosis", groupLabel: L.diagnosis, severity: "P1",
    title: "Pico de cancelamentos",
    description: "Taxa de cancelamento sobe acima do nível crítico → anomalia cancellation_spike CRITICAL.",
    input: diagInput({
      previous: overview({ kpi: { revenue: 10_000, orders: 100, avgTicket: 100, cancelledOrders: 3, cancellationRate: 2.9 } }),
      current:  overview({ kpi: { revenue: 9_000, orders: 80, avgTicket: 112.5, cancelledOrders: 25, cancellationRate: 23.8 } }),
    }),
    expect: { anomalyId: "cancellation_spike", anomalySeverity: "CRITICAL" },
  },
  {
    id: "diag-tiny-sample-no-critical", group: "diagnosis", groupLabel: L.diagnosis, severity: "P0",
    title: "Amostra pequena não gera alerta crítico",
    description: "Queda de 60% sobre apenas 3 pedidos → dataQuality LOW, nenhum CRITICAL, limitação de amostra pequena.",
    input: diagInput({
      previous: overview({ kpi: { revenue: 600, orders: 5, avgTicket: 120 } }),
      current:  overview({ kpi: { revenue: 240, orders: 3, avgTicket: 80 } }),
    }),
    expect: { dataQuality: "LOW", noCriticalFindings: true, limitationMatch: "amostra pequena" },
  },
  {
    id: "diag-missing-baseline-limitation", group: "diagnosis", groupLabel: L.diagnosis, severity: "P0",
    title: "Sem período anterior → limitação, não causa inventada",
    description: "Sem baseline comparável: nenhuma finding de comparação é inventada e a lacuna vira limitação.",
    input: diagInput({
      previous: null,
      current:  overview({ kpi: { revenue: 5_000, orders: 50, avgTicket: 100 }, topProducts: [product("X-Tudo", 2000)] }),
    }),
    expect: {
      limitationMatch: "período anterior comparável",
      forbiddenFindingIds: ["revenue_drop", "revenue_up", "orders_drop", "avg_ticket_drop", "top_product_drop", "upsell_drop"],
    },
  },
];

// ─── 2. Retention scenarios ────────────────────────────────────────────────────

const RETENTION_SCENARIOS: AnalyticsScenario[] = [
  {
    id: "ret-repeat-30-60-90", group: "retention", groupLabel: L.retention, severity: "P1",
    title: "Cohort com recompra em 30/60/90 dias",
    description: "Cohort madura com 50% de recompra em 30 dias → retenção média ≥ 40% e insights presentes.",
    input: {
      rows: [cohort({ cohortMonth: "2025-06", newCustomers: 50, returned30d: 25, returned60d: 30, returned90d: 35, avgSecondOrderDays: 18, totalRevenue: 9000, repeatRevenue: 4000 })],
      from: FROM, to: TO, now: SCENARIO_NOW,
    },
    expect: { hasData: true, avgRetention30dAtLeast: 40, insightMatch: "retenção" },
  },
  {
    id: "ret-no-repeat", group: "retention", groupLabel: L.retention, severity: "P1",
    title: "Cohort sem nenhuma recompra",
    description: "Cohort madura onde ninguém voltou → retenção 30d = 0%, sem números inventados.",
    input: {
      rows: [cohort({ cohortMonth: "2025-06", newCustomers: 40, returned30d: 0, returned60d: 0, returned90d: 0, totalRevenue: 5000, repeatRevenue: 0 })],
      from: FROM, to: TO, now: SCENARIO_NOW,
    },
    expect: { hasData: true, avgRetention30dEquals: 0 },
  },
  {
    id: "ret-imported-invalid-safe", group: "retention", groupLabel: L.retention, severity: "P2",
    title: "Pedidos importados/inválidos tratados com segurança",
    description: "Cohort com receita total zero mas com retornos e uma cohort com zero novos clientes → sem divisão por zero, sem crash.",
    input: {
      rows: [
        cohort({ cohortMonth: "2025-07", newCustomers: 10, returned30d: 3, totalRevenue: 0, repeatRevenue: 0 }),
        cohort({ cohortMonth: "2025-08", newCustomers: 0,  returned30d: 0, totalRevenue: 0, repeatRevenue: 0 }),
      ],
      from: FROM, to: TO, now: SCENARIO_NOW,
    },
    expect: { hasData: true },
  },
  {
    id: "ret-small-sample-limitation", group: "retention", groupLabel: L.retention, severity: "P1",
    title: "Amostra pequena gera limitação",
    description: "Cohort com menos de 5 novos clientes → limitação de amostra pequena, insights suprimidos.",
    input: {
      rows: [cohort({ cohortMonth: "2025-06", newCustomers: 3, returned30d: 2, totalRevenue: 400, repeatRevenue: 150 })],
      from: FROM, to: TO, now: SCENARIO_NOW,
    },
    expect: { smallSampleLimitation: true },
  },
];

// ─── 3. Operations scenarios ───────────────────────────────────────────────────

const OPERATIONS_SCENARIOS: AnalyticsScenario[] = [
  {
    id: "ops-fulfillment-time", group: "operations", groupLabel: L.operations, severity: "P1",
    title: "Pedidos concluídos produzem tempo total de atendimento",
    description: "10 entregas com timestamps completos → tempo médio positivo calculado a partir dos dados reais.",
    input: {
      rows: timingRows("DELIVERY", [30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      kpi:  opsKpi({ totalOrders: 10 }), from: FROM, to: TO,
    },
    expect: { avgFulfillmentPositive: true, perStageLimitation: true },
  },
  {
    id: "ops-missing-timestamps", group: "operations", groupLabel: L.operations, severity: "P0",
    title: "Sem timestamps → limitação em vez de métrica falsa",
    description: "Nenhum pedido com timestamps completos → tempo médio 0 e limitação explícita (sem inventar tempo de cozinha).",
    input: { rows: [], kpi: opsKpi({ totalOrders: 20 }), from: FROM, to: TO },
    expect: { avgFulfillmentEquals: 0, missingTimingLimitation: true },
  },
  {
    id: "ops-cancellations-reflected", group: "operations", groupLabel: L.operations, severity: "P1",
    title: "Cancelamentos refletidos nas métricas e gargalos",
    description: "Taxa de cancelamento de 20% → cancelledOrders refletido e gargalo de CANCELLATION.",
    input: {
      rows: timingRows("DELIVERY", [40, 45, 50]),
      kpi:  opsKpi({ totalOrders: 40, cancelledOrders: 8, cancellationRate: 20 }), from: FROM, to: TO,
    },
    expect: { cancelledOrdersEquals: 8, bottleneckStage: "CANCELLATION" },
  },
  {
    id: "ops-pending-payment-reflected", group: "operations", groupLabel: L.operations, severity: "P1",
    title: "Pagamentos pendentes refletidos",
    description: "5 pedidos aguardando pagamento → awaitingPaymentCount refletido e gargalo de PAYMENT.",
    input: {
      rows: timingRows("DELIVERY", [40, 45]),
      kpi:  opsKpi({ totalOrders: 30, awaitingPaymentCount: 5, awaitingPaymentTotal: 450 }), from: FROM, to: TO,
    },
    expect: { awaitingPaymentEquals: 5, bottleneckStage: "PAYMENT" },
  },
  {
    id: "ops-no-per-stage-limitation", group: "operations", groupLabel: L.operations, severity: "P0",
    title: "Limitação de ausência de timestamps por etapa sempre aparece",
    description: "O sistema nunca inventa tempos por etapa de cozinha — a limitação de estágio individual é sempre declarada.",
    input: {
      rows: timingRows("PICKUP", [25, 35, 45]),
      kpi:  opsKpi({ totalOrders: 3 }), from: FROM, to: TO,
    },
    expect: { perStageLimitation: true },
  },
];

// ─── 4. Conversational Analyst scenarios ───────────────────────────────────────

const ANALYST_SCENARIOS: AnalyticsScenario[] = [
  {
    id: "analyst-revenue-drop", group: "analyst", groupLabel: L.analyst, severity: "P0",
    title: "“por que as vendas caíram?” → diagnóstico",
    description: "Pergunta de queda de receita roteia para REVENUE_DROP_DIAGNOSIS.",
    input: { question: "por que as vendas caíram?" },
    expect: { intent: "REVENUE_DROP_DIAGNOSIS" },
  },
  {
    id: "analyst-product-performance", group: "analyst", groupLabel: L.analyst, severity: "P1",
    title: "“quais produtos mais venderam?” → performance de produto",
    description: "Pergunta de produtos roteia para PRODUCT_PERFORMANCE.",
    input: { question: "quais produtos mais venderam?" },
    expect: { intent: "PRODUCT_PERFORMANCE" },
  },
  {
    id: "analyst-retention", group: "analyst", groupLabel: L.analyst, severity: "P1",
    title: "“os clientes estão voltando?” → retenção",
    description: "Pergunta de fidelidade roteia para CUSTOMER_RETENTION.",
    input: { question: "os clientes estão voltando?" },
    expect: { intent: "CUSTOMER_RETENTION" },
  },
  {
    id: "analyst-operations", group: "analyst", groupLabel: L.analyst, severity: "P1",
    title: "“como está a operação?” → eficiência operacional",
    description: "Pergunta de operação roteia para OPERATIONAL_EFFICIENCY.",
    input: { question: "como está a operação?" },
    expect: { intent: "OPERATIONAL_EFFICIENCY" },
  },
  {
    id: "analyst-profit-limitation", group: "analyst", groupLabel: L.analyst, severity: "P0",
    title: "“qual lucro?” → limitação por falta de CMV/margem",
    description: "Pergunta de lucro: sem CMV/margem cadastrados o agente declara a limitação em vez de inventar lucro.",
    input: {
      question: "qual o lucro do mês?",
      agentData: { intent: "SALES_OVERVIEW", periodLabel: "Nos últimos 30 dias", question: "qual o lucro do mês?", hasMarginQuestion: true },
    },
    expect: { intentOneOf: ["SALES_OVERVIEW", "REVENUE_DROP_DIAGNOSIS"], limitationMatch: "margem", hasLimitations: true },
  },
  {
    id: "analyst-unsupported-safe", group: "analyst", groupLabel: L.analyst, severity: "P0",
    title: "Pergunta sem suporte → limitação segura",
    description: "Pergunta fora de escopo roteia para UNKNOWN_UNSUPPORTED, sem métricas inventadas, com limitações e follow-ups.",
    input: { question: "blábláblá xyzzy qual a cor do céu?" },
    expect: { intent: "UNKNOWN_UNSUPPORTED", noMetrics: true, hasLimitations: true, hasFollowUps: true },
  },
];

// ─── 5. Dashboard Cockpit scenarios (W4 exists) ────────────────────────────────

const COCKPIT_SCENARIOS: AnalyticsScenario[] = [
  {
    id: "cockpit-delayed-critical", group: "cockpit", groupLabel: L.cockpit, severity: "P0",
    title: "Pedidos atrasados geram alerta crítico e ação operacional",
    description: "4 pedidos atrasados → alerta delayed-orders CRITICAL, ação OPERATIONS e saúde operacional crítica.",
    input: cockpitRaw({ todayRevenue: 800, todayOrders: 10, avg7DayRevenue: 700, hasSevenDayData: true, delayedOrders: 4 }),
    expect: { alertId: "delayed-orders", alertSeverity: "CRITICAL", actionSource: "OPERATIONS", healthKey: "operations", healthStatus: "CRITICAL" },
  },
  {
    id: "cockpit-pending-payment-spike", group: "cockpit", groupLabel: L.cockpit, severity: "P1",
    title: "Pico de pagamentos pendentes gera alerta",
    description: "6 pagamentos Pix pendentes → alerta pending-payments presente (WARNING).",
    input: cockpitRaw({ todayRevenue: 900, todayOrders: 12, avg7DayRevenue: 800, hasSevenDayData: true, pendingPayments: 6 }),
    expect: { alertId: "pending-payments", alertSeverity: "WARNING" },
  },
  {
    id: "cockpit-crm-opportunity", group: "cockpit", groupLabel: L.cockpit, severity: "P1",
    title: "Oportunidade de CRM aparece com base fria",
    description: "30 clientes frios → ação recomendada de reativação com origem CRM.",
    input: cockpitRaw({ todayRevenue: 900, todayOrders: 12, avg7DayRevenue: 800, hasSevenDayData: true, crmFrio: 30, crmTotal: 100 }),
    expect: { actionSource: "CRM" },
  },
  {
    id: "cockpit-no-data-limitation", group: "cockpit", groupLabel: L.cockpit, severity: "P0",
    title: "Sem histórico → saúde NO_DATA, sem métrica inventada",
    description: "Sem dados de 7 dias e sem alertas → saúde de vendas NO_DATA (nenhum alerta de receita inventado).",
    input: cockpitRaw({ todayRevenue: 0, todayOrders: 0, hasSevenDayData: false }),
    expect: { healthKey: "sales", healthStatus: "NO_DATA", noAlerts: true },
  },
];

// ─── library ────────────────────────────────────────────────────────────────

export const ANALYTICS_SCENARIOS: AnalyticsScenario[] = [
  ...DIAGNOSIS_SCENARIOS,
  ...RETENTION_SCENARIOS,
  ...OPERATIONS_SCENARIOS,
  ...ANALYST_SCENARIOS,
  ...COCKPIT_SCENARIOS,
];

export interface AnalyticsScenarioGroup {
  id:    AnalyticsScenarioGroupId;
  label: string;
  count: number;
}

const GROUP_ORDER: AnalyticsScenarioGroupId[] = [
  "diagnosis", "retention", "operations", "analyst", "cockpit",
];

export function getAnalyticsScenarioGroups(): AnalyticsScenarioGroup[] {
  return GROUP_ORDER.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    count: ANALYTICS_SCENARIOS.filter((s) => s.group === id).length,
  }));
}

/** P0 scenarios used by the "quick" runner mode. */
export function getQuickScenarios(): AnalyticsScenario[] {
  return ANALYTICS_SCENARIOS.filter((s) => s.severity === "P0");
}
