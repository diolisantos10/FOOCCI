/**
 * WhatsAppReceptionistMenuBehavior — pure-function unit tests
 *
 * Covers the "0️⃣ Voltar ao menu principal" contract:
 *   - BACK_TO_MENU_RE matches "0", "voltar", "menu", etc.
 *   - BACK_TO_MENU_FOOTER is appended to every non-handoff reply.
 *   - appendBackToMainMenu / buildMenuList / renderMainMenu produce correct text.
 *   - detectSelectedOption: "0" is NOT a valid 1-indexed option.
 *   - detectIntent: intent detection priority order.
 *   - buildFlowReply: correct text per flow type.
 *
 * No DB, no WhatsApp send, no orders, no Pix.
 */

import { vi, describe, it, expect } from "vitest";

// ── Mock all heavy dependencies BEFORE importing the service ──────────────────
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/services/evolution/EvolutionConfigService", () => ({
  EvolutionConfigService: class { getConfig() { return null; } },
}));
vi.mock("@/lib/evolution/EvolutionClient", () => ({
  EvolutionClient: class {},
}));
vi.mock("@/services/buildos/BuildCommandRouter", () => ({
  detectBuildCommand: () => false,
}));
vi.mock("@/services/knowledge/RestaurantKnowledgeService", () => ({
  RestaurantKnowledgeService: class {},
}));
vi.mock("@/lib/handoff", () => ({
  markConversationNeedsHuman: vi.fn(),
}));
vi.mock("@/lib/business-hours", () => ({
  getPeriodsForRow: vi.fn(),
  isInPeriod:       vi.fn(),
  getNextOpenAt:    vi.fn(),
  buildClosedMessage: vi.fn(),
}));
vi.mock("@/lib/public-url", () => ({
  getPublicMenuUrl:    vi.fn(),
  getPublicQrUrl:      vi.fn(),
  sanitizeCustomerUrl: (u: string) => u,
}));
vi.mock("@/lib/wa-token", () => ({
  signWaToken: vi.fn(),
}));
vi.mock("@/services/ai/UnknownFallbackHandler", () => ({
  P0_FALLBACK_REPLY:             "Só um minutinho, vou chamar um atendente para te ajudar. 🤝",
  isRepeatedClarificationLoop:   vi.fn(() => false),
  classifyReceptionistFailure:   vi.fn(),
}));
vi.mock("@/services/agent-training/AgentTrainingFailureCaptureService", () => ({
  captureFailure: vi.fn(),
}));

import {
  BACK_TO_MENU_RE,
  BACK_TO_MENU_FOOTER,
  appendBackToMainMenu,
  buildMenuList,
  detectSelectedOption,
  renderMainMenu,
  buildFlowReply,
  detectIntent,
  type ReplyContext,
} from "../WhatsAppReceptionistService";
import type { MenuOption } from "@/validators/whatsapp-agent";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const THREE_OPTIONS: MenuOption[] = [
  { id: "opt-1", label: "Fazer pedido",           flow: "order"   },
  { id: "opt-2", label: "Ver cardápio",            flow: "menu"    },
  { id: "opt-3", label: "Falar com atendente",     flow: "handoff" },
];

function makeCtx(overrides: Partial<ReplyContext> = {}): ReplyContext {
  return {
    restaurantName:  "Sushi Cazza",
    agentName:       "Cazza Bot",
    customerName:    null,
    pedidoUrl:       "https://foocci.com.br/pedido/sushi-cazza",
    qrMenuUrl:       null,
    address:         null,
    deliveryEnabled: true,
    welcomeMessage:  "Bem-vindo ao Sushi Cazza!",
    orderPreMessage: "Clique no link para fazer seu pedido 😊",
    handoffMessage:  "Estou chamando um atendente, aguarde um momento 🤝",
    agentMode:       "RECEPTIONIST_ONLY",
    menuOptions:     THREE_OPTIONS,
    hoursText:       null,
    isCurrentlyOpen: true,
    closedMessage:   null,
    isPaused:        false,
    pauseReason:     null,
    menuCatalog:     [],
    instagramUrl:    null,
    tiktokUrl:       null,
    ...overrides,
  };
}

// ── BACK_TO_MENU_RE ───────────────────────────────────────────────────────────

describe("BACK_TO_MENU_RE — should match back-to-menu triggers", () => {
  const shouldMatch = [
    "0",
    "voltar",
    "VOLTAR",
    "menu",
    "MENU",
    "Menu",
    "menu principal",
    "Menu Principal",
    "MENU PRINCIPAL",
    "voltar menu",
    "Voltar Menu",
    "início",
    "Início",
    "inicio",
    "INICIO",
  ];

  for (const input of shouldMatch) {
    it(`matches "${input}"`, () => {
      expect(BACK_TO_MENU_RE.test(input.trim())).toBe(true);
    });
  }
});

describe("BACK_TO_MENU_RE — should NOT match non-trigger text", () => {
  const shouldNotMatch = [
    "01",
    "00",
    "0️⃣",
    "1",
    "2",
    "volta",
    "voltando",
    "oi",
    "Quero o menu",
    "ver menu",
    "me manda o menu",
    "cardápio",
    "Bom dia",
    "Quero pedir",
    "menu de sobremesas",
    "",
  ];

  for (const input of shouldNotMatch) {
    it(`does NOT match "${input}"`, () => {
      expect(BACK_TO_MENU_RE.test(input.trim())).toBe(false);
    });
  }
});

// ── appendBackToMainMenu ──────────────────────────────────────────────────────

describe("appendBackToMainMenu", () => {
  it("appends the footer to a non-empty reply", () => {
    expect(appendBackToMainMenu("Aqui está nosso cardápio: https://x.com")).toBe(
      "Aqui está nosso cardápio: https://x.com\n\n0️⃣ Voltar ao menu principal",
    );
  });

  it("appends the footer to an empty string", () => {
    expect(appendBackToMainMenu("")).toBe("\n\n0️⃣ Voltar ao menu principal");
  });

  it("BACK_TO_MENU_FOOTER is the exact suffix that gets appended", () => {
    const base = "resposta qualquer";
    expect(appendBackToMainMenu(base)).toBe(base + BACK_TO_MENU_FOOTER);
  });
});

// ── buildMenuList ─────────────────────────────────────────────────────────────

describe("buildMenuList", () => {
  it("returns empty string for empty options", () => {
    expect(buildMenuList([])).toBe("");
  });

  it("formats a single option with emoji 1️⃣", () => {
    const opts: MenuOption[] = [{ id: "a", label: "Fazer pedido", flow: "order" }];
    const result = buildMenuList(opts);
    expect(result).toContain("1️⃣ Fazer pedido");
    expect(result.startsWith("\n\n")).toBe(true);
  });

  it("formats three options with correct emoji numbers", () => {
    const result = buildMenuList(THREE_OPTIONS);
    expect(result).toContain("1️⃣ Fazer pedido");
    expect(result).toContain("2️⃣ Ver cardápio");
    expect(result).toContain("3️⃣ Falar com atendente");
  });

  it("separates options with newlines", () => {
    const result = buildMenuList(THREE_OPTIONS);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(3);
  });
});

// ── detectSelectedOption ──────────────────────────────────────────────────────

describe("detectSelectedOption", () => {
  it("returns first option when customer sends '1'", () => {
    expect(detectSelectedOption("1", THREE_OPTIONS)).toEqual(THREE_OPTIONS[0]);
  });

  it("returns second option when customer sends '2'", () => {
    expect(detectSelectedOption("2", THREE_OPTIONS)).toEqual(THREE_OPTIONS[1]);
  });

  it("returns third option when customer sends '3'", () => {
    expect(detectSelectedOption("3", THREE_OPTIONS)).toEqual(THREE_OPTIONS[2]);
  });

  it("returns null for '0' — 0 is back-to-menu, not a valid 1-indexed option", () => {
    expect(detectSelectedOption("0", THREE_OPTIONS)).toBeNull();
  });

  it("returns null for out-of-range '4' with three options", () => {
    expect(detectSelectedOption("4", THREE_OPTIONS)).toBeNull();
  });

  it("returns null when options list is empty", () => {
    expect(detectSelectedOption("1", [])).toBeNull();
  });

  it("matches by exact label (case insensitive)", () => {
    expect(detectSelectedOption("fazer pedido", THREE_OPTIONS)).toEqual(THREE_OPTIONS[0]);
    expect(detectSelectedOption("VER CARDÁPIO", THREE_OPTIONS)).toEqual(THREE_OPTIONS[1]);
  });

  it("returns null for partial label match", () => {
    expect(detectSelectedOption("fazer", THREE_OPTIONS)).toBeNull();
  });
});

// ── renderMainMenu ────────────────────────────────────────────────────────────

describe("renderMainMenu", () => {
  it("returns the 'Voltando ao menu principal' header with numbered list", () => {
    const result = renderMainMenu(makeCtx());
    expect(result).toContain("Voltando ao menu principal");
    expect(result).toContain("1️⃣ Fazer pedido");
    expect(result).toContain("2️⃣ Ver cardápio");
    expect(result).toContain("3️⃣ Falar com atendente");
  });

  it("ends with the respond-by-number prompt", () => {
    const result = renderMainMenu(makeCtx());
    expect(result).toContain("Responda com o número da opção 😊");
  });

  it("falls back to welcomeMessage when menuOptions is empty", () => {
    const result = renderMainMenu(makeCtx({ menuOptions: [] }));
    expect(result).toBe("Bem-vindo ao Sushi Cazza!");
  });
});

// ── buildFlowReply ────────────────────────────────────────────────────────────

describe("buildFlowReply — order flow", () => {
  it("returns pedidoUrl when open and URL is set", () => {
    const opt: MenuOption = { id: "o", label: "Fazer pedido", flow: "order" };
    const result = buildFlowReply(opt, makeCtx());
    expect(result).toContain("https://foocci.com.br/pedido/sushi-cazza");
    expect(result).toContain("Clique no link para fazer seu pedido");
  });

  it("returns closedMessage when restaurant is closed", () => {
    const opt: MenuOption = { id: "o", label: "Fazer pedido", flow: "order" };
    const ctx = makeCtx({ isCurrentlyOpen: false, closedMessage: "Estamos fechados até as 18h." });
    const result = buildFlowReply(opt, ctx);
    expect(result).toContain("Estamos fechados");
  });

  it("includes pedidoUrl in closed reply when URL is present", () => {
    const opt: MenuOption = { id: "o", label: "Fazer pedido", flow: "order" };
    const ctx = makeCtx({ isCurrentlyOpen: false, closedMessage: "Fechado." });
    expect(buildFlowReply(opt, ctx)).toContain("https://foocci.com.br/pedido/sushi-cazza");
  });
});

describe("buildFlowReply — handoff flow", () => {
  it("returns handoffMessage when open", () => {
    const opt: MenuOption = { id: "h", label: "Atendente", flow: "handoff" };
    expect(buildFlowReply(opt, makeCtx())).toBe(
      "Estou chamando um atendente, aguarde um momento 🤝",
    );
  });

  it("does NOT contain BACK_TO_MENU_FOOTER (handoff is exempt — no back option on escalation)", () => {
    const opt: MenuOption = { id: "h", label: "Atendente", flow: "handoff" };
    const reply = buildFlowReply(opt, makeCtx());
    expect(reply).not.toContain("0️⃣ Voltar ao menu principal");
  });
});

describe("buildFlowReply — menu flow", () => {
  it("returns cardápio link", () => {
    const opt: MenuOption = { id: "m", label: "Ver cardápio", flow: "menu" };
    expect(buildFlowReply(opt, makeCtx())).toBe(
      "Aqui está nosso cardápio:\n\nhttps://foocci.com.br/pedido/sushi-cazza",
    );
  });

  it("falls back to contact message when pedidoUrl is null", () => {
    const opt: MenuOption = { id: "m", label: "Ver cardápio", flow: "menu" };
    expect(buildFlowReply(opt, makeCtx({ pedidoUrl: null }))).toContain("Entre em contato");
  });
});

describe("buildFlowReply — custom flow", () => {
  it("returns opt.message when set", () => {
    const opt: MenuOption = { id: "c", label: "Horário", flow: "custom", message: "Seg-Sex 18h-23h." };
    expect(buildFlowReply(opt, makeCtx())).toBe("Seg-Sex 18h-23h.");
  });

  it("falls back to hoursText when opt.message is empty", () => {
    const opt: MenuOption = { id: "c", label: "Horário", flow: "custom", message: "" };
    const ctx = makeCtx({ hoursText: "Seg-Sex 18h-23h, Sáb-Dom 12h-23h." });
    expect(buildFlowReply(opt, ctx)).toBe("Seg-Sex 18h-23h, Sáb-Dom 12h-23h.");
  });
});

describe("buildFlowReply — promotions flow", () => {
  it("returns promotions URL", () => {
    const opt: MenuOption = { id: "p", label: "Promoções", flow: "promotions" };
    expect(buildFlowReply(opt, makeCtx())).toContain("promoções");
    expect(buildFlowReply(opt, makeCtx())).toContain("https://foocci.com.br/pedido/sushi-cazza");
  });
});

// ── detectIntent ──────────────────────────────────────────────────────────────

describe("detectIntent", () => {
  const cases: [string, string][] = [
    ["Oi",                           "GREETING"],
    ["Bom dia",                      "GREETING"],
    ["ola",                          "GREETING"],
    ["Quero fazer pedido",           "ORDER"],
    ["Quero pedir agora",            "ORDER"],
    ["cardápio",                     "MENU_REQUEST"],
    ["ver o menu",                   "MENU_REQUEST"],
    ["Quero falar com atendente",    "HUMAN_REQUEST"],
    ["veio errado meu pedido",       "COMPLAINT"],
    ["tá errado o pedido",           "COMPLAINT"],
    ["horário de funcionamento",     "HOURS_REQUEST"],
    ["que horas fecha",              "HOURS_REQUEST"],
    ["onde fica o restaurante",      "ADDRESS_REQUEST"],
    ["endereço",                     "ADDRESS_REQUEST"],
    ["faz entrega?",                 "DELIVERY_REQUEST"],
    ["vocês entregam?",              "DELIVERY_REQUEST"],
    ["aceita pix?",                  "PAYMENT_INFO"],
    ["formas de pagamento",          "PAYMENT_INFO"],
    ["cadê meu pedido",              "ORDER_STATUS"],
    ["status do meu pedido",         "ORDER_STATUS"],
    ["alguma coisa completamente aleatória xyz123", "UNKNOWN"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected}`, () => {
      expect(detectIntent(input)).toBe(expected);
    });
  }

  it("COMPLAINT takes priority over GREETING", () => {
    expect(detectIntent("veio errado, bom dia")).toBe("COMPLAINT");
  });

  it("HUMAN_REQUEST takes priority over GREETING", () => {
    expect(detectIntent("Oi, quero falar com atendente")).toBe("HUMAN_REQUEST");
  });
});

// ── appendBackToMainMenu is applied to non-handoff option replies ─────────────

describe("non-handoff option replies contain BACK_TO_MENU_FOOTER", () => {
  it("order flow reply ends with '0️⃣ Voltar ao menu principal' after appendBackToMainMenu", () => {
    const opt: MenuOption = { id: "o", label: "Fazer pedido", flow: "order" };
    const reply = appendBackToMainMenu(buildFlowReply(opt, makeCtx()));
    expect(reply.endsWith(BACK_TO_MENU_FOOTER)).toBe(true);
  });

  it("menu flow reply ends with BACK_TO_MENU_FOOTER after appendBackToMainMenu", () => {
    const opt: MenuOption = { id: "m", label: "Cardápio", flow: "menu" };
    const reply = appendBackToMainMenu(buildFlowReply(opt, makeCtx()));
    expect(reply).toContain("0️⃣ Voltar ao menu principal");
  });

  it("custom flow reply ends with BACK_TO_MENU_FOOTER after appendBackToMainMenu", () => {
    const opt: MenuOption = { id: "c", label: "Horário", flow: "custom", message: "Seg-Sex 18h-23h." };
    const reply = appendBackToMainMenu(buildFlowReply(opt, makeCtx()));
    expect(reply).toContain("0️⃣ Voltar ao menu principal");
  });
});
