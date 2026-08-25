import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // Portão de qualidade VERDE (LiveStageGuard): sem isto a trava da escada
  // derruba o degrau alto por falha fechada e estes casos nunca chegariam a
  // exercitar o que querem exercitar. O teste da TRAVA em si vive em
  // src/services/brain/runtime/escadaDeIa.class.test.ts.
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
  waiterRuntimeVersion: { findFirst: vi.fn() },
  waiterRuntimeVersionTechnique: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getWaiterRuntimeKnowledge } from "./WaiterLibraryRuntimeBridge";

function activeVersion(over: Record<string, unknown> = {}) {
  return {
    id: "v1",
    agentSlug: "waiter",
    restaurantId: null,
    isActive: true,
    status: "ACTIVE",
    mode: "LIBRARY_ASSISTED",
    libraryEnabled: true,
    maxTechniques: 6,
    activatedAt: new Date(),
    ...over,
  };
}

function assignment(opts: { priority?: number; technique?: Record<string, unknown> } = {}) {
  return {
    priority: opts.priority ?? 1,
    technique: {
      id: "t1",
      techniqueName: "Sugestão de bebida ancorada",
      category: "Vendas",
      application: "Após o prato principal, ofereça uma bebida que combine, citando o porquê.",
      usageRule: "Máximo 1 sugestão de bebida.",
      qualityTest: "A bebida combina?",
      status: "ACTIVE",
      runtimeEnabled: true,
      runtimePriority: 1,
      ...(opts.technique ?? {}),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WaiterLibraryRuntimeBridge.getWaiterRuntimeKnowledge", () => {
  it("(P12.1) no ACTIVE version → fallback CURRENT (enabled false, no prompt)", async () => {
    db.waiterRuntimeVersion.findFirst.mockResolvedValue(null);
    const k = await getWaiterRuntimeKnowledge({ restaurantId: "r1" });
    expect(k.enabled).toBe(false);
    expect(k.mode).toBe("CURRENT");
    expect(k.promptBlock).toBe("");
    expect(db.waiterRuntimeVersionTechnique.findMany).not.toHaveBeenCalled();
  });

  it("(P12.2) version exists but libraryEnabled=false → fallback CURRENT", async () => {
    db.waiterRuntimeVersion.findFirst.mockResolvedValue(activeVersion({ libraryEnabled: false }));
    const k = await getWaiterRuntimeKnowledge({});
    expect(k.enabled).toBe(false);
    expect(k.mode).toBe("CURRENT");
  });

  it("version is CURRENT mode → fallback even if libraryEnabled true", async () => {
    db.waiterRuntimeVersion.findFirst.mockResolvedValue(activeVersion({ mode: "CURRENT" }));
    const k = await getWaiterRuntimeKnowledge({});
    expect(k.enabled).toBe(false);
  });

  it("(P12.3) ACTIVE LIBRARY_ASSISTED + ACTIVE techniques → returns promptBlock", async () => {
    db.waiterRuntimeVersion.findFirst.mockResolvedValue(activeVersion());
    db.waiterRuntimeVersionTechnique.findMany.mockResolvedValue([assignment()]);
    const k = await getWaiterRuntimeKnowledge({ restaurantId: "r1" });
    expect(k.enabled).toBe(true);
    expect(k.mode).toBe("LIBRARY_ASSISTED");
    expect(k.versionId).toBe("v1");
    expect(k.techniques).toHaveLength(1);
    expect(k.promptBlock).toContain("Sugestão de bebida ancorada");
    expect(k.promptBlock).toContain("fonte da verdade");
  });

  it("(P12.4) inactive/rejected techniques are excluded → fallback when none remain", async () => {
    db.waiterRuntimeVersion.findFirst.mockResolvedValue(activeVersion());
    db.waiterRuntimeVersionTechnique.findMany.mockResolvedValue([
      assignment({ technique: { status: "REJECTED", runtimeEnabled: true } }),
      assignment({ technique: { status: "ACTIVE", runtimeEnabled: false } }),
    ]);
    const k = await getWaiterRuntimeKnowledge({});
    expect(k.enabled).toBe(false);
    expect(k.techniques).toHaveLength(0);
  });

  it("(P12.5) maxTechniques is respected (capped by the version)", async () => {
    db.waiterRuntimeVersion.findFirst.mockResolvedValue(activeVersion({ maxTechniques: 2 }));
    db.waiterRuntimeVersionTechnique.findMany.mockResolvedValue([
      assignment({ priority: 3, technique: { id: "a", techniqueName: "Técnica alfa completa" } }),
      assignment({ priority: 2, technique: { id: "b", techniqueName: "Técnica beta completa" } }),
      assignment({ priority: 1, technique: { id: "c", techniqueName: "Técnica gama completa" } }),
    ]);
    const k = await getWaiterRuntimeKnowledge({});
    expect(k.techniques).toHaveLength(2);
  });

  it("(P12.6) a DB/bridge error never breaks the runtime → fallback + warning", async () => {
    db.waiterRuntimeVersion.findFirst.mockRejectedValue(new Error("db down"));
    const k = await getWaiterRuntimeKnowledge({ restaurantId: "r1" });
    expect(k.enabled).toBe(false);
    expect(k.mode).toBe("CURRENT");
    expect(k.warnings.join(" ")).toMatch(/db down|runtime atual mantido/i);
  });
});
