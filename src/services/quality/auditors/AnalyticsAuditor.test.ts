import { describe, it, expect } from "vitest";
import { AnalyticsAuditor, classifyAnalyticsRun, evaluateReadOnlySafety } from "./AnalyticsAuditor";
import { SAFE_MODE, QualitySafeModeError } from "../SafeMode";
import type { AuditContext } from "../types";
import type { AnalyticsEvalReport, AnalyticsScenarioResult } from "@/services/analytics/testing/analyticsEvaluator";

const ctx: AuditContext = {
  runId: "run_analytics",
  now: new Date("2026-06-08T03:00:00Z"),
  safeMode: SAFE_MODE,
};

function scn(id: string, verdict: AnalyticsScenarioResult["verdict"], group = "diagnosis"): AnalyticsScenarioResult {
  return {
    id,
    group: group as AnalyticsScenarioResult["group"],
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

function report(results: AnalyticsScenarioResult[], includeLiveData = false): AnalyticsEvalReport {
  return {
    restaurantId: "r", restaurantName: "R", slug: "s", mode: "audit", includeLiveData,
    ranAt: new Date(0).toISOString(), durationMs: 0,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.verdict === "PASS").length,
      warned: results.filter((r) => r.verdict === "WARN").length,
      failed: results.filter((r) => r.verdict === "FAIL").length,
      avgScore: 100, durationMs: 0,
    },
    results,
    limitations: [],
  };
}

describe("AnalyticsAuditor — connected read-only (v1.3)", () => {
  it("(1) is ACTIVE and runs real checks in SafeMode", async () => {
    expect(AnalyticsAuditor.connection).toBe("ACTIVE");
    const findings = await AnalyticsAuditor.run(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0].auditorId).toBe("analytics");
    expect(findings[0].title).toContain("Analytics Test Center");
    expect(findings.every((f) => f.severity !== "P0")).toBe(true);
  });

  it("(2) emits the read-only / fixed-data guarantee finding (includeLiveData=false)", async () => {
    const findings = await AnalyticsAuditor.run(ctx);
    const safety = findings.find((f) => f.title.includes("read-only"));
    expect(safety).toBeDefined();
    expect(safety!.evidence.join(" ")).toContain("includeLiveData=false");
    expect(safety!.evidence.join(" ")).toContain("allowSideEffects=false");
  });

  it("(6) blocks execution outside SafeMode", async () => {
    const unsafe = { ...ctx, safeMode: { safeMode: true, dryRun: false, allowSideEffects: true } as never };
    await expect(AnalyticsAuditor.run(unsafe)).rejects.toBeInstanceOf(QualitySafeModeError);
  });
});

describe("classifyAnalyticsRun — severity mapping", () => {
  it("(4) a FAIL verdict (broken essential calc) ⇒ FAIL / P0", () => {
    const r = classifyAnalyticsRun([scn("ok", "PASS"), scn("bad", "FAIL", "cockpit")]);
    expect(r.status).toBe("FAIL");
    expect(r.severity).toBe("P0");
    expect(r.failed.map((s) => s.id)).toEqual(["bad"]);
  });

  it("(5) only WARN verdicts ⇒ WARNING / P2 (metric gaps, not P0)", () => {
    const r = classifyAnalyticsRun([scn("ok", "PASS"), scn("gap", "WARN")]);
    expect(r.status).toBe("WARNING");
    expect(r.severity).toBe("P2");
    expect(r.warned.map((s) => s.id)).toEqual(["gap"]);
  });

  it("all PASS ⇒ PASS / INFO", () => {
    const r = classifyAnalyticsRun([scn("ok", "PASS")]);
    expect(r.status).toBe("PASS");
    expect(r.severity).toBe("INFO");
  });
});

describe("evaluateReadOnlySafety — live-data dependency ⇒ P0", () => {
  it("(4) live data (includeLiveData=true) ⇒ FAIL / P0", () => {
    const s = evaluateReadOnlySafety(report([scn("ok", "PASS")], true));
    expect(s.status).toBe("FAIL");
    expect(s.severity).toBe("P0");
    expect(s.reason).toContain("ao vivo");
  });

  it("fixed-data run ⇒ PASS / INFO (read-only)", () => {
    const s = evaluateReadOnlySafety(report([scn("ok", "PASS")]));
    expect(s.status).toBe("PASS");
    expect(s.severity).toBe("INFO");
  });
});
