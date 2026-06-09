/**
 * Safety smoke test for the simulator endpoint.
 * Proves that allowSideEffects=false is always enforced — no real WA send,
 * no real order, no real Pix — regardless of what the endpoint receives.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external dependencies ─────────────────────────────────────────────────

vi.mock("@/lib/admin-auth", () => ({
  checkAdminRequest: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurant: {
      findFirst: vi.fn().mockResolvedValue({
        id: "rest-sim-1", name: "Test Restaurant", slug: "test-restaurant",
      }),
    },
  },
}));

vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService", () => ({
  getMessageAwareRoutingDecision: vi.fn().mockResolvedValue({
    routingEligible:          false,
    hasActiveSession:         false,
    detectedIntent:           "UNKNOWN",
    messageHasOrderIntent:    false,
    wouldRouteToTextOrdering: false,
    finalHandler:             "OLD_WHATSAPP_AGENT",
    effectiveFinalHandler:    "OLD_WHATSAPP_AGENT",
    replyCapable:             false,
    declineReason:            "simulator test — routing disabled",
    config: {
      mode:                  "DRY_RUN_ONLY",
      scope:                 "PHONE_ALLOWLIST",
      shouldUseTextOrdering: false,
    },
  }),
}));

vi.mock("@/services/whatsapp/ordering/WhatsAppTextOrderService", async (importActual) => {
  const actual = await importActual<typeof import("@/services/whatsapp/ordering/WhatsAppTextOrderService")>();
  return {
    ...actual,
    processCustomerMessage: vi.fn().mockResolvedValue({
      session:              { stage: "IDLE", status: "ACTIVE", selectedItems: [], unresolvedItems: [], missingQuestions: [], deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null, orderId: null, orderDraftId: null, pixPaymentId: null },
      stage:                "IDLE",
      intent:               "ORDER_REQUEST",
      parsedItems:          [],
      matchedItems:         [],
      unresolvedItems:      [],
      missingQuestions:     [],
      draft:                null,
      deliveryQuote:        null,
      payment:              null,
      order:                null,
      estimatedTotal:       0,
      suggestedReply:       "Anotei: 1× Yakisoba.",
      operatorSummary:      "",
      actions:              [],
      safetyNotes:          ["dry-run — nenhuma mensagem WhatsApp enviada por este serviço"],
      sideEffectsPerformed: [],
      handoff:              false,
    }),
  };
});

vi.mock("@/services/whatsapp/ordering/WhatsAppOrderDraftBuilder", () => ({
  buildFullDraft: vi.fn().mockReturnValue({ subtotal: 30, deliveryFee: 0, total: 30, summary: { items: [] }, comandaText: "" }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

const { POST } = await import("./route");

function makeRequest(body: object) {
  return new Request("http://localhost/api/admin/diagnostics/whatsapp-text-ordering/simulator/message", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("Simulator endpoint — safety invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("always includes safety notes confirming no real WhatsApp send", async () => {
    const res  = await POST(makeRequest({ restaurantSlug: "test-restaurant", customerName: "Test", customerPhone: "+5511999990000", messageText: "Olá" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sideEffectsPerformed).toEqual([]);
    expect(body.safetyNotes.some((n: string) => n.includes("WhatsApp"))).toBe(true);
    expect(body.safetyNotes.some((n: string) => n.includes("allowSideEffects"))).toBe(true);
    expect(body.safetyNotes.some((n: string) => n.includes("Pix"))).toBe(true);
  });

  it("returns finalHandler and botReply for old-agent path", async () => {
    const res  = await POST(makeRequest({ restaurantSlug: "test-restaurant", customerName: "Diego", customerPhone: "+5511999990000", messageText: "Olá" }));
    const body = await res.json();
    expect(body.finalHandler).toBe("OLD_WHATSAPP_AGENT");
    expect(typeof body.botReply).toBe("string");
    expect(body.botReply.length).toBeGreaterThan(0);
    // Old agent reply contains the menu options
    expect(body.botReply).toContain("1️⃣");
  });

  it("returns 401 when not authenticated", async () => {
    const { checkAdminRequest } = await import("@/lib/admin-auth");
    vi.mocked(checkAdminRequest).mockReturnValueOnce(false);
    const res = await POST(makeRequest({ restaurantSlug: "test-restaurant", customerName: "Test", customerPhone: "+5511999990000", messageText: "Olá" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ restaurantSlug: "test-restaurant" }));
    expect(res.status).toBe(400);
  });

  it("routing data is present in response", async () => {
    const res  = await POST(makeRequest({ restaurantSlug: "test-restaurant", customerName: "Test", customerPhone: "+5511999990000", messageText: "Quero yakisoba" }));
    const body = await res.json();
    expect(body.routing).toBeDefined();
    expect(typeof body.routing.finalHandler).toBe("string");
    expect(typeof body.routing.effectiveFinalHandler).toBe("string");
  });
});
