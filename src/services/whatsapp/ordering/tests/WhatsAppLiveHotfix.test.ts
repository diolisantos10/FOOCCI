/**
 * P0 live hotfix — bugs reais do teste no aparelho antes da abertura do delivery:
 * typo no produto (yaksoba), Coca-Cola escolhendo 2L sozinha, pedido iniciando
 * fora do horário, entrega sem CEP, numeração sem emoji e rodapé fora do padrão.
 */

import { describe, it, expect } from "vitest";
import { advanceSession } from "../WhatsAppOrderStateMachine";
import { bestMenuMatch, matchItems } from "../menuMatcher";
import { processCustomerMessage } from "../WhatsAppTextOrderService";
import { withMenuFooter, MENU_FOOTER, formatOptionNumber, renderNumberedOptions } from "../menuFooter";
import type { WaMenuItem, WaPersistedSession } from "../types";

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
} as WaMenuItem);

const MENU: WaMenuItem[] = [
  mk({ id: "y1", name: "Yakisoba Carne e Frango", price: 54 }),
  mk({ id: "y2", name: "Yakisoba de Camarão", price: 82 }),
  mk({ id: "c1", name: "Coca-Cola lata", price: 7 }),
  mk({ id: "c2", name: "Coca-Cola 2L", price: 20 }),
  mk({ id: "t1", name: "Temaki Salmão", price: 29.9 }),
];

function fresh(meta: Record<string, unknown> | null = null): WaPersistedSession {
  const now = new Date();
  return {
    id: "s1", restaurantId: "r1", customerId: null, conversationId: null, phone: "+5511999990223",
    status: "ACTIVE", stage: "IDLE", selectedItems: [], unresolvedItems: [], missingQuestions: [],
    deliveryType: null, address: null, deliveryQuote: null, paymentMethod: null, paymentStatus: null,
    orderDraftId: null, orderId: null, pixPaymentId: null, mode: "ALLOWLIST_FULL_TEST", source: "admin_test",
    metadata: meta, lastMessageAt: now, expiresAt: null, createdAt: now, updatedAt: now,
  } as WaPersistedSession;
}

describe("(4) matcher tolerante a typo", () => {
  it("'yaksoba' encontra os Yakisobas (nunca 'não encontrei')", () => {
    const best = bestMenuMatch("yaksoba", MENU);
    expect(best.candidates.length).toBeGreaterThanOrEqual(2);
    expect(best.candidates.every(c => /yakisoba/i.test(c.name))).toBe(true);
  });

  it("'yaksoba e coca cola' não falha por typo — yakisoba vira pendente/ambíguo", () => {
    const r = advanceSession(fresh(), "quero 1 yaksoba e 1 coca cola", MENU);
    const all = [...r.session.selectedItems.map(i => i.menuItemName), ...r.session.unresolvedItems.map(u => u.rawText)].join(" | ");
    expect(r.suggestedReply).not.toMatch(/não encontrei "?yaksoba/i);
    expect(all.toLowerCase()).toMatch(/yakisoba|yaksoba/);
  });

  it("typo em bebida ('coca colaa') também sugere Coca-Cola", () => {
    const best = bestMenuMatch("coca colaa", MENU);
    expect(best.candidates.some(c => /coca/i.test(c.name))).toBe(true);
  });
});

describe("(5) Coca-Cola/refrigerante nunca escolhe a 2L sozinha", () => {
  it("'coca cola' com lata E 2L no cardápio → pergunta com opções (sem auto-pick)", () => {
    const m = matchItems([{ rawText: "coca cola", name: "coca cola", quantity: 1 }], MENU);
    expect(m.matched).toHaveLength(0);
    expect(m.unresolved[0]?.reason).toBe("AMBIGUOUS");
    expect(m.unresolved[0]?.candidates.join(" ")).toMatch(/lata/i);
    expect(m.unresolved[0]?.candidates.join(" ")).toMatch(/2L/i);
  });

  it("a pergunta de ambiguidade usa numeração emoji", () => {
    const r = advanceSession(fresh(), "quero 1 coca cola", MENU);
    expect(r.suggestedReply).toContain("1️⃣");
    expect(r.suggestedReply).toContain("2️⃣");
    expect(r.suggestedReply).toContain(MENU_FOOTER);
  });
});

describe("(6) fora do horário bloqueia ANTES da comanda", () => {
  const closedInput = {
    restaurantId: "r1", phone: "+5511999990223", messageText: "quero 1 yakisoba carne e frango",
    mode: "ALLOWLIST_FULL_TEST" as const, currentSession: null, allowSideEffects: false,
    menu: MENU, isOpen: false,
  };

  it("não cria comanda, não pergunta pagamento, não gera Pix", async () => {
    const r = await processCustomerMessage(closedInput);
    expect(r.matchedItems).toHaveLength(0);
    expect(r.session.selectedItems).toHaveLength(0);
    expect(r.actions).toEqual([]);
    expect(r.payment).toBeNull();
    expect(r.order).toBeNull();
    expect(r.suggestedReply).toContain("fora do horário");
    expect(r.suggestedReply).toContain("1️⃣ Cardápio");
    expect(r.suggestedReply).toContain(MENU_FOOTER);
  });

  it("mesmo com sessão ativa em pagamento, fechado não segue para Pix", async () => {
    const s = fresh();
    s.stage = "COLLECTING_PAYMENT_METHOD";
    const r = await processCustomerMessage({ ...closedInput, currentSession: s, messageText: "pix" });
    expect(r.actions).toEqual([]);
    expect(r.suggestedReply).toContain("fora do horário");
  });
});

describe("(7) entrega segue o fluxo do Fute: CEP primeiro", () => {
  const fakeCep = async (cep: string) => ({ cep: cep.replace(/\D/g, ""), street: "Rua Illo Otani", neighborhood: "Centro", city: "São Paulo", uf: "SP" });
  const quoter = async () => ({ fee: 5, distanceKm: 1.2, status: "ok" as const });
  const base = {
    restaurantId: "r1", phone: "+5511999990223", mode: "ALLOWLIST_FULL_TEST" as const,
    allowSideEffects: false, menu: MENU, cepLookup: fakeCep, deliveryQuoter: quoter,
  };

  it("endereço textual sem CEP pede CEP; CEP puxa endereço; confirmação; número; frete oficial", async () => {
    // monta a comanda; "entrega" captura tipo mas fica no BUILDING_CART; "9" finaliza e pede CEP
    let r = await processCustomerMessage({ ...base, messageText: "quero 1 temaki", currentSession: null });
    r = await processCustomerMessage({ ...base, messageText: "entrega", currentSession: r.session });
    r = await processCustomerMessage({ ...base, messageText: "9", currentSession: r.session });
    expect(r.suggestedReply.toLowerCase()).toContain("cep");

    // rua solta sem CEP → re-pede CEP (nunca aceita endereço solto como caminho principal)
    r = await processCustomerMessage({ ...base, messageText: "Rua illo otani 520", currentSession: r.session });
    expect(r.suggestedReply.toLowerCase()).toContain("primeiro o cep");
    expect(r.actions).not.toContain("QUOTE_DELIVERY");

    // CEP válido → busca e confirma com opções emoji
    r = await processCustomerMessage({ ...base, messageText: "03177-010", currentSession: r.session });
    expect(r.suggestedReply).toContain("Rua Illo Otani");
    expect(r.suggestedReply).toContain("1️⃣ Sim");
    expect(r.suggestedReply).toContain("2️⃣ Corrigir");

    // confirma → pede número
    r = await processCustomerMessage({ ...base, messageText: "1", currentSession: r.session });
    expect(r.suggestedReply.toLowerCase()).toContain("número");

    // número → frete OFICIAL via quoter injetado (R$5, não fallback genérico)
    r = await processCustomerMessage({ ...base, messageText: "520", currentSession: r.session });
    expect(r.session.address?.street).toBe("Rua Illo Otani");
    expect(r.session.address?.number).toBe("520");
    expect(r.session.deliveryQuote?.fee).toBe(5);
    expect(r.suggestedReply).toContain("R$ 5.00");
    // pagamento só depois do frete correto
    expect(r.suggestedReply.toLowerCase()).toContain("pagar");
  });

  it("CEP não encontrado pede o CEP de novo (sem travar)", async () => {
    let r = await processCustomerMessage({ ...base, cepLookup: async () => null, messageText: "quero 1 temaki", currentSession: null });
    r = await processCustomerMessage({ ...base, cepLookup: async () => null, messageText: "entrega", currentSession: r.session });
    r = await processCustomerMessage({ ...base, cepLookup: async () => null, messageText: "9", currentSession: r.session });
    r = await processCustomerMessage({ ...base, cepLookup: async () => null, messageText: "99999-999", currentSession: r.session });
    expect(r.suggestedReply.toLowerCase()).toContain("não encontrei esse cep");
    expect(r.suggestedReply).toContain(MENU_FOOTER);
  });
});

describe("(3) helpers de padrão", () => {
  it("formatOptionNumber/renderNumberedOptions usam emoji 1️⃣..9️⃣", () => {
    expect(formatOptionNumber(1)).toBe("1️⃣");
    expect(formatOptionNumber(9)).toBe("9️⃣");
    expect(formatOptionNumber(10)).toBe("10.");
    expect(renderNumberedOptions(["Entrega", "Retirada"])).toBe("1️⃣ Entrega\n2️⃣ Retirada");
  });

  it("withMenuFooter normaliza variantes para exatamente `0. menu`", () => {
    expect(withMenuFooter("Oi\n\n0. voltar ao menu principal")).toBe("Oi\n\n0. menu");
    expect(withMenuFooter("Oi")).toBe("Oi\n\n0. menu");
  });
});
