/**
 * Routing diagnostic — prova que o diagnóstico de roteamento por telefone é
 * somente leitura (nada enviado/criado), mascara o telefone, e responde
 * corretamente: allowlist→FULL_TEST, fora→recepcionista (+payload sugerido),
 * paused bloqueia, HUMAN/aiLocked é reportado como bloqueio de conversa.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findFirst: vi.fn() },
  whatsAppTextOrderingConfig: { findUnique: vi.fn() },
  whatsAppOrderingSession: { findFirst: vi.fn() },
  conversation: { findMany: vi.fn() },
  message: { create: vi.fn() },
  order: { create: vi.fn() },
  payment: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runRoutingDiagnostic } from "../routingDiagnostic";

const PHONE = "+5511999990000";

function configRow(over: Partial<{ mode: string; scope: string; enabled: boolean; paused: boolean; allowlistedPhones: string[] }> = {}) {
  return {
    restaurantId: "r1", enabled: true, mode: "ALLOWLIST_FULL_TEST", scope: "PHONE_ALLOWLIST",
    allowlistedPhones: [PHONE], paused: false, notes: null, updatedAt: new Date(), ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
  delete process.env.WHATSAPP_TEXT_ORDERING_PAUSED;
  db.restaurant.findFirst.mockResolvedValue({ id: "r1", name: "Sushi Cazza" });
  db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow());
  db.whatsAppOrderingSession.findFirst.mockResolvedValue(null);
  db.conversation.findMany.mockResolvedValue([]);
});

describe("(1) telefone na allowlist entra no FULL_TEST", () => {
  it("wouldEnterTextOrder=true, decisão TEXT_ORDER_FULL_TEST, firstStage=IDLE", async () => {
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: PHONE });
    expect(r.ok).toBe(true);
    expect(r.phoneInAllowlist).toBe(true);
    expect(r.wouldEnterTextOrder).toBe(true);
    expect(r.wouldFallbackToReceptionist).toBe(false);
    expect(r.effectiveDecision).toBe("TEXT_ORDER_FULL_TEST");
    expect(r.firstStage).toBe("IDLE");
    expect(r.mode).toBe("ALLOWLIST_FULL_TEST");
    expect(r.scope).toBe("PHONE_ALLOWLIST");
  });

  it("formato tolerante: sem +55 também casa a allowlist", async () => {
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: "11999990000" });
    expect(r.phoneInAllowlist).toBe(true);
    expect(r.wouldEnterTextOrder).toBe(true);
  });

  it("sem phone informado → self-test do 1º número da allowlist", async () => {
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza" });
    expect(r.phoneSource).toBe("allowlist");
    expect(r.wouldEnterTextOrder).toBe(true);
  });
});

describe("(2) fora da allowlist cai no recepcionista", () => {
  it("reporta o motivo exato e devolve payload sugerido SEM aplicar", async () => {
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: "+5511888887777" });
    expect(r.phoneInAllowlist).toBe(false);
    expect(r.wouldEnterTextOrder).toBe(false);
    expect(r.wouldFallbackToReceptionist).toBe(true);
    expect(r.effectiveDecision).toBe("RECEPTIONIST");
    expect(r.declineReason).toBe("O número testado não está na allowlist. Por isso ele cairá no recepcionista normal.");
    expect(r.addAllowlistPayload).toEqual({ allowlistedPhones: [PHONE, "+5511888887777"] });
    // nada foi alterado: nenhuma escrita de config
    expect(db.message.create).not.toHaveBeenCalled();
  });
});

describe("(3) config paused bloqueia", () => {
  it("paused=true → recepcionista, com motivo", async () => {
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(configRow({ paused: true }));
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: PHONE });
    expect(r.wouldEnterTextOrder).toBe(false);
    expect(r.effectiveDecision).toBe("RECEPTIONIST");
    expect(String(r.declineReason)).toMatch(/paused|pausa/i);
  });
});

describe("(4) HUMAN/aiLocked é reportado como bloqueio", () => {
  it("conversa HUMAN aparece em conversationBlocks com sugestão (sem executar)", async () => {
    db.conversation.findMany.mockResolvedValue([
      { id: "c1", status: "HUMAN", aiEnabled: false, aiLocked: false, aiLockedReason: null },
    ]);
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: PHONE });
    expect(r.conversationBlocks).toHaveLength(1);
    expect(r.conversationBlocks[0]!.reason).toContain("atendimento humano");
    expect(r.conversationBlocks[0]!.suggestedUnblock).toBeTruthy();
  });

  it("aiLocked aparece com motivo e ação manual", async () => {
    db.conversation.findMany.mockResolvedValue([
      { id: "c2", status: "OPEN", aiEnabled: true, aiLocked: true, aiLockedReason: "STAFF" },
    ]);
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: PHONE });
    expect(r.conversationBlocks[0]!.aiLocked).toBe(true);
    expect(r.conversationBlocks[0]!.reason).toContain("aiLocked");
  });
});

describe("(5–9) segurança do diagnóstico", () => {
  it("(5) mascara o telefone — nunca devolve o número em claro no campo phoneMasked", async () => {
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: PHONE });
    expect(r.phoneMasked).toBeTruthy();
    expect(r.phoneMasked).not.toContain("99999");
    expect(r.phoneMasked).toMatch(/\*\*\*/);
  });

  it("(6/7/8/9) não envia WhatsApp, não cria pedido, não gera Pix, runtimeTouched=false", async () => {
    const r = await runRoutingDiagnostic({ restaurantSlug: "sushi-cazza", phone: PHONE });
    expect(db.message.create).not.toHaveBeenCalled();
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(r.runtimeTouched).toBe(false);
    expect(r.noEvolution).toBe(true);
    expect(r.noRealOrder).toBe(true);
    expect(r.noRealPix).toBe(true);
  });
});
