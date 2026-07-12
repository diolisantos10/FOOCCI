/**
 * WhatsAppHostRoutingPreview — golden tests for the receptionist-path
 * observability layer (the P0 "host routing diagnostic" round).
 *
 * Asserts:
 *  - previewReceptionistResponse() predicts the SAFE reply for the real cases
 *    (explicit order outside allowlist, loose address, simple "tem X?");
 *  - classifyReplyText() labels finished replies correctly (SAFE_MENU vs
 *    LINK_CARDAPIO vs HANDOFF vs LOCATION);
 *  - decideHost() maps a routing decision (+ human block) to the right host.
 *
 * Hermetic: no Evolution, no order, no Pix, no DB writes — pure functions.
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({ EvolutionConfigService: class {} }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({ EvolutionClient: class {} }));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({ detectBuildCommand: () => false }));
vi.mock("@/services/knowledge/RestaurantKnowledgeService", () => ({ RestaurantKnowledgeService: class {} }));
vi.mock("@/lib/handoff", () => ({ markConversationNeedsHuman: vi.fn() }));
vi.mock("@/lib/wa-token", () => ({ signWaToken: vi.fn() }));
vi.mock("@/services/ai/UnknownFallbackHandler", () => ({
  P0_FALLBACK_REPLY: "Só um minutinho, vou chamar um atendente para te ajudar. 🤝",
  isRepeatedClarificationLoop: vi.fn(() => false), classifyReceptionistFailure: vi.fn(),
}));
vi.mock("@/services/agent-training/AgentTrainingFailureCaptureService", () => ({ captureFailure: vi.fn() }));

import {
  previewReceptionistResponse,
  classifyReplyText,
  type ReplyContext,
} from "../WhatsAppReceptionistService";
import { decideHost } from "@/services/whatsapp/ordering/hostRoutingDiagnostic";
import type { MessageAwareRouteDecision } from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";
import type { MenuOption } from "@/validators/whatsapp-agent";

const OPTIONS: MenuOption[] = [
  { id: "1", label: "Fazer pedido", flow: "order" },
  { id: "2", label: "Ver cardápio", flow: "menu" },
  { id: "3", label: "Falar com atendente", flow: "handoff" },
];

function ctx(overrides: Partial<ReplyContext> = {}): ReplyContext {
  return {
    restaurantName: "Sushi Cazza", agentName: "Bot", customerName: null,
    pedidoUrl: "https://foocci.com.br/pedido/sushi-cazza", qrMenuUrl: null,
    address: "Rua do Restaurante, 1, Centro", deliveryEnabled: true,
    welcomeMessage: "Bem-vindo!", orderPreMessage: "Acesse o cardápio:", handoffMessage: "Estou chamando um atendente, aguarde um momento 🤝",
    agentMode: "RECEPTIONIST_ONLY", menuOptions: OPTIONS, hoursText: null,
    isCurrentlyOpen: true, closedMessage: null, isPaused: false, pauseReason: null,
    menuCatalog: [{ name: "Temakis", items: [{ name: "Temaki Salmão" }] }],
    instagramUrl: null, tiktokUrl: null, ...overrides,
  };
}

// ── classifyReplyText ─────────────────────────────────────────────────────────
describe("classifyReplyText", () => {
  it("menu numerado sem link → SAFE_MENU", () => {
    expect(classifyReplyText("Claro 😊 escolha:\n\n1️⃣ Fazer pedido\n2️⃣ Falar com atendente\n\n0. menu")).toBe("SAFE_MENU");
  });
  it("link de cardápio → LINK_CARDAPIO", () => {
    expect(classifyReplyText("Acesse o cardápio:\n\nhttps://foocci.com.br/pedido/x\n\n0. menu")).toBe("LINK_CARDAPIO");
  });
  it("escalada para humano → HANDOFF", () => {
    expect(classifyReplyText("Estou chamando um atendente, aguarde um momento 🤝")).toBe("HANDOFF");
  });
  it("expõe endereço do restaurante → LOCATION", () => {
    expect(classifyReplyText("Estamos em: Rua do Restaurante, 1", "Rua do Restaurante, 1, Centro")).toBe("LOCATION");
  });
  it("um menu seguro que lista 'Falar com atendente' NÃO é HANDOFF", () => {
    const safe = "Claro 😊 escolha:\n\n1️⃣ Fazer pedido pelo cardápio\n2️⃣ Falar com atendente\n\n0. menu";
    expect(classifyReplyText(safe)).toBe("SAFE_MENU");
  });
});

// ── previewReceptionistResponse — casos reais ─────────────────────────────────
describe("previewReceptionistResponse — pedido explícito fora da allowlist", () => {
  const p = previewReceptionistResponse("Quero 1 rodízio completo por favor\nTemakis grelhados", ctx());
  it("responseType = SAFE_MENU", () => { expect(p.responseType).toBe("SAFE_MENU"); });
  it("não contém link bruto", () => { expect(p.containsRawLink).toBe(false); });
  it("não é handoff e termina com 0. menu", () => {
    expect(p.containsHandoff).toBe(false);
    expect(p.endsWithMenuFooter).toBe(true);
  });
});

describe("previewReceptionistResponse — endereço solto", () => {
  const p = previewReceptionistResponse("Rua Araraquara 60\nCidade Kemel Poá", ctx());
  it("SAFE_MENU sem localização do restaurante e sem link", () => {
    expect(p.responseType).toBe("SAFE_MENU");
    expect(p.containsRestaurantLocation).toBe(false);
    expect(p.containsRawLink).toBe(false);
  });
});

describe("previewReceptionistResponse — 'tem temaki?'", () => {
  const p = previewReceptionistResponse("tem temaki?", ctx());
  // Free-form desligado (decisão de produto pré-lançamento): pergunta aberta de
  // produto NUNCA vira resposta livre do LLM nem link bruto — mas também não
  // deve escalar para humano sozinha (bug corrigido 2026-07-10: UNKNOWN
  // tocava o alarme de atendimento humano sem o cliente pedir). Cai no menu
  // seguro em vez de HANDOFF.
  it("não manda URL gigante e não escala para humano — menu seguro (SAFE_MENU)", () => {
    expect(p.containsRawLink).toBe(false);
    expect(p.responseType).toBe("SAFE_MENU");
    expect(p.containsHandoff).toBe(false);
  });
});

describe("REGRESSÃO 2026-07-10 — UNKNOWN não escala sozinho, sinais explícitos continuam escalando", () => {
  // Relato real: a conversa virou HUMANO (e tocou o alarme) para uma pergunta
  // comum de horário/entrega que o classificador de palavras-chave não
  // reconheceu — o cliente nunca pediu para falar com alguém.
  it("'Quanto tempo mais ou menos?' NÃO escala para humano (frase real do bug relatado)", () => {
    const p = previewReceptionistResponse("Quanto tempo mais ou menos?", ctx());
    expect(p.responseType).not.toBe("HANDOFF");
    expect(p.containsHandoff).toBe(false);
  });

  it("HUMAN_REQUEST continua escalando sempre (sinal explícito)", () => {
    const p = previewReceptionistResponse("quero falar com um atendente", ctx());
    expect(p.responseType).toBe("HANDOFF");
    expect(p.containsHandoff).toBe(true);
  });

  it("COMPLAINT continua escalando sempre (sinal explícito)", () => {
    const p = previewReceptionistResponse("veio errado meu pedido", ctx());
    expect(p.responseType).toBe("HANDOFF");
    expect(p.containsHandoff).toBe(true);
  });

  // Mudança 2026-07-12: ORDER_STATUS ("cadê meu pedido?", "quanto tempo
  // demora") deixou de escalar sozinho — no horário de pico isso lotava a
  // fila de "aguarda atendimento humano" e o alarme não parava. Agora recebe
  // uma resposta acolhedora (menu seguro) e só vira humano se o cliente pedir
  // de fato (→ HUMAN_REQUEST, testado acima).
  it("ORDER_STATUS ('quanto tempo demora') NÃO escala sozinho — resposta acolhedora (SAFE_MENU)", () => {
    const p = previewReceptionistResponse("quanto tempo demora", ctx());
    expect(p.responseType).not.toBe("HANDOFF");
    expect(p.containsHandoff).toBe(false);
  });
});

describe("previewReceptionistResponse — saudação e handoff", () => {
  it("'ola' → SAFE_MENU (menu)", () => {
    expect(previewReceptionistResponse("ola", ctx()).responseType).toBe("SAFE_MENU");
  });
  it("'falar com atendente' → HANDOFF", () => {
    expect(previewReceptionistResponse("falar com atendente", ctx()).responseType).toBe("HANDOFF");
  });
  it("HANDOFF vem do BRANCH, não da cópia — copy custom ainda é HANDOFF", () => {
    // Regression: a custom handoff message a text-classifier could miss must still
    // be labeled HANDOFF because the branch is the ground truth (live A6 blocker).
    const p = previewReceptionistResponse("falar com atendente", ctx({ handoffMessage: "Já vou te transferir, um instante 😊" }));
    expect(p.responseType).toBe("HANDOFF");
    expect(p.containsHandoff).toBe(true);
  });
  it("opção 2 (cardápio) selecionada → LINK_CARDAPIO (cliente pediu o link)", () => {
    expect(previewReceptionistResponse("2", ctx()).responseType).toBe("LINK_CARDAPIO");
  });
});

// ── previewReceptionistResponse — pagamento / Pix (A7-pix P0 fix) ────────────
describe("previewReceptionistResponse — pergunta de pagamento/Pix", () => {
  it("'posso pagar com Pix?' → SAFE_MENU (não LINK_CARDAPIO)", () => {
    const p = previewReceptionistResponse("posso pagar com Pix?", ctx());
    expect(p.responseType).toBe("SAFE_MENU");
    expect(p.containsRawLink).toBe(false);
  });

  it("'aceita cartão?' → SAFE_MENU sem link bruto", () => {
    const p = previewReceptionistResponse("aceita cartão?", ctx());
    expect(p.responseType).toBe("SAFE_MENU");
    expect(p.containsRawLink).toBe(false);
  });

  it("'formas de pagamento?' → deterministic, ends with 0. menu", () => {
    const p = previewReceptionistResponse("formas de pagamento?", ctx());
    expect(p.deterministic).toBe(true);
    expect(p.endsWithMenuFooter).toBe(true);
  });

  it("resposta de pagamento menciona Pix e oferece opções numeradas", () => {
    const p = previewReceptionistResponse("posso pagar com Pix?", ctx());
    expect(p.preview).toMatch(/pix/i);
    expect(p.preview).toMatch(/1️⃣/);
  });

  it("(PART8.3) responde o pagamento ANTES de oferecer o menu de venda", () => {
    const p = previewReceptionistResponse("posso pagar com Pix?", ctx());
    const answerIdx = p.preview.toLowerCase().indexOf("aceitamos");
    const menuIdx = p.preview.indexOf("1️⃣");
    expect(answerIdx).toBeGreaterThanOrEqual(0);
    expect(menuIdx).toBeGreaterThan(answerIdx); // pagamento respondido primeiro, depois conduz
  });
});

// ── rodízio presencial não vira delivery/link errado (PART 8.6) ───────────────
describe("previewReceptionistResponse — rodízio", () => {
  it("'quero rodízio' fora de sessão → SAFE_MENU conduzido (sem link, sem delivery automático)", () => {
    const p = previewReceptionistResponse("quero 1 rodízio", ctx());
    expect(p.responseType).toBe("SAFE_MENU");
    expect(p.containsRawLink).toBe(false);
    // não despeja link de cardápio nem cria fluxo de entrega — apenas conduz com opções.
    expect(p.preview).toMatch(/1️⃣/);
  });
});

// ── decideHost ────────────────────────────────────────────────────────────────
function fakeDecision(over: Partial<MessageAwareRouteDecision> & { mode?: string }): MessageAwareRouteDecision {
  return {
    config: { mode: over.mode ?? "ALLOWLIST_FULL_TEST" } as MessageAwareRouteDecision["config"],
    routingEligible: true, hasActiveSession: false, detectedIntent: "ORDER_REQUEST",
    messageHasOrderIntent: true, wouldRouteToTextOrdering: true, finalHandler: "TEXT_ORDERING",
    replyCapable: true, effectiveFinalHandler: "TEXT_ORDERING", declineReason: null, ...over,
  } as MessageAwareRouteDecision;
}

describe("decideHost", () => {
  it("conversa em HUMAN/aiLocked → HUMAN_BLOCKED", () => {
    const r = decideHost(fakeDecision({}), { status: "HUMAN", aiEnabled: false, aiLocked: false, reason: "Conversa em atendimento humano." });
    expect(r.host).toBe("HUMAN_BLOCKED");
  });
  it("effectiveFinalHandler TEXT_ORDERING → TEXT_ORDER", () => {
    expect(decideHost(fakeDecision({ effectiveFinalHandler: "TEXT_ORDERING" }), null).host).toBe("TEXT_ORDER");
  });
  it("OLD_WHATSAPP_AGENT → RECEPTIONIST com motivo", () => {
    const r = decideHost(fakeDecision({
      effectiveFinalHandler: "OLD_WHATSAPP_AGENT", wouldRouteToTextOrdering: false,
      declineReason: "Telefone não está na lista liberada",
    }), null);
    expect(r.host).toBe("RECEPTIONIST");
    expect(r.reason).toContain("lista liberada");
  });
});
