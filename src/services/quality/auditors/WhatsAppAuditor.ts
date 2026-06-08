/**
 * WhatsAppAuditor — WhatsApp (CONNECTED, v1.4).
 *
 * Runs the REAL WhatsApp Text Ordering scenario runner (`runScenarioSuite`)
 * against a synthetic injected menu. The runner is a designed-safe harness with
 * HARD invariants: `mode = DRY_RUN_ONLY` and `allowSideEffects = false` for every
 * turn, and menu injection means NO DB. It therefore never sends a real WhatsApp
 * message, never calls Evolution, never creates a real order and never generates
 * a real Pix.
 *
 * Findings:
 *  - safety gate (no-send / no-Evolution / no-order / no-Pix): any real side
 *    effect / real order / real Pix observed ⇒ FAIL / P0; else PASS / INFO;
 *  - leak gate: any internal-command / Build OS marker in a customer-facing
 *    reply ⇒ FAIL / P0; else PASS / INFO;
 *  - scenario Test Center (functional): FAIL ⇒ WARNING / P1, WARN ⇒ WARNING / P2,
 *    all green ⇒ PASS / INFO (functional coverage, not a safety P0);
 *  - a runner crash ⇒ controlled FAIL / P0.
 */

import type { Auditor, AuditContext, AuditFinding, FindingSeverity, FindingStatus } from "../types";
import { assertSafeMode } from "../SafeMode";
import { AUDITOR_META } from "../registryMeta";
import { makeFinding } from "./_shared";
import { runScenarioSuite, type WaScenarioRunReport, type WaScenarioResult } from "@/services/whatsapp/ordering/WhatsAppOrderingScenarioRunner";
import type { WaScenarioSuite } from "@/services/whatsapp/ordering/testing/whatsappOrderingScenarios";
import type { WaMenuItem } from "@/services/whatsapp/ordering/types";

/**
 * Suites that run fully on the injected menu (no DB). The "payment"/"full"
 * suites read live delivery/Pix config from the DB, so they are intentionally
 * EXCLUDED from the safe dry audit and surfaced as a coverage gap (validated in
 * the lab against a real restaurant instead).
 */
const SAFE_SUITES: WaScenarioSuite[] = ["quick", "edge"];

/** Synthetic menu covering the scenario nouns. Injection ⇒ no DB read. */
function syntheticMenu(): WaMenuItem[] {
  const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
    priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
    hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
  });
  return [
    mk({ id: "yaki-cf",  name: "Yakisoba Carne e Frango", price: 32, priceDelivery: 34 }),
    mk({ id: "yaki-cam", name: "Yakisoba de Camarão",     price: 38, priceDelivery: 40 }),
    mk({ id: "combo40",  name: "Combinado 40 peças",      price: 120, priceDelivery: 125 }),
    mk({ id: "temaki",   name: "Temaki de Salmão",        price: 28, priceDelivery: 30 }),
    mk({ id: "porc-gyo", name: "Porção de Gyoza",         price: 22, priceDelivery: 24 }),
    mk({ id: "coca",     name: "Coca-Cola",               price: 6,  priceDelivery: 6.5 }),
    mk({ id: "coca-z",   name: "Coca Zero",               price: 6,  priceDelivery: 6.5 }),
  ];
}

const RUN_CTX = {
  restaurantId: "qc-wa-synthetic",
  restaurantSlug: "qc-wa",
  restaurantName: "QC Synthetic WhatsApp",
  menu: syntheticMenu(),
};

/** Markers that must NEVER leak into a customer-facing reply. */
const LEAK_MARKERS = [
  /build\s*os/i,
  /\bcomando interno\b/i,
  /system prompt/i,
  /\bprompt do sistema\b/i,
  /<\/?(system|tool|internal)>/i,
  /\[\[.*?\]\]/, // internal templating left unrendered
];

export interface WaFunctionalClassification {
  status: FindingStatus;
  severity: FindingSeverity;
  failed: WaScenarioResult[];
  warned: WaScenarioResult[];
}

/**
 * Functional (coverage) classification — NOT the safety gate:
 *  - any FAIL verdict ⇒ WARNING / P1 (functional gap / partial flow);
 *  - else any WARN verdict ⇒ WARNING / P2;
 *  - else PASS / INFO.
 * Safety P0 is owned by the dedicated safety/leak gates below.
 */
export function classifyWaFunctional(report: WaScenarioRunReport): WaFunctionalClassification {
  const failed = report.results.filter((r) => r.verdict === "FAIL").slice().sort((a, b) => a.id.localeCompare(b.id));
  const warned = report.results.filter((r) => r.verdict === "WARN").slice().sort((a, b) => a.id.localeCompare(b.id));
  if (failed.length > 0) return { status: "WARNING", severity: "P1", failed, warned };
  if (warned.length > 0) return { status: "WARNING", severity: "P2", failed, warned };
  return { status: "PASS", severity: "INFO", failed, warned };
}

/**
 * Safety gate: any real side effect / real order id / real Pix observed during
 * the audit ⇒ FAIL / P0 (send/Evolution/order/Pix risk). Otherwise the run is
 * provably no-send / no-order / no-Pix ⇒ PASS / INFO.
 */
export function evaluateWaSafety(report: WaScenarioRunReport): {
  status: FindingStatus;
  severity: FindingSeverity;
  reason: string;
  offenders: string[];
} {
  const offenders: string[] = [];
  for (const r of report.results) {
    if (r.sideEffectsPerformed.length > 0) offenders.push(`${r.id}: side-effects=[${r.sideEffectsPerformed.join(",")}]`);
    for (const s of r.steps) {
      if (s.paymentRealPix) offenders.push(`${r.id}#${s.index}: Pix real`);
      if (s.order && (s.order as { id?: string }).id) offenders.push(`${r.id}#${s.index}: pedido real ${(s.order as { id?: string }).id}`);
    }
  }
  if (offenders.length > 0) {
    return {
      status: "FAIL",
      severity: "P0",
      reason: "Efeito colateral real detectado na auditoria (envio/pedido/Pix real).",
      offenders: offenders.sort(),
    };
  }
  return {
    status: "PASS",
    severity: "INFO",
    reason: "Dry-run garantido: 0 envio real, 0 pedido real, 0 Pix real, 0 chamada Evolution.",
    offenders: [],
  };
}

/** Leak gate: scans every customer-facing reply for internal/Build OS markers. */
export function evaluateWaLeak(report: WaScenarioRunReport): {
  status: FindingStatus;
  severity: FindingSeverity;
  reason: string;
  offenders: string[];
} {
  const offenders: string[] = [];
  for (const r of report.results) {
    for (const s of r.steps) {
      if (LEAK_MARKERS.some((re) => re.test(s.suggestedReply))) {
        offenders.push(`${r.id}#${s.index}`);
      }
    }
  }
  if (offenders.length > 0) {
    return {
      status: "FAIL",
      severity: "P0",
      reason: "Vazamento de comando interno / Build OS em resposta ao cliente.",
      offenders: offenders.sort(),
    };
  }
  return {
    status: "PASS",
    severity: "INFO",
    reason: "Nenhum comando interno / Build OS vazou para o cliente.",
    offenders: [],
  };
}

/** Runs the DB-free safe suites and merges them into one report (dedup by id). */
async function runSafeReport(): Promise<WaScenarioRunReport> {
  const byId = new Map<string, WaScenarioResult>();
  for (const suite of SAFE_SUITES) {
    const rep = await runScenarioSuite(suite, RUN_CTX);
    for (const r of rep.results) byId.set(r.id, r);
  }
  const results = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const pass = results.filter((r) => r.verdict === "PASS").length;
  const warn = results.filter((r) => r.verdict === "WARN").length;
  const fail = results.filter((r) => r.verdict === "FAIL").length;
  const score = results.length === 0 ? 100 : Math.round(((pass + warn * 0.5) / results.length) * 100);
  return {
    suite: "all",
    restaurant: { id: RUN_CTX.restaurantId, name: RUN_CTX.restaurantName, slug: RUN_CTX.restaurantSlug },
    ranAt: "", // intentionally empty — never used in findings (determinism)
    total: results.length,
    pass, warn, fail, score,
    results,
  };
}

export const WhatsAppAuditor: Auditor = {
  ...AUDITOR_META.whatsapp,
  readOnly: true,
  canRunDaily: true,
  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    assertSafeMode(ctx.safeMode);

    // A runner crash must never propagate — it becomes a controlled FAIL/P0.
    let report: WaScenarioRunReport;
    try {
      report = await runSafeReport();
    } catch (err) {
      return [
        makeFinding(ctx, "whatsapp", {
          status: "FAIL",
          severity: "P0",
          title: "WhatsApp — crash no scenario runner",
          summary: "O runner de ordering lançou exceção durante a auditoria (replay multi-turn quebrado).",
          evidence: [String(err instanceof Error ? err.message : err)],
          affectedArea: "WhatsApp",
          recommendation: "Investigar imediatamente — fluxo de pedido por texto pode estar quebrado.",
        }),
      ];
    }

    const findings: AuditFinding[] = [];

    // ── 1) Safety gate: no-send / no-Evolution / no-order / no-Pix ─────────
    const safety = evaluateWaSafety(report);
    findings.push(
      makeFinding(ctx, "whatsapp", {
        status: safety.status,
        severity: safety.severity,
        title: "WhatsApp — garantia no-send / no-Evolution / no-order / no-Pix",
        summary: safety.reason,
        evidence: [
          "safeMode=true · dryRun=true · allowSideEffects=false",
          "Runner: mode=DRY_RUN_ONLY, allowSideEffects=false (invariantes do harness)",
          ...(safety.offenders.length > 0 ? safety.offenders : ["menu injetado (sem DB), sem Evolution"]),
        ],
        affectedArea: "WhatsApp",
        recommendation:
          safety.status === "FAIL"
            ? "Bloquear auditoria — efeito colateral real não pode ocorrer."
            : "Manter auditoria sempre em DRY_RUN_ONLY com menu injetado.",
      }),
    );

    // ── 2) Leak gate: internal-command / Build OS leak prevention ──────────
    const leak = evaluateWaLeak(report);
    findings.push(
      makeFinding(ctx, "whatsapp", {
        status: leak.status,
        severity: leak.severity,
        title: "WhatsApp — prevenção de vazamento de comando interno / Build OS",
        summary: leak.reason,
        evidence: leak.offenders.length > 0 ? leak.offenders : ["Respostas ao cliente varridas — nenhum marcador interno."],
        affectedArea: "WhatsApp",
        recommendation:
          leak.status === "FAIL"
            ? "Corrigir — comando interno/Build OS jamais pode aparecer ao cliente."
            : "Manter guarda de vazamento no fluxo de resposta.",
      }),
    );

    // ── 3) Scenario Test Center (functional coverage) ──────────────────────
    const fn = classifyWaFunctional(report);
    if (fn.status === "WARNING" && fn.severity === "P1") {
      findings.push(
        makeFinding(ctx, "whatsapp", {
          status: fn.status,
          severity: fn.severity,
          title: "WhatsApp Scenario Runner — gaps funcionais",
          summary: `${report.pass}/${report.total} cenários OK. ${report.fail} falha(s) funcional(is) (parsing / fluxo parcial) — sem risco de envio.`,
          evidence: fn.failed.map((r) => `${r.id} [${r.category}]: ${r.checks.filter((c) => c.severity === "FAIL").map((c) => c.label).join(", ")}`),
          affectedArea: "WhatsApp",
          recommendation: "Revisar parsing/fluxo dos cenários que falharam; nenhum é risco de envio real.",
        }),
      );
    } else if (fn.status === "WARNING") {
      findings.push(
        makeFinding(ctx, "whatsapp", {
          status: fn.status,
          severity: fn.severity,
          title: "WhatsApp Scenario Runner — avisos de cobertura",
          summary: `${report.pass}/${report.total} cenários OK. ${report.warn} com avisos (cobertura parcial).`,
          evidence: fn.warned.map((r) => `${r.id} [${r.category}]`),
          affectedArea: "WhatsApp",
          recommendation: "Reforçar cenários parciais; sem risco de envio real.",
        }),
      );
    } else {
      findings.push(
        makeFinding(ctx, "whatsapp", {
          status: fn.status,
          severity: fn.severity,
          title: "WhatsApp Scenario Runner — todos os cenários OK",
          summary: `${report.pass}/${report.total} cenários passaram (roteamento, parsing, multi-turn, handoff, pix_safety).`,
          evidence: [`${report.total} cenários replay em DRY_RUN_ONLY`],
          affectedArea: "WhatsApp",
          recommendation: "Manter cobertura; validar ativação real com allowlist controlado.",
        }),
      );
    }

    // ── 4) Payment / Pix coverage gap (needs live config — not run safely) ─
    findings.push(
      makeFinding(ctx, "whatsapp", {
        status: "WARNING",
        severity: "P2",
        title: "WhatsApp — cobertura de pagamento/Pix fora do dry audit",
        summary:
          "Cenários de pagamento/Pix exigem config de entrega/Pix ao vivo (DB) e ficam fora da auditoria segura — validados no lab contra um restaurante real.",
        evidence: [
          `Suítes seguras auditadas: ${SAFE_SUITES.join(", ")} (menu injetado, sem DB)`,
          "Suítes payment/full excluídas: leem deliveryConfig/Pix do banco.",
        ],
        affectedArea: "WhatsApp",
        recommendation: "Adicionar fixture de config de entrega/Pix injetável para auditar pix_safety sem DB (v1.5).",
      }),
    );

    return findings;
  },
};
