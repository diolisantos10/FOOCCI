/**
 * analyticsEvaluator — Deterministic evaluation engine for Analytics logic (W5).
 *
 * Runs each AnalyticsScenario against the matching PURE analytics function and
 * grades the result with severity-weighted checks. No DB. No LLM. No network.
 * No mutation. No sends. Safe to call in any context.
 *
 * Scoring (per scenario, mirrors CRM/Waiter Test Centers):
 *   - any failed CRITICAL check → FAIL  (score 40)
 *   - only failed WARNING checks → WARN (score 70)
 *   - everything passes          → PASS (score 100)
 *
 * The evaluator never relies solely on exact text: it checks intents, severities,
 * metric directions, the presence of limitations when data is missing, and the
 * ABSENCE of invented metrics (COGS/profit, iFood integration, per-stage kitchen
 * timing, comparison findings without a baseline).
 */

import { AnalyticsDiagnosisService } from "../AnalyticsDiagnosisService";
import { computeRetentionReport } from "../AnalyticsRetentionService";
import { computeEfficiencyReport } from "../AnalyticsOperationalEfficiencyService";
import { routeIntent, buildGroundedAnswer, type AgentServiceData } from "../AnalyticsAgentService";
import { buildAlerts, buildActions, buildHealth } from "@/services/dashboard/DashboardCockpitService";

import {
  ANALYTICS_SCENARIOS,
  type AnalyticsScenario,
  type AnalyticsScenarioGroupId,
  type Severity,
} from "./analyticsScenarios";

// ─── result types ─────────────────────────────────────────────────────────────

export type CheckSeverity = "critical" | "warning";
export type Verdict = "PASS" | "WARN" | "FAIL";

export interface AnalyticsCheckResult {
  label:    string;
  severity: CheckSeverity;
  pass:     boolean;
  detail:   string;
}

export interface AnalyticsScenarioResult {
  id:              string;
  group:           AnalyticsScenarioGroupId;
  groupLabel:      string;
  name:            string;
  description:     string;
  severity:        Severity;
  verdict:         Verdict;
  score:           number;
  checks:          AnalyticsCheckResult[];
  failedChecks:    string[];   // labels of failed critical checks
  warnings:        string[];   // labels of failed warning checks
  expectedSummary: string;
  actualSummary:   string;
  durationMs:      number;
}

export interface AnalyticsEvalSummary {
  total:      number;
  passed:     number;
  warned:     number;
  failed:     number;
  avgScore:   number;
  durationMs: number;
}

export interface AnalyticsEvalReport {
  restaurantId:   string;
  restaurantName: string;
  slug:           string;
  mode:           string;
  includeLiveData: boolean;
  ranAt:          string;
  durationMs:     number;
  summary:        AnalyticsEvalSummary;
  results:        AnalyticsScenarioResult[];
  limitations:    string[];
}

// ─── check helpers ─────────────────────────────────────────────────────────────

function check(label: string, severity: CheckSeverity, pass: boolean, detail: string): AnalyticsCheckResult {
  return { label, severity, pass, detail };
}

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ─── per-group evaluation ───────────────────────────────────────────────────────

function runChecks(scenario: AnalyticsScenario): { checks: AnalyticsCheckResult[]; actual: string } {
  switch (scenario.group) {

    // ── Diagnosis ────────────────────────────────────────────────────────────
    case "diagnosis": {
      const report = AnalyticsDiagnosisService.diagnose(scenario.input);
      const e = scenario.expect;
      const checks: AnalyticsCheckResult[] = [];

      const finding = e.findingId ? report.findings.find((f) => f.id === e.findingId) : undefined;
      if (e.findingId) {
        checks.push(check(`finding ${e.findingId} present`, "critical", !!finding,
          finding ? `finding ${e.findingId} presente` : `finding ${e.findingId} AUSENTE`));
      }
      if (e.findingSeverity && finding) {
        checks.push(check(`finding severity = ${e.findingSeverity}`, "critical", finding.severity === e.findingSeverity,
          `severity=${finding.severity} (esperado ${e.findingSeverity})`));
      }
      if (e.metricDirection && finding) {
        const ok = e.metricDirection === "down" ? finding.deltaPct < 0 : finding.deltaPct > 0;
        checks.push(check(`metric direction ${e.metricDirection}`, "critical", ok,
          `deltaPct=${finding.deltaPct} (esperado ${e.metricDirection})`));
      }
      if (e.likelyCauseMatch && finding) {
        const joined = finding.likelyCauses.join(" ");
        checks.push(check(`likely cause cita "${e.likelyCauseMatch}"`, "warning", includesCI(joined, e.likelyCauseMatch),
          `causas=[${finding.likelyCauses.join(" | ")}]`));
      }
      if (e.relatedProduct && finding) {
        const products = finding.relatedEntities.products ?? [];
        checks.push(check(`relatedEntities cita ${e.relatedProduct}`, "critical", products.includes(e.relatedProduct),
          `products=[${products.join(", ")}]`));
      }

      if (e.anomalyId) {
        const anomaly = report.anomalies.find((a) => a.id === e.anomalyId);
        checks.push(check(`anomaly ${e.anomalyId} present`, "critical", !!anomaly,
          anomaly ? `anomalia ${e.anomalyId} presente` : `anomalia ${e.anomalyId} AUSENTE`));
        if (e.anomalySeverity && anomaly) {
          checks.push(check(`anomaly severity = ${e.anomalySeverity}`, "critical", anomaly.severity === e.anomalySeverity,
            `severity=${anomaly.severity} (esperado ${e.anomalySeverity})`));
        }
      }

      if (e.dataQuality) {
        checks.push(check(`dataQuality = ${e.dataQuality}`, "warning", report.dataQuality === e.dataQuality,
          `dataQuality=${report.dataQuality} (esperado ${e.dataQuality})`));
      }
      if (e.noCriticalFindings) {
        const crit = report.findings.filter((f) => f.severity === "CRITICAL");
        checks.push(check("nenhuma finding CRITICAL em amostra pequena", "critical", crit.length === 0,
          crit.length ? `findings CRITICAL: ${crit.map((f) => f.id).join(", ")}` : "sem findings críticas"));
      }
      if (e.limitationMatch) {
        const joined = report.limitations.join(" ");
        checks.push(check(`limitação cita "${e.limitationMatch}"`, "critical", includesCI(joined, e.limitationMatch),
          report.limitations.length ? `limitações=[${report.limitations.join(" | ")}]` : "sem limitações"));
      }
      if (e.forbiddenFindingIds?.length) {
        const present = report.findings.map((f) => f.id);
        const leaked = e.forbiddenFindingIds.filter((id) => present.includes(id));
        checks.push(check("nenhuma finding de comparação sem baseline", "critical", leaked.length === 0,
          leaked.length ? `findings inventadas: ${leaked.join(", ")}` : "nenhuma comparação inventada"));
      }

      // Safety invariant: every finding must carry evidence AND a recommended action.
      const weakFinding = report.findings.find((f) => f.evidence.length === 0 || f.recommendedAction.trim().length === 0);
      checks.push(check("toda finding tem evidência + ação", "critical", !weakFinding,
        weakFinding ? `finding ${weakFinding.id} sem evidência/ação` : "todas as findings têm base"));

      return {
        checks,
        actual: `findings=[${report.findings.map((f) => f.id).join(", ") || "nenhuma"}], anomalies=[${report.anomalies.map((a) => a.id).join(", ") || "nenhuma"}], dataQuality=${report.dataQuality}, limitations=${report.limitations.length}`,
      };
    }

    // ── Retention ──────────────────────────────────────────────────────────────
    case "retention": {
      const { rows, from, to, now } = scenario.input;
      const report = computeRetentionReport(rows, from, to, now);
      const e = scenario.expect;
      const checks: AnalyticsCheckResult[] = [];

      if (e.hasData !== undefined) {
        checks.push(check(`hasData = ${e.hasData}`, "critical", report.hasData === e.hasData,
          `hasData=${report.hasData} (esperado ${e.hasData})`));
      }
      if (e.avgRetention30dAtLeast !== undefined) {
        checks.push(check(`retenção 30d ≥ ${e.avgRetention30dAtLeast}%`, "critical", report.summary.avgRetention30d >= e.avgRetention30dAtLeast,
          `avgRetention30d=${report.summary.avgRetention30d}%`));
      }
      if (e.avgRetention30dEquals !== undefined) {
        checks.push(check(`retenção 30d = ${e.avgRetention30dEquals}%`, "critical", report.summary.avgRetention30d === e.avgRetention30dEquals,
          `avgRetention30d=${report.summary.avgRetention30d}% (esperado ${e.avgRetention30dEquals}%)`));
      }
      if (e.smallSampleLimitation) {
        const joined = report.limitations.join(" ");
        const ok = includesCI(joined, "menos de") || includesCI(joined, "instáveis") || includesCI(joined, "suprimidos");
        checks.push(check("limitação de amostra pequena", "critical", ok,
          report.limitations.length ? `limitações=[${report.limitations.join(" | ")}]` : "sem limitações"));
      }
      if (e.limitationMatch) {
        const joined = report.limitations.join(" ");
        checks.push(check(`limitação cita "${e.limitationMatch}"`, "critical", includesCI(joined, e.limitationMatch),
          report.limitations.length ? `limitações=[${report.limitations.join(" | ")}]` : "sem limitações"));
      }
      if (e.insightMatch) {
        const joined = report.insights.join(" ");
        checks.push(check(`insight cita "${e.insightMatch}"`, "warning", includesCI(joined, e.insightMatch),
          report.insights.length ? `insights=[${report.insights.join(" | ")}]` : "sem insights"));
      }

      // Safety invariant: retention percentages must stay within 0–100 (no fabricated > 100%).
      const badPct = report.cohorts.find((c) =>
        c.retention30dPct < 0 || c.retention30dPct > 100 ||
        c.retention60dPct < 0 || c.retention60dPct > 100 ||
        c.retention90dPct < 0 || c.retention90dPct > 100);
      checks.push(check("percentuais de retenção em 0–100%", "critical", !badPct,
        badPct ? `cohort ${badPct.cohortMonth} com pct fora de faixa` : "percentuais válidos"));

      return {
        checks,
        actual: `cohorts=${report.cohorts.length}, avg30d=${report.summary.avgRetention30d}%, hasData=${report.hasData}, limitations=${report.limitations.length}`,
      };
    }

    // ── Operations ───────────────────────────────────────────────────────────
    case "operations": {
      const { rows, kpi, from, to } = scenario.input;
      const report = computeEfficiencyReport(rows, kpi, from, to);
      const e = scenario.expect;
      const m = report.metrics;
      const checks: AnalyticsCheckResult[] = [];

      if (e.avgFulfillmentPositive) {
        checks.push(check("tempo médio de atendimento > 0", "critical", m.avgFulfillmentMinutes > 0,
          `avgFulfillmentMinutes=${m.avgFulfillmentMinutes}`));
      }
      if (e.avgFulfillmentEquals !== undefined) {
        checks.push(check(`tempo médio = ${e.avgFulfillmentEquals}`, "critical", m.avgFulfillmentMinutes === e.avgFulfillmentEquals,
          `avgFulfillmentMinutes=${m.avgFulfillmentMinutes} (esperado ${e.avgFulfillmentEquals})`));
      }
      if (e.missingTimingLimitation) {
        const joined = report.limitations.join(" ");
        const ok = includesCI(joined, "timestamps completos") || includesCI(joined, "delivered");
        checks.push(check("limitação de timestamps ausentes", "critical", ok,
          report.limitations.length ? `limitações=[${report.limitations.join(" | ")}]` : "sem limitações"));
        // No fabricated timing bottleneck when there is no timing data.
        const fakeBottleneck = report.bottlenecks.find((b) => b.stage === "FULFILLMENT");
        checks.push(check("sem gargalo de tempo sem dados de tempo", "critical", m.ordersWithTiming > 0 || !fakeBottleneck,
          fakeBottleneck ? "gargalo de FULFILLMENT inventado sem timing" : "sem gargalo inventado"));
      }
      if (e.perStageLimitation) {
        const joined = report.limitations.join(" ");
        const ok = includesCI(joined, "estágio individual") || includesCI(joined, "timestamps de estágio");
        checks.push(check("limitação de timestamps por etapa sempre presente", "critical", ok,
          report.limitations.length ? `limitações=[${report.limitations.join(" | ")}]` : "sem limitações"));
      }
      if (e.bottleneckStage) {
        const present = report.bottlenecks.some((b) => b.stage === e.bottleneckStage);
        checks.push(check(`gargalo ${e.bottleneckStage} presente`, "critical", present,
          `gargalos=[${report.bottlenecks.map((b) => b.stage).join(", ") || "nenhum"}]`));
      }
      if (e.cancelledOrdersEquals !== undefined) {
        checks.push(check(`cancelados = ${e.cancelledOrdersEquals}`, "critical", m.cancelledOrders === e.cancelledOrdersEquals,
          `cancelledOrders=${m.cancelledOrders} (esperado ${e.cancelledOrdersEquals})`));
      }
      if (e.awaitingPaymentEquals !== undefined) {
        checks.push(check(`pagamentos pendentes = ${e.awaitingPaymentEquals}`, "critical", m.awaitingPaymentCount === e.awaitingPaymentEquals,
          `awaitingPaymentCount=${m.awaitingPaymentCount} (esperado ${e.awaitingPaymentEquals})`));
      }

      return {
        checks,
        actual: `ordersWithTiming=${m.ordersWithTiming}, avg=${m.avgFulfillmentMinutes}min, bottlenecks=[${report.bottlenecks.map((b) => b.stage).join(", ") || "nenhum"}], limitations=${report.limitations.length}`,
      };
    }

    // ── Conversational Analyst ───────────────────────────────────────────────
    case "analyst": {
      const { question, agentData } = scenario.input;
      const e = scenario.expect;
      const intent = routeIntent(question);
      const data: AgentServiceData = agentData ?? { intent, periodLabel: "Nos últimos 30 dias", question };
      const answer = buildGroundedAnswer(data);
      const checks: AnalyticsCheckResult[] = [];

      if (e.intent) {
        checks.push(check(`intent = ${e.intent}`, "critical", intent === e.intent,
          `intent=${intent} (esperado ${e.intent})`));
      }
      if (e.intentOneOf?.length) {
        checks.push(check(`intent ∈ {${e.intentOneOf.join(", ")}}`, "critical", e.intentOneOf.includes(intent),
          `intent=${intent}`));
      }
      if (e.limitationMatch) {
        const joined = answer.limitations.join(" ");
        checks.push(check(`limitação cita "${e.limitationMatch}"`, "critical", includesCI(joined, e.limitationMatch),
          answer.limitations.length ? `limitações=[${answer.limitations.join(" | ")}]` : "sem limitações"));
      }
      if (e.hasLimitations) {
        checks.push(check("resposta declara limitações", "critical", answer.limitations.length > 0,
          `limitations=${answer.limitations.length}`));
      }
      if (e.noMetrics) {
        checks.push(check("nenhuma métrica inventada sem dados", "critical", answer.metrics.length === 0 && answer.dataSourcesUsed.length === 0,
          `metrics=${answer.metrics.length}, dataSources=${answer.dataSourcesUsed.length}`));
      }
      if (e.hasFollowUps) {
        checks.push(check("sugere perguntas de follow-up", "warning", answer.followUpQuestions.length > 0,
          `followUps=${answer.followUpQuestions.length}`));
      }
      if (e.confidenceNotHigh) {
        checks.push(check("confiança não é HIGH com evidência fraca", "critical", answer.confidence !== "HIGH",
          `confidence=${answer.confidence}`));
      }

      // Safety invariant: any metric reported must be backed by a declared data source.
      const fabricated = answer.metrics.length > 0 && answer.dataSourcesUsed.length === 0;
      checks.push(check("métricas sempre vêm de uma fonte de dados", "critical", !fabricated,
        fabricated ? "métricas presentes sem dataSourcesUsed" : "métricas com fonte (ou ausentes)"));

      return {
        checks,
        actual: `intent=${intent}, confidence=${answer.confidence}, metrics=${answer.metrics.length}, limitations=${answer.limitations.length}, followUps=${answer.followUpQuestions.length}`,
      };
    }

    // ── Dashboard Cockpit ────────────────────────────────────────────────────
    case "cockpit": {
      const d = scenario.input;
      const alerts  = buildAlerts(d);
      const actions = buildActions(d);
      const health  = buildHealth(d);
      const e = scenario.expect;
      const checks: AnalyticsCheckResult[] = [];

      if (e.alertId) {
        const alert = alerts.find((a) => a.id === e.alertId);
        checks.push(check(`alerta ${e.alertId} presente`, "critical", !!alert,
          alert ? `alerta ${e.alertId} presente` : `alerta ${e.alertId} AUSENTE`));
        if (e.alertSeverity && alert) {
          checks.push(check(`alerta severity = ${e.alertSeverity}`, "critical", alert.severity === e.alertSeverity,
            `severity=${alert.severity} (esperado ${e.alertSeverity})`));
        }
      }
      if (e.actionSource) {
        const action = actions.find((a) => a.source === e.actionSource);
        checks.push(check(`ação ${e.actionSource} presente`, "critical", !!action,
          `ações=[${actions.map((a) => a.source).join(", ") || "nenhuma"}]`));
      }
      if (e.healthKey && e.healthStatus) {
        const ind = health[e.healthKey];
        checks.push(check(`saúde ${e.healthKey} = ${e.healthStatus}`, "critical", ind.status === e.healthStatus,
          `status=${ind.status} (esperado ${e.healthStatus})`));
      }
      if (e.noAlerts) {
        checks.push(check("sem alerta inventado quando faltam dados", "critical", alerts.length === 0,
          alerts.length ? `alertas inesperados: ${alerts.map((a) => a.id).join(", ")}` : "sem alertas"));
        // No fabricated sales ratio when there is no 7-day baseline.
        const fakeRevenueAlert = alerts.find((a) => a.id === "revenue-below-baseline");
        checks.push(check("sem alerta de receita sem baseline", "critical", !fakeRevenueAlert,
          fakeRevenueAlert ? "alerta de receita inventado sem baseline" : "sem receita inventada"));
      }

      // Safety invariant: recommended actions are ordered by ascending priority and carry a target.
      const badAction = actions.find((a) => !a.actionHref || !a.actionLabel);
      checks.push(check("toda ação tem alvo e rótulo", "warning", !badAction,
        badAction ? `ação ${badAction.id} sem href/label` : "ações completas"));

      return {
        checks,
        actual: `alerts=[${alerts.map((a) => a.id).join(", ") || "nenhum"}], actions=[${actions.map((a) => a.source).join(", ") || "nenhuma"}], saúde.sales=${health.sales.status}, saúde.operations=${health.operations.status}`,
      };
    }
  }
}

function expectedSummaryOf(scenario: AnalyticsScenario): string {
  switch (scenario.group) {
    case "diagnosis":  { const e = scenario.expect; return [e.findingId && `finding=${e.findingId}`, e.findingSeverity && `sev=${e.findingSeverity}`, e.anomalyId && `anomaly=${e.anomalyId}`, e.dataQuality && `dq=${e.dataQuality}`, e.noCriticalFindings && "sem CRITICAL", e.limitationMatch && `limit~"${e.limitationMatch}"`, e.forbiddenFindingIds?.length && "sem comparação inventada"].filter(Boolean).join(", "); }
    case "retention":  { const e = scenario.expect; return [e.hasData !== undefined && `hasData=${e.hasData}`, e.avgRetention30dAtLeast !== undefined && `30d≥${e.avgRetention30dAtLeast}%`, e.avgRetention30dEquals !== undefined && `30d=${e.avgRetention30dEquals}%`, e.smallSampleLimitation && "limitação amostra pequena", e.insightMatch && `insight~"${e.insightMatch}"`].filter(Boolean).join(", "); }
    case "operations": { const e = scenario.expect; return [e.avgFulfillmentPositive && "tempo médio>0", e.avgFulfillmentEquals !== undefined && `tempo=${e.avgFulfillmentEquals}`, e.missingTimingLimitation && "limitação timestamps", e.perStageLimitation && "limitação por etapa", e.bottleneckStage && `gargalo=${e.bottleneckStage}`, e.cancelledOrdersEquals !== undefined && `cancelados=${e.cancelledOrdersEquals}`, e.awaitingPaymentEquals !== undefined && `pendentes=${e.awaitingPaymentEquals}`].filter(Boolean).join(", "); }
    case "analyst":    { const e = scenario.expect; return [e.intent && `intent=${e.intent}`, e.intentOneOf?.length && `intent∈{${e.intentOneOf.join("|")}}`, e.limitationMatch && `limit~"${e.limitationMatch}"`, e.noMetrics && "sem métricas", e.hasFollowUps && "com follow-ups"].filter(Boolean).join(", "); }
    case "cockpit":    { const e = scenario.expect; return [e.alertId && `alerta=${e.alertId}`, e.alertSeverity && `sev=${e.alertSeverity}`, e.actionSource && `ação=${e.actionSource}`, e.healthKey && e.healthStatus && `saúde.${e.healthKey}=${e.healthStatus}`, e.noAlerts && "sem alertas"].filter(Boolean).join(", "); }
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

export function evaluateScenario(scenario: AnalyticsScenario): AnalyticsScenarioResult {
  const startedAt = Date.now();
  let checks: AnalyticsCheckResult[];
  let actual: string;
  try {
    const out = runChecks(scenario);
    checks = out.checks;
    actual = out.actual;
  } catch (err) {
    checks = [check("cenário executa sem lançar exceção", "critical", false, `erro: ${(err as Error).message}`)];
    actual = `EXCEPTION: ${(err as Error).message}`;
  }

  const failedChecks = checks.filter((c) => !c.pass && c.severity === "critical").map((c) => c.label);
  const warnings     = checks.filter((c) => !c.pass && c.severity === "warning").map((c) => c.label);

  const verdict: Verdict = failedChecks.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";
  const score = verdict === "FAIL" ? 40 : verdict === "WARN" ? 70 : 100;

  return {
    id:              scenario.id,
    group:           scenario.group,
    groupLabel:      scenario.groupLabel,
    name:            scenario.title,
    description:     scenario.description,
    severity:        scenario.severity,
    verdict,
    score,
    checks,
    failedChecks,
    warnings,
    expectedSummary: expectedSummaryOf(scenario),
    actualSummary:   actual,
    durationMs:      Date.now() - startedAt,
  };
}

export interface EvalMeta {
  restaurantId:    string;
  restaurantName:  string;
  slug:            string;
  mode:            string;
  includeLiveData: boolean;
}

/** Suite-level limitations — always declared so the report never overclaims. */
const SUITE_LIMITATIONS: string[] = [
  "Suíte determinística baseada em fixtures: valida a lógica do motor de Analytics, não os números reais de um restaurante específico.",
  "Não há dados de CMV/margem no sistema — a suíte verifica que o agente declara essa limitação, não calcula lucro.",
  "Não existem timestamps por etapa de cozinha — a suíte verifica que a operação mede apenas tempo total (criado → concluído).",
  "Integração iFood não está ativa — o campo de preço existe, mas a suíte não valida dados de iFood.",
];

export function evaluateAll(
  scenarios: AnalyticsScenario[],
  meta: EvalMeta,
  startedAt: Date = new Date(),
): AnalyticsEvalReport {
  const results  = scenarios.map(evaluateScenario);
  const total    = results.length;
  const passed   = results.filter((r) => r.verdict === "PASS").length;
  const warned   = results.filter((r) => r.verdict === "WARN").length;
  const failed   = results.filter((r) => r.verdict === "FAIL").length;
  const avgScore = total === 0 ? 100 : Math.round(results.reduce((s, r) => s + r.score, 0) / total);
  const durationMs = Date.now() - startedAt.getTime();

  return {
    restaurantId:    meta.restaurantId,
    restaurantName:  meta.restaurantName,
    slug:            meta.slug,
    mode:            meta.mode,
    includeLiveData: meta.includeLiveData,
    ranAt:           startedAt.toISOString(),
    durationMs,
    summary: { total, passed, warned, failed, avgScore, durationMs },
    results,
    limitations: SUITE_LIMITATIONS,
  };
}

/** Convenience: evaluate the full library (used by tests). */
export function evaluateLibrary(meta: EvalMeta): AnalyticsEvalReport {
  return evaluateAll(ANALYTICS_SCENARIOS, meta);
}
