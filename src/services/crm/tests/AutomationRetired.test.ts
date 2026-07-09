import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  cRMAutomation: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { AutomationSchedulerService } from "../AutomationSchedulerService";

beforeEach(() => vi.clearAllMocks());

describe("legacy automation engine — RETIRED", () => {
  it("sends nothing even when enabled automations exist (replaced by ready-made campaigns)", async () => {
    db.cRMAutomation.findMany.mockResolvedValue([
      { id: "a1", trigger: "BIRTHDAY", isEnabled: true, messageTemplate: "oi" },
      { id: "a2", trigger: "POST_ORDER", isEnabled: true, messageTemplate: "oi" },
    ]);
    const r = await AutomationSchedulerService.runEnabledAutomations("r1");
    expect(r.automationsRun).toBe(0);
    expect(r.totalSent).toBe(0);
    expect(r.results).toEqual([]);
  });

  it("is a no-op with no automations", async () => {
    db.cRMAutomation.findMany.mockResolvedValue([]);
    const r = await AutomationSchedulerService.runEnabledAutomations("r1");
    expect(r.automationsRun).toBe(0);
    expect(r.totalSent).toBe(0);
  });
});
