import { describe, it, expect, beforeEach, vi } from "vitest";

const qc = vi.hoisted(() => ({ runOne: vi.fn() }));
vi.mock("@/services/quality/QualityControlService", () => ({ runOne: qc.runOne }));

import { runWaiterQualityGate, WAITER_AUDITOR_ID } from "./qualityGate";

function result(p0: number, globalStatus = p0 > 0 ? "FAIL" : "PASS") {
  return {
    runId: "qc_1",
    countsBySeverity: { P0: p0, P1: 0, P2: 0, INFO: 0 },
    countsByStatus: { PASS: 1, WARNING: 0, FAIL: p0 > 0 ? 1 : 0 },
    globalStatus,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("runWaiterQualityGate", () => {
  it("runs the WAITER auditor specifically", async () => {
    qc.runOne.mockResolvedValue(result(0));
    await runWaiterQualityGate();
    expect(qc.runOne).toHaveBeenCalledWith(WAITER_AUDITOR_ID);
  });

  it("passes when P0 === 0", async () => {
    qc.runOne.mockResolvedValue(result(0));
    const gate = await runWaiterQualityGate();
    expect(gate.passed).toBe(true);
    expect(gate.p0Count).toBe(0);
  });

  it("blocks when P0 > 0", async () => {
    qc.runOne.mockResolvedValue(result(2));
    const gate = await runWaiterQualityGate();
    expect(gate.passed).toBe(false);
    expect(gate.p0Count).toBe(2);
    expect(gate.reason).toMatch(/Bloqueado/);
  });

  it("blocks (never silently allows) when the auditor throws", async () => {
    qc.runOne.mockRejectedValue(new Error("auditor boom"));
    const gate = await runWaiterQualityGate();
    expect(gate.passed).toBe(false);
    expect(gate.p0Count).toBe(-1);
  });
});
