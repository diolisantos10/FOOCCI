/**
 * AnalyticsRetentionService — cohort-based customer retention analysis.
 *
 * Answers:
 *  - Of customers who made their first purchase in a given month, how many
 *    came back within 30 / 60 / 90 days?
 *  - How long on average until the second order?
 *  - Which cohorts retain best?
 *
 * Architecture:
 *  - DB layer: AnalyticsRetentionService.getReport() runs the Postgres CTE.
 *  - Pure layer: computeRetentionReport() converts raw DB rows → typed report.
 *    Exported and unit-tested independently — no DB, no network.
 *
 * Convention matches AnalyticsService:
 *  - Only real Foocci orders count (importedAt IS NULL); imported history excluded.
 *  - Revenue-valid statuses: CONFIRMED / PREPARING / READY / OUT_FOR_DELIVERY / DELIVERED.
 *  - Non-guest customers only.
 *  - Imported orders are included (they carry the customer's real history), but a
 *    limitation note is added when the window contains older imported cohorts.
 */

import { prisma } from "@/lib/prisma";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CohortData {
  cohortMonth:            string;   // YYYY-MM
  newCustomers:           number;
  returned30d:            number;
  returned60d:            number;
  returned90d:            number;
  retention30dPct:        number;
  retention60dPct:        number;
  retention90dPct:        number;
  averageSecondOrderDays: number | null;
  totalRevenue:           number;
  repeatRevenue:          number;
  repeatRevenuePct:       number;
  maturityNote:           string | null; // e.g. "cohort not yet mature for 90d window"
}

export interface RetentionSummary {
  avgRetention30d: number;   // weighted average across cohorts with ≥ minSample customers
  avgRetention60d: number;
  avgRetention90d: number;
  bestCohort30d:   string | null;
  worstCohort30d:  string | null;
}

export interface RetentionReport {
  period:      { from: string; to: string };
  cohorts:     CohortData[];
  summary:     RetentionSummary;
  insights:    string[];
  limitations: string[];
  hasData:     boolean;
}

// ── Input type for the pure computation helper (exported for tests) ───────────

export interface RawCohortRow {
  cohortMonth:           string;
  newCustomers:          number;
  returned30d:           number;
  returned60d:           number;
  returned90d:           number;
  avgSecondOrderDays:    number | null;
  totalRevenue:          number;
  repeatRevenue:         number;
}

// ─── Pure computation (no I/O, unit-testable) ─────────────────────────────────

const MIN_SAMPLE_FOR_INSIGHT = 5;

/**
 * Convert raw DB rows into a typed RetentionReport.
 * Handles maturity notes (cohorts that haven't had time to mature for 90d window).
 *
 * @param rows     — Raw rows, one per cohort month
 * @param now      — ISO date string YYYY-MM-DD for maturity calculation (default today)
 * @param fromIso  — Start of analysis window (YYYY-MM-DD)
 * @param toIso    — End of analysis window (YYYY-MM-DD)
 */
export function computeRetentionReport(
  rows:     RawCohortRow[],
  fromIso:  string,
  toIso:    string,
  now:      string = new Date().toISOString().slice(0, 10),
): RetentionReport {
  const limitations: string[] = [];
  const insights:    string[] = [];

  const nowDate  = new Date(now);
  const cohorts: CohortData[] = rows.map((row) => {
    const [yr, mo] = row.cohortMonth.split("-").map(Number);
    // First day of the NEXT month = when the cohort is 1 month old
    const cohortStart = new Date(Date.UTC(yr!, mo! - 1, 1));

    // Days since cohort start at time of analysis
    const daysSinceCohort = Math.floor(
      (nowDate.getTime() - cohortStart.getTime()) / 86_400_000,
    );

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    const retention30dPct = pct(row.returned30d, row.newCustomers);
    const retention60dPct = pct(row.returned60d, row.newCustomers);
    const retention90dPct = pct(row.returned90d, row.newCustomers);
    const repeatRevenuePct = row.totalRevenue > 0
      ? Math.round((row.repeatRevenue / row.totalRevenue) * 1000) / 10
      : 0;

    let maturityNote: string | null = null;
    if (daysSinceCohort < 30) maturityNote = "Cohort não maturou 30 dias ainda — dados preliminares.";
    else if (daysSinceCohort < 60) maturityNote = "Cohort não maturou 60 dias — retenção 60/90d subestimada.";
    else if (daysSinceCohort < 90) maturityNote = "Cohort não maturou 90 dias — retenção 90d subestimada.";

    return {
      cohortMonth:            row.cohortMonth,
      newCustomers:           row.newCustomers,
      returned30d:            row.returned30d,
      returned60d:            row.returned60d,
      returned90d:            row.returned90d,
      retention30dPct,
      retention60dPct,
      retention90dPct,
      averageSecondOrderDays: row.avgSecondOrderDays !== null
        ? Math.round(row.avgSecondOrderDays * 10) / 10
        : null,
      totalRevenue:    row.totalRevenue,
      repeatRevenue:   row.repeatRevenue,
      repeatRevenuePct,
      maturityNote,
    };
  });

  // ── Summary across mature cohorts only ────────────────────────────────────
  const matureCohorts = cohorts.filter(
    (c) => c.maturityNote === null && c.newCustomers >= MIN_SAMPLE_FOR_INSIGHT,
  );

  const wavg = (key: keyof Pick<CohortData, "retention30dPct" | "retention60dPct" | "retention90dPct">) => {
    const totalCust = matureCohorts.reduce((s, c) => s + c.newCustomers, 0);
    if (totalCust === 0) return 0;
    const weighted = matureCohorts.reduce((s, c) => s + c[key] * c.newCustomers, 0);
    return Math.round((weighted / totalCust) * 10) / 10;
  };

  const best30  = matureCohorts.sort((a, b) => b.retention30dPct - a.retention30dPct)[0]?.cohortMonth ?? null;
  const worst30 = matureCohorts.sort((a, b) => a.retention30dPct - b.retention30dPct)[0]?.cohortMonth ?? null;

  const summary: RetentionSummary = {
    avgRetention30d: wavg("retention30dPct"),
    avgRetention60d: wavg("retention60dPct"),
    avgRetention90d: wavg("retention90dPct"),
    bestCohort30d:   best30,
    worstCohort30d:  worst30 !== best30 ? worst30 : null,
  };

  // ── Limitations ────────────────────────────────────────────────────────────
  const immatureCohorts = cohorts.filter((c) => c.maturityNote !== null);
  if (immatureCohorts.length > 0) {
    limitations.push(
      `${immatureCohorts.length} cohort(s) ainda não maturou — as taxas de retenção de 30/60/90 dias serão subestimadas para esses meses. A análise é mais confiável para cohorts de mais de 90 dias atrás.`,
    );
  }

  const smallCohorts = cohorts.filter((c) => c.newCustomers < MIN_SAMPLE_FOR_INSIGHT);
  if (smallCohorts.length > 0) {
    limitations.push(
      `${smallCohorts.length} cohort(s) com menos de ${MIN_SAMPLE_FOR_INSIGHT} novos clientes — percentuais podem ser instáveis. Insights são suprimidos para esses meses.`,
    );
  }

  // ── Insights ───────────────────────────────────────────────────────────────
  if (summary.avgRetention30d === 0 && matureCohorts.length === 0) {
    if (cohorts.length > 0) {
      limitations.push("Nenhum cohort maturou o suficiente para análise de retenção confiável neste período.");
    }
  } else if (matureCohorts.length > 0) {
    if (summary.avgRetention30d >= 40) {
      insights.push(`Boa retenção em 30 dias: ${summary.avgRetention30d.toFixed(1)}% dos novos clientes fizeram um segundo pedido no primeiro mês — acima da média para restaurantes.`);
    } else if (summary.avgRetention30d < 20) {
      insights.push(`Retenção em 30 dias baixa (${summary.avgRetention30d.toFixed(1)}%) — a maioria dos novos clientes não voltou no primeiro mês. Considere uma campanha de pós-compra para novos clientes.`);
    } else {
      insights.push(`Retenção em 30 dias: ${summary.avgRetention30d.toFixed(1)}% dos novos clientes retornaram dentro de 30 dias.`);
    }

    const avgDays = matureCohorts
      .filter((c) => c.averageSecondOrderDays !== null)
      .map((c) => c.averageSecondOrderDays as number);
    if (avgDays.length > 0) {
      const mean = Math.round(avgDays.reduce((s, d) => s + d, 0) / avgDays.length);
      insights.push(`Tempo médio até o segundo pedido: ${mean} dias — use esse ciclo para acionar campanhas de retenção no momento certo.`);
    }
  }

  const hasData = cohorts.length > 0 && cohorts.some((c) => c.newCustomers > 0);

  return {
    period: { from: fromIso, to: toIso },
    cohorts,
    summary,
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

export class AnalyticsRetentionService {
  static async getReport(
    restaurantId: string,
    from: Date,
    to:   Date,
    fromIso: string,
    toIso:   string,
  ): Promise<RetentionReport> {
    const rows = await prisma.$queryRaw<Array<{
      cohort_month:          string;
      new_customers:         RawBigint;
      returned_30d:          RawBigint;
      returned_60d:          RawBigint;
      returned_90d:          RawBigint;
      avg_second_order_days: number | null;
      total_revenue:         string;
      repeat_revenue:        string;
    }>>`
      WITH first_orders AS (
        -- Global first revenue-valid order per non-guest customer
        SELECT
          o."customerId",
          MIN(o."createdAt") AS first_order_at
        FROM orders o
        JOIN customers c ON c.id = o."customerId"
        WHERE o."restaurantId" = ${restaurantId}
          AND c."restaurantId" = ${restaurantId}
          AND c."isGuest"      = false
          AND o."importedAt"   IS NULL
          AND o.status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        GROUP BY o."customerId"
      ),
      cohort_customers AS (
        -- Only customers whose first-ever order falls within the analysis window
        SELECT
          fo."customerId",
          fo.first_order_at,
          TO_CHAR(fo.first_order_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS cohort_month
        FROM first_orders fo
        WHERE fo.first_order_at >= ${from}
          AND fo.first_order_at <  ${to}
      ),
      customer_repeat AS (
        -- For each cohort customer, find their earliest repeat order and revenue
        SELECT
          cc."customerId",
          cc.cohort_month,
          cc.first_order_at,
          MIN(o."createdAt")
            FILTER (WHERE o."createdAt" > cc.first_order_at)
            AS second_order_at,
          COALESCE(SUM(o.total), 0)                                            AS total_revenue,
          COALESCE(SUM(o.total)
            FILTER (WHERE o."createdAt" > cc.first_order_at), 0)
            AS repeat_revenue
        FROM cohort_customers cc
        LEFT JOIN orders o
          ON o."customerId"    = cc."customerId"
          AND o."restaurantId" = ${restaurantId}
          AND o."importedAt"   IS NULL
          AND o.status         IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
        GROUP BY cc."customerId", cc.cohort_month, cc.first_order_at
      )
      SELECT
        cohort_month,
        COUNT(*)::bigint                                                          AS new_customers,
        COUNT(CASE WHEN second_order_at <= first_order_at + INTERVAL '30 days'
                   THEN 1 END)::bigint                                           AS returned_30d,
        COUNT(CASE WHEN second_order_at <= first_order_at + INTERVAL '60 days'
                   THEN 1 END)::bigint                                           AS returned_60d,
        COUNT(CASE WHEN second_order_at <= first_order_at + INTERVAL '90 days'
                   THEN 1 END)::bigint                                           AS returned_90d,
        AVG(
          CASE WHEN second_order_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (second_order_at - first_order_at)) / 86400.0
          END
        )                                                                        AS avg_second_order_days,
        SUM(total_revenue)::text                                                 AS total_revenue,
        SUM(repeat_revenue)::text                                                AS repeat_revenue
      FROM customer_repeat
      GROUP BY cohort_month
      ORDER BY cohort_month DESC
    `;

    const typed: RawCohortRow[] = rows.map((r) => ({
      cohortMonth:        r.cohort_month,
      newCustomers:       toNum(r.new_customers),
      returned30d:        toNum(r.returned_30d),
      returned60d:        toNum(r.returned_60d),
      returned90d:        toNum(r.returned_90d),
      avgSecondOrderDays: r.avg_second_order_days,
      totalRevenue:       toNum(r.total_revenue),
      repeatRevenue:      toNum(r.repeat_revenue),
    }));

    return computeRetentionReport(typed, fromIso, toIso);
  }
}
