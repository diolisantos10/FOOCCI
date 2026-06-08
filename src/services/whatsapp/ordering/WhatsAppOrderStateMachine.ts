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

import { matchItems, bestMenuMatch } from "./menuMatcher";
import {
  parseTextItems,
  detectIntent,
  parseQuantity,
  stripIntent,
  stripFiller,
  normalizePluralAndSpelling,
  DELIVERY_STANDALONE_RE,
  PAYMENT_STANDALONE_RE,
} from "./parser";
import { parsePaymentMethod } from "./WhatsAppPaymentService";
import { parseAddressFragment } from "./addressParser";
import { channelPrice } from "@/services/menu/MenuPricingService";
import type {
  WaPersistedSession,
  WaMenuItem,
  WaDetectedIntent,
  WaOrderItem,
  WaParsedItem,
  WaUnresolvedItem,
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
      return handleDeliveryType(next, text, menu);
    case "COLLECTING_ADDRESS":
      return handleAddress(next, text);
    case "COLLECTING_PAYMENT_METHOD":
      return handlePayment(next, text, menu);
    case "REVIEWING_ORDER":
      return handleReview(next, text, intent, menu);
    default: {
      // IDLE / INTENT_DETECTED / PARSING_ITEMS / fresh order
      // Intent-first: a menu question must never be run through the product matcher.
      if (intent === "QUESTION" && next.selectedItems.length === 0) {
        return handleMenuQuestion(next, text, menu);
      }
      // Defense-in-depth: a bare greeting must never be fed to the product matcher
      // (which would answer "não encontrei 'Bom dia' no cardápio"). The live router
      // already keeps greetings with the old WhatsApp Agent; this is the safety net
      // for any greeting that still reaches the engine (e.g. an idle active session).
      if (next.selectedItems.length === 0 && GREETING_ONLY_RE.test(text)) {
        return done(
          next,
          "UNKNOWN",
          "Olá! Pode me mandar seu pedido por aqui que eu anoto pra você. 😊",
          [],
          false,
        );
      }
      // Early info: greeting / address / payment that arrives before any item.
      const early = handleEarlyInfo(next, text, menu);
      if (early) return early;
      return handleItemCollection(next, text, menu);
    }
  }
}

// ── Smart parsing (menu-aware " e " handling) ────────────────────────────────────

/**
 * Splits a message into product items WITHOUT shattering multi-word product
 * names that contain " e " (e.g. "Yakisoba Carne e Frango"). The naive split on
 * " e " turns "yakisoba carne e frango" into ["yakisoba carne", "frango"], which
 * makes "frango" ambiguous. Here, before splitting a segment on " e ", we ask the
 * menu: if the whole segment is a confident single match, keep it intact.
 */
function smartParse(text: string, menu: WaMenuItem[]): WaParsedItem[] {
  const cleaned = stripIntent(text);

  // Strong separators (comma / + / "mais") are always item boundaries.
  const segments = cleaned
    .split(/\s*,\s*|\s*\+\s*|\s+mais\s+/i)
    .map(s => stripFiller(s.trim()))
    .filter(s =>
      s.length > 1 &&
      !DELIVERY_STANDALONE_RE.test(s) &&
      !PAYMENT_STANDALONE_RE.test(s),
    );

  const items: WaParsedItem[] = [];
  for (const seg of segments) {
    if (/\s+e\s+/i.test(seg)) {
      const { qty, rest } = parseQuantity(seg);
      const wholeName = normalizePluralAndSpelling(stripFiller(rest) || seg);
      // Keep "carne e frango" together when it's a confident single product.
      if (wholeIsConfident(wholeName, menu)) {
        items.push({ rawText: seg, quantity: qty, name: wholeName });
        continue;
      }
      // Otherwise it really is a list ("yakisoba e coca") → split on " e ".
      const parts = seg
        .split(/\s+e\s+/i)
        .map(p => stripFiller(p.trim()))
        .filter(p =>
          p.length > 1 &&
          !DELIVERY_STANDALONE_RE.test(p) &&
          !PAYMENT_STANDALONE_RE.test(p),
        );
      for (const p of parts) {
        const pq = parseQuantity(p);
        items.push({ rawText: p, quantity: pq.qty, name: normalizePluralAndSpelling(stripFiller(pq.rest) || p) });
      }
    } else {
      const { qty, rest } = parseQuantity(seg);
      items.push({ rawText: seg, quantity: qty, name: normalizePluralAndSpelling(stripFiller(rest) || seg) });
    }
  }
  return items;
}

const STOP_WORDS = new Set(["uma", "com", "sem", "para", "por"]);

/**
 * True only when the whole " e "-containing segment is a confident single product
 * AND the matched item's name covers every content word of the segment. This
 * keeps "yakisoba carne e frango" intact (Yakisoba Carne e Frango covers all
 * words) but still splits "yakisoba e uma coca" (Yakisoba covers only "yakisoba",
 * not "coca"), so it never collapses a real two-item list into one.
 */
function wholeIsConfident(wholeName: string, menu: WaMenuItem[]): boolean {
  const best = bestMenuMatch(wholeName, menu);
  if (!best.clearWinner || !best.top) return false;
  const qWords = norm(wholeName).split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const cWords = norm(best.top.name).split(/\s+/);
  return qWords.every(qw => cWords.some(cw => cw.startsWith(qw) || qw.startsWith(cw)));
}

// ── Item collection ─────────────────────────────────────────────────────────────

function handleItemCollection(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const hadItems = session.selectedItems.length > 0;
  const parsed = smartParse(text, menu);
  const { matched, unresolved, missing } = matchItems(parsed, menu);

  // Inline negation: resolve "X normal" ambiguities right away (one-line orders).
  const stillUnresolved: WaUnresolvedItem[] = [];
  for (const u of unresolved) {
    if (u.reason === "AMBIGUOUS") {
      const r = resolveByNegation(u.rawText, u, menu);
      if (r) { matched.push(r); continue; }
    }
    stillUnresolved.push(u);
  }

  // Merge newly matched items into existing selection
  session.selectedItems   = [...session.selectedItems, ...matched];
  session.unresolvedItems = stillUnresolved;
  session.missingQuestions = mergeMissing(session, menu);

  // Capture delivery/payment hints present in the same message (mixed one-line).
  captureDeliveryPayment(session, text);

  if (session.selectedItems.length === 0 && session.unresolvedItems.length === 0) {
    session.stage = "PARSING_ITEMS";
    return done(session, "UNKNOWN", "Pode me dizer o que você gostaria de pedir?", [], false);
  }

  return continueAfterItems(session, hadItems ? matched : null);
}

/** Decides the next stage after items change: ask options, clarify, or move on. */
function continueAfterItems(
  session: WaPersistedSession,
  justAdded: WaOrderItem[] | null,
): AdvanceResult {
  // Ask the first missing required option (one at a time)
  const q = session.missingQuestions[0];
  if (q) {
    session.stage  = "COLLECTING_REQUIRED_OPTIONS";
    session.status = "AWAITING_CUSTOMER";
    const opts = q.options.slice(0, 4).join(", ");
    return done(session, "ORDER_REQUEST",
      `${confirmItems(session)} Para ${articleFor(q.itemName)}${q.itemName}, qual ${q.groupName.toLowerCase()}?${opts ? ` (${opts})` : ""}`,
      [], false);
  }

  // Clarify an unresolved item
  const u = session.unresolvedItems[0];
  if (u) {
    session.stage  = "MATCHING_MENU";
    session.status = "AWAITING_CUSTOMER";
    if (u.reason === "AMBIGUOUS") {
      const label = titleCase(normalizePluralAndSpelling(stripQty(u.rawText)));
      const opts  = u.candidates.slice(0, 3).join(" ou ");
      // If other items are still queued, tell the customer what comes next.
      const remaining = session.unresolvedItems.slice(1);
      const remainLabel = remaining[0]
        ? titleCase(normalizePluralAndSpelling(stripQty(remaining[0].rawText)))
        : "";
      const hint = remaining.length === 1
        ? ` Depois confirmo ${articleFor(remainLabel)}${remainLabel}.`
        : remaining.length > 1
          ? ` Depois confirmo os outros itens.`
          : "";
      return done(session, "ORDER_REQUEST",
        `Para ${articleFor(label)}${label}, qual você quer: ${opts}?${hint}`, [], false);
    }
    if (u.reason === "UNAVAILABLE") {
      return done(session, "ORDER_REQUEST", `"${u.rawText}" está indisponível agora. Quer outra opção?`, [], false);
    }
    return done(session, "ORDER_REQUEST", `Não encontrei "${u.rawText}" no cardápio. Pode confirmar o nome?`, [], false);
  }

  // All items resolved → route based on what we already know.
  return routeAfterResolved(session, justAdded);
}

/**
 * Drives the flow once all items are resolved, using whatever delivery/payment
 * info we already captured (so a one-line "...entrega, pix" jumps straight to the
 * next missing piece instead of re-asking "entrega ou retirada?").
 */
function routeAfterResolved(
  session: WaPersistedSession,
  justAdded: WaOrderItem[] | null,
): AdvanceResult {
  const addedNew = justAdded && justAdded.length > 0 && session.selectedItems.length > justAdded.length;
  const confirm = addedNew ? `Adicionei ${listItems(justAdded!)}.` : confirmItems(session);

  if (!session.deliveryType) {
    session.stage  = "COLLECTING_DELIVERY_TYPE";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "ORDER_REQUEST", `${confirm} Vai ser entrega ou retirada?`.trim(), [], false);
  }

  if (session.deliveryType === "DELIVERY") {
    const addrComplete = !!(session.address?.street && session.address?.number);
    if (!addrComplete) {
      session.stage  = "COLLECTING_ADDRESS";
      session.status = "AWAITING_CUSTOMER";
      return done(session, "DELIVERY_INFO", "Me envia o endereço completo com número, por favor.", [], false);
    }
    if (!session.deliveryQuote || session.deliveryQuote.status !== "ok") {
      session.stage  = "CALCULATING_DELIVERY_FEE";
      session.status = "ACTIVE";
      return done(session, "DELIVERY_INFO", "Só um instante, calculando a entrega…", ["QUOTE_DELIVERY"], false);
    }
  }

  if (!session.paymentMethod) {
    session.stage  = "COLLECTING_PAYMENT_METHOD";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "ORDER_REQUEST", `${confirm} Vai pagar no Pix, cartão ou dinheiro?`.trim(), [], false);
  }

  return finalizePayment(session);
}

// ── Option answers ──────────────────────────────────────────────────────────────

function handleOptionAnswer(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const q = session.missingQuestions[0];
  if (!q) return continueAfterItems(session, null);

  // Find the menu item this question belongs to
  const menuItem = menu.find(m => m.name === q.itemName);
  const target   = session.selectedItems.find(i => i.menuItemName === q.itemName);

  if (!menuItem || !target) {
    // Can't resolve — drop the question to avoid a loop
    session.missingQuestions = session.missingQuestions.slice(1);
    return continueAfterItems(session, null);
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
      return continueAfterItems(session, null);
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
      return continueAfterItems(session, null);
    }
  }

  // Couldn't match the answer — re-ask once, listing options
  const opts = q.options.slice(0, 4).join(", ");
  return done(session, "ANSWER_TO_OPTION",
    `Não entendi. Para ${articleFor(q.itemName)}${q.itemName}, escolha: ${opts}.`, [], false);
}

// ── Delivery type ───────────────────────────────────────────────────────────────

const DELIVERY_RE      = /\b(entrega|entregar|delivery|receber|em casa|tele)\b/i;
const PICKUP_RE        = /\b(retira|retirar|retirada|buscar|pegar|balc[aã]o|no local)\b/i;
const GREETING_RE      = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[íi]|hey|hello)\b/i;
const ADDRESS_LIKE_RE  = /\b(rua|av\.?|avenida|r\.|al\.?|alameda|tv\.?|travessa|estr\.?|estrada|rod\.?|rodovia|pra[çc]a)\b.{3,}/i;
const EARLY_PAYMENT_RE = /\b(vou pagar|pago)\b/i;

// A message carries order content if it has an order verb or "<number> <word>".
// The number must be followed by a LETTER (not another digit) so a house number
// like "123, Centro" in an address is NOT mistaken for "123 c…".
const ORDER_LIKE_RE = /\b(quero|queria|vou querer|vou de|pedir|adiciona|acrescenta|outro|outra|mais\s+(um|uma|\d))\b|\b\d+\s*x?\s*[a-záéíóúâêîôûãõ]/i;

function hasOrderContent(text: string): boolean {
  return ORDER_LIKE_RE.test(text);
}

function captureDeliveryPayment(session: WaPersistedSession, text: string): void {
  if (!session.deliveryType) {
    if (PICKUP_RE.test(text)) {
      session.deliveryType  = "PICKUP";
      session.deliveryQuote = { fee: 0, status: "ok", reason: "retirada" };
    } else if (DELIVERY_RE.test(text)) {
      session.deliveryType = "DELIVERY";
    }
  }
  if (!session.paymentMethod) {
    const { method, changeFor } = parsePaymentMethod(text);
    if (method) {
      session.paymentMethod = method;
      if (changeFor) session.metadata = { ...(session.metadata ?? {}), changeFor };
    }
  }
}

function handleDeliveryType(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
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
    // Address already captured before items were ordered — skip asking for it
    if (session.address?.street && session.address?.number) {
      session.stage  = "CALCULATING_DELIVERY_FEE";
      session.status = "ACTIVE";
      return done(session, "DELIVERY_INFO", "Só um instante, calculando a entrega…", ["QUOTE_DELIVERY"], false);
    }
    session.stage  = "COLLECTING_ADDRESS";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "DELIVERY_INFO",
      "Me envia o endereço completo com número, por favor.", [], false);
  }

  // Not a delivery/pickup answer — maybe the customer is modifying the order.
  const mod = tryModification(session, text, menu);
  if (mod) return mod;

  return done(session, "UNKNOWN", "Vai ser entrega ou retirada?", [], false);
}

// ── Order modifications (add / change item / change quantity) ────────────────────

const CHANGE_ITEM_RE = /\b(troca|troque|trocar|substitui|substituir|no lugar|em vez)\b/i;
const CHANGE_QTY_KW  = /\b(na verdade|s[oó]|apenas|deixa|muda(r)?\s+(a\s+)?quantidade|coloca)\b/i;
const ADD_RE         = /\b(adiciona|adicionar|acrescenta|inclui|incluir|tamb[eé]m|mais\s+(um|uma|\d))\b/i;

const NUM_WORDS_LOCAL: Record<string, number> = {
  um: 1, uma: 1, hum: 1, dois: 2, duas: 2, tres: 3, "três": 3,
  quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

function extractQuantityFromText(text: string): number | null {
  const d = text.match(/\b(\d{1,3})\b/);
  if (d && d[1]) return parseInt(d[1], 10);
  const t = norm(text);
  for (const [w, q] of Object.entries(NUM_WORDS_LOCAL)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return q;
  }
  return null;
}

function isQuantityChange(text: string): boolean {
  return CHANGE_QTY_KW.test(text) && extractQuantityFromText(text) != null;
}

function tryModification(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult | null {
  if (session.selectedItems.length === 0) return null;
  if (isQuantityChange(text))   return changeQuantity(session, text);
  if (CHANGE_ITEM_RE.test(text)) return changeItem(session, text, menu);
  if (ADD_RE.test(text) || hasOrderContent(text)) return handleItemCollection(session, text, menu);
  return null;
}

function changeQuantity(session: WaPersistedSession, text: string): AdvanceResult {
  const n = extractQuantityFromText(text);
  const target = session.selectedItems[session.selectedItems.length - 1];
  if (!n || !target) {
    return done(session, "ORDER_MODIFICATION", "Para quantas unidades?", [], false);
  }
  target.quantity  = n;
  target.lineTotal = round(target.unitPrice * n);

  const routed = routeAfterResolved(session, null);
  const tail = routed.suggestedReply.replace(/^(Anotei:[^.]*\.|Adicionei[^.]*\.)\s*/, "");
  const ack  = `Atualizei para ${n} unidade${n !== 1 ? "s" : ""}.`;
  return done(session, "ORDER_MODIFICATION", `${ack} ${tail}`.trim(), routed.actions, false);
}

function changeItem(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
  const rest = text
    .replace(CHANGE_ITEM_RE, "")
    .replace(/^\s*(por|pra|para|pelo|pela|de|o|a)\s+/i, "")
    .trim();
  const name = normalizePluralAndSpelling(rest);
  const best = bestMenuMatch(name, menu);

  if (!best.clearWinner || !best.top) {
    if (best.candidates.length > 1) {
      return done(session, "ORDER_REQUEST",
        `Qual você quer: ${best.candidates.slice(0, 3).map(c => c.name).join(" ou ")}?`, [], false);
    }
    return done(session, "ORDER_REQUEST", `Não encontrei "${rest}" no cardápio. Pode confirmar o nome?`, [], false);
  }

  const menuItem = best.top;
  const base = norm(menuItem.name).split(" ")[0] ?? "";
  let idx = session.selectedItems.findIndex(i => norm(i.menuItemName).startsWith(base));
  if (idx < 0) idx = session.selectedItems.length - 1;

  const qty = idx >= 0 ? session.selectedItems[idx]!.quantity : 1;
  const unitPrice = channelPrice({ price: menuItem.price, priceDelivery: menuItem.priceDelivery }, "DELIVERY");
  const newItem: WaOrderItem = {
    rawText: rest, quantity: qty,
    menuItemId: menuItem.id, menuItemName: menuItem.name,
    options: [], extras: [], unitPrice, lineTotal: round(unitPrice * qty),
  };

  if (idx >= 0) session.selectedItems[idx] = newItem;
  else          session.selectedItems.push(newItem);
  session.missingQuestions = mergeMissing(session, menu);

  if (session.missingQuestions[0]) return continueAfterItems(session, null);

  const routed = routeAfterResolved(session, null);
  const tail = routed.suggestedReply.replace(/^(Anotei:[^.]*\.|Adicionei[^.]*\.)\s*/, "");
  return done(session, "ORDER_MODIFICATION",
    `Troquei para ${titleCase(menuItem.name)}. ${tail}`.trim(), routed.actions, false);
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

// ── Early-info handler (greeting/address/payment before items) ────────────────────

function handleEarlyInfo(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult | null {
  void menu; // reserved for future menu-aware early answers
  if (session.selectedItems.length > 0 || session.unresolvedItems.length > 0) return null;

  const trimmed = text.trim();

  if (GREETING_RE.test(trimmed)) {
    session.stage = "IDLE";
    return done(session, "UNKNOWN", "Olá! O que você vai querer pedir?", [], false);
  }

  // Address keyword present → remember it (a street name wins over loose number
  // detection so "Rua das Flores, 123" is never treated as an order).
  if (ADDRESS_LIKE_RE.test(text)) {
    const addr = parseAddressFragment(text);
    if (addr.street) {
      session.address = { ...(session.address ?? {}), ...addr, raw: text };
      session.stage = "IDLE";
      return done(session, "DELIVERY_INFO", "Endereço anotado! Me diz o que vai querer pedir.", [], false);
    }
  }

  const { method, changeFor } = parsePaymentMethod(text);
  if ((method || EARLY_PAYMENT_RE.test(text)) && !hasOrderContent(text)) {
    if (method) session.paymentMethod = method;
    if (changeFor) session.metadata = { ...(session.metadata ?? {}), changeFor };
    session.stage = "IDLE";
    return done(session, "PAYMENT_INFO", "Certo! Me diz o que vai querer pedir.", [], false);
  }

  return null;
}

// ── Menu questions ───────────────────────────────────────────────────────────────

const QUESTION_SUBJECT_RE =
  /^(voc[eê]s?\s+t[eê]m|t[eê]m|tem|qual|quais|quanto custa|quanto custam|quanto|h[aá]|existe|existem|vende[m]?|fazem|faz)\s+/i;

function extractQuestionSubject(text: string): string {
  return text.trim()
    .replace(/\?+\s*$/, "")
    .replace(QUESTION_SUBJECT_RE, "")
    .replace(/\bvoc[eê]s?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function handleMenuQuestion(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
  session.stage  = "IDLE";
  session.status = "ACTIVE";

  const subject = extractQuestionSubject(text);
  if (!subject || subject.length < 2) {
    return done(session, "QUESTION", "Claro! O que você gostaria de saber sobre o cardápio?", [], false);
  }

  const best = bestMenuMatch(normalizePluralAndSpelling(subject), menu);
  if (best.candidates.length === 0) {
    return done(session, "QUESTION",
      `Não encontrei ${subject} cadastrado. Quer ver outras opções ou falar com um atendente?`, [], false);
  }
  if (best.clearWinner && best.top) {
    return done(session, "QUESTION", `Sim, temos ${best.top.name}! Quer pedir?`, [], false);
  }
  const names = best.candidates.slice(0, 2).map(c => c.name).join(" e ");
  return done(session, "QUESTION", `Temos ${names}. Quer pedir?`, [], false);
}

// ── Payment ─────────────────────────────────────────────────────────────────────

function finalizePayment(session: WaPersistedSession): AdvanceResult {
  const method = session.paymentMethod;

  // Cash without change info → ask for change
  if (method === "CASH" && !(session.metadata?.changeFor)) {
    session.stage  = "COLLECTING_PAYMENT_METHOD";
    session.status = "AWAITING_CUSTOMER";
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

function handlePayment(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
  const { method, changeFor } = parsePaymentMethod(text);

  // No method this turn — but if we're awaiting cash change, a bare number is it.
  if (!method) {
    if (session.paymentMethod === "CASH") {
      const m = text.match(/(\d{1,4})/);
      if (m && m[1]) {
        session.metadata = { ...(session.metadata ?? {}), changeFor: parseInt(m[1], 10) };
        return finalizePayment(session);
      }
      // Maybe the customer changed their mind about the order instead.
      const mod = tryModification(session, text, menu);
      if (mod) return mod;
      return done(session, "PAYMENT_INFO", "Vai precisar de troco? Se sim, troco para quanto?", [], false);
    }
    const mod = tryModification(session, text, menu);
    if (mod) return mod;
    return done(session, "PAYMENT_INFO", "Vai pagar no Pix, cartão ou dinheiro?", [], false);
  }

  session.paymentMethod = method;
  if (changeFor) session.metadata = { ...(session.metadata ?? {}), changeFor };
  return finalizePayment(session);
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
  // Otherwise treat as a modification (change / add more items)
  const mod = tryModification(session, text, menu);
  if (mod) return mod;
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

  let resolved: WaOrderItem | null = matched[0] ?? null;

  // Fallback: semantic negation ("normal" → non-zero candidate)
  if (!resolved) resolved = resolveByNegation(text, u, menu);

  if (resolved) {
    // Preserve the original quantity (the matcher may reset to 1 for bare text)
    resolved = { ...resolved, quantity: u.quantity, lineTotal: round(resolved.unitPrice * u.quantity) };
    session.selectedItems.push(resolved);
    session.unresolvedItems = session.unresolvedItems.slice(1);
    session.missingQuestions = mergeMissing(session, menu);
    return continueAfterItems(session, null);
  }

  // No match — re-ask listing the options
  const opts = u.candidates.slice(0, 3).join(" ou ");
  return done(session, "ANSWER_TO_OPTION",
    `Não entendi. Qual você quer: ${opts}?`, [], false);
}

// ── Intent classification (context-aware) ──────────────────────────────────────

const CONFIRM_RE = /\b(sim|isso|pode ser|fechado|confirmo|confirmar|ok|t[aá] bom|beleza|certo|perfeito|isso mesmo)\b/i;
const CANCEL_RE  = /\b(cancela|cancelar|desisto|deixa pra l[aá]|esquece)\b/i;
// A message that is ONLY a greeting/social opener (no product content). Anchored to
// the whole string so "quero 1 coca, bom dia" is NOT caught — only pure greetings.
const GREETING_ONLY_RE =
  /^(oi+|ol[aá]+|ola+|bom dia|boa tarde|boa noite|hey|hi|hello|e a[íi]|eai|opa|al[oô]|tudo bem|tudo bom|boas|fala|menu|in[ií]cio|inicio|come[çc]ar)[\s!?.,]*$/i;

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

function listItems(items: WaOrderItem[]): string {
  return items
    .map(i => `${i.quantity}× ${i.menuItemName}${i.variantName ? ` ${i.variantName}` : ""}`)
    .join(", ");
}

function confirmItems(session: WaPersistedSession): string {
  const list = listItems(session.selectedItems);
  return list ? `Anotei: ${list}.` : "";
}

// Feminine product heads → "a", everything else → "o". Heuristic only (UX copy).
const FEMININE_WORDS_RE = /^(coca|pizza|[aá]gua|caipirinha|batata|cerveja|soda|limonada|laranja|maracuj[aá]|manga|melancia|fruta|por[çc][aã]o|bebida|sobremesa|entrada|salada|esfiha|tapioca)/i;

function articleFor(name: string): string {
  return FEMININE_WORDS_RE.test(norm(name)) ? "a " : "o ";
}

function titleCase(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
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
