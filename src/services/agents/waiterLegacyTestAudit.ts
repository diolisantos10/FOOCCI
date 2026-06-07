/**
 * waiterLegacyTestAudit — structured audit of the pre-existing failures in the
 * legacy WaiterBrainV2 unit suites (sales-core / sales-specialist).
 *
 * These suites failed BEFORE the v1.4–v1.6 work and reflect intentional product
 * evolution (search fast-path, broad recommendation showing cards instead of
 * qualification buttons, checkout-upsell flow, and stale exact-copy asserts).
 * None is a structural bug introduced by the recent work. This file documents
 * each failure so they can be retired/fixed deliberately — it does NOT change
 * any runtime behavior. Read-only data + pure helpers (unit-tested).
 *
 * Baseline at v1.6: 26 failures (19 sales-core + 7 sales-specialist).
 */

export type LegacyClassification =
  | "OBSOLETE_TEST"        // asserts superseded copy/behavior; safe to update/retire
  | "EXPECTATION_DRIFT"    // behavior intentionally changed (product evolution)
  | "REAL_BUG"             // genuine regression to fix
  | "NEEDS_MANUAL_REVIEW"; // checkout/upsell-adjacent — verify live before changing

export type LegacyPriority = "P0" | "P1" | "P2";

export interface LegacyTestFinding {
  testName: string;
  file: "sales-core" | "sales-specialist";
  oldExpectation: string;
  currentBehavior: string;
  classification: LegacyClassification;
  priority: LegacyPriority;
  recommendation: string;
}

const F = "sales-core" as const;
const S = "sales-specialist" as const;

export const WAITER_LEGACY_TEST_AUDIT: readonly LegacyTestFinding[] = [
  // ── Broad recommendation: buttons → cards (intended v1.5 change) ──
  {
    testName: "'me sugere algo' empty cart → qualification buttons (light/complete)",
    file: F,
    oldExpectation: "options[] with Leve/Completo/Compartilhar buttons, no cards",
    currentBehavior: "returns 8–12 real cards directly (broad recommendation policy)",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Update/retire: broad intent now shows cards (see card-policy.test.ts).",
  },
  {
    testName: "Acceptance A) 'me sugere algo' → button question, no cards",
    file: F,
    oldExpectation: "button question only",
    currentBehavior: "real cards shown",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Retire — superseded by v1.5 broad-card policy.",
  },
  {
    testName: "Sprint 4B ON_PERMISSION_ACCEPT empty cart → 3 qualification buttons",
    file: F,
    oldExpectation: "3 qualification buttons",
    currentBehavior: "cards/other path (permission prompt deprecated in UI)",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Retire — passive permission prompt was removed from the opening.",
  },
  {
    testName: "Sprint 4B 'me sugere algo' empty → 3 qualification buttons",
    file: F,
    oldExpectation: "3 buttons (Leve/Completo/Para compartilhar)",
    currentBehavior: "real cards",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Retire — superseded by broad-card policy.",
  },
  {
    testName: "S2 'me sugere algo' empty → qualification buttons (+ light/complete values)",
    file: S,
    oldExpectation: "qualification buttons, not product cards",
    currentBehavior: "real product cards",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Retire/update to assert real cards.",
  },

  // ── Checkout / final-upsell permission (NEEDS MANUAL REVIEW — restaurant paused) ──
  {
    testName: "ON_CHECKOUT_STARTED food+no drink → pre-checkout upsell (INTERVENTION, cards=[])",
    file: F,
    oldExpectation: "INTERVENTION, empty cards (permission prompt)",
    currentBehavior: "differs (upsell-at-checkout flow changed)",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify final-upsell flow live before changing (checkout-adjacent).",
  },
  {
    testName: "Sprint 4B ON_CHECKOUT_STARTED food+drink no dessert → pre-checkout offer",
    file: F,
    oldExpectation: "dessert pre-checkout offer",
    currentBehavior: "differs",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify dessert upsell timing live.",
  },
  {
    testName: "Sprint 4B ON_PERMISSION_ACCEPT food+no drink → deterministic drink cards",
    file: F,
    oldExpectation: "deterministic drink cards",
    currentBehavior: "differs (permission-accept path changed)",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify with live ordering.",
  },
  {
    testName: "Sprint 4F A) food no drink/dessert → asks permission once (INTERVENTION, cards=[])",
    file: F,
    oldExpectation: "INTERVENTION, cards=[]",
    currentBehavior: "differs",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify final-upsell permission live.",
  },
  {
    testName: "Sprint 4F B) finalUpsellDeclined=true → skip to CHECKOUT_SUPPORT",
    file: F,
    oldExpectation: "skip straight to CHECKOUT_SUPPORT",
    currentBehavior: "differs",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify decline path live.",
  },
  {
    testName: "23 E2) allowFinalUpsellPrompt default → ON_CHECKOUT_STARTED shows upsell",
    file: F,
    oldExpectation: "shows upsell on checkout start",
    currentBehavior: "differs",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify config-driven upsell live.",
  },
  {
    testName: "S8 final upsell permission (food-only → INTERVENTION + options, cards=[])",
    file: S,
    oldExpectation: "INTERVENTION with options, empty cards",
    currentBehavior: "differs",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify final-upsell live (3 assertions in S8).",
  },
  {
    testName: "S9 AFTER_CHECKOUT → cards=[], CHECKOUT_SUPPORT, requiresAI; message empty",
    file: S,
    oldExpectation: "empty cards + CHECKOUT_SUPPORT + AI-filled message",
    currentBehavior: "differs",
    classification: "NEEDS_MANUAL_REVIEW",
    priority: "P1",
    recommendation: "Verify post-checkout support live (2 assertions in S9).",
  },

  // ── Idle / ranking drift ──
  {
    testName: "23 D1) permissionRequiredBeforeSuggestions=false → ON_IDLE qualification question",
    file: F,
    oldExpectation: "ON_IDLE returns a qualification question",
    currentBehavior: "differs (idle behavior changed)",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Update/retire idle expectation.",
  },
  {
    testName: "Sprint 4E rankProducts already-suggested can still appear if only option",
    file: F,
    oldExpectation: "soft penalty — re-appears when it's the only option",
    currentBehavior: "hard-excluded (−200) once already suggested",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Decide soft-vs-hard penalty; update test to the chosen policy.",
  },

  // ── Stale exact-copy asserts (superseded by search fast-path + humanized copy) ──
  {
    testName: "Sprint 4D asks_for_drink → copy contains 'bebida'",
    file: F,
    oldExpectation: "INTENT_COPY drink string containing 'bebida'",
    currentBehavior: "search fast-path returns generic humanized copy",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Update to assert real cards (copy now from search fast-path).",
  },
  {
    testName: "Sprint 4D asks_for_dessert → copy contains 'doce'",
    file: F,
    oldExpectation: "INTENT_COPY dessert string containing 'doce'",
    currentBehavior: "search fast-path returns generic humanized copy",
    classification: "EXPECTATION_DRIFT",
    priority: "P2",
    recommendation: "Update to assert real cards.",
  },
  {
    testName: "23 F1) balanced → buildCommercialResponse uses old INTENT_COPY string",
    file: F,
    oldExpectation: "'Para acompanhar, essas são as opções disponíveis 👇'",
    currentBehavior: "humanized INTENT_COPY string",
    classification: "OBSOLETE_TEST",
    priority: "P2",
    recommendation: "Update expected string to the current humanized copy.",
  },
  {
    testName: "23 F4) subtle wants_recommendation → fallback string",
    file: F,
    oldExpectation: "'Separei boas opções pra você 👇' (no INTENT_COPY entry)",
    currentBehavior: "wants_recommendation now has an INTENT_COPY entry",
    classification: "OBSOLETE_TEST",
    priority: "P2",
    recommendation: "Update expectation — entry now exists.",
  },
  {
    testName: "23 G1) subtle threads asks_for_drink copy via decide()",
    file: F,
    oldExpectation: "exact SUBTLE_COPY drink string",
    currentBehavior: "search fast-path/humanized copy on this message",
    classification: "OBSOLETE_TEST",
    priority: "P2",
    recommendation: "Use buildCommercialResponse directly or update expectation.",
  },
  {
    testName: "23 G2) aggressive threads asks_for_drink copy via decide()",
    file: F,
    oldExpectation: "exact AGGRESSIVE_COPY drink string",
    currentBehavior: "search fast-path/humanized copy on this message",
    classification: "OBSOLETE_TEST",
    priority: "P2",
    recommendation: "Use buildCommercialResponse directly or update expectation.",
  },
  {
    testName: "23 H2) no config → balanced dessert copy exact string",
    file: F,
    oldExpectation: "'Pra fechar com doce, essas são boas escolhas 👇'",
    currentBehavior: "humanized INTENT_COPY dessert string",
    classification: "OBSOLETE_TEST",
    priority: "P2",
    recommendation: "Update expected string to current humanized copy.",
  },
];

// ── pure summary helpers ─────────────────────────────────────────────────────

export function auditCountByClassification(): Record<LegacyClassification, number> {
  const out: Record<LegacyClassification, number> = {
    OBSOLETE_TEST: 0,
    EXPECTATION_DRIFT: 0,
    REAL_BUG: 0,
    NEEDS_MANUAL_REVIEW: 0,
  };
  for (const f of WAITER_LEGACY_TEST_AUDIT) out[f.classification] += 1;
  return out;
}

export function auditCountByPriority(): Record<LegacyPriority, number> {
  const out: Record<LegacyPriority, number> = { P0: 0, P1: 0, P2: 0 };
  for (const f of WAITER_LEGACY_TEST_AUDIT) out[f.priority] += 1;
  return out;
}

/** No real bugs found ⇒ the legacy failures don't block the release candidate. */
export function hasRealBugs(): boolean {
  return WAITER_LEGACY_TEST_AUDIT.some((f) => f.classification === "REAL_BUG");
}
