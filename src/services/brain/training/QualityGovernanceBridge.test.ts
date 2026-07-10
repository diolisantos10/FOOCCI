import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainChangeRequest: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const store = vi.hoisted(() => ({ listHistory: vi.fn() }));
vi.mock("@/services/quality/persistence/QualityAuditStore", () => store);

import { autoFileGovernanceForLatestRun } from "./QualityGovernanceBridge";

function run(id: string, p0: number, createdAt = "2026-07-10T06:00:00Z") {
  return {
    id,
    source: "CRON",
    globalStatus: p0 > 0 ? "FAIL" : "PASS",
    startedAt: new Date(createdAt),
    finishedAt: new Date(createdAt),
    durationMs: 1000,
    auditorId: null,
    countsBySeverity: { P0: p0, P1: 0, P2: 0 },
    countsByStatus: {},
    createdAt: new Date(createdAt),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.brainChangeRequest.findFirst.mockResolvedValue(null);
  db.brainChangeRequest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "cr_auto_1", ...data }),
  );
});

describe("QualityGovernanceBridge — o Director ganha seu produtor automático", () => {
  it("NOVO P0 → arquiva BrainChangeRequest MEDIUM, PENDING_APPROVAL, sem tocar runtime", async () => {
    store.listHistory.mockResolvedValue([run("run_new", 2), run("run_prev", 0, "2026-07-09T06:00:00Z")]);
    const r = await autoFileGovernanceForLatestRun();
    expect(r.filed).toEqual(["cr_auto_1"]);
    const data = db.brainChangeRequest.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.requestedByType).toBe("TRAINING_CENTER");
    expect(data.riskLevel).toBe("MEDIUM");
    expect(data.status).toBe("PENDING_APPROVAL"); // nunca nasce aprovado
    expect(data.runtimeImpact).toBe("NONE");
  });

  it("dedupe: a mesma rodada nunca abre dois pedidos", async () => {
    store.listHistory.mockResolvedValue([run("run_new", 2), run("run_prev", 0, "2026-07-09T06:00:00Z")]);
    db.brainChangeRequest.findFirst.mockResolvedValue({ id: "cr_existente" });
    const r = await autoFileGovernanceForLatestRun();
    expect(r.filed).toEqual([]);
    expect(r.skippedDuplicates).toBe(1);
    expect(db.brainChangeRequest.create).not.toHaveBeenCalled();
  });

  it("rodadas estáveis não arquivam nada (anti-ruído)", async () => {
    store.listHistory.mockResolvedValue([run("run_a", 0), run("run_b", 0, "2026-07-09T06:00:00Z")]);
    const r = await autoFileGovernanceForLatestRun();
    expect(r.filed).toEqual([]);
    expect(db.brainChangeRequest.create).not.toHaveBeenCalled();
  });

  it("histórico insuficiente ou erro → silencioso, nunca quebra o cron", async () => {
    store.listHistory.mockResolvedValue([run("only_one", 3)]);
    expect((await autoFileGovernanceForLatestRun()).filed).toEqual([]);
    store.listHistory.mockRejectedValue(new Error("db down"));
    expect((await autoFileGovernanceForLatestRun()).filed).toEqual([]);
  });
});
