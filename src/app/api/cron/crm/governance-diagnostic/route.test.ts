import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as routeModule from "./route";

const runDiag = vi.fn();
vi.mock("@/services/crm/crmGovernanceDiagnostic", () => ({ runGovernanceDiagnostic: (...a: unknown[]) => runDiag(...a) }));

import { POST } from "./route";

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as unknown as Parameters<typeof POST>[0];
}

const PASS = { ok: true, status: "PASS", ledgerAvailable: true, campaignIdentityAvailable: true, preflightWorks: true, dedupeWorks: true, reasonCodesWork: true, cleanup: true, runtimeTouched: false, message: "ok" };

const OLD = process.env.CRON_SECRET;
beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = "s3cr3t"; runDiag.mockResolvedValue(PASS); });
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/crm/governance-diagnostic", () => {
  it("401 without bearer, does not run", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });
  it("503 without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(req({ authorization: "Bearer x" }))).status).toBe(503);
  });
  it("runs with a valid secret → PASS + runtimeTouched false", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("PASS");
    expect(body.ledgerAvailable).toBe(true);
    expect(body.runtimeTouched).toBe(false);
  });
  it("POST only — no GET handler", () => {
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
