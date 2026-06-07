import { describe, it, expect } from "vitest";
import {
  WAITER_TEST_COVERAGE,
  WAITER_EVAL_CRITERIA,
  WAITER_INTELLIGENCE_BACKLOG,
  WAITER_TOMORROW_PLAN,
  COVERAGE_LABELS,
  backlogByPriority,
  coverageSummary,
  backlogSummary,
} from "./waiterIntelligenceBacklog";

describe("waiterIntelligenceBacklog — coverage", () => {
  it("maps the 20 critical scenarios with a known status each", () => {
    expect(WAITER_TEST_COVERAGE.length).toBe(20);
    for (const c of WAITER_TEST_COVERAGE) {
      expect(COVERAGE_LABELS[c.status]).toBeTruthy();
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("coverageSummary partitions all scenarios", () => {
    const s = coverageSummary();
    expect(s.total).toBe(20);
    expect(s.automated + s.partial + s.manual + s.gap).toBe(s.total);
    expect(s.automated).toBeGreaterThan(0);
  });

  it("flags price + abandon as not-yet-automated (GAP)", () => {
    const byId = new Map(WAITER_TEST_COVERAGE.map((c) => [c.id, c]));
    expect(byId.get("price")?.status).toBe("GAP");
    expect(byId.get("abandon")?.status).toBe("GAP");
    expect(byId.get("no_hallucination")?.status).toBe("AUTOMATED");
  });
});

describe("waiterIntelligenceBacklog — criteria", () => {
  it("marks anti-hallucination as automated and '≤3 sugestões' as not automated", () => {
    const real = WAITER_EVAL_CRITERIA.find((c) => c.label === "Não inventa produto");
    expect(real?.automated).toBe(true);
    const three = WAITER_EVAL_CRITERIA.find((c) => c.label.includes("até 3"));
    expect(three?.automated).toBe(false);
  });
});

describe("waiterIntelligenceBacklog — backlog", () => {
  it("has P0/P1/P2 items and a consistent summary", () => {
    const s = backlogSummary();
    expect(s.p0).toBeGreaterThanOrEqual(1);
    expect(s.p1).toBeGreaterThanOrEqual(1);
    expect(s.p2).toBeGreaterThanOrEqual(1);
    expect(s.total).toBe(WAITER_INTELLIGENCE_BACKLOG.length);
    expect(s.p0 + s.p1 + s.p2).toBe(s.total);
  });

  it("every backlog item carries the required fields", () => {
    for (const b of WAITER_INTELLIGENCE_BACKLOG) {
      expect(b.title).toBeTruthy();
      expect(b.problem).toBeTruthy();
      expect(b.nextStep).toBeTruthy();
      expect(["P0", "P1", "P2"]).toContain(b.priority);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(b.risk);
    }
  });

  it("backlogByPriority filters correctly", () => {
    expect(backlogByPriority("P0").every((b) => b.priority === "P0")).toBe(true);
  });

  it("tomorrow plan starts by opening the Waiter Room", () => {
    expect(WAITER_TOMORROW_PLAN[0]).toMatch(/admin\/agents\/waiter/);
    expect(WAITER_TOMORROW_PLAN.length).toBeGreaterThanOrEqual(10);
  });
});
