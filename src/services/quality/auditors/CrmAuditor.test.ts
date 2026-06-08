import { describe, it, expect } from "vitest";
import { CrmAuditor, classifyCrmRun, evaluateSendSafety } from "./CrmAuditor";
import { SAFE_MODE, QualitySafeModeError } from "../SafeMode";
import type { AuditContext } from "../types";
import type { CrmEvalReport, CrmScenarioResult } from "@/services/crm/testing/crmEvaluator";

const ctx: AuditContext = {
  runId: "run_crm",
  now: new Date("2026-06-08T03:00:00Z"),
  safeMode: SAFE_MODE,
};

function scn(id: string, verdict: CrmScenarioResult["verdict"], group = "segmentation"): CrmScenarioResult {
  return {
    id,
    group: group as CrmScenarioResult["group"],
    groupLabel: group,
    name: id,
    description: id,
    severity: "P1",
    verdict,
    score: verdict === "PASS" ? 100 : verdict === "WARN" ? 70 : 40,
    checks: [],
    failedChecks: verdict === "FAIL" ? ["crit"] : [],
    warnings: verdict === "WARN" ? ["warn"] : [],
    expectedSummary: "",
    actualSummary: "",
    durationMs: 0,
  };
}

function report(results: CrmScenarioResult[], useLiveLLM = false): CrmEvalReport {
  return {
    restaurantId: "r", restaurantName: "R", slug: "s", mode: "audit", useLiveLLM,
    ranAt: new Date(0).toISOString(), durationMs: 0,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.verdict === "PASS").length,
      warned: results.filter((r) => r.verdict === "WARN").length,
      failed: results.filter((r) => r.verdict === "FAIL").length,
      avgScore: 100, durationMs: 0,
    },
    results,
  };
}

describe("CrmAuditor — connected dry-run (v1.2)", () => {
  it("(1) is ACTIVE and runs real checks in SafeMode", async () => {
    expect(CrmAuditor.connection).toBe("ACTIVE");
    const findings = await CrmAuditor.run(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0].auditorId).toBe("crm");
    expect(findings[0].title).toContain("CRM Test Center");
    // a real dry-run never produces a false P0 with the clean fixtures
    expect(findings.every((f) => f.severity !== "P0")).toBe(true);
  });

  it("(2) emits the dry-run / no-send guarantee finding (useLiveLLM=false)", async () => {
    const findings = await CrmAuditor.run(ctx);
    const safety = findings.find((f) => f.title.includes("dry-run"));
    expect(safety).toBeDefined();
    expect(safety!.evidence.join(" ")).toContain("useLiveLLM=false");
    expect(safety!.evidence.join(" ")).toContain("allowSideEffects=false");
  });

  it("(6) blocks execution outside SafeMode", async () => {
    const unsafe = { ...ctx, safeMode: { safeMode: true, dryRun: false, allowSideEffects: true } as never };
    await expect(CrmAuditor.run(unsafe)).rejects.toBeInstanceOf(QualitySafeModeError);
  });
});

describe("classifyCrmRun — severity mapping", () => {
  it("(4) a FAIL verdict (failed critical check) ⇒ FAIL / P0", () => {
    const r = classifyCrmRun([scn("ok", "PASS"), scn("bad", "FAIL", "contact_safety")]);
    expect(r.status).toBe("FAIL");
    expect(r.severity).toBe("P0");
    expect(r.failed.map((s) => s.id)).toEqual(["bad"]);
  });

  it("(5) only WARN verdicts ⇒ WARNING / P1 (config gaps, not P0)", () => {
    const r = classifyCrmRun([scn("ok", "PASS"), scn("gap", "WARN")]);
    expect(r.status).toBe("WARNING");
    expect(r.severity).toBe("P1");
    expect(r.warned.map((s) => s.id)).toEqual(["gap"]);
  });

  it("all PASS ⇒ PASS / INFO", () => {
    const r = classifyCrmRun([scn("ok", "PASS")]);
    expect(r.status).toBe("PASS");
    expect(r.severity).toBe("INFO");
  });
});

describe("evaluateSendSafety — real-send risk ⇒ P0", () => {
  it("(4) live mode (useLiveLLM=true) ⇒ FAIL / P0", () => {
    const s = evaluateSendSafety(report([scn("ok", "PASS")], true));
    expect(s.status).toBe("FAIL");
    expect(s.severity).toBe("P0");
    expect(s.reason).toContain("LIVE");
  });

  it("a failing contact_safety scenario ⇒ FAIL / P0", () => {
    const s = evaluateSendSafety(report([scn("cs-bad", "FAIL", "contact_safety")]));
    expect(s.status).toBe("FAIL");
    expect(s.severity).toBe("P0");
  });

  it("dry-run with safe contacts ⇒ PASS / INFO (no send)", () => {
    const s = evaluateSendSafety(report([scn("ok", "PASS")]));
    expect(s.status).toBe("PASS");
    expect(s.severity).toBe("INFO");
  });
});
