import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const runDiag = vi.fn();
vi.mock("@/services/simulation/examples/examplesDiagnostic", () => ({
  runExamplesDiagnostic: (...a: unknown[]) => runDiag(...a),
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof POST>[0];
}

const PASS = {
  ok: true, status: "PASS", exampleCreated: true, sanitizationPassed: true, approvedForSimulation: true,
  inspiredScenarios: 3, literalLeak: false, piiLeak: false, p0Count: 0, runtimeTouched: false, cleanup: true, message: "ok",
};

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  runDiag.mockResolvedValue(PASS);
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/agents/waiter/simulation/examples-diagnostic", () => {
  it("(1) requires Bearer CRON_SECRET — 401 without it, does not run", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });
  it("(3) rejects invalid secret — 401", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });
  it("(2) 503 when CRON_SECRET not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer x" }));
    expect(res.status).toBe(503);
    expect(runDiag).not.toHaveBeenCalled();
  });
  it("valid secret runs the diagnostic and returns PASS with all flags", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("PASS");
    expect(body.sanitizationPassed).toBe(true);
    expect(body.approvedForSimulation).toBe(true);
    expect(body.inspiredScenarios).toBe(3);
    expect(body.literalLeak).toBe(false);
    expect(body.piiLeak).toBe(false);
    expect(body.runtimeTouched).toBe(false);
    expect(body.cleanup).toBe(true);
  });
  it("propagates a controlled FAIL (still 200)", async () => {
    runDiag.mockResolvedValue({ ...PASS, ok: false, status: "FAIL", stage: "sanitization" });
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("FAIL");
  });
  it("(14) POST only — no GET handler", () => {
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
