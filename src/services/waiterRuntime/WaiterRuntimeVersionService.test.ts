import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  waiterRuntimeVersion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  waiterRuntimeVersionTechnique: { deleteMany: vi.fn(), createMany: vi.fn() },
  agentLibraryTechnique: { findMany: vi.fn() },
  $transaction: vi.fn((arr: unknown[]) => Promise.all(arr as Promise<unknown>[])),
}));
const gate = vi.hoisted(() => ({ runWaiterQualityGate: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./qualityGate", () => ({ runWaiterQualityGate: gate.runWaiterQualityGate }));

import { createDraft, activateVersion, rollbackVersion, markTesting } from "./WaiterRuntimeVersionService";

function ver(over: Record<string, unknown> = {}) {
  return { id: "v1", agentSlug: "waiter", restaurantId: null, status: "DRAFT", isActive: false, mode: "LIBRARY_ASSISTED", ...over };
}
function passGate() { return { passed: true, p0Count: 0, globalStatus: "PASS", runId: "qc", ranAt: new Date().toISOString(), reason: "ok" }; }
function failGate() { return { passed: false, p0Count: 2, globalStatus: "FAIL", runId: "qc", ranAt: new Date().toISOString(), reason: "2 P0" }; }

beforeEach(() => {
  vi.clearAllMocks();
  db.waiterRuntimeVersion.findUnique.mockResolvedValue(ver());
  db.waiterRuntimeVersion.create.mockResolvedValue(ver({ id: "vNew", status: "DRAFT" }));
  db.waiterRuntimeVersion.update.mockResolvedValue(ver());
  db.waiterRuntimeVersion.updateMany.mockResolvedValue({ count: 1 });
  db.agentLibraryTechnique.findMany.mockResolvedValue([{ id: "t1", runtimePriority: 2 }]);
  db.waiterRuntimeVersionTechnique.deleteMany.mockResolvedValue({ count: 0 });
  db.waiterRuntimeVersionTechnique.createMany.mockResolvedValue({ count: 1 });
});

describe("createDraft (P12-version.1)", () => {
  it("creates a DRAFT (never active) and freezes techniques", async () => {
    await createDraft({ name: "v Library", mode: "LIBRARY_ASSISTED", techniqueIds: ["t1"] });
    const created = db.waiterRuntimeVersion.create.mock.calls[0][0].data;
    expect(created.status).toBe("DRAFT");
    expect(created.isActive).toBe(false);
    // techniques frozen via the join table
    expect(db.waiterRuntimeVersionTechnique.createMany).toHaveBeenCalled();
  });
});

describe("activateVersion — Quality gate (P12-version.5)", () => {
  it("BLOCKS activation when the Quality gate fails (P0 > 0)", async () => {
    gate.runWaiterQualityGate.mockResolvedValue(failGate());
    const res = await activateVersion("v1", { activatedBy: "admin" });
    expect(res.ok).toBe(false);
    expect(res.gate.p0Count).toBe(2);
    // Never flips a version to ACTIVE on a failed gate.
    const activated = db.waiterRuntimeVersion.update.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === "ACTIVE",
    );
    expect(activated).toBe(false);
  });

  it("(P12-version.2/3) activates when gate passes AND demotes other active versions in scope", async () => {
    gate.runWaiterQualityGate.mockResolvedValue(passGate());
    const res = await activateVersion("v1", { activatedBy: "admin" });
    expect(res.ok).toBe(true);
    // demote others → exactly-one-active invariant
    expect(db.waiterRuntimeVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }), data: expect.objectContaining({ isActive: false }) }),
    );
    const activated = db.waiterRuntimeVersion.update.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string; isActive?: boolean } }).data?.status === "ACTIVE",
    );
    expect(activated).toBe(true);
  });
});

describe("rollbackVersion (P12-version.4) — fast, gate-free", () => {
  it("never runs the Quality gate", async () => {
    await rollbackVersion("v1", { rolledBackBy: "admin" });
    expect(gate.runWaiterQualityGate).not.toHaveBeenCalled();
  });

  it("falls back to CURRENT when no target version is provided", async () => {
    db.waiterRuntimeVersion.findUnique.mockResolvedValue(ver({ rollbackToVersionId: null }));
    const res = await rollbackVersion("v1", {});
    expect(res.mode).toBe("CURRENT_FALLBACK");
    expect(res.restoredVersionId).toBeNull();
  });

  it("restores the previous version when a target is given", async () => {
    const res = await rollbackVersion("v1", { rollbackToVersionId: "v0" });
    expect(res.mode).toBe("RESTORED_PREVIOUS");
    expect(res.restoredVersionId).toBe("v0");
  });
});

describe("markTesting", () => {
  it("only allows DRAFT → TESTING", async () => {
    db.waiterRuntimeVersion.findUnique.mockResolvedValue(ver({ status: "ACTIVE" }));
    await expect(markTesting("v1")).rejects.toThrow(/DRAFT/);
  });
});
