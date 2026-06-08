import { describe, it, expect } from "vitest";
import { WaiterAuditor, classifyWaiterRun } from "./WaiterAuditor";
import { SAFE_MODE, QualitySafeModeError } from "../SafeMode";
import type { AuditContext } from "../types";
import type { ScenarioResult } from "@/services/ai/waiter/testing/waiterEvaluator";

const ctx: AuditContext = {
  runId: "run_waiter",
  now: new Date("2026-06-08T03:00:00Z"),
  safeMode: SAFE_MODE,
};

function scenario(id: string, checks: Array<{ type: string; pass: boolean }>): ScenarioResult {
  return {
    id,
    description: id,
    group: "g",
    groupLabel: "G",
    message: "m",
    pass: checks.every((c) => c.pass),
    checks: checks.map((c) => ({ type: c.type as ScenarioResult["checks"][number]["type"], pass: c.pass, detail: "" })),
    aiResponse: { message: "", cards: [], mode: "x" },
  };
}

describe("WaiterAuditor — connected (v1.1)", () => {
  it("(1) is ACTIVE, not PARTIAL", () => {
    expect(WaiterAuditor.connection).toBe("ACTIVE");
    expect(WaiterAuditor.readOnly).toBe(true);
    expect(WaiterAuditor.canRunDaily).toBe(true);
  });

  it("(2) runs real checks in SafeMode and returns real findings", async () => {
    const findings = await WaiterAuditor.run(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    // first finding is the real Test Center evaluation
    const tc = findings[0];
    expect(tc.auditorId).toBe("waiter");
    expect(["PASS", "WARNING", "FAIL"]).toContain(tc.status);
    expect(tc.title).toContain("Waiter Test Center");
    // a real evaluation never P0 with the (clean) synthetic catalog
    expect(tc.severity).not.toBe("P0");
  });

  it("(7) blocks execution outside SafeMode", async () => {
    const unsafe = { ...ctx, safeMode: { safeMode: true, dryRun: false, allowSideEffects: true } as never };
    await expect(WaiterAuditor.run(unsafe)).rejects.toBeInstanceOf(QualitySafeModeError);
  });

  it("(6) legacy suites are surfaced as WARNING/INFO, never P0", async () => {
    const findings = await WaiterAuditor.run(ctx);
    const legacy = findings.find((f) => f.title.includes("legadas"));
    expect(legacy).toBeDefined();
    expect(legacy!.status).toBe("WARNING");
    expect(legacy!.severity).toBe("INFO");
    expect(legacy!.severity).not.toBe("P0");
  });
});

describe("classifyWaiterRun — severity mapping", () => {
  it("(5) a failing CRITICAL check ⇒ FAIL / P0", () => {
    const r = classifyWaiterRun([
      scenario("ok-1", [{ type: "has_real_cards", pass: true }]),
      scenario("bad-1", [{ type: "no_hallucination", pass: false }]),
    ]);
    expect(r.status).toBe("FAIL");
    expect(r.severity).toBe("P0");
    expect(r.critical.map((s) => s.id)).toEqual(["bad-1"]);
  });

  it("a failing non-critical check ⇒ WARNING / P2 (not P0)", () => {
    const r = classifyWaiterRun([
      scenario("ok-1", [{ type: "has_real_cards", pass: true }]),
      scenario("gap-1", [{ type: "has_real_cards", pass: true }, { type: "includes_shareable", pass: false }]),
    ]);
    expect(r.status).toBe("WARNING");
    expect(r.severity).toBe("P2");
    expect(r.nonCritical.map((s) => s.id)).toEqual(["gap-1"]);
  });

  it("all green ⇒ PASS / INFO", () => {
    const r = classifyWaiterRun([scenario("ok-1", [{ type: "has_real_cards", pass: true }])]);
    expect(r.status).toBe("PASS");
    expect(r.severity).toBe("INFO");
  });

  it("critical wins over a simultaneous non-critical failure", () => {
    const r = classifyWaiterRun([
      scenario("bad", [{ type: "no_forbidden_denial", pass: false }]),
      scenario("gap", [{ type: "includes_category", pass: false }]),
    ]);
    expect(r.severity).toBe("P0");
    expect(r.critical).toHaveLength(1);
    expect(r.nonCritical).toHaveLength(1);
  });
});
