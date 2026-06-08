/**
 * AnalyticsAuditor — Analytics (CONNECTED, v1.3).
 *
 * Runs the REAL deterministic Analytics Test Center evaluator (`evaluateAll` +
 * `ANALYTICS_SCENARIOS`) with a fixed clock and `includeLiveData=false`. 100%
 * read-only: the evaluator calls only PURE analytics functions — "No DB. No LLM.
 * No network. No mutation. No sends." (see analyticsEvaluator header). Fixtures
 * are deterministic (SCENARIO_NOW), so it never touches a real restaurant, the
 * production dashboard or live/mutable data.
 *
 * Findings:
 *  - any scenario FAIL (failed CRITICAL check — broken essential calc) ⇒ FAIL/P0;
 *  - scenarios WARN (metric gaps / partial coverage) ⇒ WARNING/P2;
 *  - all green ⇒ PASS/INFO.
 *  - a read-only/fixed-data guarantee finding: live-data dependency or a runner
 *    crash ⇒ FAIL/P0, otherwise PASS/INFO.
 */

import type { Auditor, AuditContext, AuditFinding, FindingSeverity, FindingStatus } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { makeFinding } from "./_shared";
import { ANALYTICS_SCENARIOS } from "@/services/analytics/testing/analyticsScenarios";
import {
  evaluateAll,
  type AnalyticsEvalReport,
  type AnalyticsScenarioResult,
  type EvalMeta,
} from "@/services/analytics/testing/analyticsEvaluator";

/** Read-only meta: deterministic fixtures, never live/mutable data. */
const READONLY_META: EvalMeta = {
  restaurantId: "qc-analytics-synthetic",
  restaurantName: "QC Synthetic Analytics",
  slug: "qc-analytics",
  mode: "audit",
  includeLiveData: false,
};

export interface AnalyticsRunClassification {
  status: FindingStatus;
  severity: FindingSeverity;
  failed: AnalyticsScenarioResult[];
  warned: AnalyticsScenarioResult[];
}

/**
 * Pure classifier for the Analytics Test Center result:
 *  - any FAIL verdict (broken essential calculation) ⇒ FAIL / P0;
 *  - else any WARN verdict (metric gap / partial coverage) ⇒ WARNING / P2;
 *  - else PASS / INFO.
 */
export function classifyAnalyticsRun(results: readonly AnalyticsScenarioResult[]): AnalyticsRunClassification {
  const failed = results.filter((r) => r.verdict === "FAIL").slice().sort((a, b) => a.id.localeCompare(b.id));
  const warned = results.filter((r) => r.verdict === "WARN").slice().sort((a, b) => a.id.localeCompare(b.id));
  if (failed.length > 0) return { status: "FAIL", severity: "P0", failed, warned };
  if (warned.length > 0) return { status: "WARNING", severity: "P2", failed, warned };
  return { status: "PASS", severity: "INFO", failed, warned };
}

/**
 * Pure read-only / fixed-data guarantee. A run that pulled live/mutable data
 * (includeLiveData) is an undue dependency on production ⇒ FAIL / P0; otherwise
 * the run is provably deterministic & read-only ⇒ PASS / INFO.
 */
export function evaluateReadOnlySafety(report: AnalyticsEvalReport): {
  status: FindingStatus;
  severity: FindingSeverity;
  reason: string;
} {
  if (report.includeLiveData) {
    return {
      status: "FAIL",
      severity: "P0",
      reason: "Auditoria consultou dados ao vivo (includeLiveData=true) — dependência indevida de dado real mutável.",
    };
  }
  return {
    status: "PASS",
    severity: "INFO",
    reason: "Read-only garantido (includeLiveData=false) — fixtures determinísticas, sem DB nem mutação.",
  };
}

export const AnalyticsAuditor: Auditor = {
  ...AUDITOR_META.analytics,
  readOnly: true,
  canRunDaily: true,
  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    assertSafeMode(ctx.safeMode);

    // The auditor must never crash the dashboard: a runner crash becomes a
    // controlled FAIL/P0 finding instead of propagating.
    let report: AnalyticsEvalReport;
    try {
      report = evaluateAll(ANALYTICS_SCENARIOS, READONLY_META, ctx.now);
    } catch (err) {
      return [
        makeFinding(ctx, "analytics", {
          status: "FAIL",
          severity: "P0",
          title: "Analytics — crash no runner de avaliação",
          summary: "O evaluator de Analytics lançou exceção durante a auditoria (cálculo essencial quebrado).",
          evidence: [String(err instanceof Error ? err.message : err)],
          affectedArea: "Analytics",
          recommendation: "Investigar imediatamente — cálculo crítico do dashboard pode estar quebrado.",
        }),
      ];
    }

    const { status, severity, failed, warned } = classifyAnalyticsRun(report.results);
    const { total, passed, warned: warnedCount } = report.summary;

    const findings: AuditFinding[] = [];

    // ── 1) Analytics Test Center result ────────────────────────────────────
    if (status === "FAIL") {
      findings.push(
        makeFinding(ctx, "analytics", {
          status,
          severity,
          title: "Analytics Test Center — cálculo crítico quebrado",
          summary: `${failed.length} cenário(s) falharam em checks críticos (métrica essencial / dashboard principal).`,
          evidence: failed.map((r) => `${r.id} [${r.groupLabel}]: ${r.failedChecks.join(", ")}`),
          affectedArea: "Analytics",
          recommendation: "Investigar imediatamente — risco de dashboard inutilizável ou métrica impossível.",
        }),
      );
    } else if (status === "WARNING") {
      findings.push(
        makeFinding(ctx, "analytics", {
          status,
          severity,
          title: "Analytics Test Center — gaps de métrica",
          summary: `${passed}/${total} cenários OK. ${warnedCount} com gaps (cobertura parcial / cálculo incompleto) — sem quebra crítica.`,
          evidence: warned.map((r) => `${r.id} [${r.groupLabel}]: ${r.warnings.join(", ")}`),
          affectedArea: "Analytics",
          recommendation: "Revisar cobertura de métricas; nenhum gap quebra o dashboard.",
        }),
      );
    } else {
      findings.push(
        makeFinding(ctx, "analytics", {
          status,
          severity,
          title: "Analytics Test Center — todos os cenários OK",
          summary: `${passed}/${total} cenários passaram (diagnóstico, retenção/cohort, operação, analista, cockpit).`,
          evidence: [`${total} cenários determinísticos avaliados com data fixa`],
          affectedArea: "Analytics",
          recommendation: "Manter cobertura; validar com dados reais quando o dashboard for auditado ao vivo.",
        }),
      );
    }

    // ── 2) Read-only / fixed-data guarantee ────────────────────────────────
    const safety = evaluateReadOnlySafety(report);
    findings.push(
      makeFinding(ctx, "analytics", {
        status: safety.status,
        severity: safety.severity,
        title: "Analytics — garantia read-only / data fixa",
        summary: safety.reason,
        evidence: [
          "safeMode=true · dryRun=true · allowSideEffects=false",
          `includeLiveData=${report.includeLiveData}`,
          "Evaluator puro — sem DB, sem rede, sem mutação (analyticsEvaluator).",
        ],
        affectedArea: "Analytics",
        recommendation:
          safety.status === "FAIL"
            ? "Bloquear auditoria com dados ao vivo; auditar sempre com fixtures determinísticas."
            : "Manter auditoria sempre read-only (fixtures + data fixa).",
      }),
    );

    return findings;
  },
};
