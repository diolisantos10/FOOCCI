import { describe, it, expect } from "vitest";
import {
  classifyExecution,
  summarizeExecutions,
  buildEligibilityMetrics,
  RETRYABILITY_LABEL,
} from "../crmExecutionClassification";

// P0 Evolution stabilization — failure classification + retry policy.

describe("retryability policy per category", () => {
  it("invalid phone → SKIPPED + RETRYABLE_AFTER_FIX (Precisa corrigir cadastro)", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "INVALID_PHONE_FORMAT" });
    expect(c.kind).toBe("SKIPPED");
    expect(c.retryability).toBe("RETRYABLE_AFTER_FIX");
    expect(c.retryabilityLabel).toBe("Precisa corrigir");
  });

  it("no phone → SKIPPED_NO_PHONE; not contactable → SKIPPED_NOT_CONTACTABLE", () => {
    expect(classifyExecution({ status: "SKIPPED", errorMessage: "MISSING_PHONE" }).category).toBe("SKIPPED_NO_PHONE");
    expect(classifyExecution({ status: "FAILED", errorMessage: "MISSING_PHONE" }).category).toBe("SKIPPED_NO_PHONE");
    expect(classifyExecution({ status: "FAILED", errorMessage: "CUSTOMER_NOT_CONTACTABLE" }).category).toBe("SKIPPED_NOT_CONTACTABLE");
    expect(classifyExecution({ status: "FAILED", errorMessage: "MISSING_PHONE" }).kind).toBe("SKIPPED");
  });

  it("opt-out → NEVER_RETRY", () => {
    const c = classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" });
    expect(c.retryability).toBe("NEVER_RETRY");
  });

  it("HTTP 400 → FAILED + RETRYABLE_AFTER_FIX (Precisa corrigir)", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" });
    expect(c.category).toBe("EVOLUTION_BAD_REQUEST");
    expect(c.retryability).toBe("RETRYABLE_AFTER_FIX");
    expect(c.retryabilityLabel).toBe("Precisa corrigir");
  });

  it("HTTP 500 → FAILED_PROVIDER + RETRYABLE_LATER (Pode reenviar depois)", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_500" });
    expect(c.category).toBe("FAILED_PROVIDER");
    expect(c.retryability).toBe("RETRYABLE_LATER");
    expect(c.retryabilityLabel).toBe("Pode reenviar depois");
  });

  it("timeout (text) → FAILED_TIMEOUT + RETRYABLE_LATER", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "connect ETIMEDOUT" });
    expect(c.category).toBe("FAILED_TIMEOUT");
    expect(c.retryability).toBe("RETRYABLE_LATER");
  });

  it("HTTP 504 (machine) → FAILED_TIMEOUT", () => {
    expect(classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_504" }).category).toBe("FAILED_TIMEOUT");
  });

  it("429 → RETRYABLE_LATER", () => {
    expect(classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_429" }).retryability).toBe("RETRYABLE_LATER");
  });

  it("auth 401/403 → RETRYABLE_AFTER_FIX", () => {
    expect(classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_401" }).retryability).toBe("RETRYABLE_AFTER_FIX");
  });

  it("safety block (weekly cap) → RETRYABLE_LATER but kind BLOCKED", () => {
    const c = classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" });
    expect(c.kind).toBe("BLOCKED");
    expect(c.retryability).toBe("RETRYABLE_LATER");
  });

  it("every retryability has a label", () => {
    expect(Object.keys(RETRYABILITY_LABEL).sort()).toEqual(
      ["NEVER_RETRY", "PERMANENT", "RETRYABLE_AFTER_FIX", "RETRYABLE_LATER"],
    );
  });
});

describe("summary — recoverableLater is the safe reprocess pool", () => {
  it("counts only transient provider failures (5xx/timeout/unknown), not 400/invalid/optout/safety", () => {
    const rows = [
      { status: "SENT" },
      { status: "FAILED", errorMessage: "EVOLUTION_HTTP_500" },          // recoverable
      { status: "FAILED", errorMessage: "EVOLUTION_HTTP_504" },          // recoverable (timeout)
      { status: "FAILED", failedReason: "socket hang up" },              // recoverable (timeout)
      { status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" },          // NOT (needs fix)
      { status: "FAILED", errorMessage: "INVALID_PHONE_FORMAT" },        // NOT (skipped/permanent)
      { status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" },         // NOT (never)
      { status: "BLOCKED", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" },// NOT (auto-retry, kind BLOCKED)
    ];
    const s = summarizeExecutions(rows);
    expect(s.recoverableLater).toBe(3);
    expect(s.sent).toBe(1);
    expect(s.skipped).toBe(1);            // invalid phone
    expect(s.blockedSafety).toBe(2);      // opt-out + weekly cap
    expect(s.failedProvider).toBe(4);     // 500 + 504 + timeout + 400
    expect(s.byRetryability.PERMANENT).toBe(0);          // nothing permanent in this set
    expect(s.byRetryability.NEVER_RETRY).toBe(2);         // SENT (nothing to retry) + opt-out
    expect(s.byRetryability.RETRYABLE_AFTER_FIX).toBe(2); // the 400 + invalid phone (fix cadastro)
    expect(s.byRetryability.RETRYABLE_LATER).toBe(4);     // 3 provider transient + 1 weekly cap (safety)
  });
});

describe("buildEligibilityMetrics — eligibility funnel separates skips from failures", () => {
  it("no-phone / invalid-phone are skipped, never counted as provider failures", () => {
    const rows = [
      { status: "SENT" }, { status: "SENT" },
      { status: "SKIPPED", errorMessage: "MISSING_PHONE" },        // no phone
      { status: "SKIPPED", errorMessage: "MISSING_PHONE" },
      { status: "SKIPPED", errorMessage: "INVALID_PHONE_FORMAT" }, // invalid
      { status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" },   // opt-out
      { status: "FAILED",  errorMessage: "CUSTOMER_NOT_CONTACTABLE" }, // not contactable
      { status: "FAILED",  errorMessage: "EVOLUTION_HTTP_500" },   // real failure (recoverable)
      { status: "FAILED",  errorMessage: "EVOLUTION_HTTP_400" },   // real failure (needs fix)
    ];
    const s = summarizeExecutions(rows);
    const m = buildEligibilityMetrics(s, 9);

    expect(m.audienceTotal).toBe(9);
    expect(m.sent).toBe(2);
    expect(m.providerFailures).toBe(2);          // 500 + 400 ONLY
    expect(m.recoverableFailures).toBe(1);       // 500
    expect(m.permanentFailures).toBe(1);         // 400
    expect(m.skipped).toBe(5);                   // 2 no-phone + 1 invalid + 1 opt-out + 1 not-contactable
    expect(m.skippedBreakdown.noPhone).toBe(2);
    expect(m.skippedBreakdown.invalidPhone).toBe(1);
    expect(m.skippedBreakdown.optOut).toBe(1);
    expect(m.skippedBreakdown.notContactable).toBe(1);
    expect(m.failureBreakdown.http500).toBe(1);
    expect(m.failureBreakdown.http400).toBe(1);
    // eligible = audience minus the 5 ineligible skips
    expect(m.whatsAppEligible).toBe(4);
  });
});
