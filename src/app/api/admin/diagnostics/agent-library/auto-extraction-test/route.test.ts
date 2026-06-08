import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const checkAdminRequest = vi.fn();
const runDiag = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a) }));
vi.mock("@/services/agentLibrary/autoExtractionDiagnostic", () => ({
  runAutoExtractionDiagnostic: (...a: unknown[]) => runDiag(...a),
}));

import { POST } from "./route";

function req() {
  return {} as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.ADMIN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "test-secret";
  runDiag.mockResolvedValue({ ok: true, status: "PASS", techniquesCreated: 3, sourceCleanedUp: true, runtimeTouched: false });
});
afterEach(() => { process.env.ADMIN_SECRET = OLD; });

describe("POST /api/admin/diagnostics/agent-library/auto-extraction-test", () => {
  it("(10) requires admin auth — 401 when unauthorized, does not run the diagnostic", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("is disabled (403) when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(runDiag).not.toHaveBeenCalled();
  });

  it("runs the diagnostic and returns its result when authorized", async () => {
    checkAdminRequest.mockReturnValue(true);
    const res = await POST(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runDiag).toHaveBeenCalledTimes(1);
    expect(body.status).toBe("PASS");
    expect(body.runtimeTouched).toBe(false);
  });
});
