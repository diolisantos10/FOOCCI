/**
 * WhatsAppOrderStateMachine — PURE state-transition logic.
 *
 * Given the current session, the customer's message, and the loaded menu, it
 * interprets the message in the context of the current stage and returns the
 * next session plus a suggested reply, detected intent, and any deferred actions
 * (delivery quote / order creation / Pix) that require I/O.
 *
 * No I/O here — fully unit-testable. The async wrapper in
 * WhatsAppTextOrderService performs the deferred actions.
 *
 * UX rules enforced: one question at a time, short operational replies, no
 * product listing, no upsell, no "pedido confirmado" before payment.
 */

import { matchItems } from "./menuMatcher";
import { parseTextItems, detectIntent } from "./parser";
import { parsePaymentMethod } from "./WhatsAppPaymentService";
import { parseAddressFragment } from "./addressParser";
import { channelPrice } from "@/services/menu/MenuPricingService";
import type {
  WaPersistedSession,
  WaMenuItem,
  WaDetectedIntent,
  WaOrderItem,
  WaMissingQuestion,
} from "./types";

export type WaDeferredAction = "QUOTE_DELIVERY" | "CREATE_ORDER" | "GENERATE_PIX";

export interface AdvanceResult {
  session:         WaPersistedSession;
  intent:          WaDetectedIntent;
  suggestedReply:  string;
  actions:         WaDeferredAction[];
  handoff:         boolean;
  operatorSummary: string;
}

// ── Entry point ─────────────────────────────────────────────────────────────────

export function advanceSession(
  session: WaPersistedSession,
  message: string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const text = message.trim();
  const next = clone(session);

  // 1. Global interrupts — cancel / human / complaint win in any stage
  const intent = classify(text, session.stage, session.missingQuestions.length > 0);

  if (intent === "CANCEL") {
    next.status = "CANCELLED";
    next.stage  = "CANCELLED";
    return done(next, "CANCEL", "Pedido cancelado. Se precisar, é só chamar de novo. 👋", [], false);
  }

  if (intent === "HUMAN_REQUEST" || intent === "COMPLAINT") {
    next.status = "HANDOFF_REQUIRED";
    next.stage  = "HANDOFF_REQUIRED";
    const reply = intent === "COMPLAINT"
      ? "Sinto muito por isso. Vou chamar um atendente para te ajudar. 🤝"
      : "Certo! Vou chamar um atendente agora. 🤝";
    return done(next, intent, reply, [], true);
  }

  // 2. Stage-specific handling
  switch (session.stage) {
    case "COLLECTING_REQUIRED_OPTIONS":
      return handleOptionAnswer(next, text, menu);
    case "MATCHING_MENU":
      // If we are waiting for the customer to resolve an ambiguous item, treat
      // the incoming message as an answer, not as a new order request.
      if (next.unresolvedItems[0]?.reason === "AMBIGUOUS") {
        return handleAmbiguityAnswer(next, text, menu);
      }
      return handleItemCollection(next, text, menu);
    case "COLLECTING_DELIVERY_TYPE":
      return handleDeliveryType(next, text);
    case "COLLECTING_ADDRESS":
      return handleAddress(next, text);
    case "COLLECTING_PAYMENT_METHOD":
      return handlePayment(next, text);
    case "REVIEWING_ORDER":
      return handleReview(next, text, intent, menu);
    default:
      // IDLE / INTENT_DETECTED / PARSING_ITEMS / fresh order
      return handleItemCollection(next, text, menu);
  }
}

// ── Item collection ─────────────────────────────────────────────────────────────

function handleItemCollection(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const parsed = parseTextItems(text);
  const { matched, unresolved, missing } = matchItems(parsed, menu);

  // Merge newly matched items into existing selection
  session.selectedItems   = [...session.selectedItems, ...matched];
  session.unresolvedItems = unresolved;
  session.missingQuestions = mergeMissing(session, menu);

  if (session.selectedItems.length === 0 && unresolved.length === 0) {
    session.stage = "PARSING_ITEMS";
    return done(session, "UNKNOWN", "Pode me dizer o que você gostaria de pedir?", [], false);
  }

  return continueAfterItems(session);
}

/** Decides the next stage after items change: ask options, clarify, or move on. */
function continueAfterItems(session: WaPersistedSession): AdvanceResult {
  // Ask the first missing required option (one at a time)
  const q = session.missingQuestions[0];
  if (q) {
    session.stage  = "COLLECTING_REQUIRED_OPTIONS";
    session.status = "AWAITING_CUSTOMER";
    const opts = q.options.slice(0, 4).join(", ");
    return done(session, "ORDER_REQUEST",
      `${confirmItems(session)} Para o ${q.itemName}, qual ${q.groupName.toLowerCase()}?${opts ? ` (${opts})` : ""}`,
      [], false);
  }

  // Clarify an unresolved item
  const u = session.unresolvedItems[0];
  if (u) {
    session.stage  = "MATCHING_MENU";
    session.status = "AWAITING_CUSTOMER";
    if (u.reason === "AMBIGUOUS") {
      const label = stripQty(u.rawText);
      const opts  = u.candidates.slice(0, 3).join(" ou ");
      // If other items are still queued, tell the customer what comes next (one
      // question at a time, but don't leave them guessing about the rest)
      const remaining = session.unresolvedItems.slice(1);
      const hint = remaining.length === 1
        ? ` Depois confirmo ${stripQty(remaining[0]!.rawText)}.`
        : remaining.length > 1
          ? ` Depois confirmo os outros itens.`
          : "";
      return done(session, "ORDER_REQUEST",
        `Para o ${label}, qual você quer: ${opts}?${hint}`, [], false);
    }
    if (u.reason === "UNAVAILABLE") {
      return done(session, "ORDER_REQUEST", `"${u.rawText}" está indisponível agora. Quer outra opção?`, [], false);
    }
    return done(session, "ORDER_REQUEST", `Não encontrei "${u.rawText}" no cardápio. Pode confirmar o nome?`, [], false);
  }

  // All items resolved → ask delivery type
  session.stage  = "COLLECTING_DELIVERY_TYPE";
  session.status = "AWAITING_CUSTOMER";
  return done(session, "ORDER_REQUEST",
    `${confirmItems(session)} Vai ser entrega ou retirada?`, [], false);
}

// ── Option answers ──────────────────────────────────────────────────────────────

function handleOptionAnswer(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const q = session.missingQuestions[0];
  if (!q) return continueAfterItems(session);

  // Find the menu item this question belongs to
  const menuItem = menu.find(m => m.name === q.itemName);
  const target   = session.selectedItems.find(i => i.menuItemName === q.itemName);

  if (!menuItem || !target) {
    // Can't resolve — drop the question to avoid a loop
    session.missingQuestions = session.missingQuestions.slice(1);
    return continueAfterItems(session);
  }

  const answer = norm(text);

  // Variant question?
  if (q.groupName === "Tamanho/Variante") {
    const variant = menuItem.variants.find(v => v.isAvailable && norm(v.name).includes(answer));
    if (variant) {
      target.variantId   = variant.id;
      target.variantName = variant.name;
      target.unitPrice   = channelPrice({ price: variant.price, priceDelivery: variant.priceDelivery }, "DELIVERY");
      target.lineTotal   = round(target.unitPrice * target.quantity);
      session.missingQuestions = session.missingQuestions.slice(1);
      return continueAfterItems(session);
    }
  } else {
    // Option group
    const group = menuItem.optionGroups.find(g => g.name === q.groupName);
    const opt   = group?.options.find(o => o.isAvailable && norm(o.name).includes(answer));
    if (group && opt) {
      target.options.push({
        groupId: group.id, groupName: group.name,
        optionId: opt.id, optionName: opt.name, price: opt.price,
      });
      target.unitPrice = round(target.unitPrice + opt.price);
      target.lineTotal = round(target.unitPrice * target.quantity);
      session.missingQuestions = session.missingQuestions.slice(1);
      return continueAfterItems(session);
    }
  }

  // Couldn't match the answer — re-ask once, listing options
  const opts = q.options.slice(0, 4).join(", ");
  return done(session, "ANSWER_TO_OPTION",
    `Não entendi. Para o ${q.itemName}, escolha: ${opts}.`, [], false);
}

// ── Delivery type ───────────────────────────────────────────────────────────────

const DELIVERY_RE = /\b(entrega|entregar|delivery|receber|em casa|tele)\b/i;
const PICKUP_RE   = /\b(retira|retirar|retirada|buscar|pegar|balc[aã]o|no local)\b/i;

function handleDeliveryType(session: WaPersistedSession, text: string): AdvanceResult {
  if (PICKUP_RE.test(text)) {
    session.deliveryType  = "PICKUP";
    session.deliveryQuote = { fee: 0, status: "ok", reason: "retirada" };
    session.stage  = "COLLECTING_PAYMENT_METHOD";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "DELIVERY_INFO",
      "Fechado, retirada no balcão. Vai pagar no Pix, cartão ou dinheiro?", [], false);
  }
  if (DELIVERY_RE.test(text)) {
    session.deliveryType = "DELIVERY";
    session.stage  = "COLLECTING_ADDRESS";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "DELIVERY_INFO",
      "Me envia o endereço completo com número, por favor.", [], false);
  }
  return done(session, "UNKNOWN", "Vai ser entrega ou retirada?", [], false);
}

// ── Address ─────────────────────────────────────────────────────────────────────

function handleAddress(session: WaPersistedSession, text: string): AdvanceResult {
  const addr = parseAddressFragment(text);
  session.address = { ...(session.address ?? {}), ...addr, raw: text };

  if (!session.address.street || !session.address.number) {
    return done(session, "DELIVERY_INFO",
      "Me envia o endereço completo com número, por favor.", [], false);
  }

  // Address looks complete → defer to delivery quote (I/O)
  session.stage  = "CALCULATING_DELIVERY_FEE";
  session.status = "ACTIVE";
  return done(session, "DELIVERY_INFO", "Só um instante, calculando a entrega…", ["QUOTE_DELIVERY"], false);
}

// ── Payment ─────────────────────────────────────────────────────────────────────

function handlePayment(session: WaPersistedSession, text: string): AdvanceResult {
  const { method, changeFor } = parsePaymentMethod(text);

  if (!method) {
    return done(session, "PAYMENT_INFO", "Vai pagar no Pix, cartão ou dinheiro?", [], false);
  }

  session.paymentMethod = method;
  session.metadata = { ...(session.metadata ?? {}), ...(changeFor ? { changeFor } : {}) };

  // Cash without change info → ask for change
  if (method === "CASH" && !changeFor) {
    return done(session, "PAYMENT_INFO", "Vai precisar de troco? Se sim, troco para quanto?", [], false);
  }

  if (method === "PIX") {
    session.stage  = "READY_TO_CREATE_ORDER";
    session.status = "READY_TO_CONFIRM";
    return done(session, "PAYMENT_INFO", "Gerando seu Pix…", ["CREATE_ORDER", "GENERATE_PIX"], false);
  }

  // Card / cash on delivery
  session.stage  = "READY_TO_CREATE_ORDER";
  session.status = "READY_TO_CONFIRM";
  return done(session, "PAYMENT_INFO", "Confirmando seu pedido…", ["CREATE_ORDER"], false);
}

// ── Review ──────────────────────────────────────────────────────────────────────

function handleReview(
  session: WaPersistedSession,
  text:    string,
  intent:  WaDetectedIntent,
  menu:    WaMenuItem[],
): AdvanceResult {
  if (intent === "CONFIRMATION") {
    if (!session.deliveryType) {
      session.stage = "COLLECTING_DELIVERY_TYPE";
      return done(session, "CONFIRMATION", "Vai ser entrega ou retirada?", [], false);
    }
    if (!session.paymentMethod) {
      session.stage = "COLLECTING_PAYMENT_METHOD";
      return done(session, "CONFIRMATION", "Vai pagar no Pix, cartão ou dinheiro?", [], false);
    }
  }
  // Otherwise treat as a modification (more items)
  return handleItemCollection(session, text, menu);
}

// ── Ambiguity resolution ────────────────────────────────────────────────────────

// Words that signal "the regular version" (not zero / diet / light) so
// "quero a normal" resolves to the non-zero candidate when there is exactly one.
const NEGATION_TERMS = ["normal", "classica", "original", "tradicional", "simples"];
const SPECIAL_TERMS  = ["zero", "diet", "light", "sem acucar", "sem açucar"];

function resolveByNegation(
  text:       string,
  u:          { rawText: string; quantity: number; candidates: string[] },
  menu:       WaMenuItem[],
): WaOrderItem | null {
  const t = norm(text);
  if (!NEGATION_TERMS.some(w => t.includes(w))) return null;

  // Keep only candidates that do NOT look like a "special" variety
  const regular = u.candidates.filter(c => !SPECIAL_TERMS.some(s => norm(c).includes(s)));
  if (regular.length !== 1) return null; // can't decide unambiguously

  const menuItem = menu.find(m => norm(m.name) === norm(regular[0]!) && m.isAvailable);
  if (!menuItem) return null;

  const unitPrice = channelPrice(
    { price: menuItem.price, priceDelivery: menuItem.priceDelivery },
    "DELIVERY",
  );
  return {
    rawText:      u.rawText,
    quantity:     u.quantity,
    menuItemId:   menuItem.id,
    menuItemName: menuItem.name,
    options:      [],
    extras:       [],
    unitPrice,
    lineTotal:    round(unitPrice * u.quantity),
  };
}

function handleAmbiguityAnswer(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const u = session.unresolvedItems[0];
  if (!u || u.reason !== "AMBIGUOUS") return handleItemCollection(session, text, menu);

  // Restrict matching to just the candidates for this item
  const candidateMenu = menu.filter(m =>
    m.isAvailable && u.candidates.some(c => norm(c) === norm(m.name)),
  );
  const { matched } = matchItems(
    [{ rawText: text, quantity: u.quantity, name: text }],
    candidateMenu,
  );

  let resolved: import("./types").WaOrderItem | null = matched[0] ?? null;

  // Fallback: semantic negation ("normal" → non-zero candidate)
  if (!resolved) resolved = resolveByNegation(text, u, menu);

  if (resolved) {
    // Preserve the original quantity (the matcher may reset to 1 for bare text)
    resolved = { ...resolved, quantity: u.quantity, lineTotal: round(resolved.unitPrice * u.quantity) };
    session.selectedItems.push(resolved);
    session.unresolvedItems = session.unresolvedItems.slice(1);
    session.missingQuestions = mergeMissing(session, menu);
    return continueAfterItems(session);
  }

  // No match — re-ask listing the options
  const opts = u.candidates.slice(0, 3).join(" ou ");
  return done(session, "ANSWER_TO_OPTION",
    `Não entendi. Qual você quer: ${opts}?`, [], false);
}

// ── Intent classification (context-aware) ──────────────────────────────────────

const CONFIRM_RE = /\b(sim|isso|pode ser|fechado|confirmo|confirmar|ok|t[aá] bom|beleza|certo|perfeito|isso mesmo)\b/i;
const CANCEL_RE  = /\b(cancela|cancelar|desisto|deixa pra l[aá]|esquece)\b/i;

function classify(text: string, stage: string, hasPendingQuestion: boolean): WaDetectedIntent {
  if (CANCEL_RE.test(text)) return "CANCEL";

  const base = detectIntent(text);
  if (base === "HUMAN_NEEDED" || base === "HUMAN_REQUEST") return "HUMAN_REQUEST";
  if (base === "COMPLAINT") return "COMPLAINT";

  // In a question-collecting stage, short answers are answers, not new intents
  if (hasPendingQuestion && stage === "COLLECTING_REQUIRED_OPTIONS") return "ANSWER_TO_OPTION";
  if (stage === "COLLECTING_DELIVERY_TYPE") return "DELIVERY_INFO";
  if (stage === "COLLECTING_ADDRESS")       return "DELIVERY_INFO";
  if (stage === "COLLECTING_PAYMENT_METHOD") return "PAYMENT_INFO";

  if (CONFIRM_RE.test(text)) return "CONFIRMATION";
  return base;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function mergeMissing(session: WaPersistedSession, menu: WaMenuItem[]): WaMissingQuestion[] {
  // Recompute missing questions for all selected items that still lack required choices
  const out: WaMissingQuestion[] = [];
  for (const item of session.selectedItems) {
    const menuItem = menu.find(m => m.id === item.menuItemId);
    if (!menuItem) continue;

    if (menuItem.hasVariants && menuItem.variants.length > 0 && !item.variantId) {
      out.push({
        itemName: menuItem.name, groupName: "Tamanho/Variante", required: true,
        options: menuItem.variants.filter(v => v.isAvailable).map(v => v.name),
      });
    }
    for (const group of menuItem.optionGroups) {
      if (group.required && group.minSelect > 0) {
        const answered = item.options.some(o => o.groupId === group.id);
        if (!answered) {
          out.push({
            itemName: menuItem.name, groupName: group.name, required: true,
            options: group.options.filter(o => o.isAvailable).map(o => o.name),
          });
        }
      }
    }
  }
  return out;
}

function confirmItems(session: WaPersistedSession): string {
  const list = session.selectedItems
    .map(i => `${i.quantity}× ${i.menuItemName}${i.variantName ? ` ${i.variantName}` : ""}`)
    .join(", ");
  return list ? `Anotei: ${list}.` : "";
}

function operatorSummaryOf(session: WaPersistedSession): string {
  const items = session.selectedItems
    .map(i => `${i.quantity}x ${i.menuItemName}${i.variantName ? ` ${i.variantName}` : ""}`)
    .join(" + ");
  const parts = [`Cliente tentou pedir: ${items || "(nada identificado)"}.`];
  if (session.missingQuestions.length > 0) {
    parts.push(`Falta confirmar: ${session.missingQuestions.map(q => `${q.groupName} do ${q.itemName}`).join(", ")}.`);
  }
  if (session.deliveryType === "DELIVERY" && !session.address?.street) parts.push("Falta endereço de entrega.");
  if (!session.deliveryType) parts.push("Falta definir entrega/retirada.");
  if (!session.paymentMethod) parts.push("Falta forma de pagamento.");
  return parts.join(" ");
}

function done(
  session: WaPersistedSession,
  intent:  WaDetectedIntent,
  reply:   string,
  actions: WaDeferredAction[],
  handoff: boolean,
): AdvanceResult {
  return { session, intent, suggestedReply: reply, actions, handoff, operatorSummary: operatorSummaryOf(session) };
}

function clone(s: WaPersistedSession): WaPersistedSession {
  return {
    ...s,
    selectedItems:    s.selectedItems.map(i => ({ ...i, options: [...i.options], extras: [...i.extras] })),
    unresolvedItems:  s.unresolvedItems.map(u => ({ ...u, candidates: [...u.candidates] })),
    missingQuestions: s.missingQuestions.map(q => ({ ...q, options: [...q.options] })),
    address:          s.address ? { ...s.address } : null,
    deliveryQuote:    s.deliveryQuote ? { ...s.deliveryQuote } : null,
    metadata:         s.metadata ? { ...s.metadata } : null,
  };
}

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const round = (n: number) => Math.round(n * 100) / 100;

/** Strips a leading quantity token ("2 yakisoba" → "yakisoba", "uma coca" → "coca"). */
function stripQty(raw: string): string {
  return raw
    .replace(/^\d+\s+/, "")
    .replace(/^(um|uma|hum|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+/i, "")
    .trim();
}

export { operatorSummaryOf };
