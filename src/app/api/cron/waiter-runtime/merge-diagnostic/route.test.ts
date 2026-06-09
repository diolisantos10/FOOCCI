import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const runDiag = vi.fn();
vi.mock("@/services/waiterRuntime/mergeDiagnostic", () => ({
  runWaiterRuntimeMergeDiagnostic: (...a: unknown[]) => runDiag(...a),
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof POST>[0];
}

const PASS = {
  ok: true, status: "PASS", versionCreated: true, techniqueCreated: true, qualityGateP0: 0,
  activated: true, bridgeEnabled: true, promptBlockIncludedTechnique: true, rolledBack: true,
  fallbackCurrent: true, cleanup: true, runtimeTouched: false, message: "ok",
};

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  runDiag.mockResolvedValue(PASS);
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/waiter-runtime/merge-diagnostic", () => {
  it("requires a Bearer CRON_SECRET — 401 without it, does not run", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("rejects an invalid secret — 401", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer whatever" }));
    expect(res.status).toBe(503);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("valid secret runs the diagnostic and returns PASS with all flags", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runDiag).toHaveBeenCalledTimes(1);
    expect(body.status).toBe("PASS");
    expect(body.activated).toBe(true);
    expect(body.bridgeEnabled).toBe(true);
    expect(body.promptBlockIncludedTechnique).toBe(true);
    expect(body.rolledBack).toBe(true);
    expect(body.fallbackCurrent).toBe(true);
    expect(body.cleanup).toBe(true);
    expect(body.runtimeTouched).toBe(false);
    expect(body.qualityGateP0).toBe(0);
  });

  it("propagates a controlled FAIL result (still 200)", async () => {
    runDiag.mockResolvedValue({ ...PASS, ok: false, status: "FAIL", stage: "bridge_check", message: "x" });
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("FAIL");
    expect(body.stage).toBe("bridge_check");
    expect(body.runtimeTouched).toBe(false);
  });

  it("does not expose a GET handler (POST only)", () => {
    expect(typeof POST).toBe("function");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
