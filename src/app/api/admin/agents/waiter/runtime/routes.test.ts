import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the underlying services so these tests exercise the HTTP/guard layer only.
const versionSvc = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getActiveVersion: vi.fn(),
  createDraft: vi.fn(),
  getVersion: vi.fn(),
  assignTechniques: vi.fn(),
  markTesting: vi.fn(),
  activateVersion: vi.fn(),
  rollbackVersion: vi.fn(),
}));
const curationSvc = vi.hoisted(() => ({
  listTechniques: vi.fn(),
  activateTechnique: vi.fn(),
  setRuntimeEnabled: vi.fn(),
  setPriority: vi.fn(),
  rejectTechnique: vi.fn(),
  archiveTechnique: vi.fn(),
}));

vi.mock("@/services/waiterRuntime/WaiterRuntimeVersionService", () => versionSvc);
vi.mock("@/services/waiterRuntime/TechniqueCurationService", () => curationSvc);

import { GET as listVersionsRoute, POST as createVersionRoute } from "./versions/route";
import { POST as versionActionRoute } from "./versions/[id]/route";
import { POST as techniqueActionRoute } from "./techniques/[id]/route";

const SECRET = "admin-s3cr3t";

function req(opts: { admin?: boolean; body?: unknown; url?: string } = {}) {
  const headers = new Map<string, string>();
  if (opts.admin) headers.set("x-admin-secret", SECRET);
  return {
    url: opts.url ?? "http://localhost/api/admin/agents/waiter/runtime/versions",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: () => undefined },
    json: async () => opts.body ?? {},
  } as unknown as Parameters<typeof createVersionRoute>[0];
}

const OLD = process.env.ADMIN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = SECRET;
});
afterEach(() => { process.env.ADMIN_SECRET = OLD; });

describe("Waiter runtime admin APIs — auth (P12-api.1)", () => {
  it("403 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await listVersionsRoute(req({ admin: true }));
    expect(res.status).toBe(403);
  });

  it("401 when not an authenticated admin", async () => {
    const res = await listVersionsRoute(req({ admin: false }));
    expect(res.status).toBe(401);
    expect(versionSvc.listVersions).not.toHaveBeenCalled();
  });

  it("200 for an authenticated admin", async () => {
    versionSvc.listVersions.mockResolvedValue([]);
    versionSvc.getActiveVersion.mockResolvedValue(null);
    const res = await listVersionsRoute(req({ admin: true }));
    expect(res.status).toBe(200);
  });
});

describe("create / activate / rollback versions (P12-api.3)", () => {
  it("creates a draft", async () => {
    versionSvc.createDraft.mockResolvedValue({ id: "vNew", status: "DRAFT" });
    const res = await createVersionRoute(req({ admin: true, body: { name: "v1", mode: "LIBRARY_ASSISTED" } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(versionSvc.createDraft).toHaveBeenCalled();
  });

  it("rejects a draft with no name (400)", async () => {
    const res = await createVersionRoute(req({ admin: true, body: {} }));
    expect(res.status).toBe(400);
  });

  it("activate returns 422 when the Quality gate blocks it", async () => {
    versionSvc.activateVersion.mockResolvedValue({ ok: false, versionId: "v1", gate: { p0Count: 2 }, reason: "blocked" });
    const res = await versionActionRoute(req({ admin: true, body: { action: "activate" } }), { params: { id: "v1" } });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("activate returns 200 when the gate passes", async () => {
    versionSvc.activateVersion.mockResolvedValue({ ok: true, versionId: "v1", gate: { p0Count: 0 }, reason: "ok" });
    const res = await versionActionRoute(req({ admin: true, body: { action: "activate" } }), { params: { id: "v1" } });
    expect(res.status).toBe(200);
  });

  it("rollback is allowed (gate-free) and returns 200", async () => {
    versionSvc.rollbackVersion.mockResolvedValue({ ok: true, versionId: "v1", restoredVersionId: null, mode: "CURRENT_FALLBACK" });
    const res = await versionActionRoute(req({ admin: true, body: { action: "rollback" } }), { params: { id: "v1" } });
    expect(res.status).toBe(200);
    expect(versionSvc.rollbackVersion).toHaveBeenCalled();
  });
});

describe("technique curation (P12-api.2)", () => {
  it("activate then enable are two distinct actions", async () => {
    curationSvc.activateTechnique.mockResolvedValue({ id: "t1", status: "ACTIVE" });
    curationSvc.setRuntimeEnabled.mockResolvedValue({ id: "t1", runtimeEnabled: true });

    const r1 = await techniqueActionRoute(req({ admin: true, body: { action: "activate" } }), { params: { id: "t1" } });
    expect(r1.status).toBe(200);
    expect(curationSvc.activateTechnique).toHaveBeenCalledWith("t1", null);

    const r2 = await techniqueActionRoute(req({ admin: true, body: { action: "enable" } }), { params: { id: "t1" } });
    expect(r2.status).toBe(200);
    expect(curationSvc.setRuntimeEnabled).toHaveBeenCalledWith("t1", true);
  });

  it("rejects an unknown action (400)", async () => {
    const res = await techniqueActionRoute(req({ admin: true, body: { action: "nuke" } }), { params: { id: "t1" } });
    expect(res.status).toBe(400);
  });
});
