/**
 * ConversationAiPolicyService — pure decision tests (P0-A).
 *
 * Covers shouldAiRespond() only — no DB, no network. The lock/unlock mutations
 * are thin Prisma wrappers and are exercised via the integration surface.
 *
 *   A — STAFF classification → AI must not respond (locked)
 *   B — SUPPLIER classification → AI must not respond (locked)
 *   C — normal human takeover (aiEnabled=false, not locked) → no AI, but not locked
 *   D — lock precedence: aiLocked overrides aiEnabled=true (auto-return can't win)
 *   E — CUSTOMER + aiEnabled + OPEN → AI allowed
 *   F — RESOLVED → no AI
 *   G — CRM context → no AI (human handles)
 *   H — INTERNAL/PARTNER/OTHER classifications → correct lock reasons
 */

import { describe, it, expect } from "vitest";
import { shouldAiRespond, type AiPolicyConversation } from "./ConversationAiPolicyService";

function conv(p: Partial<AiPolicyConversation> = {}): AiPolicyConversation {
  return {
    aiEnabled:        p.aiEnabled        ?? true,
    aiLocked:         p.aiLocked         ?? false,
    conversationType: p.conversationType ?? "CUSTOMER",
    status:           p.status           ?? "OPEN",
    contextType:      p.contextType      ?? null,
  };
}

describe("A — STAFF lock blocks AI", () => {
  it("does not allow AI for a STAFF conversation", () => {
    const d = shouldAiRespond(conv({ conversationType: "STAFF", aiLocked: true }));
    expect(d.allowed).toBe(false);
    expect(d.locked).toBe(true);
    expect(d.reason).toBe("STAFF_LOCK");
  });
});

describe("B — SUPPLIER lock blocks AI", () => {
  it("does not allow AI for a SUPPLIER conversation", () => {
    const d = shouldAiRespond(conv({ conversationType: "SUPPLIER", aiLocked: true }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SUPPLIER_LOCK");
  });
});

describe("C — normal human takeover is not a permanent lock", () => {
  it("blocks AI but reports HUMAN_TAKEOVER (not locked)", () => {
    const d = shouldAiRespond(conv({ aiEnabled: false }));
    expect(d.allowed).toBe(false);
    expect(d.locked).toBe(false);
    expect(d.reason).toBe("HUMAN_TAKEOVER");
  });
});

describe("D — lock precedence over auto-return", () => {
  it("a locked conversation never replies even if aiEnabled was flipped true", () => {
    // Simulates an auto-return rule (or stray /release) setting aiEnabled=true
    // while the conversation is still classified/locked as staff.
    const d = shouldAiRespond(conv({ conversationType: "STAFF", aiLocked: true, aiEnabled: true, status: "AI_ATENDENDO" }));
    expect(d.allowed).toBe(false);
    expect(d.locked).toBe(true);
  });

  it("non-customer classification alone (no aiLocked flag) still blocks", () => {
    const d = shouldAiRespond(conv({ conversationType: "INTERNAL", aiLocked: false, aiEnabled: true }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("INTERNAL_LOCK");
  });
});

describe("E — normal customer with AI on", () => {
  it("allows AI for CUSTOMER + aiEnabled + OPEN", () => {
    const d = shouldAiRespond(conv());
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("AI_ACTIVE");
    expect(d.locked).toBe(false);
  });

  it("allows AI in AI_ATENDENDO and BOT statuses", () => {
    expect(shouldAiRespond(conv({ status: "AI_ATENDENDO" })).allowed).toBe(true);
    expect(shouldAiRespond(conv({ status: "BOT" })).allowed).toBe(true);
  });
});

describe("F — resolved conversations", () => {
  it("does not allow AI when RESOLVED", () => {
    const d = shouldAiRespond(conv({ status: "RESOLVED" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("RESOLVED");
  });
});

describe("G — CRM context", () => {
  it("does not allow AI for CRM_CAMPAIGN origin", () => {
    const d = shouldAiRespond(conv({ contextType: "CRM_CAMPAIGN" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("CRM_CONTEXT");
  });

  it("does not allow AI for CRM_AUTOMATION origin", () => {
    expect(shouldAiRespond(conv({ contextType: "CRM_AUTOMATION" })).allowed).toBe(false);
  });
});

describe("H — classification reasons", () => {
  it("PARTNER and OTHER_NON_CUSTOMER map to MANUAL_LOCK", () => {
    expect(shouldAiRespond(conv({ conversationType: "PARTNER", aiLocked: true })).reason).toBe("MANUAL_LOCK");
    expect(shouldAiRespond(conv({ conversationType: "OTHER_NON_CUSTOMER", aiLocked: true })).reason).toBe("MANUAL_LOCK");
  });

  it("status not AI-eligible (e.g. HUMAN) with no lock → UNKNOWN", () => {
    const d = shouldAiRespond(conv({ status: "HUMAN", aiEnabled: true }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("UNKNOWN");
  });
});
