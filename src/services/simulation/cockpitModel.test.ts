import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentSimulationRun: { findFirst: vi.fn() },
  agentSimulationOpportunity: { findMany: vi.fn(), groupBy: vi.fn() },
  agentSimulationScenario: { findMany: vi.fn() },
}));
const store = vi.hoisted(() => ({ exampleStats: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./examples/SimulationExampleStore", () => store);

import { getSimulationCockpit, nextScheduledRun } from "./cockpitModel";

function run(mode: string) {
  return { id: `r_${mode}`, mode, status: "COMPLETED", createdAt: new Date(), p0Count: 0, scenariosTotal: 12, scenariosPassed: 10, scenariosWarning: 2, scenariosFailed: 0, p1Count: 0, p2Count: 2, opportunityCount: 3 };
}

beforeEach(() => {
  vi.clearAllMocks();
  // findFirst is called in order: latest(any), latestManual, latestCron
  db.agentSimulationRun.findFirst
    .mockResolvedValueOnce(run("MANUAL"))   // latestRun
    .mockResolvedValueOnce(run("MANUAL"))   // latestManualRun
    .mockResolvedValueOnce(run("CRON"));    // latestCronRun
  db.agentSimulationOpportunity.findMany.mockResolvedValue([
    { id: "o1", type: "MISSED_SALE", severity: "P1", title: "Sem CTA", summary: "x", recommendation: "add CTA", status: "PENDING_REVIEW", scenario: { scenarioType: "RECOMMENDATION_REQUEST", persona: "p", initialMessage: "m" }, run: { mode: "CRON" } },
  ]);
  db.agentSimulationOpportunity.groupBy.mockResolvedValue([
    { status: "PENDING_REVIEW", _count: { _all: 1 } },
    { status: "APPROVED", _count: { _all: 2 } },
  ]);
  db.agentSimulationScenario.findMany.mockResolvedValue([
    { id: "s1", scenarioType: "INDECISIVE_CUSTOMER", persona: "p", initialMessage: "não sei", status: "PASS", severity: "INFO", score: 100, summary: "ok", transcript: "[]" },
  ]);
  store.exampleStats.mockResolvedValue({ total: 4, approved: 1, pending: 2, rejected: 1 });
});

describe("getSimulationCockpit", () => {
  it("assembles automation status, last cron/manual runs, pending opportunities, examples", async () => {
    const c = await getSimulationCockpit("waiter");
    expect(c.automation.isAutomated).toBe(true);
    expect(c.automation.scheduleLabel).toMatch(/03:45/);
    expect(c.latestCronRun?.mode).toBe("CRON");
    expect(c.latestManualRun?.mode).toBe("MANUAL");
    expect(c.pendingOpportunities).toHaveLength(1);
    expect(c.pendingOpportunityCount).toBe(1);
    expect(c.opportunitiesByStatus.APPROVED).toBe(2);
    expect(c.latestScenarios).toHaveLength(1);
    expect(c.exampleStats.approved).toBe(1);
    expect(c.runtimeSafety.runtimeTouched).toBe(false);
  });

  it("nextScheduledRun returns a future 06:45 UTC ISO", () => {
    const now = new Date("2026-06-09T10:00:00Z");
    const next = new Date(nextScheduledRun(now));
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getUTCHours()).toBe(6);
    expect(next.getUTCMinutes()).toBe(45);
  });

  it("degrades gracefully when the example store fails", async () => {
    store.exampleStats.mockRejectedValue(new Error("no table"));
    const c = await getSimulationCockpit("waiter");
    expect(c.exampleStats).toEqual({ total: 0, approved: 0, pending: 0, rejected: 0 });
  });
});
