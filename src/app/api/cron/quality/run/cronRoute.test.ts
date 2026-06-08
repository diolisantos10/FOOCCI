import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const runAll = vi.fn();
const persistRun = vi.fn();

vi.mock("@/services/quality/QualityControlService", () => ({ runAll: (...a: unknown[]) => runAll(...a) }));
vi.mock("@/services/quality/persistence/QualityAuditStore", () => ({ persistRun: (...a: unknown[]) => persistRun(...a) }));

import { POST } from "./route";

const result = {
  runId: "run_x",
  startedAt: new Date("2026-06-08T03:00:00.000Z"),
  finishedAt: new Date("2026-06-08T03:00:00.300Z"),
  auditorIds: ["waiter", "crm", "analytics", "whatsapp"],
  findings: [{ id: 1 }, { id: 2 }, { id: 3 }],
  countsBySeverity: { P0: 0, P1: 0, P2: 1, INFO: 7 },
  countsByStatus: { PASS: 5, WARNING: 3, FAIL: 0 },
  globalStatus: "WARNING",
};

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  runAll.mockResolvedValue(result);
  persistRun.mockResolvedValue("qar_cron_1");
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/quality/run — auth", () => {
  it("(1) requires an Authorization Bearer header — 401 without it", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runAll).not.toHaveBeenCalled();
  });

  it("(3) rejects an invalid secret — 401", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(runAll).not.toHaveBeenCalled();
  });

  it("(2) does not run when CRON_SECRET is not configured — 503", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer whatever" }));
    expect(res.status).toBe(503);
    expect(runAll).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/quality/run — execution", () => {
  it("(4)(5)(6) valid secret runs runAll and persists as source CRON / triggeredBy cron", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runAll).toHaveBeenCalledTimes(1);
    expect(persistRun).toHaveBeenCalledTimes(1);
    expect(persistRun.mock.calls[0][1]).toEqual({ source: "CRON", triggeredBy: "cron" });
    expect(body).toMatchObject({
      ok: true,
      runId: "qar_cron_1",
      globalStatus: "WARNING",
      findingsCount: 3,
      durationMs: 300,
    });
    expect(body.counts.bySeverity).toEqual({ P0: 0, P1: 0, P2: 1, INFO: 7 });
    expect(body.counts.byStatus).toEqual({ PASS: 5, WARNING: 3, FAIL: 0 });
  });

  it("(8) returns a controlled 500 when persistence fails", async () => {
    persistRun.mockRejectedValue(new Error("db down"));
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("persistence failed");
  });
});

describe("POST /api/cron/quality/run — method", () => {
  it("(7) does not expose a GET handler (POST only)", () => {
    expect(typeof POST).toBe("function");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
