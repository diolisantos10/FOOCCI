/**
 * WhatsApp Text Order Service — W0/W1 dry-run engine.
 *
 * Analyses a customer's free-text WhatsApp message and returns:
 *  - detected intent
 *  - parsed item list
 *  - menu-matched items
 *  - unresolved items (not found / ambiguous / unavailable)
 *  - missing required option questions
 *  - draft summary + estimated total
 *  - suggested short reply
 *  - safety notes confirming no side-effects
 *
 * HARD INVARIANTS (enforced by design — no code path violates these):
 *  - Does NOT send WhatsApp messages.
 *  - Does NOT create real Orders.
 *  - Does NOT create real Pix payments.
 *  - Does NOT mutate any customer or campaign record.
 *  - Only reads menu data from DB (tenant-scoped by restaurantId).
 *
 * Not wired into the real webhook path. Protected by WHATSAPP_TEXT_ORDERING_ENABLED flag.
 */

import { matchItems } from "./menuMatcher";
import { calculateDraftSummary } from "./orderCalculator";
import type {
  WaAnalyzeInput,
  WaAnalyzeResult,
  WaDetectedIntent,
  WaMenuItem,
  WaOrderItem,
  WaOrderStage,
  WaParsedItem,
  WaUnresolvedItem,
  WaMissingQuestion,
} from "./types";

// ── Intent detection ──────────────────────────────────────────────────────────

const ORDER_PATTERNS: RegExp[] = [
  /\b(quero|queria|pode me trazer|me traz|coloca|vai|pedir|pede|adiciona|me d[aá]|me manda|manda|quero pedir|vou querer|vou de)\b/i,
  /\b(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+\w{3}/i,
  /\b\d+\s*[xX×]\s*\w/,
  /\b(pedido|combo|prato|por[çc][aã]o|lanche|pizza|hambur[gq]uer|sushi|temaki|yakisoba|ramen|sashimi|uramaki|rodízio)\b/i,
];

const QUESTION_PATTERNS: RegExp[] = [
  /\b(tem|voc[eê]s tem|qual|quais|quanto custa|pre[çc]o|card[aá]pio|menu|dispon[ií]vel|como funciona|hor[aá]rio|funcionam|entrega)\b/i,
  /\?/,
];

const HUMAN_PATTERNS: RegExp[] = [
  /\b(atendente|humano|pessoa|operador|falar com|falar com algu[eé]m|preciso de ajuda|respons[aá]vel|gerente)\b/i,
];

// Starts with a question word → almost certainly a question even if it names a product
const QUESTION_START_RE = /^(qual|quais|quanto|como|quando|onde|por que|tem |vocês? tem|você tem|h[aá] )/i;

export function detectIntent(text: string): WaDetectedIntent {
  if (HUMAN_PATTERNS.some(p => p.test(text))) return "HUMAN_NEEDED";

  // Strong question signal wins even if a product name is mentioned
  const isQuestion = QUESTION_START_RE.test(text.trim()) ||
    (text.includes("?") && QUESTION_PATTERNS.some(p => p.test(text)));
  if (isQuestion) return "QUESTION";

  if (ORDER_PATTERNS.some(p => p.test(text)))    return "ORDER_REQUEST";
  if (QUESTION_PATTERNS.some(p => p.test(text))) return "QUESTION";
  return "UNKNOWN";
}

// ── Text parser ───────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, hum: 1,
  dois: 2, duas: 2,
  "três": 3, tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

function parseQuantity(token: string): { qty: number; rest: string } {
  // "2x yakisoba" or "2× yakisoba"
  const xMatch = token.match(/^(\d+)\s*[xX×]\s*([\s\S]*)/);
  if (xMatch) return { qty: Math.max(1, parseInt(xMatch[1] ?? "1", 10)), rest: (xMatch[2] ?? "").trim() };

  // "2 yakisoba"
  const digitMatch = token.match(/^(\d+)\s+([\s\S]*)/);
  if (digitMatch) return { qty: Math.max(1, parseInt(digitMatch[1] ?? "1", 10)), rest: (digitMatch[2] ?? "").trim() };

  // "duas cocas"
  const lower = token.toLowerCase();
  for (const [word, qty] of Object.entries(NUMBER_WORDS)) {
    if (lower.startsWith(word + " ") || lower === word) {
      return { qty, rest: token.slice(word.length).trim() };
    }
  }

  return { qty: 1, rest: token.trim() };
}

// Strips leading intent phrases so the item name is cleaner
const INTENT_PREFIX_RE = /^(quero|queria|pode me trazer|me traz|coloca a[íi]|coloca no pedido|adiciona|me d[aá]|me manda|manda|gostaria de|gostaria|vai|pede|pedido de|pedir|vou querer|vou de)\s+/i;

function stripIntent(text: string): string {
  return text.trim().replace(INTENT_PREFIX_RE, "").trim();
}

export function parseTextItems(messageText: string): WaParsedItem[] {
  const cleaned = stripIntent(messageText);

  // Split on list separators: "e", ",", "+", "mais"
  const parts = cleaned
    .split(/\s+e\s+|\s*,\s*|\s*\+\s*|\s+mais\s+/i)
    .map(p => p.trim())
    .filter(p => p.length > 1);

  return parts.map(part => {
    const { qty, rest } = parseQuantity(part);
    return {
      rawText:  part,
      quantity: qty,
      name:     rest || part,
    };
  });
}

// ── Menu loading from DB ──────────────────────────────────────────────────────

export async function loadMenuForRestaurant(restaurantId: string): Promise<WaMenuItem[]> {
  const { prisma } = await import("@/lib/prisma");

  const categories = await prisma.menuCategory.findMany({
    where: {
      restaurantId,
      isActive:      true,
      isAvailable:   true,
      showInDelivery: true,
    },
    include: {
      items: {
        where:   { isActive: true },
        include: {
          variants:     { orderBy: { sortOrder: "asc" } },
          extras:       true,
          optionGroups: {
            include: { options: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const items: WaMenuItem[] = [];
  for (const cat of categories) {
    for (const item of (cat as { items: typeof cat.items }).items) {
      items.push({
        id:            item.id,
        name:          item.name,
        description:   item.description ?? undefined,
        price:         Number(item.price),
        priceDelivery: item.priceDelivery != null ? Number(item.priceDelivery) : null,
        isActive:      item.isActive,
        isAvailable:   item.isAvailable,
        showInDelivery: item.showInDelivery,
        hasVariants:   item.hasVariants,
        variants: item.variants.map(v => ({
          id:            v.id,
          name:          v.name,
          price:         Number(v.price),
          priceDelivery: v.priceDelivery != null ? Number(v.priceDelivery) : null,
          isAvailable:   v.isAvailable,
        })),
        optionGroups: item.optionGroups.map(g => ({
          id:        g.id,
          name:      g.name,
          required:  g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map(o => ({
            id:          o.id,
            name:        o.name,
            price:       Number(o.price),
            isAvailable: o.isAvailable,
          })),
        })),
        extras: item.extras.map(e => ({
          id:          e.id,
          name:        e.name,
          price:       Number(e.price),
          isAvailable: e.isAvailable,
        })),
      });
    }
  }
  return items;
}

// ── Suggested reply ────────────────────────────────────────────────────────────

export function buildSuggestedReply(
  intent:    WaDetectedIntent,
  matched:   WaOrderItem[],
  unresolved: WaUnresolvedItem[],
  missing:   WaMissingQuestion[],
): string {
  if (intent === "HUMAN_NEEDED") {
    return "Certo! Vou chamar um atendente agora. 🤝";
  }
  if (intent === "QUESTION") {
    return "Claro! O que você gostaria de saber?";
  }
  if (intent === "UNKNOWN") {
    return "Pode repetir? Não entendi bem. 😊";
  }

  // ORDER_REQUEST
  const parts: string[] = [];

  // If we have confirmed items and nothing is blocking, move forward
  if (matched.length > 0 && missing.length === 0 && unresolved.length === 0) {
    const summary = matched.map(m => `${m.quantity}× ${m.menuItemName}`).join(", ");
    return `Anotei: ${summary}. Vai ser entrega ou retirada?`;
  }

  // Lead with confirmation of what was matched
  if (matched.length > 0 && (missing.length > 0 || unresolved.length > 0)) {
    const ok = matched.map(m => `${m.quantity}× ${m.menuItemName}`).join(", ");
    parts.push(`${ok} anotado.`);
  }

  // Ask first missing question only (one question at a time)
  const firstMissing = missing[0];
  if (firstMissing) {
    const opts = firstMissing.options.slice(0, 4).join(", ");
    parts.push(`Para o ${firstMissing.itemName}, qual ${firstMissing.groupName.toLowerCase()}?${opts ? ` (${opts})` : ""}`);
  }

  // Report unresolved items
  const firstUnresolved = unresolved[0];
  if (firstUnresolved && !firstMissing) {
    if (firstUnresolved.reason === "NOT_FOUND") {
      parts.push(`Não encontrei "${firstUnresolved.rawText}" no cardápio. Pode confirmar o nome?`);
    } else if (firstUnresolved.reason === "AMBIGUOUS") {
      const candidates = firstUnresolved.candidates.join(" ou ");
      parts.push(`Qual você quer: ${candidates}?`);
    } else if (firstUnresolved.reason === "UNAVAILABLE") {
      parts.push(`"${firstUnresolved.rawText}" está indisponível no momento. Quer outra opção?`);
    }
  }

  if (parts.length === 0) return "Pode detalhar seu pedido?";
  return parts.join(" ");
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function analyzeTextOrder(input: WaAnalyzeInput): Promise<WaAnalyzeResult> {
  const safetyNotes: string[] = [
    "dry_run=true — nenhuma ordem criada",
    "dry_run=true — nenhum Pix gerado",
    "dry_run=true — nenhuma mensagem WhatsApp enviada",
    "dry_run=true — nenhum dado de cliente mutado",
  ];

  const intent = detectIntent(input.messageText);

  // Non-order intents short-circuit — no menu parsing needed
  if (intent !== "ORDER_REQUEST") {
    return {
      detectedIntent:   intent,
      parsedItems:      [],
      matchedItems:     [],
      unresolvedItems:  [],
      missingQuestions: [],
      draftSummary:     null,
      estimatedTotal:   0,
      nextStage:        intent === "HUMAN_NEEDED" ? "HANDOFF_REQUIRED" : "IDLE",
      suggestedReply:   buildSuggestedReply(intent, [], [], []),
      actions:          intent === "HUMAN_NEEDED" ? ["ESCALATE_TO_HUMAN"] : [],
      safetyNotes,
    };
  }

  // Load real menu from DB (tenant-scoped, read-only)
  const menu   = await loadMenuForRestaurant(input.restaurantId);
  const parsed = parseTextItems(input.messageText);

  const { matched, unresolved, missing } = matchItems(parsed, menu);

  const draftSummary  = matched.length > 0 ? calculateDraftSummary(matched, missing.map(q => `${q.itemName}: ${q.groupName}`)) : null;
  const estimatedTotal = draftSummary?.subtotal ?? 0;

  let nextStage: WaOrderStage;
  if (missing.length > 0)                              nextStage = "COLLECTING_REQUIRED_OPTIONS";
  else if (unresolved.length > 0)                      nextStage = "MATCHING_MENU";
  else if (matched.length > 0)                         nextStage = "REVIEWING_ORDER";
  else                                                  nextStage = "PARSING_ITEMS";

  const actions: string[] = [];
  if (matched.length > 0)    actions.push("ITEMS_MATCHED");
  if (unresolved.length > 0) actions.push("REQUEST_CLARIFICATION");
  if (missing.length > 0)    actions.push("ASK_MISSING_OPTIONS");
  if (matched.length === 0 && unresolved.length === 0) actions.push("NO_ITEMS_PARSED");

  return {
    detectedIntent:   "ORDER_REQUEST",
    parsedItems:      parsed,
    matchedItems:     matched,
    unresolvedItems:  unresolved,
    missingQuestions: missing,
    draftSummary,
    estimatedTotal,
    nextStage,
    suggestedReply:   buildSuggestedReply("ORDER_REQUEST", matched, unresolved, missing),
    actions,
    safetyNotes,
  };
}
