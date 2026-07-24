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
  MEDIA_MESSAGE_REPLY,
  appendBackToMainMenu,
  buildMenuList,
  detectSelectedOption,
  renderMainMenu,
  renderSubmenu,
  buildFlowReply,
  detectIntent,
  looksLikeLooseAddress,
  isExplicitOrderMessage,
  buildOrderIntentReply,
  buildLooseAddressReply,
  buildTextOrderConfirmationReply,
  buildRodizioReply,
  buildClubReply,
  type ReplyContext,
} from "../WhatsAppReceptionistService";
import { detectIntent as detectOrderingIntent } from "@/services/whatsapp/ordering/parser";
import { menuOptionSchema, type MenuOption } from "@/validators/whatsapp-agent";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const THREE_OPTIONS: MenuOption[] = [
  { id: "opt-1", label: "Fazer pedido",           flow: "order"   },
  { id: "opt-2", label: "Ver cardápio",            flow: "menu"    },
  { id: "opt-3", label: "Falar com atendente",     flow: "handoff" },
];

describe("submenu (one-level, configurable)", () => {
  const PARENT: MenuOption = {
    id: "p-order", label: "Fazer pedido", flow: "submenu",
    submenuOptions: [
      { id: "p-type", label: "Digitar pedido", flow: "text_order" },
      { id: "p-menu", label: "Ver cardápio",   flow: "menu" },
    ],
  };

  it("renderSubmenu lists the children and keeps the 0. menu escape", () => {
    const out = renderSubmenu(PARENT, (PARENT.submenuOptions ?? []) as MenuOption[]);
    expect(out).toContain("Fazer pedido");
    expect(out).toContain("Digitar pedido");
    expect(out).toContain("Ver cardápio");
    expect(out).toContain("0. menu");
  });

  it("detectSelectedOption resolves a number against the submenu children", () => {
    const children = (PARENT.submenuOptions ?? []) as MenuOption[];
    expect(detectSelectedOption("1", children)?.flow).toBe("text_order");
    expect(detectSelectedOption("2", children)?.flow).toBe("menu");
    expect(detectSelectedOption("9", children)).toBeNull();
  });

  it("a terminal option carries no children", () => {
    expect(THREE_OPTIONS[1]!.submenuOptions).toBeUndefined();
  });

  it("validator accepts one-level submenuOptions", () => {
    const parsed = menuOptionSchema.parse({
      id: "p", label: "Fazer pedido", flow: "submenu",
      submenuOptions: [{ id: "c", label: "Digitar pedido", flow: "text_order" }],
    });
    expect(parsed.submenuOptions?.[0]?.flow).toBe("text_order");
  });

  it("validator strips a second nesting level (submenu children are leaves)", () => {
    const parsed = menuOptionSchema.parse({
      id: "p", label: "Fazer pedido", flow: "submenu",
      submenuOptions: [{
        id: "c", label: "X", flow: "menu",
        submenuOptions: [{ id: "g", label: "Y", flow: "menu" }],
      }],
    });
    expect((parsed.submenuOptions?.[0] as Record<string, unknown>).submenuOptions).toBeUndefined();
  });
});

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
      "Aqui está nosso cardápio: https://x.com\n\n0. menu",
    );
  });

  it("appends the footer to an empty string", () => {
    expect(appendBackToMainMenu("")).toBe("\n\n0. menu");
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

  it("lists all options sequentially with no 'Outras opções' divider", () => {
    const result = buildMenuList(THREE_OPTIONS);
    expect(result).not.toContain("────────────");
    expect(result).not.toContain("Outras opções:");
    expect(result).toContain("1️⃣ Fazer pedido");
    expect(result).toContain("2️⃣ Ver cardápio");
    expect(result).toContain("3️⃣ Falar com atendente");
  });

  it("does NOT add separator for 2-option menus", () => {
    const twoOpts: MenuOption[] = [
      { id: "a", label: "Opção A", flow: "order"   },
      { id: "b", label: "Opção B", flow: "handoff" },
    ];
    const result = buildMenuList(twoOpts);
    expect(result).not.toContain("────────────");
    expect(result).not.toContain("Outras opções:");
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
  it("uses new greeting 'Como você prefere começar?' header with numbered list", () => {
    const result = renderMainMenu(makeCtx());
    expect(result).toContain("Como você prefere começar?");
    expect(result).toContain("1️⃣ Fazer pedido");
    expect(result).toContain("2️⃣ Ver cardápio");
    expect(result).toContain("3️⃣ Falar com atendente");
  });

  it("ends with '0. menu' footer", () => {
    expect(renderMainMenu(makeCtx()).endsWith("0. menu")).toBe(true);
  });

  it("does NOT contain the old 'Voltando ao menu principal' text", () => {
    expect(renderMainMenu(makeCtx())).not.toContain("Voltando ao menu principal");
  });

  it("does NOT contain 'Responda com o número da opção'", () => {
    expect(renderMainMenu(makeCtx())).not.toContain("Responda com o número da opção");
  });

  it("does NOT contain 'Cardápio. Faça seu pedido'", () => {
    expect(renderMainMenu(makeCtx())).not.toContain("Cardápio. Faça seu pedido");
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
    expect(reply).not.toContain("0. menu");
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
    ["opa",                          "GREETING"],
    ["Opa, tudo bem?",               "GREETING"],
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

// ── Explicit-order routing fix (P0) ───────────────────────────────────────────
// These guard the production bug where an explicit text order ("Quero 1 rodízio
// completo... Temakis grelhados") fell to the receptionist and got a giant
// cardápio link, and a loose address got the restaurant location + a handoff.

describe("explicit-order classification (shared ordering intent)", () => {
  const orders = [
    "quero 1 yakisoba e uma coca",
    "quero 1 rodízio completo por favor\nTemakis grelhados", // the exact print case
    "manda 2 temakis",
    "vou querer hot roll e coca",
    "1 yakisoba frango",
    "pode mandar um combinado",
    "pode ser um combinado",
    "1x temaki",
  ];
  for (const msg of orders) {
    it(`"${msg.replace(/\n/g, " / ")}" → ORDER_REQUEST`, () => {
      expect(detectOrderingIntent(msg)).toBe("ORDER_REQUEST");
      expect(isExplicitOrderMessage(msg)).toBe(true);
    });
  }

  const questions = ["tem temaki?", "tem rodízio?", "qual horário?", "aceita cartão?"];
  for (const msg of questions) {
    it(`"${msg}" stays a QUESTION, not an order`, () => {
      expect(detectOrderingIntent(msg)).not.toBe("ORDER_REQUEST");
      expect(isExplicitOrderMessage(msg)).toBe(false);
    });
  }
});

describe("buildOrderIntentReply — explicit order outside allowlist", () => {
  it("never sends a raw cardápio URL as the primary body", () => {
    expect(buildOrderIntentReply(makeCtx())).not.toContain("http");
  });

  it("conducts through the single configurable menu (no ad-hoc reduced menu)", () => {
    const reply = buildOrderIntentReply(makeCtx());
    expect(reply).toContain("1️⃣ Fazer pedido");
    expect(reply.toLowerCase()).toContain("cardápio");
    expect(reply.toLowerCase()).toContain("atendente");
  });

  it("never claims existence ('temos X sim')", () => {
    expect(buildOrderIntentReply(makeCtx()).toLowerCase()).not.toContain("temos");
  });

  it("ends with the 0. menu footer once wrapped", () => {
    expect(appendBackToMainMenu(buildOrderIntentReply(makeCtx())).endsWith("0. menu")).toBe(true);
  });
});

describe("looksLikeLooseAddress", () => {
  const addresses = [
    "Rua Araraquara 60\nCidade Kemel Poá", // the exact print case
    "Av. Paulista, 1000",
    "Avenida Brasil 250",
    "01310-100",
    "meu cep é 01310100",
    "Travessa das Flores 12",
  ];
  for (const a of addresses) {
    it(`detects "${a.replace(/\n/g, " / ")}" as a loose address`, () => {
      expect(looksLikeLooseAddress(a)).toBe(true);
    });
  }

  const notAddresses = [
    "quero 1 rodízio completo",
    "qual o endereço de vocês?",
    "onde fica o restaurante",
    "tem temaki?",
    "",
  ];
  for (const n of notAddresses) {
    it(`does NOT treat "${n}" as a loose address`, () => {
      expect(looksLikeLooseAddress(n)).toBe(false);
    });
  }
});

describe("buildLooseAddressReply — address with no order session", () => {
  it("never returns the restaurant's own location or a raw URL", () => {
    const reply = buildLooseAddressReply(makeCtx({ address: "Rua do Restaurante, 1" }));
    expect(reply).not.toContain("http");
    expect(reply).not.toContain("Rua do Restaurante");
  });

  it("guides the customer to start the order / send CEP", () => {
    const reply = buildLooseAddressReply(makeCtx()).toLowerCase();
    expect(reply).toContain("pedido");
    expect(reply).toContain("cep");
  });

  it("ends with the 0. menu footer once wrapped", () => {
    expect(appendBackToMainMenu(buildLooseAddressReply(makeCtx())).endsWith("0. menu")).toBe(true);
  });
});

// ── Per-option phrase override (opt.message overrides ANY flow's default) ─────

describe("buildFlowReply — per-option phrase override", () => {
  it("order: uses opt.message instead of orderPreMessage, still appends the URL", () => {
    const opt: MenuOption = { id: "o", label: "Fazer pedido", flow: "order", message: "Bora pedir? 🍣" };
    const reply = buildFlowReply(opt, makeCtx());
    expect(reply).toContain("Bora pedir? 🍣");
    expect(reply).not.toContain("Clique no link");                          // default gone
    expect(reply).toContain("https://foocci.com.br/pedido/sushi-cazza");    // action preserved
  });

  it("handoff: uses opt.message instead of handoffMessage", () => {
    const opt: MenuOption = { id: "h", label: "Falar com atendente", flow: "handoff", message: "Já te transfiro! 👋" };
    expect(buildFlowReply(opt, makeCtx())).toBe("Já te transfiro! 👋");
  });

  it("menu: uses opt.message as the lead-in, still appends the URL", () => {
    const opt: MenuOption = { id: "m", label: "Cardápio", flow: "menu", message: "Deu fome? Olha só 👇" };
    const reply = buildFlowReply(opt, makeCtx());
    expect(reply).toContain("Deu fome? Olha só 👇");
    expect(reply).not.toContain("Aqui está nosso cardápio");
    expect(reply).toContain("https://foocci.com.br/pedido/sushi-cazza");
  });

  it("promotions: uses opt.message as the lead-in, still appends the URL", () => {
    const opt: MenuOption = { id: "p", label: "Promoções", flow: "promotions", message: "Ofertas da semana 🔥" };
    const reply = buildFlowReply(opt, makeCtx());
    expect(reply).toContain("Ofertas da semana 🔥");
    expect(reply).toContain("https://foocci.com.br/pedido/sushi-cazza");
  });

  it("text_order: uses opt.message instead of the built-in confirmation", () => {
    const opt: MenuOption = { id: "t", label: "Já sei o que quero", flow: "text_order", message: "Manda aí o que vai querer 📝" };
    expect(buildFlowReply(opt, makeCtx())).toBe("Manda aí o que vai querer 📝");
  });

  it("blank/whitespace message falls back to the flow default", () => {
    const opt: MenuOption = { id: "h", label: "Atendente", flow: "handoff", message: "   " };
    expect(buildFlowReply(opt, makeCtx())).toBe("Estou chamando um atendente, aguarde um momento 🤝");
  });

  it("closed store ignores the custom order phrase (safety)", () => {
    const opt: MenuOption = { id: "o", label: "Fazer pedido", flow: "order", message: "Bora pedir agora!" };
    const reply = buildFlowReply(opt, makeCtx({ isCurrentlyOpen: false, closedMessage: "Estamos fechados." }));
    expect(reply).toContain("Estamos fechados.");
    expect(reply).not.toContain("Bora pedir agora!");
  });
});

// ── New flow types (text_order / rodizio / club) ──────────────────────────────

describe("buildFlowReply — text_order flow", () => {
  it("returns the text order confirmation message", () => {
    const opt: MenuOption = { id: "t", label: "Já sei o que quero pedir", flow: "text_order" };
    const result = buildFlowReply(opt, makeCtx());
    expect(result.toLowerCase()).toContain("me manda seu pedido");
    expect(result.toLowerCase()).toContain("yakisoba");
  });

  it("does not contain a raw URL", () => {
    const opt: MenuOption = { id: "t", label: "Já sei o que quero pedir", flow: "text_order" };
    expect(buildFlowReply(opt, makeCtx())).not.toContain("http");
  });
});

describe("buildFlowReply — rodizio flow", () => {
  it("mentions presencial", () => {
    const opt: MenuOption = { id: "r", label: "Rodízio presencial", flow: "rodizio" };
    const result = buildFlowReply(opt, makeCtx());
    expect(result.toLowerCase()).toContain("presencial");
  });

  it("includes address when available", () => {
    const opt: MenuOption = { id: "r", label: "Rodízio presencial", flow: "rodizio" };
    const result = buildFlowReply(opt, makeCtx({ address: "Rua das Flores, 123" }));
    expect(result).toContain("Rua das Flores, 123");
  });

  it("omits address line when null", () => {
    const opt: MenuOption = { id: "r", label: "Rodízio presencial", flow: "rodizio" };
    const result = buildFlowReply(opt, makeCtx({ address: null }));
    expect(result).not.toContain("📍");
  });
});

describe("buildFlowReply — club flow", () => {
  it("mentions Cazza Club fidelidade", () => {
    const opt: MenuOption = { id: "c", label: "Cazza Club", flow: "club" };
    const result = buildFlowReply(opt, makeCtx());
    expect(result.toLowerCase()).toContain("cazza club");
    expect(result.toLowerCase()).toContain("fidelidade");
  });
});

describe("buildTextOrderConfirmationReply", () => {
  it("instructs customer to send order by message", () => {
    const reply = buildTextOrderConfirmationReply();
    expect(reply.toLowerCase()).toContain("me manda");
    expect(reply.toLowerCase()).toContain("yakisoba");
  });
});

describe("buildRodizioReply", () => {
  it("explains rodízio is presencial", () => {
    expect(buildRodizioReply(makeCtx())).toContain("presencial");
  });
});

describe("buildClubReply", () => {
  it("mentions the fidelity program", () => {
    expect(buildClubReply(makeCtx()).toLowerCase()).toContain("fidelidade");
  });
});

describe("7-option menu (single flat list)", () => {
  const SEVEN_OPTIONS: MenuOption[] = [
    { id: "1", label: "Já sei o que quero pedir",  flow: "text_order"  },
    { id: "2", label: "Ver cardápio",               flow: "menu"        },
    { id: "3", label: "Rodízio presencial",         flow: "rodizio"     },
    { id: "4", label: "Horário de funcionamento",   flow: "custom"      },
    { id: "5", label: "Promoções",                  flow: "promotions"  },
    { id: "6", label: "Cazza Club",                 flow: "club"        },
    { id: "7", label: "Falar com atendente",        flow: "handoff"     },
  ];

  it("buildMenuList renders all 7 options", () => {
    const result = buildMenuList(SEVEN_OPTIONS);
    for (let i = 1; i <= 7; i++) {
      expect(result).toContain(`${["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣"][i-1]}`);
    }
  });

  it("lists options sequentially with no divider", () => {
    const result = buildMenuList(SEVEN_OPTIONS);
    expect(result).not.toContain("────────────");
    expect(result).not.toContain("Outras opções:");
    const pos2 = result.indexOf("2️⃣");
    const pos3 = result.indexOf("3️⃣");
    expect(pos2).toBeGreaterThan(0);
    expect(pos3).toBeGreaterThan(pos2);
  });

  it("detectSelectedOption maps '7' to handoff option", () => {
    const opt = detectSelectedOption("7", SEVEN_OPTIONS);
    expect(opt?.flow).toBe("handoff");
  });

  it("detectSelectedOption maps '1' to text_order", () => {
    const opt = detectSelectedOption("1", SEVEN_OPTIONS);
    expect(opt?.flow).toBe("text_order");
  });

  it("renderMainMenu shows 'Como você prefere começar?' with 7-option list", () => {
    const ctx = makeCtx({ menuOptions: SEVEN_OPTIONS });
    const result = renderMainMenu(ctx);
    expect(result).toContain("Como você prefere começar?");
    expect(result).toContain("7️⃣ Falar com atendente");
    expect(result).not.toContain("────────────");
  });

  it("approved menu: option 1 = Já sei o que quero pedir (text_order)", () => {
    const opt = detectSelectedOption("1", SEVEN_OPTIONS);
    expect(opt?.label).toBe("Já sei o que quero pedir");
    expect(opt?.flow).toBe("text_order");
  });

  it("approved menu: option 2 = Ver cardápio (menu)", () => {
    const opt = detectSelectedOption("2", SEVEN_OPTIONS);
    expect(opt?.label).toBe("Ver cardápio");
    expect(opt?.flow).toBe("menu");
  });

  it("approved menu: option 3 = Rodízio presencial (rodizio)", () => {
    const opt = detectSelectedOption("3", SEVEN_OPTIONS);
    expect(opt?.label).toBe("Rodízio presencial");
    expect(opt?.flow).toBe("rodizio");
  });

  it("approved menu: option 7 = Falar com atendente (handoff)", () => {
    const opt = detectSelectedOption("7", SEVEN_OPTIONS);
    expect(opt?.flow).toBe("handoff");
  });

  it("approved menu: option 1 reply instructs text ordering, not a URL", () => {
    const opt = detectSelectedOption("1", SEVEN_OPTIONS)!;
    const reply = buildFlowReply(opt, makeCtx({ menuOptions: SEVEN_OPTIONS }));
    expect(reply.toLowerCase()).toContain("me manda seu pedido");
    expect(reply).not.toContain("http");
  });

  it("approved menu: option 2 reply sends cardápio URL", () => {
    const opt = detectSelectedOption("2", SEVEN_OPTIONS)!;
    const reply = buildFlowReply(opt, makeCtx({ menuOptions: SEVEN_OPTIONS }));
    expect(reply).toContain("https://foocci.com.br/pedido/sushi-cazza");
  });

  it("approved menu: renderMainMenu ends with '0. menu'", () => {
    const ctx = makeCtx({ menuOptions: SEVEN_OPTIONS });
    expect(renderMainMenu(ctx).endsWith("0. menu")).toBe(true);
  });

  it("approved menu: does NOT contain 'Cardápio. Faça seu pedido'", () => {
    const ctx = makeCtx({ menuOptions: SEVEN_OPTIONS });
    expect(renderMainMenu(ctx)).not.toContain("Cardápio. Faça seu pedido");
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
    expect(reply).toContain("0. menu");
  });

  it("custom flow reply ends with BACK_TO_MENU_FOOTER after appendBackToMainMenu", () => {
    const opt: MenuOption = { id: "c", label: "Horário", flow: "custom", message: "Seg-Sex 18h-23h." };
    const reply = appendBackToMainMenu(buildFlowReply(opt, makeCtx()));
    expect(reply).toContain("0. menu");
  });
});

// ── MEDIA_MESSAGE_REPLY — image / audio / document response ──────────────────

describe("MEDIA_MESSAGE_REPLY — image reply contract", () => {
  it("contains 3 short menu options without a URL", () => {
    expect(MEDIA_MESSAGE_REPLY).toContain("1️⃣ Quero pedir esse item");
    expect(MEDIA_MESSAGE_REPLY).toContain("2️⃣ Tenho uma dúvida");
    expect(MEDIA_MESSAGE_REPLY).toContain("7️⃣ Falar com atendente");
    expect(MEDIA_MESSAGE_REPLY).not.toMatch(/https?:\/\//);
  });

  it("ends with '0. menu' footer so customer can return to main menu", () => {
    expect(MEDIA_MESSAGE_REPLY.endsWith("0. menu")).toBe(true);
  });
});
