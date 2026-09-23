import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WaMenuItem } from "./types";

/**
 * ⚠️ ESTE MOCK MUDOU EM 24/09/2026, E O MOTIVO IMPORTA.
 *
 * Antes ele fingia a OpenAI (`@/lib/openai`). O cargo virou Tier 1 e o roteador
 * passou a mandar o agente de WhatsApp para o piloto CLAUDE. Se o mock tivesse
 * ficado onde estava, a suíte continuaria VERDE — medindo um caminho que a
 * produção não percorre mais. Régua verde sobre o componente errado é pior que
 * régua nenhuma: mata a dúvida e deixa o defeito. Agora o mock está no SDK do
 * laboratório que o roteador escolhe de verdade.
 */
const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: ai.create };
  },
}));

import { reasonOrderTurn } from "./WhatsAppOrderBrain";
import { __resetAnthropicClient } from "@/services/brain/engines/AnthropicEngineAdapter";

function item(id: string, name: string, price: number): WaMenuItem {
  return {
    id, name, description: "", price, priceDelivery: price,
    isActive: true, isAvailable: true, showInDelivery: true,
    hasVariants: false, variants: [], optionGroups: [], extras: [],
  };
}

const menu: WaMenuItem[] = [
  item("yaki1", "Yakisoba de Frango", 39.9),
  item("temaki1", "Temaki Salmão", 22.0),
  item("coca1", "Coca-Cola Lata", 7.0),
];

function respostaCrua(texto: string) {
  ai.create.mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: texto }],
  });
}

function mockReply(obj: Record<string, unknown>) {
  respostaCrua(JSON.stringify(obj));
}

const OLD_KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  vi.clearAllMocks();
  __resetAnthropicClient();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});
afterEach(() => {
  __resetAnthropicClient();
  if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OLD_KEY;
});

describe("WhatsAppOrderBrain.reasonOrderTurn", () => {
  it("detects real menu items from a free-text order (ids + quantities)", async () => {
    mockReply({
      intent: "ADD_ITEMS",
      items: [
        { menuItemId: "yaki1", menuItemName: "Yakisoba de Frango", quantity: 1 },
        { menuItemId: "temaki1", menuItemName: "Temaki Salmão", quantity: 2 },
      ],
      reply: "Anotei 1 Yakisoba e 2 Temaki. Mais alguma coisa?",
      shouldHandoff: false,
    });
    const d = await reasonOrderTurn({ message: "quero um yaksoba e dois temaki", menu, comanda: [] });
    expect(d.reasoningMode).toBe("LLM");
    expect(d.intent).toBe("ADD_ITEMS");
    expect(d.items).toHaveLength(2);
    expect(d.items[0].menuItemId).toBe("yaki1");
    expect(d.items[1].menuItemId).toBe("temaki1");
    expect(d.items[1].quantity).toBe(2);
  });

  it("NEVER invents — drops item ids that are not in the real menu", async () => {
    mockReply({
      intent: "ADD_ITEMS",
      items: [
        { menuItemId: "yaki1", menuItemName: "Yakisoba", quantity: 1 },
        { menuItemId: "PIZZA_999", menuItemName: "Pizza", quantity: 1 },
      ],
      reply: "Anotei o Yakisoba. Não temos pizza, viu?",
      shouldHandoff: false,
    });
    const d = await reasonOrderTurn({ message: "um yakisoba e uma pizza", menu, comanda: [] });
    expect(d.items).toHaveLength(1);
    expect(d.items[0].menuItemId).toBe("yaki1");
  });

  it("redirects menu browsing to '1' instead of listing the cardápio", async () => {
    mockReply({ intent: "MENU_BROWSE", items: [], reply: "Pra ver tudo é só apertar 1 😉", shouldHandoff: false });
    const d = await reasonOrderTurn({ message: "quais os sabores de temaki?", menu, comanda: [] });
    expect(d.intent).toBe("MENU_BROWSE");
    expect(d.reply).toMatch(/1/);
    expect(d.items).toHaveLength(0);
  });

  it("answers host questions (INFO_QUESTION) from the provided knowledge", async () => {
    mockReply({ intent: "INFO_QUESTION", items: [], reply: "Funcionamos das 18h às 23h 😊", shouldHandoff: false });
    const d = await reasonOrderTurn({
      message: "que horas vocês abrem?",
      menu, comanda: [],
      knowledge: { hours: "18h às 23h, terça a domingo" },
    });
    expect(d.intent).toBe("INFO_QUESTION");
    expect(d.shouldHandoff).toBe(false);
  });

  it("escalates complaints / order-status to a human (HUMAN forces handoff)", async () => {
    mockReply({ intent: "HUMAN", items: [], reply: "Vou chamar um atendente pra te ajudar. 🤝", shouldHandoff: false });
    const d = await reasonOrderTurn({ message: "não recebi o pedido", menu, comanda: [] });
    expect(d.intent).toBe("HUMAN");
    expect(d.shouldHandoff).toBe(true); // forced by intent even if model said false
  });

  it("falls back safely (no pilot) so the caller can defer to the legacy machine", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const d = await reasonOrderTurn({ message: "quero um yakisoba", menu, comanda: [] });
    expect(d.reasoningMode).toBe("FALLBACK");
    expect(d.items).toHaveLength(0);
    expect(ai.create).not.toHaveBeenCalled();
  });

  it("falls back when the model returns malformed JSON (never throws)", async () => {
    respostaCrua("not json {");
    const d = await reasonOrderTurn({ message: "um yakisoba", menu, comanda: [] });
    expect(d.reasoningMode).toBe("FALLBACK");
  });
});
