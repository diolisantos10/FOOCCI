/**
 * CrmAuditor — CRM (CONNECTED, v1.2).
 *
 * Runs the REAL deterministic CRM Test Center evaluator (`evaluateAll` +
 * `CRM_SCENARIOS`) in hard dry-run. 100% read-only: the evaluator only calls
 * PURE CRM functions (contact-safety, segmentation, intelligence, action-center,
 * message-variation preview, attribution, review-eligibility) — "No DB. No LLM.
 * No network. No sends. No campaign records." (see crmEvaluator header). A
 * synthetic fixture set is used: it never touches a real restaurant, customer,
 * coupon, campaign or external provider.
 *
 * Findings:
 *  - any scenario FAIL (failed CRITICAL check — e.g. send-safety) ⇒ FAIL / P0;
 *  - scenarios WARN (config gaps: empty audience, missing window, incomplete
 *    template) ⇒ WARNING / P1;
 *  - all green ⇒ PASS / INFO.
 *  - a dedicated send-safety finding guarantees the run was dry-run/no-send;
 *    live mode or a contact-safety failure ⇒ FAIL / P0.
 */

import type { Auditor, AuditContext, AuditFinding, FindingSeverity, FindingStatus } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { makeFinding } from "./_shared";
import { CRM_SCENARIOS } from "@/services/crm/testing/crmScenarios";
import { evaluateAll, type CrmEvalReport, type CrmScenarioResult, type EvalMeta } from "@/services/crm/testing/crmEvaluator";

/** Hard dry-run meta: never live LLM, never a real send/restaurant. */
const DRY_RUN_META: EvalMeta = {
  restaurantId: "qc-crm-synthetic",
  restaurantName: "QC Synthetic CRM",
  slug: "qc-crm",
  mode: "audit",
  useLiveLLM: false,
};

export interface CrmRunClassification {
  status: FindingStatus;
  severity: FindingSeverity;
  failed: CrmScenarioResult[];
  warned: CrmScenarioResult[];
}

/**
 * Pure classifier for the CRM Test Center result:
 *  - any FAIL verdict (failed critical check) ⇒ FAIL / P0;
 *  - else any WARN verdict ⇒ WARNING / P1;
 *  - else PASS / INFO.
 */
export function classifyCrmRun(results: readonly CrmScenarioResult[]): CrmRunClassification {
  const failed = results.filter((r) => r.verdict === "FAIL").slice().sort((a, b) => a.id.localeCompare(b.id));
  const warned = results.filter((r) => r.verdict === "WARN").slice().sort((a, b) => a.id.localeCompare(b.id));
  if (failed.length > 0) return { status: "FAIL", severity: "P0", failed, warned };
  if (warned.length > 0) return { status: "WARNING", severity: "P1", failed, warned };
  return { status: "PASS", severity: "INFO", failed, warned };
}

/**
 * Pure send-safety / dry-run guarantee. A live run (useLiveLLM) or a failing
 * contact-safety scenario means a real-send risk ⇒ FAIL / P0; otherwise the run
 * is provably dry-run / no-send ⇒ PASS / INFO.
 */
export function evaluateSendSafety(report: CrmEvalReport): { status: FindingStatus; severity: FindingSeverity; reason: string } {
  if (report.useLiveLLM) {
    return { status: "FAIL", severity: "P0", reason: "Auditoria rodou em modo LIVE (useLiveLLM=true) — risco de envio real." };
  }
  const safetyFail = report.results.find((r) => r.group === "contact_safety" && r.verdict === "FAIL");
  if (safetyFail) {
    return { status: "FAIL", severity: "P0", reason: `Falha de Contact Safety em "${safetyFail.id}" — risco de disparo indevido.` };
  }
  return { status: "PASS", severity: "INFO", reason: "Dry-run garantido (useLiveLLM=false) — nenhum envio, campanha ou mutação." };
}

export const CrmAuditor: Auditor = {
  ...AUDITOR_META.crm,
  readOnly: true,
  canRunDaily: true,
  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    assertSafeMode(ctx.safeMode);

    const report = evaluateAll(CRM_SCENARIOS, DRY_RUN_META, ctx.now);
    const { status, severity, failed, warned } = classifyCrmRun(report.results);
    const { total, passed, warned: warnedCount } = report.summary;

    const findings: AuditFinding[] = [];

    // ── 1) CRM Test Center result ──────────────────────────────────────────
    if (status === "FAIL") {
      findings.push(
        makeFinding(ctx, "crm", {
          status,
          severity,
          title: "CRM Test Center — falha crítica detectada",
          summary: `${failed.length} cenário(s) falharam em checks críticos (segurança de disparo / configuração essencial).`,
          evidence: failed.map((r) => `${r.id} [${r.groupLabel}]: ${r.failedChecks.join(", ")}`),
          affectedArea: "CRM",
          recommendation: "Investigar imediatamente — risco de envio indevido ou regra crítica quebrada.",
        }),
      );
    } else if (status === "WARNING") {
      findings.push(
        makeFinding(ctx, "crm", {
          status,
          severity,
          title: "CRM Test Center — gaps de configuração",
          summary: `${passed}/${total} cenários OK. ${warnedCount} com gaps (ex.: público vazio, janela ausente, template incompleto) — sem risco de envio.`,
          evidence: warned.map((r) => `${r.id} [${r.groupLabel}]: ${r.warnings.join(", ")}`),
          affectedArea: "CRM",
          recommendation: "Revisar configuração/segmentos; nenhum é risco de disparo real.",
        }),
      );
    } else {
      findings.push(
        makeFinding(ctx, "crm", {
          status,
          severity,
          title: "CRM Test Center — todos os cenários OK",
          summary: `${passed}/${total} cenários passaram (segmentação, campanhas, templates, atribuição, review).`,
          evidence: [`${total} cenários determinísticos avaliados em dry-run`],
          affectedArea: "CRM",
          recommendation: "Manter cobertura; validar com dados reais quando o CRM for ao ar.",
        }),
      );
    }

    // ── 2) Send-safety / dry-run guarantee ─────────────────────────────────
    const safety = evaluateSendSafety(report);
    findings.push(
      makeFinding(ctx, "crm", {
        status: safety.status,
        severity: safety.severity,
        title: "CRM — garantia de dry-run / no-send",
        summary: safety.reason,
        evidence: [
          "safeMode=true · dryRun=true · allowSideEffects=false",
          `useLiveLLM=${report.useLiveLLM}`,
          "Evaluator puro — sem DB, sem rede, sem envio (crmEvaluator).",
        ],
        affectedArea: "CRM",
        recommendation:
          safety.status === "FAIL"
            ? "Bloquear auditoria em modo live; auditar sempre em dry-run."
            : "Manter auditoria sempre em dry-run (sem provedor externo).",
      }),
    );

    return findings;
  },
};
