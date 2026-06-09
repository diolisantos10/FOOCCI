import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const store = vi.hoisted(() => ({ listExamples: vi.fn(), exampleStats: vi.fn(), reviewExample: vi.fn() }));
const extractor = vi.hoisted(() => ({ extractExamples: vi.fn() }));

vi.mock("@/services/simulation/examples/SimulationExampleStore", () => store);
vi.mock("@/services/simulation/examples/SimulationExampleExtractor", () => extractor);

import { GET as listRoute } from "./route";
import { POST as extractRoute } from "./extract/route";
import { PATCH as reviewRoute } from "./[id]/route";

const SECRET = "admin-s3cr3t";
function req(opts: { admin?: boolean; body?: unknown; url?: string } = {}) {
  const headers = new Map<string, string>();
  if (opts.admin) headers.set("x-admin-secret", SECRET);
  return {
    url: opts.url ?? "http://localhost/api/admin/agents/waiter/simulation/examples",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: () => undefined },
    json: async () => { if (opts.body === undefined) throw new Error("no body"); return opts.body; },
  } as unknown as Parameters<typeof listRoute>[0];
}

const OLD = process.env.ADMIN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = SECRET;
  store.listExamples.mockResolvedValue([]);
  store.exampleStats.mockResolvedValue({ total: 0, approved: 0, pending: 0, rejected: 0 });
  store.reviewExample.mockResolvedValue({ id: "e1", status: "APPROVED" });
  extractor.extractExamples.mockResolvedValue({ ok: true, created: 3, skipped: 7, pendingReview: 3 });
});
afterEach(() => { process.env.ADMIN_SECRET = OLD; });

describe("example admin APIs — auth", () => {
  it("list: 401 without admin", async () => {
    expect((await listRoute(req({ admin: false }))).status).toBe(401);
    expect(store.listExamples).not.toHaveBeenCalled();
  });
  it("extract: 401 without admin", async () => {
    expect((await extractRoute(req({ admin: false, body: {} }))).status).toBe(401);
    expect(extractor.extractExamples).not.toHaveBeenCalled();
  });
  it("list: 403 when ADMIN_SECRET missing", async () => {
    delete process.env.ADMIN_SECRET;
    expect((await listRoute(req({ admin: true }))).status).toBe(403);
  });
});

describe("example admin APIs — behaviour", () => {
  it("lists examples + stats", async () => {
    store.listExamples.mockResolvedValue([{ id: "e1" }]);
    const res = await listRoute(req({ admin: true }));
    const json = await res.json();
    expect(json.examples).toHaveLength(1);
    expect(json.stats).toBeDefined();
  });

  it("extracts (admin-triggered) and returns counts", async () => {
    const res = await extractRoute(req({ admin: true, body: { limit: 50, days: 30 } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.created).toBe(3);
    expect(extractor.extractExamples).toHaveBeenCalled();
  });

  it("(P12-ex.7) review APPROVED makes it usable; invalid status → 400", async () => {
    const ok = await reviewRoute(req({ admin: true, body: { status: "APPROVED" } }), { params: { id: "e1" } });
    expect(ok.status).toBe(200);
    expect(store.reviewExample).toHaveBeenCalledWith("e1", "APPROVED", null);

    const bad = await reviewRoute(req({ admin: true, body: { status: "NOPE" } }), { params: { id: "e1" } });
    expect(bad.status).toBe(400);
  });
});
