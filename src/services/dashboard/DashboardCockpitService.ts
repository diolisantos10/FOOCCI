/**
 * DashboardCockpitService — W4
 *
 * Produces a CockpitReport: urgent alerts, recommended actions, and health
 * indicators for the restaurant owner command center.
 *
 * Architecture:
 *  - Pure builders (buildAlerts, buildActions, buildHealth) — no I/O, fully testable.
 *  - getCockpitReport — async, fetches raw data, calls pure builders.
 *
 * NON-NEGOTIABLE:
 *  - Read-only. No mutations, no side effects.
 *  - No invented metrics. Every value comes from DB.
 *  - If data is missing, declare a limitation — never fake a number.
 *  - Tenant-scoped via restaurantId.
 */

import { prisma } from "@/lib/prisma";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type HealthStatus  = "HEALTHY"  | "WARNING"  | "CRITICAL" | "NO_DATA";
export type ActionSource  = "OPERATIONS" | "CRM" | "RECOVERY";

export interface CockpitAlert {
  id:           string;
  severity:     AlertSeverity;
  title:        string;
  description:  string;
  actionLabel?: string;
  actionHref?:  string;
}

export interface CockpitAction {
  id:          string;
  priority:    number;
  title:       string;
  description: string;
  actionLabel: string;
  actionHref:  string;
  source:      ActionSource;
}

export interface HealthIndicator {
  status: HealthStatus;
  label:  string;
  sub?:   string;
}

export interface CockpitReport {
  generatedAt:        string;  // ISO timestamp
  urgentAlerts:       CockpitAlert[];
  recommendedActions: CockpitAction[];
  health: {
    sales:      HealthIndicator;
    operations: HealthIndicator;
    crm:        HealthIndicator;
    recovery:   HealthIndicator;
  };
  crmOpportunities: {
    coldCustomers:       number;
    lostCustomers:       number;
    vipCustomers:        number;
    reviewOpportunities: number;
  };
  limitations: string[];
}

// ─── Input shape for pure builders ───────────────────────────────────────────

export interface CockpitRawData {
  todayRevenue:    number;
  todayOrders:     number;
  cancelledToday:  number;

  avg7DayRevenue:  number;   // average daily revenue over the previous 7 days
  hasSevenDayData: boolean;  // false when there are no 7-day orders at all

  pendingPayments:  number;  // orders with status AWAITING_PAYMENT
  delayedOrders:    number;  // open orders waiting >20 min without progression

  crmFrio:          number;  // customers in FRIO segment
  crmTotal:         number;  // total active non-guest customers
  vipCustomers:     number;  // customers with tier OURO or DIAMANTE

  pendingRecovery:  number;  // OPEN drafts >20 min old, no recovery attempt, has items
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

// ─── Pure builder: alerts ─────────────────────────────────────────────────────

export function buildAlerts(d: CockpitRawData): CockpitAlert[] {
  const alerts: CockpitAlert[] = [];

  if (d.delayedOrders > 0) {
    const n = d.delayedOrders;
    alerts.push({
      id:          "delayed-orders",
      severity:    n >= 3 ? "CRITICAL" : "WARNING",
      title:       `${n} pedido${n !== 1 ? "s" : ""} atrasado${n !== 1 ? "s" : ""}`,
      description: "Pedidos aguardando há mais de 20 minutos sem progressão.",
      actionLabel: "Ver pedidos",
      actionHref:  "/orders",
    });
  }

  if (d.pendingPayments > 0) {
    const n = d.pendingPayments;
    alerts.push({
      id:          "pending-payments",
      severity:    n >= 3 ? "WARNING" : "INFO",
      title:       `${n} pagamento${n !== 1 ? "s" : ""} pendente${n !== 1 ? "s" : ""}`,
      description: "Pedidos aguardando confirmação de pagamento Pix.",
      actionLabel: "Ver pedidos",
      actionHref:  "/orders",
    });
  }

  if (d.hasSevenDayData && d.avg7DayRevenue > 0 && d.todayOrders > 0) {
    const ratio = d.todayRevenue / d.avg7DayRevenue;
    if (ratio < 0.5) {
      alerts.push({
        id:          "revenue-below-baseline",
        severity:    "WARNING",
        title:       "Receita abaixo da média",
        description: `Hoje representa ${fmtPct(ratio * 100)} da média diária dos últimos 7 dias.`,
        actionLabel: "Ver analytics",
        actionHref:  "/analytics",
      });
    }
  }

  const totalAttempts = d.todayOrders + d.cancelledToday;
  if (totalAttempts >= 5 && d.cancelledToday / totalAttempts > 0.15) {
    const n = d.cancelledToday;
    alerts.push({
      id:          "high-cancellations",
      severity:    "WARNING",
      title:       `${n} cancelamento${n !== 1 ? "s" : ""} hoje`,
      description: `Taxa de cancelamento de ${fmtPct((d.cancelledToday / totalAttempts) * 100)} — acima do esperado.`,
      actionLabel: "Ver pedidos",
      actionHref:  "/orders",
    });
  }

  return alerts;
}

// ─── Pure builder: recommended actions ───────────────────────────────────────

export function buildActions(d: CockpitRawData): CockpitAction[] {
  const actions: CockpitAction[] = [];
  let p = 1;

  if (d.pendingRecovery > 0) {
    const n = d.pendingRecovery;
    actions.push({
      id:          `recovery-${p}`,
      priority:    p++,
      title:       `${n} carrinho${n !== 1 ? "s" : ""} abandonado${n !== 1 ? "s" : ""}`,
      description: "Clientes com itens no carrinho há mais de 20 min sem finalizar o pedido.",
      actionLabel: "Ver carrinhos",
      actionHref:  "/orders",
      source:      "RECOVERY",
    });
  }

  if (d.crmFrio >= 20) {
    const n = d.crmFrio;
    actions.push({
      id:          `crm-cold-${p}`,
      priority:    p++,
      title:       `${n} cliente${n !== 1 ? "s" : ""} inativo${n !== 1 ? "s" : ""}`,
      description: "Clientes no segmento Frio — boa oportunidade para campanha de reativação.",
      actionLabel: "Criar campanha",
      actionHref:  "/crm",
      source:      "CRM",
    });
  }

  if (d.delayedOrders >= 3) {
    actions.push({
      id:          `ops-delay-${p}`,
      priority:    p++,
      title:       "Operação com atrasos críticos",
      description: `${d.delayedOrders} pedidos aguardando há mais de 20 min. Revise a capacidade da cozinha.`,
      actionLabel: "Ver operações",
      actionHref:  "/orders",
      source:      "OPERATIONS",
    });
  }

  return actions;
}

// ─── Pure builder: health indicators ─────────────────────────────────────────

export function buildHealth(d: CockpitRawData): CockpitReport["health"] {
  // Sales health — based on today vs 7-day average
  let sales: HealthIndicator;
  if (!d.hasSevenDayData || d.avg7DayRevenue === 0) {
    sales = { status: "NO_DATA", label: "Sem histórico", sub: "Dados insuficientes para comparar" };
  } else {
    const ratio = d.todayRevenue / d.avg7DayRevenue;
    if (ratio >= 0.8)       sales = { status: "HEALTHY",  label: "Normal",   sub: `${fmtPct(ratio * 100)} da média` };
    else if (ratio >= 0.5)  sales = { status: "WARNING",  label: "Abaixo",   sub: `${fmtPct(ratio * 100)} da média` };
    else                    sales = { status: "CRITICAL", label: "Crítico",  sub: `${fmtPct(ratio * 100)} da média` };
  }

  // Operations health — delayed orders + pending payments
  let operations: HealthIndicator;
  if (d.delayedOrders >= 3) {
    operations = { status: "CRITICAL", label: "Crítico",     sub: `${d.delayedOrders} pedidos atrasados`   };
  } else if (d.delayedOrders > 0) {
    operations = { status: "WARNING",  label: "Atenção",     sub: `${d.delayedOrders} pedido${d.delayedOrders !== 1 ? "s" : ""} atrasado${d.delayedOrders !== 1 ? "s" : ""}` };
  } else if (d.pendingPayments >= 5) {
    operations = { status: "WARNING",  label: "Pagamentos",  sub: `${d.pendingPayments} pendentes`          };
  } else {
    operations = { status: "HEALTHY",  label: "Normal",      sub: "Sem atrasos detectados"                   };
  }

  // CRM health — cold customer ratio
  let crm: HealthIndicator;
  if (d.crmTotal === 0) {
    crm = { status: "NO_DATA", label: "Sem dados",      sub: "Base de clientes vazia"              };
  } else {
    const coldRatio = d.crmFrio / d.crmTotal;
    if (coldRatio >= 0.4)      crm = { status: "CRITICAL", label: "Muitos inativos", sub: `${fmtPct(coldRatio * 100)} da base fria` };
    else if (coldRatio >= 0.25) crm = { status: "WARNING",  label: "Atenção",         sub: `${fmtPct(coldRatio * 100)} da base fria` };
    else                        crm = { status: "HEALTHY",  label: "Saudável",         sub: `${d.crmFrio} clientes frios`             };
  }

  // Recovery health — abandoned carts
  let recovery: HealthIndicator;
  if (d.pendingRecovery >= 3) {
    recovery = { status: "WARNING",  label: "Carrinhos",  sub: `${d.pendingRecovery} sem recovery`    };
  } else if (d.pendingRecovery > 0) {
    recovery = { status: "WARNING",  label: "1 carrinho", sub: "Aguardando tentativa de recovery"     };
  } else {
    recovery = { status: "HEALTHY",  label: "OK",         sub: "Nenhum carrinho pendente"             };
  }

  return { sales, operations, crm, recovery };
}

// ─── Async data fetch + report assembly ──────────────────────────────────────

function brazilMidnight(): Date {
  const now = new Date();
  const d   = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0));
  if (Date.now() < d.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const REVENUE_STATUS = ["DELIVERED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "AWAITING_PAYMENT"] as const;
const OPEN_STATUS    = ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const;
const DELAY_MS       = 20 * 60 * 1_000;

export async function getCockpitReport(restaurantId: string): Promise<CockpitReport> {
  const todayStart    = brazilMidnight();
  const sevenDaysAgo  = new Date(todayStart.getTime() - 7 * 86_400_000);
  const now           = new Date();
  const staleCutoff   = new Date(now.getTime() - DELAY_MS);

  const [
    todayOrderRows,
    cancelledTodayCount,
    sevenDayOrders,
    pendingPaymentsCount,
    openOrders,
    segmentCounts,
    vipCount,
    staleDraftCount,
  ] = await Promise.all([
    // 1. Today's revenue orders
    prisma.order.findMany({
      where:  { restaurantId, status: { in: [...REVENUE_STATUS] }, createdAt: { gte: todayStart } },
      select: { total: true },
    }),
    // 2. Cancellations today
    prisma.order.count({
      where: { restaurantId, status: "CANCELLED", createdAt: { gte: todayStart } },
    }),
    // 3. Last 7 days revenue (for avg baseline — exclude today)
    prisma.order.findMany({
      where:  { restaurantId, status: { in: [...REVENUE_STATUS] }, createdAt: { gte: sevenDaysAgo, lt: todayStart } },
      select: { total: true },
    }),
    // 4. Pending payment orders (real-time)
    prisma.order.count({
      where: { restaurantId, status: "AWAITING_PAYMENT" },
    }),
    // 5. Open orders for delayed check (real-time)
    prisma.order.findMany({
      where:  { restaurantId, status: { in: [...OPEN_STATUS] } },
      select: { status: true, createdAt: true },
    }),
    // 6. CRM segment breakdown
    prisma.customer.groupBy({
      by:    ["segment"],
      where: { restaurantId, isGuest: false, isActive: true },
      _count: { id: true },
    }),
    // 7. VIP customers (tier OURO or DIAMANTE)
    prisma.customer.count({
      where: { restaurantId, isGuest: false, isActive: true, tier: { in: ["OURO", "DIAMANTE"] } },
    }),
    // 8. Abandoned carts: OPEN, >20min, 0 recovery attempts, has items
    prisma.orderDraft.count({
      where: {
        restaurantId,
        status:           "OPEN",
        recoveryAttempts: 0,
        updatedAt:        { lt: staleCutoff },
        items:            { some: {} },
      },
    }),
  ]);

  // ── Compute inputs ────────────────────────────────────────────────────────
  const todayRevenue   = todayOrderRows.reduce((s, o) => s + Number(o.total), 0);
  const todayOrders    = todayOrderRows.length;

  const seven7Revenue  = sevenDayOrders.reduce((s, o) => s + Number(o.total), 0);
  const avg7DayRevenue = seven7Revenue / 7;  // per-day average over the 7-day window
  const hasSevenDayData = sevenDayOrders.length > 0;

  const segMap: Record<string, number> = {};
  for (const row of segmentCounts) segMap[row.segment] = row._count.id;
  const crmFrio  = segMap["FRIO"]       ?? 0;
  const crmTotal = Object.values(segMap).reduce((s, n) => s + n, 0);

  const delayedOrders = openOrders.filter(
    o => (now.getTime() - o.createdAt.getTime()) > DELAY_MS
  ).length;

  const raw: CockpitRawData = {
    todayRevenue,
    todayOrders,
    cancelledToday:  cancelledTodayCount,
    avg7DayRevenue,
    hasSevenDayData,
    pendingPayments: pendingPaymentsCount,
    delayedOrders,
    crmFrio,
    crmTotal,
    vipCustomers:    vipCount,
    pendingRecovery: staleDraftCount,
  };

  const limitations: string[] = [
    "Oportunidades de avaliação não estão disponíveis — integração de reviews não configurada.",
    "Atribuição de campanhas não incluída neste resumo — consulte Analytics para detalhes.",
  ];

  return {
    generatedAt:        now.toISOString(),
    urgentAlerts:       buildAlerts(raw),
    recommendedActions: buildActions(raw),
    health:             buildHealth(raw),
    crmOpportunities: {
      coldCustomers:       crmFrio,
      lostCustomers:       crmFrio,   // same FRIO segment; no "lost" distinction without date threshold
      vipCustomers:        vipCount,
      reviewOpportunities: 0,         // declared as limitation above
    },
    limitations,
  };
}
