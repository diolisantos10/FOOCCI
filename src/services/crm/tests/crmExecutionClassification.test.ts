import { describe, it, expect } from "vitest";
import { classifyExecution, summarizeExecutions } from "../crmExecutionClassification";

describe("classifyExecution — SENT statuses", () => {
  it("classifies SENT as SENT kind", () => {
    const r = classifyExecution({ status: "SENT" });
    expect(r.category).toBe("SENT");
    expect(r.kind).toBe("SENT");
  });

  it("classifies DELIVERED as SENT kind", () => {
    const r = classifyExecution({ status: "DELIVERED" });
    expect(r.category).toBe("SENT");
    expect(r.kind).toBe("SENT");
  });

  it("classifies READ as SENT kind", () => {
    const r = classifyExecution({ status: "READ" });
    expect(r.category).toBe("SENT");
    expect(r.kind).toBe("SENT");
  });
});

describe("classifyExecution — BLOCKED statuses with machine reason", () => {
  it("CUSTOMER_WEEKLY_CAP_REACHED → BLOCKED_WEEKLY_LIMIT", () => {
    const r = classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" });
    expect(r.category).toBe("BLOCKED_WEEKLY_LIMIT");
    expect(r.kind).toBe("BLOCKED");
  });

  it("CUSTOMER_COOLDOWN_ACTIVE → BLOCKED_COOLDOWN", () => {
    const r = classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_COOLDOWN_ACTIVE" });
    expect(r.category).toBe("BLOCKED_COOLDOWN");
    expect(r.kind).toBe("BLOCKED");
  });

  it("CUSTOMER_OPTED_OUT → BLOCKED_OPT_OUT", () => {
    const r = classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" });
    expect(r.category).toBe("BLOCKED_OPT_OUT");
    expect(r.kind).toBe("BLOCKED");
  });

  it("BLOCKED with no errorMessage → generic BLOCKED_SAFETY", () => {
    const r = classifyExecution({ status: "BLOCKED" });
    expect(r.category).toBe("BLOCKED_SAFETY");
    expect(r.kind).toBe("BLOCKED");
  });
});

describe("classifyExecution — FAILED statuses with machine reason", () => {
  it("INVALID_PHONE_FORMAT → BLOCKED_INVALID_PHONE (kind FAILED)", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "INVALID_PHONE_FORMAT" });
    expect(r.category).toBe("BLOCKED_INVALID_PHONE");
    expect(r.kind).toBe("FAILED");
  });

  it("EVOLUTION_HTTP_400 → EVOLUTION_BAD_REQUEST", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" });
    expect(r.category).toBe("EVOLUTION_BAD_REQUEST");
    expect(r.kind).toBe("FAILED");
  });

  it("EVOLUTION_HTTP_401 → EVOLUTION_AUTH_ERROR", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_401" });
    expect(r.category).toBe("EVOLUTION_AUTH_ERROR");
    expect(r.kind).toBe("FAILED");
  });

  it("EVOLUTION_HTTP_403 → EVOLUTION_AUTH_ERROR", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_403" });
    expect(r.category).toBe("EVOLUTION_AUTH_ERROR");
    expect(r.kind).toBe("FAILED");
  });

  it("EVOLUTION_HTTP_429 → EVOLUTION_RATE_LIMITED (kind BLOCKED)", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_429" });
    expect(r.category).toBe("EVOLUTION_RATE_LIMITED");
    expect(r.kind).toBe("BLOCKED");
  });

  it("EVOLUTION_HTTP_503 → FAILED_PROVIDER (fallthrough)", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "EVOLUTION_HTTP_503" });
    expect(r.category).toBe("FAILED_PROVIDER");
    expect(r.kind).toBe("FAILED");
  });

  it("EMPTY_MESSAGE_AFTER_RENDER → EMPTY_MESSAGE", () => {
    const r = classifyExecution({ status: "FAILED", errorMessage: "EMPTY_MESSAGE_AFTER_RENDER" });
    expect(r.category).toBe("EMPTY_MESSAGE");
    expect(r.kind).toBe("FAILED");
  });
});

describe("classifyExecution — text-based heuristics for legacy rows", () => {
  it("failedReason 'disconnected' → EVOLUTION_INSTANCE_DISCONNECTED", () => {
    const r = classifyExecution({ status: "FAILED", failedReason: "instance disconnected" });
    expect(r.category).toBe("EVOLUTION_INSTANCE_DISCONNECTED");
    expect(r.kind).toBe("FAILED");
  });

  it("failedReason 'rate limit' → EVOLUTION_RATE_LIMITED", () => {
    const r = classifyExecution({ status: "FAILED", failedReason: "rate limit exceeded" });
    expect(r.category).toBe("EVOLUTION_RATE_LIMITED");
    expect(r.kind).toBe("BLOCKED");
  });

  it("failedReason 'Limite semanal atingido' (legacy FAILED) → BLOCKED_WEEKLY_LIMIT", () => {
    const r = classifyExecution({ status: "FAILED", failedReason: "Limite semanal atingido (1/1)" });
    expect(r.category).toBe("BLOCKED_WEEKLY_LIMIT");
    expect(r.kind).toBe("BLOCKED");
  });

  it("failedReason with JID → BLOCKED_INVALID_PHONE", () => {
    const r = classifyExecution({ status: "FAILED", failedReason: "invalid jid format" });
    expect(r.category).toBe("BLOCKED_INVALID_PHONE");
    expect(r.kind).toBe("FAILED");
  });
});

describe("summarizeExecutions — recurring campaign cycle vs lifetime invariant", () => {
  it("lifetime failures > audience size is fine when counted correctly", () => {
    // 3 audience members, 2 cycles → 6 executions total, 4 failures
    const rows = [
      // cycle 1
      { status: "SENT" },
      { status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" },
      { status: "FAILED", errorMessage: "INVALID_PHONE_FORMAT" },
      // cycle 2
      { status: "SENT" },
      { status: "FAILED", errorMessage: "EVOLUTION_HTTP_400" },
      { status: "BLOCKED", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" },
    ];
    const summary = summarizeExecutions(rows);
    expect(summary.sent).toBe(2);
    // BLOCKED_INVALID_PHONE has kind FAILED so it counts toward failedProvider
    expect(summary.failedProvider).toBe(3); // 2 bad requests + 1 invalid phone
    expect(summary.blockedSafety).toBe(1);  // weekly cap only (invalid phone is kind FAILED)
    expect(summary.total).toBe(6);
    expect(summary.byCategory["EVOLUTION_BAD_REQUEST"]).toBe(2);
    expect(summary.byCategory["BLOCKED_INVALID_PHONE"]).toBe(1);
    expect(summary.byCategory["BLOCKED_WEEKLY_LIMIT"]).toBe(1);
  });

  it("current-cycle view with filtered rows is independent of lifetime total", () => {
    // lifetime: 10 failures total
    const lifetime = Array.from({ length: 10 }, () => ({
      status: "FAILED",
      errorMessage: "EVOLUTION_HTTP_400",
    }));
    // current cycle: only 2 failures
    const currentCycle = lifetime.slice(0, 2);

    const lifetimeSummary = summarizeExecutions(lifetime);
    const cycleSummary    = summarizeExecutions(currentCycle);

    expect(lifetimeSummary.failedProvider).toBe(10);
    expect(cycleSummary.failedProvider).toBe(2);
    // They are independent — no shared state
    expect(lifetimeSummary.failedProvider).not.toBe(cycleSummary.failedProvider);
  });
});
