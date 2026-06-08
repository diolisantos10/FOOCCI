import { describe, it, expect, beforeEach, vi } from "vitest";

const checkAdminRequest = vi.fn();
const listHistory = vi.fn();
const getRunWithFindings = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ checkAdminRequest: (...a: unknown[]) => checkAdminRequest(...a) }));
vi.mock("@/services/quality/persistence/QualityAuditStore", () => ({
  listHistory: (...a: unknown[]) => listHistory(...a),
  getRunWithFindings: (...a: unknown[]) => getRunWithFindings(...a),
}));

import { GET } from "./route";

function req(url: string) {
  return { url } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = "test-secret";
});

describe("GET /api/admin/quality/history", () => {
  it("(8) requires admin auth — 401 when unauthorized", async () => {
    checkAdminRequest.mockReturnValue(false);
    const res = await GET(req("http://localhost/api/admin/quality/history"));
    expect(res.status).toBe(401);
    expect(listHistory).not.toHaveBeenCalled();
  });

  it("(3) returns latest + recent runs when authorized", async () => {
    checkAdminRequest.mockReturnValue(true);
    listHistory.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    const res = await GET(req("http://localhost/api/admin/quality/history?limit=20"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.latest).toEqual({ id: "r1" });
    expect(body.runs).toHaveLength(2);
    expect(listHistory).toHaveBeenCalledWith(20);
  });

  it("returns a single run with findings when runId is provided", async () => {
    checkAdminRequest.mockReturnValue(true);
    listHistory.mockResolvedValue([{ id: "r1" }]);
    getRunWithFindings.mockResolvedValue({ id: "r1", findings: [{ id: "f1" }] });
    const res = await GET(req("http://localhost/api/admin/quality/history?runId=r1"));
    const body = await res.json();
    expect(body.run.id).toBe("r1");
    expect(getRunWithFindings).toHaveBeenCalledWith("r1");
  });

  it("is disabled (403) when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await GET(req("http://localhost/api/admin/quality/history"));
    expect(res.status).toBe(403);
  });
});
