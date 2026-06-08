import { describe, it, expect, beforeEach, vi } from "vitest";

const create = vi.fn();
const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    qualityAuditRun: {
      create: (...a: unknown[]) => create(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { persistRun, listHistory, getLatestRun } from "./QualityAuditStore";
import type { AuditRunResult } from "../types";

const result: AuditRunResult = {
  runId: "run_x",
  startedAt: new Date("2026-06-08T03:00:00.000Z"),
  finishedAt: new Date("2026-06-08T03:00:00.200Z"),
  auditorIds: ["waiter"],
  findings: [
    {
      runId: "run_x", auditorId: "waiter", status: "PASS", severity: "INFO",
      title: "OK", summary: "37/37", evidence: ["safeMode=true"], affectedArea: "IA",
      recommendation: "manter", createdAt: new Date(0),
    },
  ],
  countsBySeverity: { P0: 0, P1: 0, P2: 0, INFO: 1 },
  countsByStatus: { PASS: 1, WARNING: 0, FAIL: 0 },
  globalStatus: "PASS",
};

beforeEach(() => vi.clearAllMocks());

describe("QualityAuditStore.persistRun", () => {
  it("(1)(2) creates a run with nested sanitized findings and returns the id", async () => {
    create.mockResolvedValue({ id: "qar_1" });
    const id = await persistRun(result, { source: "MANUAL", auditorId: "waiter" });
    expect(id).toBe("qar_1");
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.source).toBe("MANUAL");
    expect(arg.data.auditorId).toBe("waiter");
    expect(arg.data.globalStatus).toBe("PASS");
    expect(arg.data.durationMs).toBe(200);
    // findings nested-created
    const nested = arg.data.findings as { create: unknown[] };
    expect(nested.create).toHaveLength(1);
  });
});

describe("QualityAuditStore.listHistory", () => {
  it("(3) returns recent runs ordered by createdAt desc, capped at 50", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const rows = await listHistory(999); // over cap
    expect(rows).toHaveLength(2);
    const arg = findMany.mock.calls[0][0] as { take: number; orderBy: unknown };
    expect(arg.take).toBe(50); // capped
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
  });

  it("getLatestRun returns the single most recent run (take=1)", async () => {
    findMany.mockResolvedValue([{ id: "latest" }]);
    const latest = await getLatestRun();
    expect(latest).toEqual({ id: "latest" });
    expect((findMany.mock.calls[0][0] as { take: number }).take).toBe(1);
  });

  it("getLatestRun returns null when there is no history", async () => {
    findMany.mockResolvedValue([]);
    expect(await getLatestRun()).toBeNull();
  });
});
