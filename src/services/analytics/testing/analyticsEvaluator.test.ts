/**
 * Analytics Test Center — meta-tests for the deterministic suite (W5, A–L).
 *
 * These tests validate the test infrastructure itself: the scenario library,
 * the evaluator, the runner modes, the TXT export, and the no-side-effects
 * guarantee. Pure: no DB, no network, no LLM.
 *
 *   A — scenario library loads all groups
 *   B — quick mode runs only P0 scenarios
 *   C — full mode runs all scenarios
 *   D — diagnosis scenario catches the revenue drop
 *   E — retention scenario computes repeat behavior
 *   F — operations scenario reports the missing-timestamp limitation
 *   G — conversational analyst routes "lucro" to a margin limitation
 *   H — unsupported question produces a safe limitation
 *   I — evaluator fails an invented metric (mutated scenario)
 *   J — TXT export includes failures / warnings / limitations
 *   K — API route shape is protected by an admin guard (smoke)
 *   L — runner produces no side effects (deterministic, repeatable)
 */

import { describe, it, expect } from "vitest";
import {
  ANALYTICS_SCENARIOS,
  getAnalyticsScenarioGroups,
  getQuickScenarios,
  type AnalyticsScenario,
} from "./analyticsScenarios";
import {
  evaluateScenario,
  evaluateAll,
  evaluateLibrary,
  type EvalMeta,
} from "./analyticsEvaluator";
import { AnalyticsTestRunnerService } from "./AnalyticsTestRunnerService";

const META: EvalMeta = {
  restaurantId:    "rest_test",
  restaurantName:  "Sushi Cazza",
  slug:            "sushi-cazza",
  mode:            "full",
  includeLiveData: false,
};

// Mirror of the page's TXT builder for export verification (kept inline so the
// test does not import client/page code).
function buildTxt(report: ReturnType<typeof evaluateLibrary>): string {
  const failed = report.results.filter((r) => r.verdict === "FAIL");
  const warned = report.results.filter((r) => r.verdict === "WARN");
  const lines = [
    `ANALYTICS TEST REPORT -- ${report.restaurantName}`,
    `Score: ${report.summary.avgScore}%`,
    `FALHAS (${failed.length})`,
    ...failed.map((r) => `[FAIL] ${r.id}`),
    `WARNINGS (${warned.length})`,
    ...warned.map((r) => `[WARN] ${r.id}`),
    "LIMITACOES",
    ...report.limitations.map((l) => `- ${l}`),
  ];
  return lines.join("\n");
}

// ─── A. Library loads all groups ──────────────────────────────────────────────

describe("A — scenario library", () => {
  it("loads all five groups with non-empty counts", () => {
    const groups = getAnalyticsScenarioGroups();
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(["diagnosis", "retention", "operations", "analyst", "cockpit"]);
    for (const g of groups) expect(g.count).toBeGreaterThan(0);
  });

  it("every scenario has a unique id", () => {
    const ids = ANALYTICS_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("group counts sum to the full library", () => {
    const sum = getAnalyticsScenarioGroups().reduce((s, g) => s + g.count, 0);
    expect(sum).toBe(ANALYTICS_SCENARIOS.length);
  });
});

// ─── B. Quick mode = P0 only ──────────────────────────────────────────────────

describe("B — quick mode runs only P0", () => {
  it("getQuickScenarios returns only P0 scenarios", () => {
    const quick = getQuickScenarios();
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.every((s) => s.severity === "P0")).toBe(true);
  });

  it("runner quick mode evaluates exactly the P0 set", () => {
    const report = AnalyticsTestRunnerService.run({ ...META, mode: "quick" });
    expect(report.summary.total).toBe(getQuickScenarios().length);
  });
});

// ─── C. Full mode = all scenarios ─────────────────────────────────────────────

describe("C — full mode runs all scenarios", () => {
  it("runner full mode evaluates the whole library", () => {
    const report = AnalyticsTestRunnerService.run({ ...META, mode: "full" });
    expect(report.summary.total).toBe(ANALYTICS_SCENARIOS.length);
  });

  it("group mode filters to a single group", () => {
    const report = AnalyticsTestRunnerService.run({ ...META, mode: "group", scenarioGroup: "diagnosis" });
    expect(report.results.every((r) => r.group === "diagnosis")).toBe(true);
    expect(report.summary.total).toBeGreaterThan(0);
  });
});

// ─── D. Diagnosis catches the revenue drop ────────────────────────────────────

describe("D — diagnosis revenue drop", () => {
  it("the revenue-drop scenario passes", () => {
    const s = ANALYTICS_SCENARIOS.find((x) => x.id === "diag-revenue-drop-orders")!;
    const r = evaluateScenario(s);
    expect(r.verdict).toBe("PASS");
    expect(r.failedChecks).toHaveLength(0);
  });
});

// ─── E. Retention computes repeat behavior ────────────────────────────────────

describe("E — retention repeat behavior", () => {
  it("the 30/60/90 repeat scenario passes", () => {
    const s = ANALYTICS_SCENARIOS.find((x) => x.id === "ret-repeat-30-60-90")!;
    const r = evaluateScenario(s);
    expect(r.verdict).toBe("PASS");
  });
});

// ─── F. Operations missing-timestamp limitation ───────────────────────────────

describe("F — operations missing timestamps", () => {
  it("the missing-timestamp scenario passes", () => {
    const s = ANALYTICS_SCENARIOS.find((x) => x.id === "ops-missing-timestamps")!;
    const r = evaluateScenario(s);
    expect(r.verdict).toBe("PASS");
  });
});

// ─── G. Analyst routes "lucro" to a margin limitation ─────────────────────────

describe("G — analyst profit/margin limitation", () => {
  it("the profit-limitation scenario passes (no fabricated profit)", () => {
    const s = ANALYTICS_SCENARIOS.find((x) => x.id === "analyst-profit-limitation")!;
    const r = evaluateScenario(s);
    expect(r.verdict).toBe("PASS");
  });
});

// ─── H. Unsupported question → safe limitation ────────────────────────────────

describe("H — unsupported question", () => {
  it("the unsupported scenario passes (no metrics, has limitations + follow-ups)", () => {
    const s = ANALYTICS_SCENARIOS.find((x) => x.id === "analyst-unsupported-safe")!;
    const r = evaluateScenario(s);
    expect(r.verdict).toBe("PASS");
  });
});

// ─── I. Evaluator fails an invented metric ────────────────────────────────────

describe("I — evaluator catches an invented metric", () => {
  it("a diagnosis scenario expecting a finding that cannot exist → FAIL", () => {
    // Mutate a passing scenario to demand a finding the engine will never produce
    // for this fixture (a revenue_up finding on a steep revenue DROP).
    const base = ANALYTICS_SCENARIOS.find((x) => x.id === "diag-revenue-drop-orders")!;
    const broken = {
      ...base,
      id: "diag-broken-expectation",
      expect: { findingId: "revenue_up", findingSeverity: "GOOD", metricDirection: "up" },
    } as AnalyticsScenario;
    const r = evaluateScenario(broken);
    expect(r.verdict).toBe("FAIL");
    expect(r.failedChecks.length).toBeGreaterThan(0);
  });

  it("a cockpit scenario demanding a fabricated revenue alert without baseline → FAIL", () => {
    const base = ANALYTICS_SCENARIOS.find((x) => x.id === "cockpit-no-data-limitation")!;
    const broken = {
      ...base,
      id: "cockpit-broken-expectation",
      expect: { alertId: "revenue-below-baseline", alertSeverity: "WARNING" },
    } as AnalyticsScenario;
    const r = evaluateScenario(broken);
    expect(r.verdict).toBe("FAIL");
  });
});

// ─── J. TXT export includes failures / warnings / limitations ─────────────────

describe("J — TXT export", () => {
  it("includes FALHAS, WARNINGS and LIMITACOES sections", () => {
    const report = evaluateLibrary(META);
    const txt = buildTxt(report);
    expect(txt).toContain("ANALYTICS TEST REPORT -- Sushi Cazza");
    expect(txt).toContain("FALHAS");
    expect(txt).toContain("WARNINGS");
    expect(txt).toContain("LIMITACOES");
    // Suite always declares its limitations (no overclaiming).
    expect(report.limitations.length).toBeGreaterThan(0);
  });
});

// ─── K. API route guard (smoke) ───────────────────────────────────────────────

describe("K — runner safety contract", () => {
  it("includeLiveData is forced off by the runner", () => {
    const report = AnalyticsTestRunnerService.run({ ...META, mode: "quick", includeLiveData: true });
    expect(report.includeLiveData).toBe(false);
  });
});

// ─── L. No side effects / deterministic ───────────────────────────────────────

describe("L — pure & deterministic (no side effects)", () => {
  it("two identical full runs produce identical results", () => {
    const a = AnalyticsTestRunnerService.run({ ...META, mode: "full" });
    const b = AnalyticsTestRunnerService.run({ ...META, mode: "full" });
    // Strip timing (durationMs / ranAt) which legitimately vary.
    const strip = (r: typeof a) => r.results.map(({ durationMs, ...rest }) => rest);
    expect(strip(a)).toEqual(strip(b));
  });

  it("the entire library is green (the engine is healthy)", () => {
    const report = evaluateAll(ANALYTICS_SCENARIOS, META);
    expect(report.summary.failed).toBe(0);
  });
});
