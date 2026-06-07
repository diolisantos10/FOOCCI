import { describe, it, expect } from "vitest";
import {
  WAITER_LEGACY_TEST_AUDIT,
  auditCountByClassification,
  auditCountByPriority,
  hasRealBugs,
} from "./waiterLegacyTestAudit";

describe("waiterLegacyTestAudit — legacy suite audit (Waiter v1.6)", () => {
  it("documents every legacy finding with the required fields", () => {
    expect(WAITER_LEGACY_TEST_AUDIT.length).toBeGreaterThan(0);
    for (const f of WAITER_LEGACY_TEST_AUDIT) {
      expect(f.testName.trim().length).toBeGreaterThan(0);
      expect(["sales-core", "sales-specialist"]).toContain(f.file);
      expect(f.oldExpectation.trim().length).toBeGreaterThan(0);
      expect(f.currentBehavior.trim().length).toBeGreaterThan(0);
      expect(["OBSOLETE_TEST", "EXPECTATION_DRIFT", "REAL_BUG", "NEEDS_MANUAL_REVIEW"]).toContain(
        f.classification,
      );
      expect(["P0", "P1", "P2"]).toContain(f.priority);
      expect(f.recommendation.trim().length).toBeGreaterThan(0);
    }
  });

  it("classification counts sum to the total number of findings", () => {
    const byClass = auditCountByClassification();
    const total =
      byClass.OBSOLETE_TEST +
      byClass.EXPECTATION_DRIFT +
      byClass.REAL_BUG +
      byClass.NEEDS_MANUAL_REVIEW;
    expect(total).toBe(WAITER_LEGACY_TEST_AUDIT.length);
  });

  it("priority counts sum to the total number of findings", () => {
    const byPrio = auditCountByPriority();
    expect(byPrio.P0 + byPrio.P1 + byPrio.P2).toBe(WAITER_LEGACY_TEST_AUDIT.length);
  });

  it("finds NO real bug — the legacy failures do not block the release candidate", () => {
    expect(hasRealBugs()).toBe(false);
    expect(auditCountByClassification().REAL_BUG).toBe(0);
    expect(auditCountByPriority().P0).toBe(0);
  });

  it("flags checkout/upsell-adjacent findings for manual review (restaurant paused)", () => {
    expect(auditCountByClassification().NEEDS_MANUAL_REVIEW).toBeGreaterThan(0);
  });
});
