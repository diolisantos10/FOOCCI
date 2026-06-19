/**
 * P0 — WhatsApp/Fute: reuse known customer data and last delivery address.
 *
 * Tests:
 * 1. Cliente com endereço salvo escolhe entrega → sistema oferece último endereço
 * 2. Cliente confirma endereço salvo → calcula frete sem pedir CEP
 * 3. Cliente escolhe outro endereço → pede CEP (não pede rua/número direto)
 * 4. Cliente sem endereço salvo → pede CEP
 * 5. Endereço salvo não vaza dados sensíveis além do formatado
 * 6. WhatsApp e Fute usam a mesma fonte de dados (checkoutBridge.getSavedAddressForCustomer)
 * 7. Pagamento só vem depois do endereço/frete confirmado
 */

import { describe, it, expect, vi } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import { getSavedAddressForCustomer, enrichSessionMetadata } from "../checkoutBridge";
import type { WaMenuItem, WaPersistedSession } from "../types";

// ── Stub prisma (read-only, hermetic) ─────────────────────────────────────────
const db = vi.hoisted(() => ({
  paymentSettings: { findUnique: vi.fn() },
  order:           { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
} as WaMenuItem);

const MENU: WaMenuItem[] = [
  mk({ id: "m1", name: "Yakisoba Frango", price: 39.9 }),
  mk({ id: "m4", name: "Coca-Cola lata", price: 7 }),
];

const SAVED = {
  street:       "Rua das Flores",
  number:       "123",
  neighborhood: "Centro",
  formatted:    "Rua das Flores, 123 — Centro",
};

function fresh(meta: Record<string, unknown> | null = null, stage: WaPersistedSession["stage"] = "IDLE"): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: "cust-1", conversationId: null, phone: "+5511999990000",
    status: "ACTIVE", stage, selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "ALLOWLIST_FULL_TEST", source: "admin_test",
    metadata: meta, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
  } as WaPersistedSession;
}

function withItem(s: WaPersistedSession): WaPersistedSession {
  return {
    ...s,
    selectedItems: [{ rawText: "coca", menuItemId: "m4", menuItemName: "Coca-Cola lata", quantity: 1, unitPrice: 7, lineTotal: 7, options: [], extras: [] }],
  };
}

// ── 1. Cliente com endereço salvo → sistema oferece último endereço ─────────

describe("1 — oferta do endereço salvo", () => {
  it("proposta contém texto correto e endereço formatado", () => {
    const s = withItem(fresh({ savedAddress: SAVED, cartFinalized: true }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "BUILDING_CART";
    const r = advanceSession(s, "9", MENU);
    expect(r.session.stage).toBe("COLLECTING_ADDRESS");
    expect(r.suggestedReply).toContain("Posso entregar no seu último endereço?");
    expect(r.suggestedReply).toContain("Rua das Flores, 123");
    expect(r.suggestedReply).toContain("1️⃣ Sim, entregar nesse endereço");
    expect(r.suggestedReply).toContain("2️⃣ Usar outro endereço");
  });

  it("proposta inclui 0. menu no rodapé", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    // Re-enter with a non-matching input to get the proposal re-shown
    const r = advanceSession(s, "Rua sem cep", MENU);
    expect(r.suggestedReply.trimEnd()).toContain("0. menu");
  });
});

// ── 2. Cliente confirma → calcula frete sem pedir CEP ────────────────────────

describe("2 — confirma endereço salvo (opção 1)", () => {
  it("adota o endereço salvo e emite QUOTE_DELIVERY imediatamente", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "1", MENU);
    expect(r.session.address?.street).toBe("Rua das Flores");
    expect(r.session.address?.number).toBe("123");
    expect(r.actions).toContain("QUOTE_DELIVERY");
    expect(r.actions).not.toContain("LOOKUP_CEP");
  });

  it("endereço adotado fica na sessão e savedAddress é removido do metadata", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "1", MENU);
    expect(r.session.metadata?.savedAddress).toBeUndefined();
  });

  it("estágio vai para CALCULATING_DELIVERY_FEE após confirmação", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "1", MENU);
    expect(r.session.stage).toBe("CALCULATING_DELIVERY_FEE");
  });
});

// ── 3. Cliente escolhe outro endereço → pede CEP (não rua/número direto) ────

describe("3 — rejeita endereço salvo (opção 2) → pede CEP", () => {
  it("resposta pede CEP, não rua/número", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "2", MENU);
    expect(r.suggestedReply).toMatch(/cep/i);
    expect(r.suggestedReply).not.toMatch(/rua.{0,10}n[uú]mero/i);
    expect(r.actions).not.toContain("QUOTE_DELIVERY");
  });

  it("savedAddress é removido do metadata ao rejeitar", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "2", MENU);
    expect(r.session.metadata?.savedAddress).toBeUndefined();
  });

  it("após rejeitar, cliente envia CEP → LOOKUP_CEP emitido", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r1 = advanceSession(s, "2", MENU);
    const r2 = advanceSession(r1.session, "03177-010", MENU);
    expect(r2.actions).toContain("LOOKUP_CEP");
  });
});

// ── 4. Cliente sem endereço salvo → pede CEP directamente ────────────────────

describe("4 — sem endereço salvo → pede CEP", () => {
  it("sem savedAddress no metadata, pede CEP direto", () => {
    const s = withItem(fresh(null));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "oi", MENU);
    expect(r.suggestedReply).toMatch(/cep/i);
    expect(r.suggestedReply).not.toContain("último endereço");
  });

  it("startCheckout sem savedAddress vai direto para pedido de CEP", () => {
    const s = withItem(fresh({ cartFinalized: true }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "BUILDING_CART";
    const r = advanceSession(s, "9", MENU);
    expect(r.session.stage).toBe("COLLECTING_ADDRESS");
    expect(r.suggestedReply).toMatch(/cep/i);
    expect(r.suggestedReply).not.toContain("último endereço");
  });
});

// ── 5. Endereço salvo não vaza dados sensíveis ───────────────────────────────

describe("5 — sem vazamento de dados sensíveis", () => {
  it("proposta exibe apenas o campo `formatted`, sem serialização interna", () => {
    const saved = {
      street: "Rua Secreta",
      number: "999",
      neighborhood: "Vila Segura",
      formatted: "Rua Secreta, 999 — Vila Segura",
    };
    // Trigger the proposal via startCheckout (BUILDING_CART → "9")
    const s = withItem(fresh({ savedAddress: saved, cartFinalized: false }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "BUILDING_CART";
    const r = advanceSession(s, "9", MENU);
    // formatted value shown in proposal
    expect(r.suggestedReply).toContain("Rua Secreta, 999 — Vila Segura");
    // raw JSON field names NOT leaked in the reply
    expect(r.suggestedReply).not.toMatch(/"street"/);
    expect(r.suggestedReply).not.toMatch(/"number":/);
    expect(r.suggestedReply).not.toMatch(/"neighborhood"/);
    // Internal object not serialised as "[object Object]"
    expect(r.suggestedReply).not.toContain("[object Object]");
  });
});

// ── 6. WhatsApp e Fute usam a mesma fonte (checkoutBridge) ──────────────────

describe("6 — mesma fonte de dados (checkoutBridge)", () => {
  it("enrichSessionMetadata usa getSavedAddressForCustomer (mesma fn que page.tsx fallback)", async () => {
    db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCard: false, acceptCash: true });
    db.order.findFirst.mockResolvedValue({
      deliveryAddress: { street: "Rua das Flores", number: "123", neighborhood: "Centro", city: "SP" },
    });

    const r = await enrichSessionMetadata({
      restaurantId: "r1", customerId: "cust-1", currentMetadata: null, hasAddress: false,
    });
    const saved = r.metadata.savedAddress as { street: string } | undefined;
    expect(saved?.street).toBe("Rua das Flores");
    expect(r.savedAddressLoaded).toBe(true);
  });

  it("getSavedAddressForCustomer retorna null quando não há pedido com endereço", async () => {
    db.order.findFirst.mockResolvedValue(null);
    const result = await getSavedAddressForCustomer("cust-no-orders");
    expect(result).toBeNull();
  });

  it("getSavedAddressForCustomer formata endereço igual ao usado pelo WhatsApp", async () => {
    db.order.findFirst.mockResolvedValue({
      deliveryAddress: { street: "Av. Brasil", number: "42", neighborhood: "Jardim", city: "São Paulo" },
    });
    const addr = await getSavedAddressForCustomer("cust-1");
    expect(addr).not.toBeNull();
    expect(addr!.formatted).toContain("Av. Brasil, 42");
    expect(addr!.formatted).toContain("Jardim");
  });
});

// ── 7. Pagamento só vem depois do endereço/frete ────────────────────────────

describe("7 — pagamento após endereço e frete", () => {
  it("confirmação do endereço salvo não salta direto para pagamento", () => {
    const s = withItem(fresh({ savedAddress: SAVED }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    s.stage = "COLLECTING_ADDRESS";
    const r = advanceSession(s, "1", MENU);
    // Stage goes to CALCULATING_DELIVERY_FEE, not payment
    expect(r.session.stage).toBe("CALCULATING_DELIVERY_FEE");
    expect(r.session.paymentMethod).toBeNull();
    expect(r.actions).toContain("QUOTE_DELIVERY");
    expect(r.actions).not.toContain("CREATE_ORDER");
    expect(r.actions).not.toContain("GENERATE_PIX");
  });

  it("frete calculado → só então pergunta pagamento", () => {
    // Simulate post-QUOTE_DELIVERY state (deliveryQuote is set externally)
    const s = withItem(fresh({ savedAddress: SAVED, cartFinalized: true }));
    (s as { deliveryType: string | null }).deliveryType = "DELIVERY";
    (s as { address: unknown }).address = { street: "Rua das Flores", number: "123", neighborhood: "Centro" };
    (s as { deliveryQuote: unknown }).deliveryQuote = { fee: 8, distanceKm: 2, status: "ok" };
    s.stage = "BUILDING_CART";
    const r = advanceSession(s, "9", MENU);
    expect(r.session.stage).toBe("COLLECTING_PAYMENT_METHOD");
    expect(r.suggestedReply).toMatch(/pagar|pagamento/i);
  });
});
