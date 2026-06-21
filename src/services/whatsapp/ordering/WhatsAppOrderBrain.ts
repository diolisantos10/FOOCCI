/**
 * WhatsAppOrderBrain — the reasoning "head" for WhatsApp order-taking.
 *
 * Replaces the regex detectIntent/menuMatcher with REAL reasoning (via the Brain's
 * engine router / AI pilot). It does NOT execute anything — it returns a structured
 * DECISION (intent + detected REAL menu items + reply) that the existing WhatsApp
 * order machinery (comanda + Fute finalization) executes.
 *
 * Scope = the WhatsApp agent (NOT the full web waiter):
 *  - For customers who already know what they want → take the order.
 *  - Detect which REAL menu items they mean (exact menu ids; NEVER invent).
 *  - Host: answer hours / rodízio / general info from the provided knowledge only.
 *  - Wants to BROWSE the menu / see options → redirect to "aperte 1".
 *  - Complaint / order status / "talk to the store" → handoff.
 *
 * Read-only on the Brain side. OPENAI only today (via the router). Safe FALLBACK
 * (reasoningMode:"FALLBACK") when no pilot is configured or the call/parse fails —
 * the caller then defers to the legacy regex machine (today's behavior, no worse).
 */

import { selectEngine } from "@/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";
import type { WaMenuItem, WaOrderItem } from "./types";

export type WaOrderBrainIntent =
  | "ADD_ITEMS"      // wants to order specific items
  | "MENU_BROWSE"    // wants to see the menu / explore options/flavors → "aperte 1"
  | "INFO_QUESTION"  // hours, rodízio, payment, general info
  | "CHECKOUT"       // wants to finalize ("é só isso", "pode fechar")
  | "MODIFY"         // remove/change an item
  | "HUMAN"          // complaint, order status, explicit human request
  | "SMALLTALK"      // greeting, thanks
  | "UNKNOWN";

export interface WaOrderBrainItem {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
}

export interface WaOrderBrainDecision {
  intent: WaOrderBrainIntent;
  /** Detected items — only ids that REALLY exist in the menu survive validation. */
  items: WaOrderBrainItem[];
  reply: string;
  shouldHandoff: boolean;
  reasoningMode: "LLM" | "FALLBACK";
}

/** Host knowledge (the truth) — never invented. */
export interface WaOrderKnowledge {
  restaurantName?: string | null;
  hours?: string | null;
  rodizio?: string | null;
  payments?: string | null;
  delivery?: string | null;
  general?: string | null;
}

const VALID_INTENTS: ReadonlySet<string> = new Set<WaOrderBrainIntent>([
  "ADD_ITEMS", "MENU_BROWSE", "INFO_QUESTION", "CHECKOUT", "MODIFY", "HUMAN", "SMALLTALK", "UNKNOWN",
]);

const SYSTEM_PROMPT =
  "Você é o atendente de WhatsApp de um restaurante, focado em ANOTAR PEDIDOS de clientes que JÁ SABEM o que querem. " +
  "Você NÃO é um garçom consultor: não fica sugerindo nem listando o cardápio.\n" +
  "REGRAS:\n" +
  "1) Entenda a intenção REAL da mensagem e classifique em: ADD_ITEMS (quer pedir itens), MENU_BROWSE (quer ver o " +
  "cardápio/opções/sabores), INFO_QUESTION (horário, rodízio, pagamento, info geral), CHECKOUT (quer fechar o pedido), " +
  "MODIFY (mudar/remover item), HUMAN (reclamação, status de pedido, falar com atendente/loja), SMALLTALK (saudação/" +
  "agradecimento), UNKNOWN.\n" +
  "2) ADD_ITEMS: identifique QUAIS itens do CARDÁPIO REAL abaixo o cliente quer, com quantidade. Use SOMENTE os itens " +
  "da lista e retorne o `menuItemId` EXATO. NUNCA invente item nem preço. Se o cliente citar algo que não está no " +
  "cardápio, NÃO inclua e diga gentilmente que não temos.\n" +
  "3) MENU_BROWSE: NÃO liste o cardápio. Encaminhe com delicadeza, convidando a ver o cardápio completo apertando 1.\n" +
  "4) INFO_QUESTION: responda usando SOMENTE as INFORMAÇÕES DO RESTAURANTE abaixo. Se a info não estiver lá, diga que " +
  "vai confirmar — NÃO invente.\n" +
  "5) HUMAN: reclamação, 'não recebi o pedido', 'status do pedido', 'falar com a loja' → shouldHandoff=true e avise que " +
  "vai chamar um atendente.\n" +
  "6) Tom curto, cordial e humano, em português do Brasil.\n" +
  "Responda SOMENTE em JSON com as chaves: intent, items (array de {menuItemId, menuItemName, quantity}), reply, " +
  "shouldHandoff (boolean).";

function menuBlock(menu: WaMenuItem[]): string {
  const visible = menu.filter((m) => m.isActive && m.isAvailable && m.showInDelivery);
  if (visible.length === 0) return "(cardápio indisponível no momento)";
  return visible
    .map((m) => {
      const price = m.priceDelivery ?? m.price;
      const extras = m.hasVariants ? " [tem tamanhos]" : m.optionGroups.some((g) => g.required) ? " [tem opções]" : "";
      return `${m.id} | ${m.name} | R$ ${price.toFixed(2)}${extras}`;
    })
    .join("\n");
}

function comandaBlock(items: WaOrderItem[]): string {
  if (items.length === 0) return "(vazia)";
  return items.map((i) => `${i.quantity}x ${i.menuItemName}`).join(", ");
}

function knowledgeBlock(k: WaOrderKnowledge): string {
  const line = (label: string, v?: string | null) => `${label}: ${v && v.trim() ? v.trim() : "não informado"}`;
  return [
    line("Restaurante", k.restaurantName),
    line("Horário de funcionamento", k.hours),
    line("Rodízio", k.rodizio),
    line("Formas de pagamento", k.payments),
    line("Entrega/retirada", k.delivery),
    line("Outras informações", k.general),
  ].join("\n");
}

interface RawDecision {
  intent?: string;
  items?: Array<{ menuItemId?: string; menuItemName?: string; quantity?: number }>;
  reply?: string;
  shouldHandoff?: boolean;
}

function fallback(): WaOrderBrainDecision {
  return { intent: "UNKNOWN", items: [], reply: "", shouldHandoff: false, reasoningMode: "FALLBACK" };
}

export interface ReasonOrderTurnInput {
  message: string;
  menu: WaMenuItem[];
  comanda: WaOrderItem[];
  knowledge?: WaOrderKnowledge;
}

/**
 * Reasons about ONE WhatsApp order turn. Never throws — returns a FALLBACK decision
 * (so the caller defers to the legacy machine) when there is no pilot or the call
 * fails. Item ids are validated against the real menu; invented ids are dropped.
 */
export async function reasonOrderTurn(input: ReasonOrderTurnInput): Promise<WaOrderBrainDecision> {
  const engine = selectEngine("whatsapp");
  if (engine.provider === "MOCK") return fallback();

  try {
    const userContent = [
      `CARDÁPIO REAL (use SOMENTE estes menuItemId):\n${menuBlock(input.menu)}`,
      `\nINFORMAÇÕES DO RESTAURANTE:\n${knowledgeBlock(input.knowledge ?? {})}`,
      `\nCOMANDA ATUAL: ${comandaBlock(input.comanda)}`,
      `\nMENSAGEM DO CLIENTE: "${input.message}"`,
    ].join("\n");

    const raw = await callStructuredJson({ selection: engine, systemPrompt: SYSTEM_PROMPT, userContent, temperature: 0.2 });
    const parsed = JSON.parse(raw) as RawDecision;

    const intent = (parsed.intent && VALID_INTENTS.has(parsed.intent) ? parsed.intent : "UNKNOWN") as WaOrderBrainIntent;

    // Validate items against the REAL menu — drop anything invented; trust the
    // menu's name/id, not the model's.
    const byId = new Map(input.menu.map((m) => [m.id, m]));
    const items: WaOrderBrainItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .map((it) => {
            const menuItem = it?.menuItemId ? byId.get(it.menuItemId) : undefined;
            if (!menuItem) return null;
            const qty = Math.max(1, Math.floor(Number(it?.quantity) || 1));
            return { menuItemId: menuItem.id, menuItemName: menuItem.name, quantity: qty };
          })
          .filter((x): x is WaOrderBrainItem => x !== null)
      : [];

    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (!reply && items.length === 0 && intent === "UNKNOWN") return fallback();

    return {
      intent,
      items,
      reply,
      shouldHandoff: parsed.shouldHandoff === true || intent === "HUMAN",
      reasoningMode: "LLM",
    };
  } catch {
    return fallback();
  }
}
