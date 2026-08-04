/**
 * WhatsAppRealCaseDiagnostics — hermetic reproduction of the REAL incident cases
 *
 * Living regression net keyed to the production failures observed in the field
 * (the "raio-x" round). It drives the 10 real cases through the SAME
 * classification + receptionist decision surface the webhook uses, with NO
 * envio de WhatsApp, NO real order, NO Pix, NO DB writes — pure functions only.
 *
 * Cases that depend on the live catalog or the order state machine (rodízio
 * conducting real temakis, CEP→frete, Pix timing, out-of-hours gate) are
 * asserted only at the layer that is hermetically provable here; the catalog /
 * runtime behaviour is covered by:
 *   - ordering/tests/WhatsAppTextOrderFlow.test.ts        (CEP-first delivery, Pix after summary)
 *   - ordering/tests/WhatsAppLiveHotfix.test.ts           (out-of-hours gate, typo matcher, 2L tie)
 *   - ordering/tests/WhatsAppOrderingScenarioRunner.test.ts (full journeys, DRY_RUN)
 *   - ordering/tests/WhatsAppTextOrderSimulator.test.ts   (hermetic end-to-end)
 *
 * The point of THIS file: prove where each real message lands at the routing /
 * receptionist boundary — the exact surface that mis-handled the print.
 */

import { vi, describe, it, expect } from "vitest";

// ── Mock heavy deps so the receptionist module imports cleanly ────────────────
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));
// Canal único: nenhum envio real de WhatsApp neste teste.
vi.mock("@/services/whatsapp/WhatsAppMessagingService", () => ({
  WhatsAppMessagingService: { sendText: vi.fn(), sendConversationReply: vi.fn() },
}));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({ detectBuildCommand: () => false }));
vi.mock("@/services/knowledge/RestaurantKnowledgeService", () => ({ RestaurantKnowledgeService: class {} }));
vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/business-hours", () => ({
  getPeriodsForRow: vi.fn(), isInPeriod: vi.fn(), getNextOpenAt: vi.fn(), buildClosedMessage: vi.fn(),
}));
vi.mock("@/lib/public-url", () => ({
  getPublicMenuUrl: vi.fn(), getPublicQrUrl: vi.fn(), sanitizeCustomerUrl: (u: string) => u,
}));
vi.mock("@/lib/wa-token", () => ({ signWaToken: vi.fn() }));
vi.mock("@/services/ai/UnknownFallbackHandler", () => ({
  P0_FALLBACK_REPLY: "atendente", isRepeatedClarificationLoop: vi.fn(() => false), classifyReceptionistFailure: vi.fn(),
}));
vi.mock("@/services/agent-training/AgentTrainingFailureCaptureService", () => ({ captureFailure: vi.fn() }));

import {
  detectIntent as receptionistIntent,
  isExplicitOrderMessage,
  looksLikeLooseAddress,
  buildOrderIntentReply,
  buildLooseAddressReply,
  appendBackToMainMenu,
  type ReplyContext,
} from "../WhatsAppReceptionistService";
import { detectIntent as orderingIntent } from "@/services/whatsapp/ordering/parser";

function ctx(overrides: Partial<ReplyContext> = {}): ReplyContext {
  return {
    restaurantName: "Sushi Cazza", agentName: "Bot", customerName: null,
    pedidoUrl: "https://foocci.com.br/pedido/sushi-cazza", qrMenuUrl: null,
    address: "Rua do Restaurante, 1, Centro", deliveryEnabled: true,
    welcomeMessage: "Bem-vindo!", orderPreMessage: "Cardápio:", handoffMessage: "Chamando atendente 🤝",
    agentMode: "RECEPTIONIST_ONLY", menuOptions: [], hoursText: null,
    isCurrentlyOpen: true, closedMessage: null, isPaused: false, pauseReason: null,
    menuCatalog: [], instagramUrl: null, tiktokUrl: null, ...overrides,
  };
}

// ── Caso 1 — saudação ─────────────────────────────────────────────────────────
describe("Caso 1 — saudação 'ola'", () => {
  it("classifica como GREETING (host abre o menu; não é pedido)", () => {
    expect(receptionistIntent("ola")).toBe("GREETING");
    expect(isExplicitOrderMessage("ola")).toBe(false);
    expect(looksLikeLooseAddress("ola")).toBe(false);
  });
  // Regra de novo-dia/inatividade + rodapé "0. menu": run() do recepcionista
  // (cooldown 30min + sameLocalDay) — comportamento com DB, fora deste nível.
});

// ── Caso 2 — pedido simples ───────────────────────────────────────────────────
describe("Caso 2 — 'quero 1 yakisoba e 1 coca cola'", () => {
  it("é pedido explícito (entra no Text Order se allowlisted)", () => {
    expect(orderingIntent("quero 1 yakisoba e 1 coca cola")).toBe("ORDER_REQUEST");
    expect(isExplicitOrderMessage("quero 1 yakisoba e 1 coca cola")).toBe(true);
  });
  it("fora da allowlist: recepcionista NÃO manda link bruto", () => {
    expect(buildOrderIntentReply(ctx())).not.toContain("http");
  });
  // Comanda + Coca ambígua (lata vs 2L, nunca auto-2L): menuMatcher + state machine
  // → ordering/tests/WhatsAppLiveHotfix.test.ts (containment-tie).
});

// ── Caso 3 — typo ─────────────────────────────────────────────────────────────
describe("Caso 3 — 'quero yaksoba e coca'", () => {
  it("ainda é pedido explícito (não cai em 'não encontrei' no roteamento)", () => {
    expect(orderingIntent("quero yaksoba e coca")).toBe("ORDER_REQUEST");
    expect(isExplicitOrderMessage("quero yaksoba e coca")).toBe(true);
  });
  // 'yaksoba' → Yakisoba (Levenshtein bounded): menuMatcher tests.
});

// ── Caso 4 — rodízio + temaki (o print) ───────────────────────────────────────
describe("Caso 4 — 'Quero 1 rodízio completo por favor\\nTemakis grelhados'", () => {
  const msg = "Quero 1 rodízio completo por favor\nTemakis grelhados";
  it("classifica como pedido explícito", () => {
    expect(orderingIntent(msg)).toBe("ORDER_REQUEST");
    expect(isExplicitOrderMessage(msg)).toBe(true);
  });
  it("fora da allowlist: conduz pelo menu configurável, sem link e sem 'temos X sim'", () => {
    const reply = buildOrderIntentReply(ctx({
      menuOptions: [
        { id: "o", label: "Fazer pedido",        flow: "order"   },
        { id: "h", label: "Falar com atendente", flow: "handoff" },
      ],
    }));
    expect(reply).not.toContain("http");
    expect(reply.toLowerCase()).not.toContain("temos");
    expect(reply.toLowerCase()).toContain("atendente");
  });
  // Conduzir temakis reais / explicar rodízio presencial: depende do catálogo →
  // validação em campo (allowlist) + state machine. NÃO assertável hermético.
});

// ── Caso 5 — pergunta simples ─────────────────────────────────────────────────
describe("Caso 5 — 'tem temaki?'", () => {
  it("é pergunta, NÃO inicia pedido", () => {
    expect(orderingIntent("tem temaki?")).not.toBe("ORDER_REQUEST");
    expect(isExplicitOrderMessage("tem temaki?")).toBe(false);
  });
});

// ── Caso 6 — endereço solto ───────────────────────────────────────────────────
describe("Caso 6 — 'Rua Araraquara 60\\nCidade Kemel Poá'", () => {
  const addr = "Rua Araraquara 60\nCidade Kemel Poá";
  it("é detectado como endereço solto e NÃO como pedido", () => {
    expect(looksLikeLooseAddress(addr)).toBe(true);
    expect(isExplicitOrderMessage(addr)).toBe(false);
  });
  it("sem sessão: não devolve a localização do restaurante e não manda link", () => {
    const reply = buildLooseAddressReply(ctx({ address: "Rua do Restaurante, 1, Centro" }));
    expect(reply).not.toContain("Rua do Restaurante");
    expect(reply).not.toContain("http");
    expect(reply.toLowerCase()).toContain("cep"); // orienta a iniciar pedido / CEP
  });
  // Com sessão ativa → CEP-first: ordering/tests/WhatsAppTextOrderFlow.test.ts.
});

// ── Caso 10 — humano ──────────────────────────────────────────────────────────
describe("Caso 10 — 'falar com atendente'", () => {
  it("classifica como HUMAN_REQUEST (handoff)", () => {
    expect(receptionistIntent("falar com atendente")).toBe("HUMAN_REQUEST");
    expect(receptionistIntent("quero falar com atendente")).toBe("HUMAN_REQUEST");
  });
});

// ── Invariantes de segurança do rodapé ────────────────────────────────────────
describe("invariantes — toda resposta de fallback termina com 0. menu", () => {
  for (const [name, reply] of [
    ["pedido fora da allowlist", buildOrderIntentReply(ctx())],
    ["endereço solto", buildLooseAddressReply(ctx())],
  ] as const) {
    it(`${name} termina com 0. menu`, () => {
      expect(appendBackToMainMenu(reply).endsWith("0. menu")).toBe(true);
    });
  }
});

/*
 * Casos 7 (entrega CEP→frete), 8 (fora do horário), 9 (Pix após confirmação):
 * vivem no runtime/state machine e são cobertos hermeticamente por:
 *   - WhatsAppTextOrderFlow.test.ts / WhatsAppOrderingFlow.test.ts (CEP-first, frete, Pix após resumo)
 *   - WhatsAppLiveHotfix.test.ts (gate de horário antes da comanda)
 * Aqui ficam fora de escopo por exigirem catálogo/sessão; ver doc raio-x §5/§12.
 */
