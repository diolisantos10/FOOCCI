/**
 * CRM Test Center — tests (A–J)
 *
 * Validates the deterministic CRM evaluation infrastructure itself:
 * scenario library, evaluator grading, test runner, API safety, and exports.
 * No DB, no LLM, no sends — fully deterministic.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CRM_SCENARIOS,
  getCrmScenarioGroups,
  getQuickScenarios,
  type CrmScenario,
} from "@/services/crm/testing/crmScenarios";
import {
  evaluateScenario,
  evaluateAll,
  evaluateLibrary,
  type EvalMeta,
} from "@/services/crm/testing/crmEvaluator";
import { CrmTestRunnerService } from "@/services/crm/testing/CrmTestRunnerService";

const META: EvalMeta = {
  restaurantId: "rest-test", restaurantName: "Sushi Cazza", slug: "sushi-cazza",
  mode: "full", useLiveLLM: false,
};

// ── A: scenario library loads all groups ────────────────────────────────────

describe("A — scenario library loads all 7 groups with scenarios", () => {
  it("exposes all groups, each with at least one scenario", () => {
    const groups = getCrmScenarioGroups();
    expect(groups.map((g) => g.id).sort()).toEqual([
      "action_center", "attribution", "contact_safety", "intelligence",
      "message_variation", "review_request", "segmentation",
    ]);
    for (const g of groups) expect(g.count).toBeGreaterThan(0);
    // Group counts sum to the full library.
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(CRM_SCENARIOS.length);
  });

  it("every scenario has a unique id and a valid severity", () => {
    const ids = CRM_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CRM_SCENARIOS) expect(["P0", "P1", "P2"]).toContain(s.severity);
  });
});

// ── B: evaluator passes a known-good safety scenario ─────────────────────────

describe("B — evaluator PASSES a known-good safe scenario", () => {
  it("cs-01 (safe contactable customer) is a clean PASS", () => {
    const sc = CRM_SCENARIOS.find((s) => s.id === "cs-01")!;
    const r = evaluateScenario(sc);
    expect(r.verdict).toBe("PASS");
    expect(r.score).toBe(100);
    expect(r.failedChecks).toHaveLength(0);
  });
});

// ── C: evaluator FAILS when an unsafe scenario expects the wrong thing ───────

describe("C — evaluator FAILS an opt-out scenario asserted unsafe", () => {
  it("marks FAIL when an opt-out customer is (wrongly) expected to be sendable", () => {
    const base = CRM_SCENARIOS.find((s) => s.id === "cs-02")! as Extract<CrmScenario, { group: "contact_safety" }>;
    // Flip the expectation to the WRONG answer — the real service blocks opt-out,
    // so the evaluator must catch the mismatch and FAIL.
    const corrupted: CrmScenario = { ...base, expect: { sendable: true, reason: null } };
    const r = evaluateScenario(corrupted);
    expect(r.verdict).toBe("FAIL");
    expect(r.score).toBeLessThan(70);
    expect(r.failedChecks.length).toBeGreaterThan(0);
  });
});

// ── D: segment/tier scenario evaluated correctly ─────────────────────────────

describe("D — segmentation scenarios grade correctly", () => {
  it("all segmentation scenarios PASS against the real classifier", () => {
    const segs = CRM_SCENARIOS.filter((s) => s.group === "segmentation");
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      const r = evaluateScenario(s);
      expect(r.verdict, `${s.id} (${s.actualSummary ?? ""})`).not.toBe("FAIL");
    }
  });
});

// ── E: attribution scenario quality correct ──────────────────────────────────

describe("E — attribution scenarios grade correctly", () => {
  it("all attribution scenarios PASS", () => {
    const at = CRM_SCENARIOS.filter((s) => s.group === "attribution");
    for (const s of at) expect(evaluateScenario(s).verdict).toBe("PASS");
  });
});

// ── F: review eligibility scenario correct ───────────────────────────────────

describe("F — review request scenarios grade correctly", () => {
  it("all review_request scenarios are PASS or WARN (never FAIL)", () => {
    const rr = CRM_SCENARIOS.filter((s) => s.group === "review_request");
    for (const s of rr) {
      const r = evaluateScenario(s);
      expect(r.verdict, `${s.id}: ${r.actualSummary}`).not.toBe("FAIL");
    }
  });
});

// ── G: test runner quick mode returns a summary ──────────────────────────────

describe("G — test runner modes return coherent summaries", () => {
  it("quick mode runs only P0 scenarios", () => {
    const report = CrmTestRunnerService.run({ ...META, mode: "quick", restaurantId: "r", restaurantName: "n", slug: "sushi-cazza" });
    expect(report.summary.total).toBe(getQuickScenarios().length);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.passed + report.summary.warned + report.summary.failed).toBe(report.summary.total);
  });

  it("group mode filters to a single group", () => {
    const report = CrmTestRunnerService.run({ mode: "group", scenarioGroup: "contact_safety", restaurantId: "r", restaurantName: "n", slug: "sushi-cazza" });
    expect(report.results.every((r) => r.group === "contact_safety")).toBe(true);
  });

  it("full mode runs the whole library and is all green (PASS/WARN, no FAIL)", () => {
    const report = CrmTestRunnerService.run({ mode: "full", restaurantId: "r", restaurantName: "n", slug: "sushi-cazza" });
    expect(report.summary.total).toBe(CRM_SCENARIOS.length);
    expect(report.summary.failed, `failures: ${report.results.filter((r) => r.verdict === "FAIL").map((r) => `${r.id} (${r.actualSummary})`).join(" | ")}`).toBe(0);
    expect(report.summary.avgScore).toBeGreaterThanOrEqual(70);
  });
});

// ── H: API route is admin-protected ──────────────────────────────────────────

describe("H — API route is admin-protected", () => {
  const routeSrc = readFileSync(resolve(__dirname, "../../../app/api/admin/ai/crm-tests/run/route.ts"), "utf8");

  it("checks ADMIN_SECRET and checkAdminRequest before running", () => {
    expect(routeSrc).toContain("process.env.ADMIN_SECRET");
    expect(routeSrc).toContain("checkAdminRequest(req)");
    expect(routeSrc).toMatch(/status:\s*401/);
    expect(routeSrc).toMatch(/status:\s*403/);
  });
});

// ── I: no send / campaign / mutation side effects anywhere in the test infra ─

describe("I — test infrastructure has no send/campaign/mutation side effects", () => {
  const dir = resolve(__dirname, "../testing");
  const files = ["crmScenarios.ts", "crmEvaluator.ts", "CrmTestRunnerService.ts"].map((f) =>
    readFileSync(resolve(dir, f), "utf8"),
  );
  const routeSrc = readFileSync(resolve(__dirname, "../../../app/api/admin/ai/crm-tests/run/route.ts"), "utf8");

  it("never imports an Evolution/WhatsApp client", () => {
    for (const src of files) {
      expect(src).not.toMatch(/EvolutionClient|sendWhatsApp|sendMessage|sendText/i);
    }
  });

  it("never creates a CampaignExecution or mutates customer data", () => {
    for (const src of [...files, routeSrc]) {
      expect(src).not.toMatch(/campaignExecution\.(create|update|upsert|delete)/);
      expect(src).not.toMatch(/customer\.(update|delete|create)/);
    }
  });

  it("the API route performs no DB writes (read-only findUnique only)", () => {
    expect(routeSrc).not.toMatch(/\.(create|update|upsert|delete|deleteMany|updateMany|createMany)\(/);
    expect(routeSrc).toContain("findUnique");
  });

  it("the runner forces dryRun and never auto-enables live LLM", () => {
    const runnerSrc = files[2];
    expect(runnerSrc).toContain("useLiveLLM === true");
    expect(routeSrc).toContain("useLiveLLM:     false");
  });
});

// ── J: export builders include failures and actual output ────────────────────

describe("J — report shape supports TXT/JSON export with failures + actual", () => {
  it("a corrupted scenario surfaces in results with failedChecks and actualSummary", () => {
    const base = CRM_SCENARIOS.find((s) => s.id === "rr-01")! as Extract<CrmScenario, { group: "review_request" }>;
    const corrupted: CrmScenario = { ...base, expect: { eligible: false, blocks: ["NO_REVIEW_LINKS"] } };
    const report = evaluateAll([corrupted, ...CRM_SCENARIOS.filter((s) => s.id !== "rr-01")], META);

    const failedResult = report.results.find((r) => r.id === "rr-01");
    expect(failedResult?.verdict).toBe("FAIL");
    expect(failedResult?.failedChecks.length).toBeGreaterThan(0);
    expect(failedResult?.actualSummary).toContain("eligible=true");

    // Summary aggregates correctly.
    expect(report.summary.total).toBe(CRM_SCENARIOS.length);
    expect(report.summary.failed).toBeGreaterThanOrEqual(1);
    expect(typeof report.summary.avgScore).toBe("number");
  });

  it("evaluateLibrary returns a full report header for export", () => {
    const report = evaluateLibrary(META);
    expect(report.slug).toBe("sushi-cazza");
    expect(report.restaurantName).toBe("Sushi Cazza");
    expect(report.results.length).toBe(CRM_SCENARIOS.length);
  });
});
