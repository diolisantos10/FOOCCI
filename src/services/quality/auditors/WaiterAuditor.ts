/**
 * WaiterAuditor — IA / Vendas (CONNECTED, v1.1).
 *
 * Runs the REAL deterministic Waiter Test Center evaluator (`evaluateAll` +
 * `WAITER_TEST_CASES`) against a synthetic, in-memory catalog. 100% read-only:
 * the evaluator only calls the pure `decide()` — no OpenAI, no DB writes, no
 * order/checkout/Pix/WhatsApp. A synthetic catalog is used (instead of the admin
 * route) so the auditor never touches a real restaurant or the database.
 *
 * Findings are classified conservatively:
 *  - a failing CRITICAL check (hallucination / non-catalog item / forbidden
 *    denial) ⇒ FAIL / P0 (real bug);
 *  - failing non-critical checks ⇒ WARNING / P2 (gap / drift);
 *  - all green ⇒ PASS / INFO.
 *  - the 26 legacy unit-suite failures are surfaced as WARNING / INFO (drift /
 *    manual-review), never auto-promoted to P0.
 */

import type { Auditor, AuditContext, AuditFinding, FindingSeverity, FindingStatus } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { makeFinding } from "./_shared";
import { WAITER_TEST_CASES } from "@/services/ai/waiter/testing/waiterScenarios";
import { evaluateAll, type ScenarioResult } from "@/services/ai/waiter/testing/waiterEvaluator";
import type { V2CatalogItem } from "@/services/ai/WaiterBrainV2";
import {
  auditCountByClassification,
  hasRealBugs,
  WAITER_LEGACY_TEST_AUDIT,
} from "@/services/agents/waiterLegacyTestAudit";

/** Checks that, when failing, indicate a genuine critical bug (FAIL / P0). */
const CRITICAL_CHECKS = new Set(["no_hallucination", "has_real_cards", "no_forbidden_denial"]);

/**
 * Deterministic synthetic catalog covering the audited dimensions: mains,
 * shareable combos (group/family), porções, sobremesas, drinks (for refusal),
 * light & budget & vegetarian options. Built fresh per run for safety.
 */
function syntheticCatalog(): V2CatalogItem[] {
  return [
    { id: "uramaki",   name: "Uramaki Salmão",        categoryName: "Uramakis",   price: 28, sortOrder: 1 },
    { id: "hotfila",   name: "Hot Roll Filadélfia",   categoryName: "Hot Rolls",  price: 30, sortOrder: 2 },
    { id: "temaki",    name: "Temaki Salmão",         categoryName: "Temakis",    price: 24, sortOrder: 3 },
    { id: "yakisoba",  name: "Yakisoba de Frango",    categoryName: "Quentes",    price: 33, sortOrder: 4 },
    { id: "combo40",   name: "Combinado 40 peças",    categoryName: "Combos",     price: 120, sortOrder: 5, servingSize: 4 },
    { id: "festival",  name: "Festival Família",      categoryName: "Combos",     price: 180, sortOrder: 6, servingSize: 6 },
    { id: "porc-gyoza",   name: "Porção de Gyoza",    categoryName: "Porções",    price: 22, sortOrder: 7, description: "pastel japonês de legumes" },
    { id: "porc-haru",    name: "Porção de Harumaki", categoryName: "Porções",    price: 20, sortOrder: 8, description: "rolinho de legumes" },
    { id: "porc-eda",     name: "Porção de Edamame",  categoryName: "Porções",    price: 18, sortOrder: 9, description: "vagem de soja" },
    { id: "brownie",   name: "Brownie",               categoryName: "Sobremesas", price: 16, sortOrder: 10 },
    { id: "mochi",     name: "Mochi",                 categoryName: "Sobremesas", price: 14, sortOrder: 11 },
    { id: "coca",      name: "Coca-Cola",             categoryName: "Bebidas",    price: 8,  sortOrder: 12 },
    { id: "suco",      name: "Suco de Laranja",       categoryName: "Bebidas",    price: 10, sortOrder: 13 },
    { id: "sunomono",  name: "Sunomono",              categoryName: "Saladas",    price: 16, sortOrder: 14, description: "salada de pepino" },
    { id: "pepino",    name: "Uramaki Pepino",        categoryName: "Uramakis",   price: 19, sortOrder: 15, description: "pepino e arroz" },
  ];
}

/** Stable list of failing check types for a scenario (deterministic evidence). */
function failingCheckTypes(r: ScenarioResult): string[] {
  return r.checks.filter((c) => !c.pass).map((c) => c.type).sort();
}

export interface WaiterRunClassification {
  status: FindingStatus;
  severity: FindingSeverity;
  /** Failing scenarios where a CRITICAL check failed (real bug). */
  critical: ScenarioResult[];
  /** Failing scenarios with only non-critical gaps (drift). */
  nonCritical: ScenarioResult[];
}

/**
 * Pure classifier for the Test Center result:
 *  - any critical-check failure ⇒ FAIL / P0;
 *  - else any non-critical failure ⇒ WARNING / P2;
 *  - else PASS / INFO.
 */
export function classifyWaiterRun(results: readonly ScenarioResult[]): WaiterRunClassification {
  const failed = results.filter((r) => !r.pass);
  const critical = failed
    .filter((r) => r.checks.some((c) => !c.pass && CRITICAL_CHECKS.has(c.type)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const nonCritical = failed
    .filter((r) => !critical.includes(r))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (critical.length > 0) return { status: "FAIL", severity: "P0", critical, nonCritical };
  if (nonCritical.length > 0) return { status: "WARNING", severity: "P2", critical, nonCritical };
  return { status: "PASS", severity: "INFO", critical, nonCritical };
}

export const WaiterAuditor: Auditor = {
  ...AUDITOR_META.waiter,
  readOnly: true,
  canRunDaily: true,
  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    assertSafeMode(ctx.safeMode);

    const report = evaluateAll(
      WAITER_TEST_CASES,
      syntheticCatalog(),
      "qc-waiter-synthetic",
      "QC Synthetic Catalog",
      ctx.now,
    );

    const { critical, nonCritical } = classifyWaiterRun(report.results);
    const total = report.summary.total;
    const passed = report.summary.passed;

    const findings: AuditFinding[] = [];

    // ── 1) Test Center result ──────────────────────────────────────────────
    if (critical.length > 0) {
      findings.push(
        makeFinding(ctx, "waiter", {
          status: "FAIL",
          severity: "P0",
          title: "Waiter Test Center — bug crítico detectado",
          summary: `${critical.length} cenário(s) falharam em checks críticos (alucinação / item fora do catálogo / negação proibida).`,
          evidence: critical.map((r) => `${r.id}: ${failingCheckTypes(r).filter((t) => CRITICAL_CHECKS.has(t)).join(", ")}`),
          affectedArea: "IA / Vendas",
          recommendation: "Investigar imediatamente — possível regressão de alucinação ou negação indevida no WaiterBrainV2.",
        }),
      );
    } else if (nonCritical.length > 0) {
      findings.push(
        makeFinding(ctx, "waiter", {
          status: "WARNING",
          severity: "P2",
          title: "Waiter Test Center — gaps não-críticos",
          summary: `${passed}/${total} cenários OK. ${nonCritical.length} com gaps não-críticos (ex.: shareable/categoria/CTA) — sem alucinação nem negação proibida.`,
          evidence: nonCritical.map((r) => `${r.id}: ${failingCheckTypes(r).join(", ")}`),
          affectedArea: "IA / Vendas",
          recommendation: "Revisar gaps de catálogo/cobertura; nenhum é bug crítico.",
        }),
      );
    } else {
      findings.push(
        makeFinding(ctx, "waiter", {
          status: "PASS",
          severity: "INFO",
          title: "Waiter Test Center — todos os cenários OK",
          summary: `${passed}/${total} cenários passaram (sem alucinação, cards reais, sem negação proibida).`,
          evidence: [`${total} cenários determinísticos avaliados contra catálogo sintético`],
          affectedArea: "IA / Vendas",
          recommendation: "Manter cobertura; validar com catálogo real quando o restaurante reabrir.",
        }),
      );
    }

    // ── 2) Legacy unit suites — drift, never auto-P0 ───────────────────────
    const byClass = auditCountByClassification();
    findings.push(
      makeFinding(ctx, "waiter", {
        status: "WARNING",
        severity: "INFO",
        title: "Suítes legadas (sales-core/specialist) — drift auditado",
        summary:
          `${WAITER_LEGACY_TEST_AUDIT.length} falhas legadas já classificadas (` +
          `${byClass.EXPECTATION_DRIFT} drift · ${byClass.OBSOLETE_TEST} obsoletas · ` +
          `${byClass.NEEDS_MANUAL_REVIEW} revisão manual · ${byClass.REAL_BUG} bug real).`,
        evidence: [
          `hasRealBugs=${hasRealBugs()}`,
          "Classificadas em waiterLegacyTestAudit.ts — não bloqueiam o release.",
        ],
        affectedArea: "IA / Vendas",
        recommendation: "Aposentar/atualizar testes obsoletos; validar itens de revisão manual ao vivo.",
      }),
    );

    return findings;
  },
};
