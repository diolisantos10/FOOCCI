import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const model = vi.hoisted(() => ({ getSimulationCockpit: vi.fn() }));
vi.mock("@/services/simulation/cockpitModel", () => model);

import { GET } from "./route";

const SECRET = "admin-s3cr3t";
function req(admin: boolean) {
  const headers = new Map<string, string>();
  if (admin) headers.set("x-admin-secret", SECRET);
  return {
    url: "http://localhost/api/admin/agents/waiter/simulation/cockpit",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    cookies: { get: () => undefined },
  } as unknown as Parameters<typeof GET>[0];
}

const OLD = process.env.ADMIN_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = SECRET;
  model.getSimulationCockpit.mockResolvedValue({ automation: { isAutomated: true }, pendingOpportunityCount: 0 });
});
afterEach(() => { process.env.ADMIN_SECRET = OLD; });

describe("GET /api/admin/agents/waiter/simulation/cockpit", () => {
  it("403 without ADMIN_SECRET", async () => {
    delete process.env.ADMIN_SECRET;
    expect((await GET(req(true))).status).toBe(403);
  });
  it("401 without admin", async () => {
    expect((await GET(req(false))).status).toBe(401);
    expect(model.getSimulationCockpit).not.toHaveBeenCalled();
  });
  it("200 returns the cockpit for an admin", async () => {
    const res = await GET(req(true));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.cockpit.automation.isAutomated).toBe(true);
  });
});
