import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentSimulationExample: { create: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
}));
const store = vi.hoisted(() => ({ reviewExample: vi.fn(), getApprovedExampleSeeds: vi.fn() }));
const sim = vi.hoisted(() => ({ runWaiterSimulation: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./SimulationExampleStore", () => store);
vi.mock("../waiter/runWaiterSimulation", () => sim);

import { runExamplesDiagnostic } from "./examplesDiagnostic";

function simResult(over: Record<string, unknown> = {}) {
  return {
    p0Count: 0,
    scenarios: [
      { scenario: { customerConstraints: { inspiredByExampleId: "e1" }, initialMessage: "quero algo barato" }, output: { finalMessage: "tenho boas opções em conta" } },
      { scenario: { customerConstraints: {}, initialMessage: "me ajuda?" }, output: { finalMessage: "claro" } },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.agentSimulationExample.create.mockResolvedValue({ id: "e1", status: "PENDING_REVIEW", isApprovedForSimulation: false });
  db.agentSimulationExample.deleteMany.mockResolvedValue({ count: 1 });
  db.agentSimulationExample.count.mockResolvedValue(0);
  store.reviewExample.mockResolvedValue({ id: "e1", isApprovedForSimulation: true });
  store.getApprovedExampleSeeds.mockResolvedValue([{ exampleId: "e1", intent: "preço/orçamento", scenarioType: "BUDGET_CUSTOMER" }]);
  sim.runWaiterSimulation.mockResolvedValue(simResult());
});

describe("runExamplesDiagnostic", () => {
  it("(P12.4/5/7/8/12/13) full PASS — sanitized, pending→approved, inspires generator, no leak, cleanup", async () => {
    const r = await runExamplesDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.exampleCreated).toBe(true);
    expect(r.sanitizationPassed).toBe(true);
    expect(r.approvedForSimulation).toBe(true);
    expect(r.inspiredScenarios).toBeGreaterThanOrEqual(1);
    expect(r.literalLeak).toBe(false);
    expect(r.piiLeak).toBe(false);
    expect(r.p0Count).toBe(0);
    expect(r.runtimeTouched).toBe(false);
    expect(r.cleanup).toBe(true);
  });

  it("(P3) stores a SANITIZED transcript — no raw PII reaches the create call", async () => {
    await runExamplesDiagnostic();
    const data = db.agentSimulationExample.create.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING_REVIEW");
    expect(data.isApprovedForSimulation).toBe(false);
    for (const pii of ["Maria", "11999998888", "maria@email.com", "Rua das Flores", "123.456.789-09"]) {
      expect(data.sanitizedTranscript).not.toContain(pii);
    }
  });

  it("(P12.6/9/10) FAILs on a literal/PII leak in generated text and still cleans up", async () => {
    sim.runWaiterSimulation.mockResolvedValue(simResult({
      scenarios: [{ scenario: { customerConstraints: { inspiredByExampleId: "e1" }, initialMessage: "meu telefone é 11999998888" }, output: { finalMessage: "ok" } }],
    }));
    const r = await runExamplesDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.piiLeak || r.literalLeak).toBe(true);
    expect(r.cleanup).toBe(true);
  });

  it("(P12.11) always cleans up the synthetic example even on an exception", async () => {
    store.reviewExample.mockRejectedValue(new Error("boom"));
    const r = await runExamplesDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(db.agentSimulationExample.deleteMany).toHaveBeenCalled();
    expect(r.cleanup).toBe(true);
  });
});
