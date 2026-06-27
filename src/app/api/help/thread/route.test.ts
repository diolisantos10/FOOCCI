import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/help/thread", () => {
  it("returns 401 when there is no tenant context", async () => {
    // No middleware-injected tenant headers → getTenantContext returns null.
    const req = { headers: new Headers() } as unknown as Parameters<typeof GET>[0];
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
