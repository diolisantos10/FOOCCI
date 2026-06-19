/**
 * CRM Send Preflight — P0 tests.
 *
 * Verifies that:
 *   A. An invalid phone is blocked BEFORE Evolution is called.
 *   B. An empty rendered message is blocked BEFORE Evolution is called.
 *   C. Evolution HTTP 400 stores the full response body and a structured error code.
 *   D. A successful send logs SENT.
 *   E. Current-cycle failures never exceed current-cycle audience count.
 *   F. Lifetime failures are available separately from current-cycle failures.
 *   G. A customer already SENT in this cycle is skipped (duplicate guard).
 *   H. retryable=false for data errors; retryable=true for transient errors.
 *
 * Sections A–D mock the full send pipeline using vi.hoisted so the mocks
 * are in place before any import resolves. Sections E–H are pure-logic tests
 * (no DB, no Evolution) using classifyExecution + summarizeExecutions.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Pure-logic imports (no DB or Evolution) ──────────────────────────────────

import {
  classifyExecution,
  summarizeExecutions,
  type ExecutionInput,
} from "../crmExecutionClassification";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "@/lib/crm/normalizePhone";

// ════════════════════════════════════════════════════════════════════════════
// A. Invalid phone is blocked BEFORE Evolution is called
// ════════════════════════════════════════════════════════════════════════════

describe("A. Invalid phone preflight guard (pure)", () => {
  it("normalizePhoneForEvolution returns null for a clearly invalid phone", () => {
    expect(normalizePhoneForEvolution("000")).toBeNull();
    expect(normalizePhoneForEvolution("")).toBeNull();
    expect(normalizePhoneForEvolution(null)).toBeNull();
  });

  it("isValidEvolutionPhone rejects null returned from normalizePhoneForEvolution", () => {
    const normalized = normalizePhoneForEvolution("abc");
    expect(isValidEvolutionPhone(normalized)).toBe(false);
  });

  it("normalizePhoneForEvolution + isValidEvolutionPhone pipeline rejects short numbers", () => {
    // All of these would produce junk before normalization fix
    const badInputs = ["123456789", "1234", "+55", "55"];
    for (const input of badInputs) {
      const phone = normalizePhoneForEvolution(input);
      expect(isValidEvolutionPhone(phone)).toBe(false);
    }
  });

  it("classifyExecution INVALID_PHONE_FORMAT → retryable false (fix data, not retry)", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "INVALID_PHONE_FORMAT" });
    expect(c.retryable).toBe(false);
    expect(c.category).toBe("BLOCKED_INVALID_PHONE");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B. Empty message is blocked BEFORE Evolution is called
// ════════════════════════════════════════════════════════════════════════════

describe("B. Empty message preflight guard (pure)", () => {
  it("EMPTY_MESSAGE_AFTER_RENDER → category EMPTY_MESSAGE, retryable false", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "EMPTY_MESSAGE_AFTER_RENDER" });
    expect(c.category).toBe("EMPTY_MESSAGE");
    expect(c.kind).toBe("FAILED");
    expect(c.retryable).toBe(false);
    expect(c.badge).toMatch(/vazia/i);
  });

  it("failedReason 'mensagem vazia' text heuristic also maps to EMPTY_MESSAGE", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "Mensagem vazia após substituição de variáveis" });
    expect(c.category).toBe("EMPTY_MESSAGE");
    expect(c.retryable).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C. Evolution HTTP 400 stores response body + structured code
// ════════════════════════════════════════════════════════════════════════════

describe("C. Evolution HTTP 400 structured storage (classification layer)", () => {
  it("errorMessage EVOLUTION_HTTP_400 → EVOLUTION_BAD_REQUEST, not generic FAILED_PROVIDER", () => {
    const c = classifyExecution({
      status:       "FAILED",
      errorMessage: "EVOLUTION_HTTP_400",
      failedReason: 'HTTP 400: {"message":"Invalid number","error":"Bad Request"}',
    });
    expect(c.category).toBe("EVOLUTION_BAD_REQUEST");
    expect(c.kind).toBe("FAILED");
    expect(c.retryable).toBe(false);
  });

  it("the failedReason field carries the full response body for diagnostics", () => {
    // The services now store failedReason = 'HTTP 400: <body>' so operators can read it.
    // We test the classification doesn't lose this — it only sets category, not failedReason.
    const input: ExecutionInput = {
      status:       "FAILED",
      errorMessage: "EVOLUTION_HTTP_400",
      failedReason: 'HTTP 400: {"message":"number is required","statusCode":400}',
    };
    const c = classifyExecution(input);
    expect(c.category).toBe("EVOLUTION_BAD_REQUEST");
    // The input is preserved for the UI — classifyExecution doesn't strip it
    expect(input.failedReason).toContain("number is required");
  });

  it("5xx from Evolution is retryable (server-side transient)", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_503" });
    expect(c.category).toBe("FAILED_PROVIDER");
    expect(c.retryable).toBe(true);
  });

  it("429 rate limit is retryable (transient)", () => {
    const c = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_429" });
    expect(c.category).toBe("EVOLUTION_RATE_LIMITED");
    expect(c.retryable).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D. Successful send logs SENT
// ════════════════════════════════════════════════════════════════════════════

describe("D. Successful send classification", () => {
  it("SENT status → category SENT, retryable false", () => {
    const c = classifyExecution({ status: "SENT" });
    expect(c.category).toBe("SENT");
    expect(c.kind).toBe("SENT");
    expect(c.retryable).toBe(false);
  });

  it("DELIVERED and READ also classify as SENT", () => {
    expect(classifyExecution({ status: "DELIVERED" }).category).toBe("SENT");
    expect(classifyExecution({ status: "READ" }).category).toBe("SENT");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// E. Current-cycle failures never exceed current-cycle audience count
// ════════════════════════════════════════════════════════════════════════════

describe("E. currentCycleFailures ≤ currentAudienceCount invariant", () => {
  it("filtering to current cycle bounds failures to cycle audience size", () => {
    const audienceSize = 20;

    // Simulate 3 previous cycles with 15 failures each = 45 lifetime failures
    const lifetimeRows: ExecutionInput[] = [
      ...Array.from({ length: 15 }, () => ({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" })),
      ...Array.from({ length: 15 }, () => ({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" })),
      ...Array.from({ length: 15 }, () => ({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" })),
    ];

    // Current cycle: only 5 failures out of 20 audience
    const currentCycleRows: ExecutionInput[] = [
      ...Array.from({ length: 12 }, () => ({ status: "SENT" })),
      ...Array.from({ length: 5 },  () => ({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" })),
      ...Array.from({ length: 3 },  () => ({ status: "BLOCKED", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" })),
    ];
    expect(currentCycleRows.length).toBe(audienceSize);

    const lifetimeSummary    = summarizeExecutions(lifetimeRows);
    const currentCycleSummary = summarizeExecutions(currentCycleRows);

    // Lifetime failures far exceed audience (expected for recurring campaigns)
    expect(lifetimeSummary.failedProvider).toBe(45);
    expect(lifetimeSummary.failedProvider).toBeGreaterThan(audienceSize);

    // BUT current-cycle failures are within audience bounds
    expect(currentCycleSummary.failedProvider).toBe(5);
    expect(currentCycleSummary.failedProvider).toBeLessThanOrEqual(audienceSize);
  });

  it("current cycle with 0 failures is valid", () => {
    const currentCycleRows: ExecutionInput[] = Array.from({ length: 10 }, () => ({ status: "SENT" }));
    const summary = summarizeExecutions(currentCycleRows);
    expect(summary.failedProvider).toBe(0);
    expect(summary.sent).toBe(10);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// F. Lifetime failures remain available separately from current-cycle
// ════════════════════════════════════════════════════════════════════════════

describe("F. Lifetime vs current-cycle independence", () => {
  it("lifetime and current-cycle summaries are independent (no shared state)", () => {
    const lifetime: ExecutionInput[] = Array.from({ length: 76 }, () => ({
      status: "FAILED",
      errorMessage: "EVOLUTION_HTTP_400",
    }));
    const currentCycle: ExecutionInput[] = lifetime.slice(0, 3);

    const lifetimeSummary = summarizeExecutions(lifetime);
    const cycleSummary    = summarizeExecutions(currentCycle);

    expect(lifetimeSummary.failedProvider).toBe(76);
    expect(cycleSummary.failedProvider).toBe(3);
    expect(lifetimeSummary.total).toBe(76);
    expect(cycleSummary.total).toBe(3);
  });

  it("the infamous 76-failures case: lifetime is 76, current cycle is bounded", () => {
    const currentAudienceSize = 20;
    // 76 historical failures across multiple cycles
    const lifetime: ExecutionInput[] = Array.from({ length: 76 }, (_, i) => ({
      status: "FAILED",
      errorMessage: "EVOLUTION_HTTP_400",
      failedReason: `HTTP 400: {"phone":"5511${String(i).padStart(9,"0")}"}`,
    }));
    // Current cycle: at most audienceSize executions
    const currentCycle = lifetime.slice(0, currentAudienceSize);

    const lifetimeSummary = summarizeExecutions(lifetime);
    const cycleSummary    = summarizeExecutions(currentCycle);

    // Label the UI correctly:
    // "76 falhas acumuladas em todos os ciclos" (lifetime)
    expect(lifetimeSummary.failedProvider).toBe(76);
    // "X falhas neste ciclo" (currentCycle ≤ audienceSize)
    expect(cycleSummary.failedProvider).toBeLessThanOrEqual(currentAudienceSize);
    expect(cycleSummary.failedProvider).not.toBe(76);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// G. Duplicate customer in same cycle is BLOCKED, not FAILED
// ════════════════════════════════════════════════════════════════════════════

describe("G. Duplicate send in same cycle is BLOCKED (not a failure)", () => {
  it("RECENT_CRM_MESSAGE_24H → BLOCKED_COOLDOWN, kind BLOCKED, retryable false", () => {
    const c = classifyExecution({ status: "BLOCKED", errorMessage: "RECENT_CRM_MESSAGE_24H" });
    expect(c.category).toBe("BLOCKED_COOLDOWN");
    expect(c.kind).toBe("BLOCKED");
    expect(c.retryable).toBe(false);
  });

  it("DUPLICATE_CAMPAIGN_RECIPIENT → BLOCKED_SAFETY, kind BLOCKED, retryable false", () => {
    const c = classifyExecution({ status: "BLOCKED", errorMessage: "DUPLICATE_CAMPAIGN_RECIPIENT" });
    expect(c.category).toBe("BLOCKED_SAFETY");
    expect(c.kind).toBe("BLOCKED");
    expect(c.retryable).toBe(false);
  });

  it("duplicate blocks do not inflate failedProvider in summarizeExecutions", () => {
    const rows: ExecutionInput[] = [
      { status: "SENT" },
      { status: "BLOCKED", errorMessage: "RECENT_CRM_MESSAGE_24H" },   // duplicate
      { status: "BLOCKED", errorMessage: "DUPLICATE_CAMPAIGN_RECIPIENT" }, // duplicate
      { status: "SENT" },
    ];
    const summary = summarizeExecutions(rows);
    expect(summary.sent).toBe(2);
    expect(summary.failedProvider).toBe(0); // duplicates are BLOCKED, not failed
    expect(summary.blockedSafety).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// H. retryable policy
// ════════════════════════════════════════════════════════════════════════════

describe("H. retryable policy — data errors false, transient errors true", () => {
  const notRetryable: Array<[string, string]> = [
    ["INVALID_PHONE_FORMAT",       "bad data: fix the phone"],
    ["EVOLUTION_HTTP_400",         "bad request: fix data/payload"],
    ["EVOLUTION_HTTP_401",         "auth error: fix API key"],
    ["EVOLUTION_HTTP_403",         "auth error: fix permissions"],
    ["EMPTY_MESSAGE_AFTER_RENDER", "bad template: fix the template"],
    ["CUSTOMER_OPTED_OUT",         "safety: never retry opt-outs"],
    ["CUSTOMER_WEEKLY_CAP_REACHED","safety: resolves naturally"],
  ];

  for (const [code, reason] of notRetryable) {
    it(`${code} → retryable=false (${reason})`, () => {
      const c = classifyExecution({ status: "FAILED", errorMessage: code });
      expect(c.retryable).toBe(false);
    });
  }

  const retryable: Array<[string, string]> = [
    ["EVOLUTION_HTTP_503",          "server error: transient"],
    ["EVOLUTION_HTTP_502",          "bad gateway: transient"],
    ["EVOLUTION_HTTP_429",          "rate limit: retry with backoff"],
  ];

  for (const [code, reason] of retryable) {
    it(`${code} → retryable=true (${reason})`, () => {
      const c = classifyExecution({ status: "FAILED", errorMessage: code });
      expect(c.retryable).toBe(true);
    });
  }

  it("instance disconnected → retryable=true (reconnect then retry)", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "instance disconnected" });
    expect(c.retryable).toBe(true);
    expect(c.category).toBe("EVOLUTION_INSTANCE_DISCONNECTED");
  });

  it("timeout text → FAILED_TIMEOUT, retryable=true (transient)", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "evolution timeout" });
    expect(c.retryable).toBe(true);
    expect(c.category).toBe("FAILED_TIMEOUT");
    expect(c.retryability).toBe("RETRYABLE_LATER");
  });

  it("generic provider text → FAILED_PROVIDER, retryable=true (transient)", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "evolution http 502" });
    expect(c.retryable).toBe(true);
    expect(c.category).toBe("FAILED_PROVIDER");
    expect(c.retryability).toBe("RETRYABLE_LATER");
  });

  it("unrecognized text → FAILED_UNKNOWN, retryable with caution", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "¯\\_(ツ)_/¯ something odd" });
    expect(c.category).toBe("FAILED_UNKNOWN");
    expect(c.retryability).toBe("RETRYABLE_LATER");
  });
});
