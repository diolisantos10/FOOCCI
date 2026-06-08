import { describe, it, expect } from "vitest";
import { WhatsAppAuditor, classifyWaFunctional, evaluateWaSafety, evaluateWaLeak, evaluateWaPixSafety } from "./WhatsAppAuditor";
import { SAFE_MODE, QualitySafeModeError } from "../SafeMode";
import type { AuditContext } from "../types";
import type {
  WaScenarioRunReport,
  WaScenarioResult,
  WaScenarioStep,
} from "@/services/whatsapp/ordering/WhatsAppOrderingScenarioRunner";

const ctx: AuditContext = {
  runId: "run_wa",
  now: new Date("2026-06-08T03:00:00Z"),
  safeMode: SAFE_MODE,
};

function step(over: Partial<WaScenarioStep> = {}): WaScenarioStep {
  return {
    index: 0, message: "m", previousStage: "IDLE", stage: "IDLE", status: "ACTIVE",
    intent: "order", suggestedReply: "Claro! Quer adicionar?", matchedItems: [],
    unresolvedItems: [], missingQuestions: [], actions: [], sideEffectsPerformed: [],
    order: null, paymentStub: true, paymentRealPix: false, estimatedTotal: 0,
    deliveryType: null, paymentMethod: null, cashChange: null, hasAddress: false,
    ...over,
  };
}

function result(over: Partial<WaScenarioResult> = {}): WaScenarioResult {
  return {
    id: "s1", name: "S1", category: "basic", description: "", messages: ["a"],
    verdict: "PASS", checks: [], steps: [step()], finalStage: "IDLE", finalStatus: "ACTIVE",
    finalItems: [], sideEffectsPerformed: [], durationMs: 0, ...over,
  };
}

function report(results: WaScenarioResult[]): WaScenarioRunReport {
  const pass = results.filter((r) => r.verdict === "PASS").length;
  const warn = results.filter((r) => r.verdict === "WARN").length;
  const fail = results.filter((r) => r.verdict === "FAIL").length;
  return {
    suite: "all", restaurant: { id: "r" }, ranAt: "", total: results.length,
    pass, warn, fail, score: 100, results,
  };
}

describe("WhatsAppAuditor — connected safe runner (v1.4)", () => {
  it("(1) is ACTIVE and runs real checks in SafeMode (no false P0)", async () => {
    expect(WhatsAppAuditor.connection).toBe("ACTIVE");
    const findings = await WhatsAppAuditor.run(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.every((f) => f.auditorId === "whatsapp")).toBe(true);
    expect(findings.every((f) => f.severity !== "P0")).toBe(true);
  });

  it("(2) emits the no-send safety and the leak-prevention findings", async () => {
    const findings = await WhatsAppAuditor.run(ctx);
    const safety = findings.find((f) => f.title.includes("no-send"));
    const leak = findings.find((f) => f.title.includes("vazamento"));
    expect(safety?.status).toBe("PASS");
    expect(leak?.status).toBe("PASS");
    expect(safety!.evidence.join(" ")).toContain("allowSideEffects=false");
  });

  it("(1) covers pix_safety WITHOUT a DB — PASS/INFO, no real Pix, no Mercado Pago", async () => {
    const findings = await WhatsAppAuditor.run(ctx);
    const pixSafety = findings.find((f) => f.title.includes("segurança de pagamento/Pix"));
    expect(pixSafety).toBeDefined();
    expect(pixSafety!.status).toBe("PASS");
    expect(pixSafety!.severity).toBe("INFO");
    expect(pixSafety!.summary).toContain("pix_safety coberto");
    // the old DB-coverage gap finding must be gone
    expect(findings.some((f) => f.title.includes("fora do dry audit"))).toBe(false);
  });

  it("(7) blocks execution outside SafeMode", async () => {
    const unsafe = { ...ctx, safeMode: { safeMode: true, dryRun: false, allowSideEffects: true } as never };
    await expect(WhatsAppAuditor.run(unsafe)).rejects.toBeInstanceOf(QualitySafeModeError);
  });
});

describe("evaluateWaSafety — real-action risk ⇒ P0", () => {
  it("(4) a real side effect ⇒ FAIL / P0", () => {
    const s = evaluateWaSafety(report([result({ sideEffectsPerformed: ["sent_whatsapp"] })]));
    expect(s.status).toBe("FAIL");
    expect(s.severity).toBe("P0");
  });

  it("(4) a real Pix in a step ⇒ FAIL / P0", () => {
    const s = evaluateWaSafety(report([result({ steps: [step({ paymentRealPix: true })] })]));
    expect(s.severity).toBe("P0");
  });

  it("(4) a real order id in a step ⇒ FAIL / P0", () => {
    const s = evaluateWaSafety(report([result({ steps: [step({ order: { id: "ord_real" } as never })] })]));
    expect(s.severity).toBe("P0");
  });

  it("clean dry-run ⇒ PASS / INFO", () => {
    const s = evaluateWaSafety(report([result()]));
    expect(s.status).toBe("PASS");
    expect(s.severity).toBe("INFO");
  });
});

describe("evaluateWaPixSafety — Pix safety without DB", () => {
  it("(4) a real Pix ⇒ FAIL / P0", () => {
    const s = evaluateWaPixSafety(report([result({ steps: [step({ paymentRealPix: true })] })]));
    expect(s.status).toBe("FAIL");
    expect(s.severity).toBe("P0");
  });

  it("Pix stub flow ⇒ PASS / INFO (covered, no Mercado Pago)", () => {
    const s = evaluateWaPixSafety(
      report([result({ steps: [step({ paymentStub: true, stage: "AWAITING_PIX_PAYMENT" })] })]),
    );
    expect(s.status).toBe("PASS");
    expect(s.severity).toBe("INFO");
    expect(s.pixStubFlows).toBe(1);
  });
});

describe("evaluateWaLeak — internal/Build OS leak ⇒ P0", () => {
  it("(5) a Build OS marker in a customer reply ⇒ FAIL / P0", () => {
    const s = evaluateWaLeak(report([result({ steps: [step({ suggestedReply: "rodando Build OS bootstrap..." })] })]));
    expect(s.status).toBe("FAIL");
    expect(s.severity).toBe("P0");
  });

  it("(5) an internal-command marker ⇒ FAIL / P0", () => {
    const s = evaluateWaLeak(report([result({ steps: [step({ suggestedReply: "system prompt: você é..." })] })]));
    expect(s.severity).toBe("P0");
  });

  it("clean replies ⇒ PASS / INFO", () => {
    const s = evaluateWaLeak(report([result()]));
    expect(s.status).toBe("PASS");
  });
});

describe("classifyWaFunctional — coverage mapping (never safety P0)", () => {
  it("(6) a FAIL verdict ⇒ WARNING / P1 (functional gap, not P0)", () => {
    const r = classifyWaFunctional(report([result({ verdict: "PASS" }), result({ id: "s2", verdict: "FAIL" })]));
    expect(r.status).toBe("WARNING");
    expect(r.severity).toBe("P1");
  });

  it("(6) only WARN verdicts ⇒ WARNING / P2", () => {
    const r = classifyWaFunctional(report([result({ verdict: "WARN" })]));
    expect(r.severity).toBe("P2");
  });

  it("all PASS ⇒ PASS / INFO", () => {
    const r = classifyWaFunctional(report([result()]));
    expect(r.status).toBe("PASS");
    expect(r.severity).toBe("INFO");
  });
});
