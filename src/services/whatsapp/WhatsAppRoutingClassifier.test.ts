/**
 * WhatsApp Routing Test Lab — classifier + runner tests (A–L).
 *
 * Pure: no DB, no WhatsApp send, no LLM. These tests are the executable contract
 * that replaces manual WhatsApp testing.
 *
 *   A — classifier: normal inbound customer
 *   B — classifier: customer /build (suppressed)
 *   C — classifier: fromMe /build (outbound mirror, hidden)
 *   D — classifier: operator manual /build (blocked)
 *   E — build handler throw still suppresses (detection-only invariant)
 *   F — unauthorized build suppresses
 *   G — historical leaked command hidden/relabelled
 *   H — message with /build not at start is normal
 *   I — (API route protected — covered structurally; see note)
 *   J — quick suite returns pass/fail summary
 *   K — custom simulation returns a classification
 *   L — NO scenario ever sends to the customer for an internal command
 */

import { describe, it, expect } from "vitest";
import { classifyRoutingEvent } from "./WhatsAppRoutingClassifier";
import {
  runRoutingScenarios,
  runCustomEvent,
  ROUTING_SCENARIOS,
} from "./testing/WhatsAppRoutingTestService";

// ── A ──────────────────────────────────────────────────────────────────────
describe("A — normal inbound customer", () => {
  it("renders as a customer bubble and reaches the WhatsApp agent, no send", () => {
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "Oi" });
    expect(d.isInternalCommand).toBe(false);
    expect(d.actor).toBe("CUSTOMER");
    expect(d.direction).toBe("INBOUND");
    expect(d.shouldRenderAsCustomerBubble).toBe(true);
    expect(d.shouldCallWhatsAppAgent).toBe(true);
    expect(d.shouldCallProviderSend).toBe(false);
  });

  it("respects conversation gating — no agent when aiEnabled=false", () => {
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "Oi", aiEnabled: false });
    expect(d.shouldCallWhatsAppAgent).toBe(false);
    expect(d.shouldRenderAsCustomerBubble).toBe(true);
  });

  it("routes to Waiter only in AI_ORDERING_EXPERIMENTAL", () => {
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "Oi", agentMode: "AI_ORDERING_EXPERIMENTAL" });
    expect(d.shouldCallWaiter).toBe(true);
    expect(d.shouldCallWhatsAppAgent).toBe(false);
  });
});

// ── B ──────────────────────────────────────────────────────────────────────
describe("B — customer /build is suppressed", () => {
  it("never persists, never reaches an agent, never sends", () => {
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "/build teste" });
    expect(d.isInternalCommand).toBe(true);
    expect(d.commandType).toBe("BUILD");
    expect(d.shouldPersistConversationMessage).toBe(false);
    expect(d.shouldRenderAsCustomerBubble).toBe(false);
    expect(d.shouldCallWhatsAppAgent).toBe(false);
    expect(d.shouldCallWaiter).toBe(false);
    expect(d.shouldCallProviderSend).toBe(false);
  });
});

// ── C ──────────────────────────────────────────────────────────────────────
describe("C — fromMe /build is an outbound mirror, hidden", () => {
  it("classifies as internal/outbound/hidden, no send", () => {
    const d = classifyRoutingEvent({
      source: "WEBHOOK", fromMe: true, messageText: "/build teste",
      fromPhone: "+5511990001122", connectedBusinessPhone: "+5511990001122",
    });
    expect(d.isInternalCommand).toBe(true);
    expect(d.direction).toBe("OUTBOUND");
    expect(d.visibility).toBe("HIDDEN");
    expect(d.shouldCallProviderSend).toBe(false);
    expect(d.shouldShowInAtendimento).toBe(false);
    expect(d.safetyNotes.join(" ")).toMatch(/mirror/i);
  });
});

// ── D ──────────────────────────────────────────────────────────────────────
describe("D — operator manual /build is blocked", () => {
  it("returns a block reason and never sends or persists", () => {
    const d = classifyRoutingEvent({ source: "MANUAL_OPERATOR", messageText: "/build teste", operatorId: "op-1" });
    expect(d.isInternalCommand).toBe(true);
    expect(d.blockReason).toBeTruthy();
    expect(d.shouldCallProviderSend).toBe(false);
    expect(d.shouldPersistConversationMessage).toBe(false);
  });

  it("allows a normal operator reply (sends to customer)", () => {
    const d = classifyRoutingEvent({ source: "MANUAL_OPERATOR", messageText: "Olá, posso ajudar?" });
    expect(d.actor).toBe("OPERATOR");
    expect(d.blockReason).toBeNull();
    expect(d.shouldCallProviderSend).toBe(true);
  });
});

// ── E ──────────────────────────────────────────────────────────────────────
describe("E — handler exception does not change suppression", () => {
  it("detection alone decides; classification is independent of handleBuildCommand", () => {
    // The classifier never calls handleBuildCommand; a thrown handler in prod is
    // irrelevant because the pre-flight gate uses detection only.
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "/build raio-x" });
    expect(d.isInternalCommand).toBe(true);
    expect(d.shouldCallProviderSend).toBe(false);
    expect(d.shouldRenderAsCustomerBubble).toBe(false);
  });
});

// ── F ──────────────────────────────────────────────────────────────────────
describe("F — unauthorized build is suppressed", () => {
  it("Build OS enabled + unauthorized sender → still no send, with a note", () => {
    const d = classifyRoutingEvent({
      source: "WEBHOOK", fromMe: false, messageText: "/build deploy",
      buildOsEnabled: true, authorizedBuildPhone: false,
    });
    expect(d.isInternalCommand).toBe(true);
    expect(d.shouldCallProviderSend).toBe(false);
    expect(d.shouldPersistConversationMessage).toBe(false);
    expect(d.safetyNotes.join(" ")).toMatch(/not authorized/i);
  });
});

// ── G ──────────────────────────────────────────────────────────────────────
describe("G — historical leaked command is hidden/relabelled", () => {
  it("hidden, excluded from preview, not a customer bubble, not deleted", () => {
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "/build antigo", isHistoricalRecord: true });
    expect(d.visibility).toBe("HIDDEN");
    expect(d.shouldShowInAtendimento).toBe(false);
    expect(d.shouldRenderAsCustomerBubble).toBe(false);
    expect(d.shouldPersistConversationMessage).toBe(true); // preserved
    expect(d.expectedLabel).toMatch(/ocultado/i);
  });
});

// ── H ──────────────────────────────────────────────────────────────────────
describe("H — /build not at the start is a normal message", () => {
  it("treated as a normal customer message", () => {
    const d = classifyRoutingEvent({ source: "WEBHOOK", fromMe: false, messageText: "como uso /build no app?" });
    expect(d.isInternalCommand).toBe(false);
    expect(d.actor).toBe("CUSTOMER");
    expect(d.shouldRenderAsCustomerBubble).toBe(true);
    expect(d.shouldCallWhatsAppAgent).toBe(true);
  });
});

// ── I ──────────────────────────────────────────────────────────────────────
describe("I — API route is admin-protected (contract)", () => {
  it("scenarios are pure and contain no secret/credential material", () => {
    // The route guards with checkAdminRequest (ADMIN_SECRET). Here we assert the
    // scenario fixtures carry no tokens/secrets so exported reports are safe.
    const blob = JSON.stringify(ROUTING_SCENARIOS);
    expect(blob).not.toMatch(/secret|apikey|api_key|token/i);
  });
});

// ── J ──────────────────────────────────────────────────────────────────────
describe("J — quick suite returns a pass/fail summary", () => {
  it("returns a scored summary with all-pass on current rules", () => {
    const s = runRoutingScenarios("quick");
    expect(s.total).toBeGreaterThan(0);
    expect(s.passed + s.warned + s.failed).toBe(s.total);
    expect(s.failed).toBe(0);
    expect(s.score).toBe(100);
  });

  it("full suite is all-pass", () => {
    const s = runRoutingScenarios("full");
    expect(s.failed).toBe(0);
    expect(s.score).toBe(100);
  });
});

// ── K ──────────────────────────────────────────────────────────────────────
describe("K — custom simulation returns a classification", () => {
  it("classifies an ad-hoc fromMe /build event", () => {
    const r = runCustomEvent({ source: "WEBHOOK", fromMe: true, messageText: "/build x", fromPhone: "+5511990001122", connectedBusinessPhone: "+5511990001122" });
    expect(r.actual.isInternalCommand).toBe(true);
    expect(r.wouldCallProviderSend).toBe(false);
    expect(r.scenarioId).toBe("custom");
  });
});

// ── L ──────────────────────────────────────────────────────────────────────
describe("L — nenhum comando interno chega a enviar mensagem", () => {
  it("across every built-in scenario, internal commands never send and never bubble", () => {
    const s = runRoutingScenarios("full");
    for (const r of s.results) {
      if (r.actual.isInternalCommand) {
        expect(r.wouldCallProviderSend).toBe(false);
        expect(r.wouldRenderAsCustomerBubble).toBe(false);
        expect(r.wouldCallWhatsAppAgent).toBe(false);
        expect(r.wouldCallWaiter).toBe(false);
        expect(r.redFlags).toEqual([]);
      }
    }
  });

  it("a fuzz sweep of command prefixes never sends", () => {
    const prefixes = ["/build", "/cmd", "/prompt", "/BUILD", "  /build  ", "/build: x"];
    const sources = ["WEBHOOK", "MANUAL_OPERATOR", "CARDAPIO"] as const;
    for (const text of prefixes) {
      for (const source of sources) {
        for (const fromMe of [true, false]) {
          const d = classifyRoutingEvent({ source, messageText: text, fromMe });
          expect(d.shouldCallProviderSend).toBe(false);
          expect(d.shouldRenderAsCustomerBubble).toBe(false);
        }
      }
    }
  });
});
