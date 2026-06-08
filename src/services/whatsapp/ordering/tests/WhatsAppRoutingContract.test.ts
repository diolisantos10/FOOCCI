/**
 * WhatsAppRoutingContract — proves the message-aware routing contract:
 *
 *   route to Text Ordering ⇔ routingEligible && (activeSession || orderIntent)
 *
 * The old WhatsApp Agent (Receptionist) is the DEFAULT HOST. Text Ordering is an
 * order-taking tool that engages only on genuine order intent or an active order
 * session. This is what restores the greeting/menu reply that broke when
 * RESTAURANT_WIDE was activated.
 *
 * Prisma is mocked — no DB, no WhatsApp send, no order, no Pix.
 *
 * Coverage (maps to the prompt's A–O):
 *   A. RESTAURANT_WIDE + "Bom dia" + no session  → OLD_WHATSAPP_AGENT
 *   B. RESTAURANT_WIDE + "Oi" + no session        → OLD_WHATSAPP_AGENT
 *   C. RESTAURANT_WIDE + "Cardápio" + no session  → OLD_WHATSAPP_AGENT
 *   D. RESTAURANT_WIDE + "Quero 1 yakisoba"       → TEXT_ORDERING
 *   E. Active session + "frango"                  → TEXT_ORDERING (session wins)
 *   L. Disabled config + order message            → OLD_WHATSAPP_AGENT
 *   M. Paused config + order message              → OLD_WHATSAPP_AGENT
 *   N/O. finalHandler matches the diagnostic contract.
 *   + state-machine greeting defense (Part 3).
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mock prisma BEFORE importing the service ──────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  whatsAppTextOrderingConfig: {
    findUnique: vi.fn(),
  },
  whatsAppOrderingSession: {
    findFirst: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getMessageAwareRoutingDecision } from "../WhatsAppTextOrderingConfigService";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import type { WaMenuItem, WaPersistedSession } from "../types";

const REST = "rest-sushi-cazza";
const EVOLUTION_PHONE = "+5511999990000";

const ENV_KEYS = [
  "WHATSAPP_TEXT_ORDERING_ENABLED",
  "WHATSAPP_TEXT_ORDERING_PAUSED",
] as const;
function clearEnv() { for (const k of ENV_KEYS) delete process.env[k]; }

function dbRow(over: Partial<{
  enabled: boolean; mode: string; scope: string; allowlistedPhones: unknown; paused: boolean;
}> = {}) {
  return {
    id: "cfg-1", restaurantId: REST,
    enabled: over.enabled ?? false,
    mode: over.mode ?? "ALLOWLIST_REPLY_ONLY",
    scope: over.scope ?? "RESTAURANT_WIDE",
    allowlistedPhones: over.allowlistedPhones ?? [],
    paused: over.paused ?? false,
    notes: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

/** Configure the restaurant as eligible (enabled, RESTAURANT_WIDE) by default. */
function eligibleConfig(over: Parameters<typeof dbRow>[0] = {}) {
  prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
    dbRow({ enabled: true, scope: "RESTAURANT_WIDE", ...over }),
  );
}
/** No active ordering session for this phone. */
function noSession() { prismaMock.whatsAppOrderingSession.findFirst.mockResolvedValue(null); }
/** An active ordering session exists for this phone. */
function activeSession() {
  prismaMock.whatsAppOrderingSession.findFirst.mockResolvedValue({
    id: "sess-1", restaurantId: REST, phone: EVOLUTION_PHONE, status: "AWAITING_CUSTOMER",
    stage: "COLLECTING_REQUIRED_OPTIONS", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "ALLOWLIST_REPLY_ONLY", source: "webhook",
    customerId: null, conversationId: null, metadata: null,
    lastMessageAt: new Date(), expiresAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
}

beforeEach(() => {
  prismaMock.whatsAppTextOrderingConfig.findUnique.mockReset();
  prismaMock.whatsAppOrderingSession.findFirst.mockReset();
  clearEnv();
});
afterEach(() => clearEnv());

const route = (messageText: string) =>
  getMessageAwareRoutingDecision({ restaurantId: REST, phone: EVOLUTION_PHONE, messageText, conversationId: "c1" });

// ── A/B/C — greetings & questions stay with the old agent ─────────────────────

describe("A — RESTAURANT_WIDE + 'Bom dia' + no session → old WhatsApp Agent", () => {
  it("does not route to Text Ordering", async () => {
    eligibleConfig(); noSession();
    const d = await route("Bom dia");
    expect(d.routingEligible).toBe(true);          // config IS eligible
    expect(d.messageHasOrderIntent).toBe(false);
    expect(d.hasActiveSession).toBe(false);
    expect(d.wouldRouteToTextOrdering).toBe(false);
    expect(d.finalHandler).toBe("OLD_WHATSAPP_AGENT");
  });
});

describe("B — RESTAURANT_WIDE + 'Oi' + no session → old WhatsApp Agent", () => {
  it("does not route", async () => {
    eligibleConfig(); noSession();
    const d = await route("Oi");
    expect(d.wouldRouteToTextOrdering).toBe(false);
    expect(d.finalHandler).toBe("OLD_WHATSAPP_AGENT");
  });
});

describe("C — RESTAURANT_WIDE + 'Cardápio' + no session → old WhatsApp Agent", () => {
  it("a menu question is not order intent", async () => {
    eligibleConfig(); noSession();
    const d = await route("Cardápio");
    expect(d.detectedIntent).toBe("QUESTION");
    expect(d.messageHasOrderIntent).toBe(false);
    expect(d.wouldRouteToTextOrdering).toBe(false);
    expect(d.finalHandler).toBe("OLD_WHATSAPP_AGENT");
  });
});

// ── D — genuine order intent routes to Text Ordering ──────────────────────────

describe("D — RESTAURANT_WIDE + 'Quero 1 yakisoba' → Text Ordering", () => {
  it("routes on order intent even with no prior session", async () => {
    eligibleConfig(); noSession();
    const d = await route("Quero 1 yakisoba");
    expect(d.detectedIntent).toBe("ORDER_REQUEST");
    expect(d.messageHasOrderIntent).toBe(true);
    expect(d.wouldRouteToTextOrdering).toBe(true);
    expect(d.finalHandler).toBe("TEXT_ORDERING");
  });
});

// ── E — an active session continues even on a non-order message ───────────────

describe("E — active session + 'frango' → Text Ordering", () => {
  it("session presence routes the turn even though 'frango' alone is not order intent", async () => {
    eligibleConfig(); activeSession();
    const d = await route("frango");
    // "frango" by itself is a product keyword → ORDER_REQUEST, but the key assertion
    // is that the active session alone is sufficient to route.
    expect(d.hasActiveSession).toBe(true);
    expect(d.wouldRouteToTextOrdering).toBe(true);
    expect(d.finalHandler).toBe("TEXT_ORDERING");
  });

  it("a bare answer like 'sim' routes purely because a session is active", async () => {
    eligibleConfig(); activeSession();
    const d = await route("sim");
    expect(d.messageHasOrderIntent).toBe(false); // "sim" is not order intent
    expect(d.hasActiveSession).toBe(true);
    expect(d.wouldRouteToTextOrdering).toBe(true);
  });
});

// ── L — disabled config never routes ──────────────────────────────────────────

describe("L — disabled config → old WhatsApp Agent regardless of message", () => {
  it("order intent still falls back when feature disabled", async () => {
    eligibleConfig({ enabled: false }); noSession();
    const d = await route("Quero 1 yakisoba");
    expect(d.routingEligible).toBe(false);
    expect(d.wouldRouteToTextOrdering).toBe(false);
    expect(d.finalHandler).toBe("OLD_WHATSAPP_AGENT");
    // The session is never even looked up when config is ineligible.
    expect(prismaMock.whatsAppOrderingSession.findFirst).not.toHaveBeenCalled();
  });
});

// ── M — paused config never routes ────────────────────────────────────────────

describe("M — paused config → old WhatsApp Agent", () => {
  it("order intent falls back when paused", async () => {
    eligibleConfig({ paused: true }); noSession();
    const d = await route("Quero 1 yakisoba");
    expect(d.routingEligible).toBe(false);
    expect(d.wouldRouteToTextOrdering).toBe(false);
    expect(d.declineReason).toBeTruthy();
  });
});

// ── N/O — finalHandler matches the diagnostic contract ────────────────────────

describe("N/O — finalHandler values match the diagnostic", () => {
  it("'Bom dia' → OLD_WHATSAPP_AGENT, 'Quero yakisoba' → TEXT_ORDERING", async () => {
    eligibleConfig(); noSession();
    expect((await route("Bom dia")).finalHandler).toBe("OLD_WHATSAPP_AGENT");
    eligibleConfig(); noSession();
    expect((await route("Quero yakisoba")).finalHandler).toBe("TEXT_ORDERING");
  });
});

// ── Part 3 — state-machine greeting defense ───────────────────────────────────

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
});
const MENU: WaMenuItem[] = [
  mk({ id: "yaki", name: "Yakisoba Carne", price: 32 }),
  mk({ id: "coca", name: "Coca-Cola", price: 6 }),
];
function freshSession(over: Partial<WaPersistedSession> = {}): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: EVOLUTION_PHONE,
    status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "DRY_RUN_ONLY", source: "admin_test",
    metadata: null, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now, ...over,
  };
}

describe("Part 3 — state-machine greeting defense", () => {
  it("a bare greeting at IDLE never says 'não encontrei … no cardápio'", () => {
    for (const greeting of ["Bom dia", "Oi", "Olá", "Boa noite"]) {
      const r = advanceSession(freshSession(), greeting, MENU);
      expect(r.suggestedReply).not.toMatch(/n[ãa]o encontrei/i);
      expect(r.session.selectedItems).toHaveLength(0);
      expect(r.handoff).toBe(false);
    }
  });

  it("a real product message at IDLE still runs the matcher", () => {
    const r = advanceSession(freshSession(), "quero 1 yakisoba carne", MENU);
    expect(r.session.selectedItems.length).toBeGreaterThan(0);
  });
});
