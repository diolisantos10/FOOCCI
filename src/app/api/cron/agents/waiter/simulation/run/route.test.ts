import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const runSvc = vi.hoisted(() => ({ runAndPersistWaiterSimulation: vi.fn() }));
vi.mock("@/services/simulation/waiter/runWaiterSimulation", () => runSvc);

import { POST } from "./route";

function req(headers: Record<string, string> = {}, body: unknown = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  runSvc.runAndPersistWaiterSimulation.mockResolvedValue({
    runId: "r1",
    result: { scenariosTotal: 12, scenariosPassed: 12, scenariosWarning: 0, scenariosFailed: 0, p0Count: 0, opportunityCount: 0 },
  });
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/agents/waiter/simulation/run", () => {
  it("401 without bearer secret, does not run", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runSvc.runAndPersistWaiterSimulation).not.toHaveBeenCalled();
  });
  it("503 when CRON_SECRET not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer x" }));
    expect(res.status).toBe(503);
  });
  it("runs with a valid secret and returns PASS + runtimeTouched false", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("PASS");
    expect(body.runtimeTouched).toBe(false);
    expect(body.p0Count).toBe(0);
  });

  it("(P12-auto.5) records the run with mode=CRON", async () => {
    await POST(req({ authorization: "Bearer s3cr3t" }));
    expect(runSvc.runAndPersistWaiterSimulation).toHaveBeenCalledWith(expect.objectContaining({ mode: "CRON" }));
  });
  it("does not expose a GET handler (POST only)", () => {
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
