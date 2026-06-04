/**
 * AnalyticsOperationalEfficiencyService — order fulfillment timing analysis.
 *
 * Answers:
 *  - How long does it take from order placed to order completed?
 *  - Are delays increasing?
 *  - Which order type / payment method has more delays?
 *  - What fraction of orders are delayed / cancelled / awaiting payment?
 *
 * IMPORTANT SCHEMA LIMITATIONS:
 *  - The Order model has only TWO reliable timestamps for timing:
 *      createdAt   (always set, order placed)
 *      completedAt (set on DELIVERED transition only)
 *  - There are NO per-stage timestamps (confirmedAt, preparingAt, readyAt).
 *    Stage-level breakdowns are therefore NOT implemented.
 *  - Imported orders have completedAt = import time (unreliable) — excluded.
 *  - PICKUP/DINE_IN may reach DELIVERED, but operators sometimes stop at READY.
 *    Those orders will have no completedAt and are not counted in timing.
 *
 * Architecture:
 *  - Pure layer: computeEfficiencyReport() converts raw rows → typed report.
 *    Exported and unit-tested independently.
 *  - DB layer: AnalyticsOperationalEfficiencyService.getReport() fetches rows.
 */

import { prisma } from "@/lib/prisma";

// ─── Public types ─────────────────────────────────────────────────────────────

export type BottleneckStage = "FULFILLMENT" | "PAYMENT" | "CANCELLATION";
export type BottleneckSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface EfficiencyByType {
  type:                    string;
  ordersWithTiming:        number;
  avgFulfillmentMinutes:   number;
  delayedOrders:           number;
  delayedRate:             number;
  delayThresholdMinutes:   number;
}

export interface Bottleneck {
  stage:             BottleneckStage;
  severity:          BottleneckSeverity;
  observedValue:     number;
  threshold:         string;
  affectedOrders:    number;
  recommendation:    string;
}

export interface OperationalMetrics {
  ordersWithTiming:            number;
  avgFulfillmentMinutes:       number;
  medianFulfillmentMinutes:    number;
  p90FulfillmentMinutes:       number;
  delayedOrders:               number;
  delayedRate:                 number;
  totalOrders:                 number;
  cancelledOrders:             number;
  cancellationRate:            number;
  awaitingPaymentCount:        number;
  awaitingPaymentTotal:        number;
  byType:                      EfficiencyByType[];
}

export interface OperationalEfficiencyReport {
  period:      { from: string; to: string };
  metrics:     OperationalMetrics;
  bottlenecks: Bottleneck[];
  insights:    string[];
  limitations: string[];
  hasData:     boolean;
}

// ── Input types for the pure computation helper ───────────────────────────────

export interface RawTimingRow {
  type:               string;  // DELIVERY | PICKUP | DINE_IN
  fulfillmentMinutes: number;
}

export interface RawKpiHints {
  totalOrders:          number;
  cancelledOrders:      number;
  cancellationRate:     number;
  awaitingPaymentCount: number;
  awaitingPaymentTotal: number;
}

export interface EfficiencyThresholds {
  /** Minutes after which a DELIVERY order is considered delayed (default 60). */
  deliveryDelayMinutes:  number;
  /** Minutes after which a PICKUP order is considered delayed (default 40). */
  pickupDelayMinutes:    number;
  /** Minutes after which a DINE_IN order is considered delayed (default 45). */
  dineInDelayMinutes:    number;
  /** Fallback for unknown type (default 60). */
  defaultDelayMinutes:   number;
  /** Cancellation rate (%) at which a WARNING bottleneck fires (default 10). */
  cancellationWarnPct:   number;
  /** Cancellation rate (%) at which a CRITICAL bottleneck fires (default 20). */
  cancellationCritPct:   number;
  /** Minimum awaiting-payment count to flag as a bottleneck (default 3). */
  pixPendingMinCount:    number;
  /** Delayed-order rate (%) for a WARNING bottleneck (default 25). */
  delayedRateWarnPct:    number;
  /** Delayed-order rate (%) for a CRITICAL bottleneck (default 50). */
  delayedRateCritPct:    number;
}

export const DEFAULT_EFFICIENCY_THRESHOLDS: EfficiencyThresholds = {
  deliveryDelayMinutes: 60,
  pickupDelayMinutes:   40,
  dineInDelayMinutes:   45,
  defaultDelayMinutes:  60,
  cancellationWarnPct:  10,
  cancellationCritPct:  20,
  pixPendingMinCount:   3,
  delayedRateWarnPct:   25,
  delayedRateCritPct:   50,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delayThreshold(type: string, t: EfficiencyThresholds): number {
  if (type === "DELIVERY") return t.deliveryDelayMinutes;
  if (type === "PICKUP")   return t.pickupDelayMinutes;
  if (type === "DINE_IN")  return t.dineInDelayMinutes;
  return t.defaultDelayMinutes;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round((sorted[Math.max(0, idx)] ?? 0) * 10) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Pure computation (no I/O, unit-testable) ─────────────────────────────────

/**
 * Compute the full operational efficiency report from raw timing rows + KPI hints.
 * Accepts an optional threshold override for testing.
 */
export function computeEfficiencyReport(
  timingRows:  RawTimingRow[],
  kpi:         RawKpiHints,
  fromIso:     string,
  toIso:       string,
  thresholds?: Partial<EfficiencyThresholds>,
): OperationalEfficiencyReport {
  const t: EfficiencyThresholds = { ...DEFAULT_EFFICIENCY_THRESHOLDS, ...(thresholds ?? {}) };

  const limitations: string[] = [];
  const insights:    string[] = [];
  const bottlenecks: Bottleneck[] = [];

  // ── Overall timing ──────────────────────────────────────────────────────
  const allMinutes = timingRows.map((r) => r.fulfillmentMinutes).sort((a, b) => a - b);
  const ordersWithTiming = allMinutes.length;
  const avgFulfillmentMinutes = ordersWithTiming > 0
    ? round1(allMinutes.reduce((s, m) => s + m, 0) / ordersWithTiming)
    : 0;
  const medianFulfillmentMinutes = percentile(allMinutes, 50);
  const p90FulfillmentMinutes    = percentile(allMinutes, 90);

  // ── Delayed per type ────────────────────────────────────────────────────
  const typeMap = new Map<string, { minutes: number[]; delayed: number; threshold: number }>();
  for (const row of timingRows) {
    const thresh = delayThreshold(row.type, t);
    const existing = typeMap.get(row.type);
    if (existing) {
      existing.minutes.push(row.fulfillmentMinutes);
      if (row.fulfillmentMinutes > thresh) existing.delayed++;
    } else {
      typeMap.set(row.type, {
        minutes:   [row.fulfillmentMinutes],
        delayed:   row.fulfillmentMinutes > thresh ? 1 : 0,
        threshold: thresh,
      });
    }
  }

  let totalDelayed = 0;
  const byType: EfficiencyByType[] = [];
  for (const [type, data] of typeMap.entries()) {
    const cnt  = data.minutes.length;
    const avg  = cnt > 0 ? round1(data.minutes.reduce((s, m) => s + m, 0) / cnt) : 0;
    const rate = cnt > 0 ? round1((data.delayed / cnt) * 100) : 0;
    totalDelayed += data.delayed;
    byType.push({
      type,
      ordersWithTiming:      cnt,
      avgFulfillmentMinutes: avg,
      delayedOrders:         data.delayed,
      delayedRate:           rate,
      delayThresholdMinutes: data.threshold,
    });
  }
  const delayedRate = ordersWithTiming > 0
    ? round1((totalDelayed / ordersWithTiming) * 100)
    : 0;

  // ── Limitations ──────────────────────────────────────────────────────────
  if (ordersWithTiming === 0) {
    limitations.push(
      "Nenhum pedido DELIVERED com timestamps completos neste período — não é possível calcular tempo de atendimento. Isso pode ocorrer se os pedidos não foram marcados como concluídos no sistema.",
    );
  } else if (ordersWithTiming < kpi.totalOrders * 0.5) {
    limitations.push(
      `Apenas ${ordersWithTiming} de ${kpi.totalOrders} pedidos têm timestamps completos (createdAt + completedAt). PICKUP e DINE_IN não marcados como DELIVERED não são contabilizados no tempo de atendimento.`,
    );
  }

  limitations.push(
    "Não há timestamps de estágio individual (confirmado, em preparo, pronto para entrega). O tempo medido é total: pedido criado → pedido concluído.",
  );

  // ── Bottlenecks ──────────────────────────────────────────────────────────
  if (ordersWithTiming > 0) {
    const delaySev: BottleneckSeverity =
      delayedRate >= t.delayedRateCritPct ? "CRITICAL" :
      delayedRate >= t.delayedRateWarnPct ? "WARNING"  : "INFO";

    if (delaySev !== "INFO") {
      bottlenecks.push({
        stage:          "FULFILLMENT",
        severity:       delaySev,
        observedValue:  round1(avgFulfillmentMinutes),
        threshold:      `${t.defaultDelayMinutes}min padrão`,
        affectedOrders: totalDelayed,
        recommendation: "Revisar fluxo de preparo — identificar os itens que mais atrasam e ajustar tempos estimados no cardápio.",
      });
    }
  }

  const cancSev: BottleneckSeverity =
    kpi.cancellationRate >= t.cancellationCritPct ? "CRITICAL" :
    kpi.cancellationRate >= t.cancellationWarnPct ? "WARNING"  : "INFO";
  if (cancSev !== "INFO" && kpi.cancelledOrders > 0) {
    bottlenecks.push({
      stage:          "CANCELLATION",
      severity:       cancSev,
      observedValue:  round1(kpi.cancellationRate),
      threshold:      `≥ ${t.cancellationWarnPct}%`,
      affectedOrders: kpi.cancelledOrders,
      recommendation: "Investigar motivos de cancelamento — problemas de pagamento, indisponibilidade de item ou preparo longo são as causas mais comuns.",
    });
  }

  if (kpi.awaitingPaymentCount >= t.pixPendingMinCount) {
    bottlenecks.push({
      stage:          "PAYMENT",
      severity:       "WARNING",
      observedValue:  kpi.awaitingPaymentCount,
      threshold:      `≥ ${t.pixPendingMinCount} pendências`,
      affectedOrders: kpi.awaitingPaymentCount,
      recommendation: "Rever o fluxo de Pix — verificar geração de QR, prazo de expiração e lembrete automático de pagamento.",
    });
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  if (ordersWithTiming > 0) {
    const fmtMin = (m: number) => `${Math.floor(m)}min`;
    if (avgFulfillmentMinutes > 0) {
      insights.push(`Tempo médio de atendimento: ${fmtMin(avgFulfillmentMinutes)} (mediana ${fmtMin(medianFulfillmentMinutes)}, P90 ${fmtMin(p90FulfillmentMinutes)}).`);
    }
    if (delayedRate >= t.delayedRateWarnPct) {
      insights.push(`${delayedRate.toFixed(1)}% dos pedidos estão acima do tempo esperado — oportunidade de melhoria operacional.`);
    } else if (delayedRate < 10 && ordersWithTiming >= 10) {
      insights.push(`Baixa taxa de atrasos (${delayedRate.toFixed(1)}%) — operação dentro do tempo esperado na maioria dos pedidos.`);
    }
  }

  const metrics: OperationalMetrics = {
    ordersWithTiming,
    avgFulfillmentMinutes,
    medianFulfillmentMinutes,
    p90FulfillmentMinutes,
    delayedOrders:        totalDelayed,
    delayedRate,
    totalOrders:          kpi.totalOrders,
    cancelledOrders:      kpi.cancelledOrders,
    cancellationRate:     kpi.cancellationRate,
    awaitingPaymentCount: kpi.awaitingPaymentCount,
    awaitingPaymentTotal: kpi.awaitingPaymentTotal,
    byType,
  };

  const hasData = ordersWithTiming > 0 || kpi.totalOrders > 0;

  return {
    period:      { from: fromIso, to: toIso },
    metrics,
    bottlenecks,
    insights,
    limitations,
    hasData,
  };
}

// ─── DB service ───────────────────────────────────────────────────────────────

type RawBigint = bigint | number;

function toNum(v: RawBigint | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

export class AnalyticsOperationalEfficiencyService {
  static async getReport(
    restaurantId: string,
    from: Date,
    to:   Date,
    fromIso: string,
    toIso:   string,
  ): Promise<OperationalEfficiencyReport> {
    const [timingRows, kpiRows] = await Promise.all([
      // Timing: DELIVERED, real orders only (no imported), completedAt set, positive delta
      prisma.$queryRaw<Array<{
        type:                 string;
        fulfillment_minutes:  number;
      }>>`
        SELECT
          o.type::text                                                              AS type,
          EXTRACT(EPOCH FROM (o."completedAt" - o."createdAt")) / 60.0             AS fulfillment_minutes
        FROM orders o
        WHERE o."restaurantId" = ${restaurantId}
          AND o.status         = 'DELIVERED'
          AND o."completedAt"  IS NOT NULL
          AND o."importedAt"   IS NULL
          AND COALESCE(o."importedAt", o."createdAt") >= ${from}
          AND COALESCE(o."importedAt", o."createdAt") <  ${to}
          AND EXTRACT(EPOCH FROM (o."completedAt" - o."createdAt")) > 0
          AND EXTRACT(EPOCH FROM (o."completedAt" - o."createdAt")) < 28800
      `,
      // Lightweight KPI (orders + cancellations + awaiting payment)
      prisma.$queryRaw<Array<{
        total_orders:           RawBigint;
        cancelled_orders:       RawBigint;
        awaiting_payment_count: RawBigint;
        awaiting_payment_total: string;
      }>>`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED'))
                                                                AS total_orders,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')          AS cancelled_orders,
          COUNT(*) FILTER (WHERE status = 'AWAITING_PAYMENT')   AS awaiting_payment_count,
          COALESCE(SUM(total) FILTER (WHERE status = 'AWAITING_PAYMENT'), 0)::text
                                                                AS awaiting_payment_total
        FROM orders
        WHERE "restaurantId" = ${restaurantId}
          AND COALESCE("importedAt", "createdAt") >= ${from}
          AND COALESCE("importedAt", "createdAt") <  ${to}
      `,
    ]);

    const kpiRow = kpiRows[0];
    const totalOrders     = toNum(kpiRow?.total_orders);
    const cancelledOrders = toNum(kpiRow?.cancelled_orders);
    const total           = totalOrders + cancelledOrders;
    const cancellationRate = total > 0 ? Math.round((cancelledOrders / total) * 1000) / 10 : 0;

    const kpi: RawKpiHints = {
      totalOrders,
      cancelledOrders,
      cancellationRate,
      awaitingPaymentCount: toNum(kpiRow?.awaiting_payment_count),
      awaitingPaymentTotal: toNum(kpiRow?.awaiting_payment_total),
    };

    const typed: RawTimingRow[] = (timingRows as Array<{ type: string; fulfillment_minutes: number }>)
      .map((r) => ({
        type:               r.type ?? "DELIVERY",
        fulfillmentMinutes: Number(r.fulfillment_minutes),
      }))
      .filter((r) => r.fulfillmentMinutes > 0 && isFinite(r.fulfillmentMinutes));

    return computeEfficiencyReport(typed, kpi, fromIso, toIso);
  }
}
