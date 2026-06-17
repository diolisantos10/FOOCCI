import { describe, it, expect } from "vitest";
import {
  classifyExecution,
  summarizeExecutions,
  summarizeFromReasonCounts,
} from "../crmExecutionClassification";

describe("classifyExecution — safety blocks are NOT send failures", () => {
  it("(1) weekly cap (new row: BLOCKED + machine code) → BLOCKED_WEEKLY_LIMIT, kind BLOCKED", () => {
    const c = classifyExecution({ status: "BLOCKED", failedReason: "Limite semanal atingido (1/1)", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" });
    expect(c.category).toBe("BLOCKED_WEEKLY_LIMIT");
    expect(c.kind).toBe("BLOCKED");
    expect(c.badge).toMatch(/semanal/i);
  });

  it("(1-legacy) old data stored as FAILED with 'Limite semanal' text → still BLOCKED_WEEKLY_LIMIT", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "Limite semanal atingido (1/1)" });
    expect(c.category).toBe("BLOCKED_WEEKLY_LIMIT");
    expect(c.kind).toBe("BLOCKED");
  });

  it("(2) Evolution HTTP 400 (new structured code) → EVOLUTION_BAD_REQUEST (kind FAILED)", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "HTTP 400: {\"message\":\"jid inválido\"}", errorMessage: "EVOLUTION_HTTP_400" });
    expect(c.category).toBe("EVOLUTION_BAD_REQUEST");
    expect(c.kind).toBe("FAILED");
  });

  it("(2-legacy) old free-text Evolution 400 → EVOLUTION_BAD_REQUEST via text heuristic", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: "Evolution API POST /message/sendText/sushicazza → HTTP 400", errorMessage: "Evolution API POST /message/sendText/sushicazza → HTTP 400" });
    expect(c.category).toBe("EVOLUTION_BAD_REQUEST");
    expect(c.kind).toBe("FAILED");
  });

  it("(2b) invalid-number provider error → BLOCKED_INVALID_PHONE (kind FAILED, badge 'Telefone inválido')", () => {
    const c = classifyExecution({ status: "FAILED", failedReason: 'HTTP 400 {"exists":false}', errorMessage: "INVALID_PHONE_FORMAT" });
    expect(c.category).toBe("BLOCKED_INVALID_PHONE");
    expect(c.kind).toBe("FAILED");
    expect(c.badge).toMatch(/inválido/i);
  });

  it("maps cooldown / opt-out / global cap correctly", () => {
    expect(classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_COOLDOWN_ACTIVE" }).category).toBe("BLOCKED_COOLDOWN");
    expect(classifyExecution({ status: "BLOCKED", errorMessage: "RECENT_CRM_MESSAGE_24H" }).category).toBe("BLOCKED_COOLDOWN");
    expect(classifyExecution({ status: "BLOCKED", errorMessage: "CUSTOMER_OPTED_OUT" }).category).toBe("BLOCKED_OPT_OUT");
    expect(classifyExecution({ status: "BLOCKED", errorMessage: "DAILY_GLOBAL_CAP_REACHED" }).category).toBe("BLOCKED_DAILY_GLOBAL_CAP");
  });

  it("SENT/DELIVERED/READ → SENT", () => {
    expect(classifyExecution({ status: "SENT" }).category).toBe("SENT");
    expect(classifyExecution({ status: "DELIVERED" }).category).toBe("SENT");
    expect(classifyExecution({ status: "READ" }).category).toBe("SENT");
  });
});

describe("summarizeExecutions — (3) performance separates blocked vs failed", () => {
  it("the 'frios' scenario: 9 sent, 243 weekly-cap blocks, a few real failures", () => {
    const rows = [
      ...Array.from({ length: 9 }, () => ({ status: "SENT" })),
      ...Array.from({ length: 243 }, () => ({ status: "BLOCKED", failedReason: "Limite semanal atingido (1/1)", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED" })),
      ...Array.from({ length: 4 }, () => ({ status: "FAILED", errorMessage: "Evolution API → HTTP 400" })),
    ];
    const s = summarizeExecutions(rows);
    expect(s.sent).toBe(9);
    expect(s.blockedSafety).toBe(243); // NOT counted as failures
    expect(s.failedProvider).toBe(4);
    expect(s.byCategory.BLOCKED_WEEKLY_LIMIT).toBe(243);
    const weekly = s.reasonGroups.find((g) => g.category === "BLOCKED_WEEKLY_LIMIT");
    expect(weekly?.count).toBe(243);
    expect(weekly?.kind).toBe("BLOCKED");
  });

  it("(6) summarizeFromReasonCounts aggregates DB groupBy rows", () => {
    const s = summarizeFromReasonCounts([
      { status: "BLOCKED", errorMessage: "CUSTOMER_WEEKLY_CAP_REACHED", count: 243 },
      { status: "FAILED", errorMessage: "HTTP 400", count: 4 },
    ]);
    expect(s.blockedSafety).toBe(243);
    expect(s.failedProvider).toBe(4);
    expect(s.total).toBe(247);
  });
});
