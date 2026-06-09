import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const runDiag = vi.fn();
vi.mock("@/services/agentLibrary/deepExtraction/deepExtractionDiagnostic", () => ({
  runDeepExtractionDiagnostic: (...a: unknown[]) => runDiag(...a),
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  runDiag.mockResolvedValue({ ok: true, status: "PASS", agentSlug: "waiter", techniquesCreated: 3, sourceCleanedUp: true, runtimeTouched: false, message: "ok" });
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/agent-library/deep-diagnostic", () => {
  it("(1) requires a Bearer CRON_SECRET — 401 without it, does not run", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("(3) rejects an invalid secret — 401", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("(2) 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer whatever" }));
    expect(res.status).toBe(503);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("(5)(7)(8) valid secret runs the deep diagnostic and returns PASS", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runDiag).toHaveBeenCalledTimes(1);
    expect(body.status).toBe("PASS");
    expect(body.techniquesCreated).toBe(3);
    expect(body.sourceCleanedUp).toBe(true);
    expect(body.runtimeTouched).toBe(false);
  });

  it("(6) propagates a controlled FAIL result (still 200)", async () => {
    runDiag.mockResolvedValue({ ok: false, status: "FAIL", stage: "consolidate", message: "0 técnicas", sourceCleanedUp: true, runtimeTouched: false });
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("FAIL");
    expect(body.stage).toBe("consolidate");
    expect(body.runtimeTouched).toBe(false);
  });

  it("(4) does not expose a GET handler (POST only)", () => {
    expect(typeof POST).toBe("function");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
