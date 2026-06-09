import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentLibrarySource: { create: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  agentLibraryTechnique: { create: vi.fn(), deleteMany: vi.fn() },
  waiterRuntimeVersion: { deleteMany: vi.fn(), count: vi.fn() },
}));
const verSvc = vi.hoisted(() => ({
  createDraft: vi.fn(), markTesting: vi.fn(), activateVersion: vi.fn(),
  rollbackVersion: vi.fn(), getActiveVersion: vi.fn(),
}));
const curSvc = vi.hoisted(() => ({ activateTechnique: vi.fn(), setRuntimeEnabled: vi.fn(), setPriority: vi.fn() }));
const bridge = vi.hoisted(() => ({ getWaiterRuntimeKnowledge: vi.fn() }));
const gate = vi.hoisted(() => ({ runWaiterQualityGate: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./WaiterRuntimeVersionService", () => verSvc);
vi.mock("./TechniqueCurationService", () => curSvc);
vi.mock("./WaiterLibraryRuntimeBridge", () => bridge);
vi.mock("./qualityGate", () => gate);

import { runWaiterRuntimeMergeDiagnostic, DIAG_TECHNIQUE } from "./mergeDiagnostic";

function enabledKnowledge() {
  return {
    enabled: true, mode: "LIBRARY_ASSISTED", versionId: "v1",
    techniques: [{ id: "t1", name: DIAG_TECHNIQUE.techniqueName, category: "venda consultiva" }],
    promptBlock: `bloco\n${DIAG_TECHNIQUE.techniqueName}\nA UI e o catálogo real continuam sendo a fonte da verdade.`,
    warnings: [],
  };
}
function currentKnowledge() {
  return { enabled: false, mode: "CURRENT", techniques: [], promptBlock: "", warnings: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.agentLibrarySource.create.mockResolvedValue({ id: "s1" });
  db.agentLibraryTechnique.create.mockResolvedValue({ id: "t1" });
  db.agentLibrarySource.deleteMany.mockResolvedValue({ count: 1 });
  db.agentLibraryTechnique.deleteMany.mockResolvedValue({ count: 1 });
  db.waiterRuntimeVersion.deleteMany.mockResolvedValue({ count: 1 });
  db.agentLibrarySource.count.mockResolvedValue(0);
  db.waiterRuntimeVersion.count.mockResolvedValue(0);

  curSvc.activateTechnique.mockResolvedValue({});
  curSvc.setRuntimeEnabled.mockResolvedValue({});
  curSvc.setPriority.mockResolvedValue({});
  verSvc.createDraft.mockResolvedValue({ id: "v1", techniques: [{ id: "vt1" }] });
  verSvc.markTesting.mockResolvedValue({});
  verSvc.activateVersion.mockResolvedValue({ ok: true, versionId: "v1", reason: "ok" });
  verSvc.getActiveVersion.mockResolvedValue({ id: "v1" });
  verSvc.rollbackVersion.mockResolvedValue({ ok: true, mode: "CURRENT_FALLBACK" });
  gate.runWaiterQualityGate.mockResolvedValue({ passed: true, p0Count: 0, reason: "ok" });
  // bridge: first call (active) → enabled; second (after rollback) → CURRENT.
  bridge.getWaiterRuntimeKnowledge.mockResolvedValueOnce(enabledKnowledge()).mockResolvedValueOnce(currentKnowledge());
});

describe("runWaiterRuntimeMergeDiagnostic", () => {
  it("PASS — full cycle with all flags true and runtimeTouched false", async () => {
    const r = await runWaiterRuntimeMergeDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.versionCreated).toBe(true);
    expect(r.techniqueCreated).toBe(true);
    expect(r.qualityGateP0).toBe(0);
    expect(r.activated).toBe(true);
    expect(r.bridgeEnabled).toBe(true);
    expect(r.promptBlockIncludedTechnique).toBe(true);
    expect(r.rolledBack).toBe(true);
    expect(r.fallbackCurrent).toBe(true);
    expect(r.cleanup).toBe(true);
    expect(r.runtimeTouched).toBe(false);
  });

  it("scopes the synthetic version to a UNIQUE non-existent restaurantId (never a real scope)", async () => {
    await runWaiterRuntimeMergeDiagnostic();
    const draftArg = verSvc.createDraft.mock.calls[0][0];
    expect(draftArg.restaurantId).toMatch(/^__waiter_merge_diag_/);
    // the bridge is always queried with that same synthetic scope
    expect(bridge.getWaiterRuntimeKnowledge.mock.calls[0][0].restaurantId).toBe(draftArg.restaurantId);
  });

  it("BLOCKS at the quality gate (P0 > 0) and still cleans up", async () => {
    gate.runWaiterQualityGate.mockResolvedValue({ passed: false, p0Count: 1, reason: "P0" });
    const r = await runWaiterRuntimeMergeDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("quality_gate");
    expect(r.activated).toBe(false);
    expect(r.cleanup).toBe(true); // cleanup runs even on failure
    expect(r.runtimeTouched).toBe(false);
  });

  it("FAILs when the bridge does not reflect the active version", async () => {
    bridge.getWaiterRuntimeKnowledge.mockReset();
    bridge.getWaiterRuntimeKnowledge.mockResolvedValue(currentKnowledge());
    const r = await runWaiterRuntimeMergeDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("bridge_check");
    expect(r.cleanup).toBe(true);
  });

  it("always attempts cleanup even when an exception is thrown", async () => {
    verSvc.createDraft.mockRejectedValue(new Error("boom"));
    const r = await runWaiterRuntimeMergeDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.cleanup).toBe(true);
    expect(db.agentLibraryTechnique.deleteMany).toHaveBeenCalled();
  });
});
