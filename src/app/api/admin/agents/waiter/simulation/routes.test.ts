import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const runSvc = vi.hoisted(() => ({ runAndPersistWaiterSimulation: vi.fn() }));
const store = vi.hoisted(() => ({ listRuns: vi.fn(), getRunDetail: vi.fn(), updateOpportunityStatus: vi.fn() }));

vi.mock("@/services/simulation/waiter/runWaiterSimulation", () => runSvc);
vi.mock("@/services/simulation/SimulationStore", () => store);

import { POST as runRoute } from "./run/route";
import { GET as historyRoute } from "./route";
import { GET as detailRoute } from "./[runId]/route";
import { PATCH as oppRoute } from "./opportunities/[id]/route";

const SECRET = "admin-s3cr3t";
function req(opts: { admin?: boolean; body?: unknown; url?: string } = {}) {
  const headers = new Map<string, string>();
  if (opts.admin) headers.set("x-admin-secret", SECRET);
  return {
    url: opts.url ?? "http://localhost/api/admin/agents/waiter/simulation",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: () => undefined },
    json: async () => { if (opts.body === undefined) throw new Error("no body"); return opts.body; },
  } as unknown as Parameters<typeof runRoute>[0];
}

const OLD = process.env.ADMIN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = SECRET;
  runSvc.runAndPersistWaiterSimulation.mockResolvedValue({
    runId: "r1",
    result: { status: "COMPLETED", scenariosTotal: 12, scenariosPassed: 10, scenariosWarning: 2, scenariosFailed: 0, p0Count: 0, p1Count: 0, p2Count: 2, opportunityCount: 2, runtimeTouched: false },
  });
  store.listRuns.mockResolvedValue([]);
  store.getRunDetail.mockResolvedValue({ id: "r1", scenarios: [], opportunities: [] });
  store.updateOpportunityStatus.mockResolvedValue({ id: "o1", status: "APPROVED" });
});
afterEach(() => { process.env.ADMIN_SECRET = OLD; });

describe("(P12-api.1/2/3) admin auth on simulation routes", () => {
  it("run: 403 without ADMIN_SECRET", async () => {
    delete process.env.ADMIN_SECRET;
    expect((await runRoute(req({ admin: true, body: {} }))).status).toBe(403);
  });
  it("run: 401 without admin", async () => {
    const res = await runRoute(req({ admin: false, body: {} }));
    expect(res.status).toBe(401);
    expect(runSvc.runAndPersistWaiterSimulation).not.toHaveBeenCalled();
  });
  it("history: 401 without admin", async () => {
    expect((await historyRoute(req({ admin: false }))).status).toBe(401);
  });
  it("detail: 401 without admin", async () => {
    expect((await detailRoute(req({ admin: false }), { params: { runId: "r1" } })).status).toBe(401);
  });
});

describe("run simulation", () => {
  it("runs and returns a summary (dry-run)", async () => {
    const res = await runRoute(req({ admin: true, body: { scenarioCount: 12 } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.runId).toBe("r1");
    expect(json.summary.scenariosTotal).toBe(12);
    expect(json.runtimeTouched).toBe(false);
  });

  it("allows an empty body (uses defaults)", async () => {
    const res = await runRoute(req({ admin: true })); // json() throws → defaults
    expect(res.status).toBe(200);
    expect(runSvc.runAndPersistWaiterSimulation).toHaveBeenCalled();
  });
});

describe("history + detail", () => {
  it("history returns runs", async () => {
    store.listRuns.mockResolvedValue([{ id: "r1" }]);
    const res = await historyRoute(req({ admin: true }));
    expect((await res.json()).runs).toHaveLength(1);
  });
  it("detail 404 when missing", async () => {
    store.getRunDetail.mockResolvedValue(null);
    const res = await detailRoute(req({ admin: true }), { params: { runId: "nope" } });
    expect(res.status).toBe(404);
  });
});

describe("(P12-api.4) opportunity update — human review", () => {
  it("updates a valid status", async () => {
    const res = await oppRoute(req({ admin: true, body: { status: "APPROVED", reviewedBy: "diego" } }), { params: { id: "o1" } });
    expect(res.status).toBe(200);
    expect(store.updateOpportunityStatus).toHaveBeenCalledWith("o1", "APPROVED", "diego");
  });
  it("rejects an invalid status (400)", async () => {
    const res = await oppRoute(req({ admin: true, body: { status: "WHATEVER" } }), { params: { id: "o1" } });
    expect(res.status).toBe(400);
    expect(store.updateOpportunityStatus).not.toHaveBeenCalled();
  });
});
