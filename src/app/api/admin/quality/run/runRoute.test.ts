import { describe, it, expect, beforeEach, vi } from "vitest";

const checkAdminRequest = vi.fn();
const handleQualityRun = vi.fn();
const persistRun = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a) }));
vi.mock("@/services/quality/runRequest", () => ({ handleQualityRun: (...a: unknown[]) => handleQualityRun(...a) }));
vi.mock("@/services/quality/persistence/QualityAuditStore", () => ({ persistRun: (...a: unknown[]) => persistRun(...a) }));

import { POST } from "./route";

function req(body: unknown) {
  return { text: async () => JSON.stringify(body) } as unknown as Parameters<typeof POST>[0];
}

const okResult = {
  ok: true, mode: "all" as const,
  result: { auditorIds: ["waiter"], globalStatus: "WARNING" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "test-secret";
});

describe("POST /api/admin/quality/run", () => {
  it("(8) requires admin auth — 401 when unauthorized", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(handleQualityRun).not.toHaveBeenCalled();
  });

  it("(1) persists a successful run and returns its runId", async () => {
    checkAdminRequest.mockReturnValue(true);
    handleQualityRun.mockResolvedValue({ httpStatus: 200, payload: { ...okResult } });
    persistRun.mockResolvedValue("qar_123");

    const res = await POST(req({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(persistRun).toHaveBeenCalledTimes(1);
    expect(body.runId).toBe("qar_123");
    expect(persistRun.mock.calls[0][1]).toMatchObject({ source: "MANUAL" });
  });

  it("(6) persists auditorId for a single-auditor run", async () => {
    checkAdminRequest.mockReturnValue(true);
    handleQualityRun.mockResolvedValue({
      httpStatus: 200,
      payload: { ok: true, mode: "one", result: { auditorIds: ["crm"], globalStatus: "PASS" } },
    });
    persistRun.mockResolvedValue("qar_2");
    await POST(req({ auditorId: "crm" }));
    expect(persistRun.mock.calls[0][1]).toMatchObject({ source: "MANUAL", auditorId: "crm" });
  });

  it("persistence failure is non-fatal — still returns the audit result", async () => {
    checkAdminRequest.mockReturnValue(true);
    handleQualityRun.mockResolvedValue({ httpStatus: 200, payload: { ...okResult } });
    persistRun.mockRejectedValue(new Error("db down"));
    const res = await POST(req({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.runId).toBeUndefined();
  });

  it("does not persist a failed/unauthorized run", async () => {
    checkAdminRequest.mockReturnValue(true);
    handleQualityRun.mockResolvedValue({ httpStatus: 404, payload: { ok: false, mode: "one", error: "x", code: "NOT_FOUND" } });
    await POST(req({ auditorId: "nope" }));
    expect(persistRun).not.toHaveBeenCalled();
  });
});
