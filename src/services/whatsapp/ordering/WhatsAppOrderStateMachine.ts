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
import { withMenuFooter, isMenuReturn , formatOptionNumber } from "./menuFooter";
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

export type WaDeferredAction = "QUOTE_DELIVERY" | "CREATE_ORDER" | "GENERATE_PIX" | "LOOKUP_CEP";

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

  // 1.5 Menu return (`0` / "menu") — never silently discards an in-progress order.
  if (next.metadata?.menuReturnPending === true) {
    delete (next.metadata as Record<string, unknown>).menuReturnPending;
    if (/^\s*1\s*$/.test(text)) {
      return done(next, "QUESTION", "Perfeito! Seguimos com o seu pedido de onde paramos. 😊", [], false);
    }
    if (/^\s*2\s*$/.test(text)) {
      next.status = "CANCELLED";
      next.stage  = "CANCELLED";
      return done(next, "MENU_RETURN", "Pedido descartado. Voltando ao menu principal. 👋", [], false);
    }
    if (/^\s*3\s*$/.test(text)) {
      next.status = "HANDOFF_REQUIRED";
      next.stage  = "HANDOFF_REQUIRED";
      return done(next, "HUMAN_REQUEST", "Certo! Vou chamar um atendente agora. 🤝", [], true);
    }
    // Anything else (including another `0`) → re-ask, keeping the draft safe.
    next.metadata = { ...(next.metadata ?? {}), menuReturnPending: true };
    return done(next, "QUESTION",
      "Você tem um pedido em andamento.\n1️⃣ Continuar pedido\n2️⃣ Descartar pedido\n3️⃣ Falar com atendente", [], false);
  }
  if (isMenuReturn(text)) {
    const hasDraft = next.selectedItems.length > 0 || next.unresolvedItems.length > 0 || next.stage !== "IDLE";
    if (hasDraft && next.stage !== "CANCELLED") {
      next.metadata = { ...(next.metadata ?? {}), menuReturnPending: true };
      return done(next, "QUESTION",
        "Você tem um pedido em andamento.\n1️⃣ Continuar pedido\n2️⃣ Descartar pedido\n3️⃣ Falar com atendente", [], false);
    }
    return done(next, "MENU_RETURN", "Voltando ao menu principal. 👋", [], false);
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
      // PARTE 1: greeting must never reach the product matcher mid-order.
      if (GREETING_ONLY_RE.test(text)) return continueAfterItems(next, null, menu);
      // PARTE 2: order-status / follow-up must never reach the product matcher.
      if (ORDER_FOLLOWUP_RE.test(text)) {
        next.status = "HANDOFF_REQUIRED";
        next.stage  = "HANDOFF_REQUIRED";
        return done(next, "HUMAN_REQUEST", "Vou chamar um atendente para verificar o status do seu pedido. 🤝", [], true);
      }
      return handleItemCollection(next, text, menu);
    case "COLLECTING_DELIVERY_TYPE":
      return handleDeliveryType(next, text, menu);
    case "COLLECTING_ADDRESS":
      return handleAddress(next, text, menu);
    case "COLLECTING_PAYMENT_METHOD":
      return handlePayment(next, text, menu);
    case "REVIEWING_ORDER":
      return handleReview(next, text, intent, menu);
    case "AWAITING_PIX_PAYMENT":
      return handleAwaitingPixPayment(next, text);
    case "BUILDING_CART":
      return handleBuildingCart(next, text, menu);

    default: {
      // IDLE / INTENT_DETECTED / PARSING_ITEMS / fresh order
      // Priority: greeting → follow-up/status → question → early-info → product

      // PARTE 1: Greeting guard — must never reach the product matcher, whether the
      // cart is empty or has items (prevents "não encontrei 'oi' no cardápio").
      if (GREETING_ONLY_RE.test(text)) {
        if (next.selectedItems.length === 0) {
          return done(
            next,
            "UNKNOWN",
            "Olá! Pode me mandar seu pedido por aqui que eu anoto pra você. 😊",
            [],
            false,
          );
        }
        // Active cart: resume context — show the next required question.
        return continueAfterItems(next, null, menu);
      }

      // PARTE 2: Order-status / follow-up guard — must never reach the product matcher.
      // "cadê", "ué", "onde está", "quanto tempo falta" etc. are status signals, not
      // product names, and would otherwise produce "Não encontrei 'cadê' no cardápio".
      if (ORDER_FOLLOWUP_RE.test(text)) {
        if (next.selectedItems.length > 0) {
          next.status = "HANDOFF_REQUIRED";
          next.stage  = "HANDOFF_REQUIRED";
          return done(next, "HUMAN_REQUEST", "Vou chamar um atendente para verificar o status do seu pedido. 🤝", [], true);
        }
        next.stage = "IDLE";
        return done(next, "UNKNOWN", "Ainda não temos um pedido em andamento. Pode me dizer o que vai querer pedir? 😊", [], false);
      }

      // Intent-first: a menu question must never be run through the product matcher.
      if (intent === "QUESTION" && next.selectedItems.length === 0) {
        return handleMenuQuestion(next, text, menu);
      }
      // Early info: address / payment that arrives before any item.
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

// ── Awaiting Pix payment ────────────────────────────────────────────────────────

const PIX_PAID_RE = /\b(paguei|pago|pix\s*feito|transferi|enviei|confirmei|j[aá]\s+paguei|j[aá]\s+mandei|j[aá]\s+fiz)\b/i;

function handleAwaitingPixPayment(session: WaPersistedSession, text: string): AdvanceResult {
  if (PIX_PAID_RE.test(text)) {
    return done(session, "CONFIRMATION",
      "Aguardando confirmação automática do Pix. Assim que identificarmos, avisamos e seu pedido entra para preparo! 😊",
      [], false);
  }
  if (CANCEL_RE.test(text)) {
    session.status = "CANCELLED";
    session.stage  = "CANCELLED";
    return done(session, "CANCEL", "Pedido cancelado. Se precisar, é só chamar de novo. 👋", [], false);
  }
  if (/\b(atendente|humano|pessoa|operador|falar com)\b/i.test(text)) {
    session.status = "HANDOFF_REQUIRED";
    session.stage  = "HANDOFF_REQUIRED";
    return done(session, "HUMAN_REQUEST", "Certo! Vou chamar um atendente. 🤝", [], true);
  }
  return done(session, "UNKNOWN",
    "Seu pedido está aguardando confirmação do Pix. Assim que confirmado, avisamos! 😊",
    [], false);
}

// ── Inline comanda builder (pure, no imports needed) ──────────────────────────

function inlineComanda(session: WaPersistedSession): string {
  const lines: string[] = ["*Resumo do pedido:*"];
  let subtotal = 0;
  for (const item of session.selectedItems) {
    const variant = item.variantName ? ` ${item.variantName}` : "";
    const opts = item.options.length > 0 ? ` (${item.options.map(o => o.optionName).join(", ")})` : "";
    lines.push(`${item.quantity}x ${item.menuItemName}${variant}${opts} — R$ ${item.lineTotal.toFixed(2)}`);
    subtotal += item.lineTotal;
  }
  const deliveryFee = session.deliveryType === "PICKUP" ? 0 : (session.deliveryQuote?.fee ?? 0);
  if (session.deliveryType === "DELIVERY") {
    lines.push(`Entrega — R$ ${deliveryFee.toFixed(2)}`);
  } else if (session.deliveryType === "PICKUP") {
    lines.push("Retirada — grátis");
  }
  const total = round(subtotal + deliveryFee);
  lines.push(`*Total — R$ ${total.toFixed(2)}*`);
  return lines.join("\n");
}

// ── BUILDING_CART constants ──────────────────────────────────────────────────────

const FINALIZE_CART_RE =
  /^\s*9[️⃣]*\s*$|\b(finalizar(\s+pedido)?|fechar\s+pedido|quero\s+finalizar|confirmar\s+pedido)\b/i;

const BEVERAGE_KEYWORDS_RE =
  /\b(coca|suco|cerveja|chopp|[aá]gua|caipirinha|drink|vinho|whisky|cacha[çc]a|limonada|refrigerante|soda|guaran[aá]|heineken|skol|brahma|pepsi|sprite|fanta|monster|red\s*bull|energ[eé]tico|[aá]lcool)\b/i;

const DESSERT_KEYWORDS_RE =
  /\b(sobremesa|doce|pudim|sorvete|mousse|torta|brownie|cheesecake|churros|brigadeiro|fondue|crepe|petit\s*gateau|tapioca|a[çc]a[ií])\b/i;

function buildCartReply(session: WaPersistedSession): string {
  const parts: string[] = ["Anotei até agora:"];
  for (const item of session.selectedItems) {
    const variant = item.variantName ? ` ${item.variantName}` : "";
    const opts = item.options.length > 0 ? ` (${item.options.map(o => o.optionName).join(", ")})` : "";
    const price = item.lineTotal.toFixed(2).replace(".", ",");
    parts.push(`${item.quantity}× ${item.menuItemName}${variant}${opts} — R$ ${price}`);
  }
  parts.push("\nQuer adicionar mais alguma coisa?");
  parts.push("");
  parts.push("1️⃣ Adicionar mais itens");
  parts.push("2️⃣ Ver bebidas");
  parts.push("3️⃣ Ver sobremesas");
  parts.push("9️⃣ Finalizar pedido");
  return parts.join("\n");
}

function showCategoryItems(
  session: WaPersistedSession,
  menu: WaMenuItem[],
  category: "BEVERAGE" | "DESSERT",
): AdvanceResult {
  const filter = category === "BEVERAGE" ? BEVERAGE_KEYWORDS_RE : DESSERT_KEYWORDS_RE;
  const label = category === "BEVERAGE" ? "Bebidas" : "Sobremesas";
  const items = menu.filter(m => m.isAvailable && filter.test(m.name));
  if (items.length === 0) {
    return done(session, "ORDER_REQUEST",
      `Não temos ${label.toLowerCase()} disponíveis no momento.\n\n9️⃣ Finalizar pedido`, [], false);
  }
  const lines = items.slice(0, 6).map((item, i) => {
    const p = channelPrice({ price: item.price, priceDelivery: item.priceDelivery }, "DELIVERY");
    return `${formatOptionNumber(i + 1)} ${titleCase(item.name)} — R$ ${p.toFixed(2)}`;
  });
  return done(session, "ORDER_REQUEST",
    `${label} disponíveis:\n\n${lines.join("\n")}\n\nQual você quer adicionar? Ou:\n9️⃣ Finalizar pedido`, [], false);
}

function handleBuildingCart(
  session: WaPersistedSession,
  text: string,
  menu: WaMenuItem[],
): AdvanceResult {
  if (FINALIZE_CART_RE.test(text)) {
    session.metadata = { ...(session.metadata ?? {}), cartFinalized: true };
    return startCheckout(session);
  }
  if (/^\s*1[️⃣]*\s*$/.test(text)) {
    return done(session, "ORDER_REQUEST", "Claro! O que mais vai querer?", [], false);
  }
  if (/^\s*2[️⃣]*\s*$/.test(text)) {
    return showCategoryItems(session, menu, "BEVERAGE");
  }
  if (/^\s*3[️⃣]*\s*$/.test(text)) {
    return showCategoryItems(session, menu, "DESSERT");
  }
  captureDeliveryPayment(session, text);
  const mod = tryModification(session, text, menu);
  if (mod) return mod;
  return handleItemCollection(session, text, menu);
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

  return continueAfterItems(session, hadItems ? matched : null, menu);
}

/** Decides the next stage after items change: ask options, clarify, or move on. */
function continueAfterItems(
  session:   WaPersistedSession,
  justAdded: WaOrderItem[] | null,
  menu:      WaMenuItem[],
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
      const label    = titleCase(normalizePluralAndSpelling(stripQty(u.rawText)));
      const hasDraft = session.selectedItems.length > 0;
      // Numbered options (up to 3 candidates + optional "Deixar sem X")
      const numOpts  = u.candidates.slice(0, 3).map((c, i) => {
        const item  = menu.find(m => norm(m.name) === norm(c));
        const price = item
          ? channelPrice({ price: item.price, priceDelivery: item.priceDelivery }, "DELIVERY")
          : null;
        return `${formatOptionNumber(i + 1)} ${titleCase(c)}${price !== null ? ` — R$ ${price.toFixed(2)}` : ""}`;
      });
      if (hasDraft) numOpts.push(`${numOpts.length + 1} — Deixar sem ${label}`);
      const optsList = numOpts.join("\n");
      // If other items are still queued, tell the customer what comes next.
      const remaining   = session.unresolvedItems.slice(1);
      const remainLabel = remaining[0]
        ? titleCase(normalizePluralAndSpelling(stripQty(remaining[0].rawText)))
        : "";
      const hint = remaining.length === 1
        ? ` Depois confirmo ${articleFor(remainLabel)}${remainLabel}.`
        : remaining.length > 1
          ? ` Depois confirmo os outros itens.`
          : "";
      return done(session, "ORDER_REQUEST",
        `Para ${articleFor(label)}${label}, qual opção você quer?\n${optsList}${hint}`, [], false);
    }
    if (u.reason === "UNAVAILABLE") {
      return done(session, "ORDER_REQUEST", `"${u.rawText}" está indisponível agora. Quer outra opção?`, [], false);
    }
    return done(session, "ORDER_REQUEST", `Não encontrei "${u.rawText}" no cardápio. Pode confirmar o nome?`, [], false);
  }

  // All items resolved → route based on what we already know.
  return routeAfterResolved(session, justAdded);
}

function startCheckout(session: WaPersistedSession): AdvanceResult {
  if (!session.deliveryType) {
    session.stage  = "COLLECTING_DELIVERY_TYPE";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "ORDER_REQUEST", "Vai ser entrega ou retirada?", [], false);
  }

  if (session.deliveryType === "DELIVERY") {
    const addrComplete = !!(session.address?.street && session.address?.number);
    if (!addrComplete) {
      session.stage  = "COLLECTING_ADDRESS";
      session.status = "AWAITING_CUSTOMER";
      return done(session, "DELIVERY_INFO", askAddressReply(session), [], false);
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
    const comanda = inlineComanda(session);
    return done(session, "ORDER_REQUEST", `${comanda}\n\n${askPaymentReply(session)}`, [], false);
  }

  return finalizePayment(session);
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
  void justAdded;
  const cartFinalized = (session.metadata as Record<string, unknown> | null)?.cartFinalized === true;
  if (!cartFinalized) {
    session.stage  = "BUILDING_CART";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "ORDER_REQUEST", buildCartReply(session), [], false);
  }
  return startCheckout(session);
}

// ── Option answers ──────────────────────────────────────────────────────────────

function handleOptionAnswer(
  session: WaPersistedSession,
  text:    string,
  menu:    WaMenuItem[],
): AdvanceResult {
  const q = session.missingQuestions[0];
  if (!q) return continueAfterItems(session, null, menu);

  // Explicit add-item interrupt (ADD_RE or order content not matching any listed option)
  if (ADD_RE.test(text) || (hasOrderContent(text) && !q.options.some(o => norm(text).includes(norm(o))))) {
    const mod = tryModification(session, text, menu);
    if (mod) return mod;
  }

  // Numeric selection: "1" → first option, "2" → second, etc.
  const numericSel = /^\s*\d+\s*$/.test(text) ? parseInt(text.trim(), 10) : NaN;
  if (!isNaN(numericSel) && numericSel >= 1 && numericSel <= q.options.length) {
    return handleOptionAnswer(session, q.options[numericSel - 1]!, menu);
  }

  // Find the menu item this question belongs to
  const menuItem = menu.find(m => m.name === q.itemName);
  const target   = session.selectedItems.find(i => i.menuItemName === q.itemName);

  if (!menuItem || !target) {
    // Can't resolve — drop the question to avoid a loop
    session.missingQuestions = session.missingQuestions.slice(1);
    return continueAfterItems(session, null, menu);
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
      return continueAfterItems(session, null, menu);
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
      return continueAfterItems(session, null, menu);
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
    const comanda = inlineComanda(session);
    return done(session, "DELIVERY_INFO",
      `Retirada no balcão. ✅\n\n${comanda}\n\n${askPaymentReply(session)}`, [], false);
  }
  if (DELIVERY_RE.test(text)) {
    session.deliveryType = "DELIVERY";
    // Address already captured before items were ordered — only skip the CEP flow
    // when it includes a CEP (official freight needs the CEP-grade address).
    if (session.address?.street && session.address?.number && session.address?.cep) {
      session.stage  = "CALCULATING_DELIVERY_FEE";
      session.status = "ACTIVE";
      return done(session, "DELIVERY_INFO", "Só um instante, calculando a entrega…", ["QUOTE_DELIVERY"], false);
    }
    if (session.address?.street) session.address = null; // loose address → restart via CEP
    session.stage  = "COLLECTING_ADDRESS";
    session.status = "AWAITING_CUSTOMER";
    return done(session, "DELIVERY_INFO", askAddressReply(session), [], false);
  }

  // Numeric answer to the numbered question: 1 = entrega, 2 = retirada.
  if (/^\s*1\s*$/.test(text)) return handleDeliveryType(session, "entrega", menu);
  if (/^\s*2\s*$/.test(text)) return handleDeliveryType(session, "retirada", menu);

  // Not a delivery/pickup answer — maybe the customer is modifying the order.
  const mod = tryModification(session, text, menu);
  if (mod) return mod;

  return done(session, "UNKNOWN", "Como você quer receber?\n1️⃣ Entrega\n2️⃣ Retirada", [], false);
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
  const ack  = `Atualizei para ${n} unidade${n !== 1 ? "s" : ""}.`;
  if (routed.suggestedReply.startsWith("Anotei até agora:")) {
    return done(session, "ORDER_MODIFICATION", `${ack}\n\n${routed.suggestedReply}`, routed.actions, false);
  }
  const tail = routed.suggestedReply.replace(/^(Anotei:[^.]*\.|Adicionei[^.]*\.)\s*/, "");
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

  if (session.missingQuestions[0]) return continueAfterItems(session, null, menu);

  const routed = routeAfterResolved(session, null);
  const ack = `Troquei para ${titleCase(menuItem.name)}.`;
  if (routed.suggestedReply.startsWith("Anotei até agora:")) {
    return done(session, "ORDER_MODIFICATION", `${ack}\n\n${routed.suggestedReply}`, routed.actions, false);
  }
  const tail = routed.suggestedReply.replace(/^(Anotei:[^.]*\.|Adicionei[^.]*\.)\s*/, "");
  return done(session, "ORDER_MODIFICATION", `${ack} ${tail}`.trim(), routed.actions, false);
}

// ── Cancel pending unresolved item (item-level cancel during ambiguity) ───────────

function cancelPendingItem(session: WaPersistedSession, menu: WaMenuItem[]): AdvanceResult {
  const u     = session.unresolvedItems[0];
  const label = u ? titleCase(normalizePluralAndSpelling(stripQty(u.rawText))) : "o item";
  session.unresolvedItems = session.unresolvedItems.slice(1);
  const ack = `Beleza, deixei ${articleFor(label)}${label} de fora.`;

  if (session.selectedItems.length === 0 && session.unresolvedItems.length === 0) {
    session.stage  = "IDLE";
    session.status = "ACTIVE";
    return done(session, "CANCEL", `${ack} Quer pedir algo?`, [], false);
  }

  const routed = continueAfterItems(session, null, menu);
  // Prepend ack + inline comanda so customer sees what remains
  const replyHasComanda =
    routed.suggestedReply.includes("*Resumo do pedido:*") ||
    routed.suggestedReply.startsWith("Anotei até agora:");
  if (replyHasComanda) {
    routed.suggestedReply = `${ack}\n\n${routed.suggestedReply}`;
  } else {
    const comanda = inlineComanda(session);
    routed.suggestedReply = `${ack}\n\n${comanda}\n\n${routed.suggestedReply}`;
  }
  return routed;
}

// ── Address ─────────────────────────────────────────────────────────────────────

// ── Saved address (opt-in via session.metadata.savedAddress, Fute parity) ───────
interface WaSavedAddress { street: string; number: string; neighborhood?: string; formatted: string }

function savedAddressOf(session: WaPersistedSession): WaSavedAddress | null {
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const sa = meta.savedAddress as WaSavedAddress | undefined;
  return sa && sa.street && sa.number ? sa : null;
}

/** The ask-address question — offers the saved address (1/2) when available. */
const ASK_CEP_REPLY = "Para calcular a entrega certinho, me envie primeiro o CEP, por favor.";
const CEP_IN_TEXT_RE = /\b\d{5}-?\d{3}\b/;

function askAddressReply(session: WaPersistedSession): string {
  const saved = savedAddressOf(session);
  if (saved && !session.address?.street) {
    return `Posso enviar para este endereço?\n${saved.formatted}\n1️⃣ Sim\n2️⃣ Usar outro endereço`;
  }
  return ASK_CEP_REPLY;
}

function handleAddress(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
  // Saved-address answer: 1 = use it, 2 = type another one.
  const saved = savedAddressOf(session);
  if (saved && !session.address?.street) {
    if (/^\s*1\s*$/.test(text)) {
      session.address = { street: saved.street, number: saved.number, neighborhood: saved.neighborhood, raw: saved.formatted };
      session.metadata = { ...(session.metadata ?? {}), savedAddress: undefined };
      session.stage  = "CALCULATING_DELIVERY_FEE";
      session.status = "ACTIVE";
      return done(session, "DELIVERY_INFO", "Só um instante, calculando a entrega…", ["QUOTE_DELIVERY"], false);
    }
    if (/^\s*2\s*$/.test(text)) {
      session.metadata = { ...(session.metadata ?? {}), savedAddress: undefined };
      return done(session, "DELIVERY_INFO", "Me envia o endereço com rua, número e bairro, por favor.", [], false);
    }
  }
  // Add-item interrupt: if the message carries order content and does NOT look
  // like a street address, treat it as a new item request, not an address.
  if ((ADD_RE.test(text) || hasOrderContent(text)) && !ADDRESS_LIKE_RE.test(text) && !CEP_IN_TEXT_RE.test(text)) {
    const mod = tryModification(session, text, menu);
    if (mod) return mod;
  }

  const flow = (session.metadata?.addressFlow as string | undefined) ?? "AWAIT_CEP";
  const meta = () => (session.metadata = { ...(session.metadata ?? {}) });

  // Step 2 — confirm the address found for the CEP.
  if (flow === "CONFIRM_CEP") {
    const cepAddr = session.metadata?.cepAddress as { street: string; neighborhood: string; city: string; cep: string } | undefined;
    if (/^\s*1\s*$/.test(text) && cepAddr) {
      meta().addressFlow = "ASK_NUMBER";
      return done(session, "DELIVERY_INFO", "Qual o número? (e complemento, se tiver)", [], false);
    }
    if (/^\s*2\s*$/.test(text) || CEP_IN_TEXT_RE.test(text)) {
      meta().addressFlow = "AWAIT_CEP";
      delete (session.metadata as Record<string, unknown>).cepAddress;
      if (CEP_IN_TEXT_RE.test(text)) {
        meta().pendingCep = text.match(CEP_IN_TEXT_RE)![0];
        return done(session, "DELIVERY_INFO", "Um instante, buscando o endereço do CEP…", ["LOOKUP_CEP"], false);
      }
      return done(session, "DELIVERY_INFO", ASK_CEP_REPLY, [], false);
    }
    const found = cepAddr ? `${cepAddr.street}${cepAddr.neighborhood ? `, ${cepAddr.neighborhood}` : ""} — ${cepAddr.city}` : "";
    return done(session, "DELIVERY_INFO",
      `Encontrei este endereço:\n${found}\n\n1️⃣ Sim, é esse\n2️⃣ Corrigir o CEP`, [], false);
  }

  // Step 3 — house number (+ optional complement) completes the address.
  if (flow === "ASK_NUMBER") {
    const cepAddr = session.metadata?.cepAddress as { street: string; neighborhood: string; city: string; cep: string } | undefined;
    const numMatch = text.match(/\d{1,6}/);
    if (!numMatch || !cepAddr) {
      return done(session, "DELIVERY_INFO", "Qual o número? (e complemento, se tiver)", [], false);
    }
    const number = numMatch[0];
    const complement = text.replace(numMatch[0], "").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
    session.address = {
      street: cepAddr.street,
      number,
      neighborhood: cepAddr.neighborhood || undefined,
      cep: cepAddr.cep,
      raw: `${cepAddr.street}, ${number}${complement ? ` ${complement}` : ""} - ${cepAddr.neighborhood}, ${cepAddr.city}`,
    };
    session.metadata = { ...(session.metadata ?? {}), addressFlow: undefined, cepAddress: undefined };
    session.stage  = "CALCULATING_DELIVERY_FEE";
    session.status = "ACTIVE";
    return done(session, "DELIVERY_INFO", "Só um instante, calculando a entrega…", ["QUOTE_DELIVERY"], false);
  }

  // Step 1 — CEP first (same flow as the Fute checkout).
  if (CEP_IN_TEXT_RE.test(text)) {
    meta().pendingCep = text.match(CEP_IN_TEXT_RE)![0];
    meta().addressFlow = "AWAIT_CEP";
    return done(session, "DELIVERY_INFO", "Um instante, buscando o endereço do CEP…", ["LOOKUP_CEP"], false);
  }
  // Street text without CEP → ask the CEP (never accept a loose address as main path).
  return done(session, "DELIVERY_INFO", ASK_CEP_REPLY, [], false);
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

// More-specific multi-word forms (e.g. "quanto sai") must come BEFORE the
// bare "quanto" so the regex engine doesn't stop early and leave "sai …" behind.
// All alternatives use `\s+` at the end (via the outer `)\s+`) so prefixes of
// real product names like "tem" in "temaki" are never accidentally stripped.
const QUESTION_SUBJECT_RE =
  /^(voc[eê]s?\s+t[eê]m|t[eê]m|tem|qual|quais|quanto custa[m]?|quanto\s+sai|quanto\s+fica|quanto|h[aá]|existe[m]?|vende[m]?|fazem|faz|pre[çc]o|valor)\s+/i;

// Leading Portuguese articles AND genitive prepositions — strip them so
// "o yakisoba" → "yakisoba" and "do temaki" → "temaki" for menu matching.
// Combined with the loop in extractQuestionSubject this handles multi-step
// cases like "qual o preço do X" → "preço do X" → "X" in two passes.
const LEADING_ARTICLE_RE = /^(d[aeo]s?|os?|as?|um[as]?|uns?)\s+/i;

function extractQuestionSubject(text: string): string {
  let s = text.trim().replace(/\?+\s*$/, "");
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(QUESTION_SUBJECT_RE, "")
      .replace(/\bvoc[eê]s?\b/gi, "")
      .replace(LEADING_ARTICLE_RE, "")
      .trim();
  } while (s !== prev && s.length > 0);
  return s.replace(/\s+/g, " ").trim();
}

function buildPriceListReply(subject: string, candidates: WaMenuItem[]): string {
  if (candidates.length === 0) {
    // Menu QUESTION (not an order attempt): never quote the phrase as a missing
    // product — answer honestly, name the subject unquoted, and offer the menu/atendente.
    return `Não encontrei ${subject} no cardápio. Quer ver o cardápio completo ou falar com um atendente?`;
  }

  if (candidates.length === 1 && candidates[0]) {
    const item = candidates[0];
    if (item.hasVariants && item.variants.length > 0) {
      const varLines = item.variants
        .filter(v => v.isAvailable)
        .slice(0, 5)
        .map((v, i) => {
          const p = channelPrice({ price: v.price, priceDelivery: v.priceDelivery }, "DELIVERY");
          return `${formatOptionNumber(i + 1)} ${titleCase(v.name)} — R$ ${p.toFixed(2)}`;
        })
        .join("\n");
      return `Temos estas opções de ${titleCase(item.name)}:\n\n${varLines}\n\nQuer pedir alguma?`;
    }
    const p = channelPrice({ price: item.price, priceDelivery: item.priceDelivery }, "DELIVERY");
    return `${titleCase(item.name)} custa R$ ${p.toFixed(2)}. Quer pedir?`;
  }

  // Multiple candidates → numbered list with prices
  const lines = candidates.slice(0, 4).map((item, i) => {
    const p = channelPrice({ price: item.price, priceDelivery: item.priceDelivery }, "DELIVERY");
    return `${formatOptionNumber(i + 1)} ${titleCase(item.name)} — R$ ${p.toFixed(2)}`;
  }).join("\n");
  return `Temos estas opções:\n\n${lines}\n\nQuer pedir alguma?`;
}

function handleMenuQuestion(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
  session.stage  = "IDLE";
  session.status = "ACTIVE";

  const subject = extractQuestionSubject(text);
  if (!subject || subject.length < 2) {
    return done(session, "QUESTION", "Claro! O que você gostaria de saber sobre o cardápio?", [], false);
  }

  const isPriceQuery = /\b(quanto custa|quanto custam|pre[çc]o|valor|quanto\s+sai|quanto\s+fica|qual\s+o\s+pre[çc]o)\b/i.test(text);

  const best = bestMenuMatch(normalizePluralAndSpelling(subject), menu);

  if (best.candidates.length === 0) {
    // Menu QUESTION: answer honestly without quoting the phrase as a missing
    // product (the quoted form is reserved for genuine order attempts).
    return done(session, "QUESTION",
      `Não encontrei ${subject} no cardápio. Quer ver o cardápio completo ou falar com um atendente?`, [], false);
  }

  if (isPriceQuery) {
    const candidates = best.clearWinner && best.top ? [best.top] : best.candidates.slice(0, 4);
    return done(session, "QUESTION", buildPriceListReply(subject, candidates), [], false);
  }

  if (best.clearWinner && best.top) {
    return done(session, "QUESTION", `Sim, temos ${titleCase(best.top.name)}! Quer pedir?`, [], false);
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

// ── Configured payment options (Fute parity, opt-in via session.metadata) ───────
// metadata.paymentQuestion: numbered question rendered from the restaurant's
//   configured payment options (same PaymentSettings the Fute checkout uses);
// metadata.paymentOptionOrder: ["PIX","CARD","CASH"...] so a bare number maps to
//   the official option; metadata.declaredPayment: method the customer mentioned
//   in free text — still confirmed through the official options (1. Sim / 2. Outra).
const PAYMENT_LABELS: Record<"PIX" | "CARD" | "CASH", string> = {
  PIX: "Pix", CARD: "Cartão na entrega", CASH: "Dinheiro na entrega",
};

function askPaymentReply(session: WaPersistedSession): string {
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const declared = meta.declaredPayment as "PIX" | "CARD" | "CASH" | undefined;
  if (declared && !session.paymentMethod) {
    return `Você informou ${PAYMENT_LABELS[declared].toLowerCase()}.\nConfirma essa forma de pagamento?\n1️⃣ Sim, ${PAYMENT_LABELS[declared].toLowerCase()}\n2️⃣ Escolher outra forma de pagamento`;
  }
  if (typeof meta.paymentQuestion === "string" && meta.paymentQuestion.trim()) {
    return meta.paymentQuestion;
  }
  return "Vai pagar no Pix, cartão ou dinheiro?";
}

function handlePayment(session: WaPersistedSession, text: string, menu: WaMenuItem[]): AdvanceResult {
  const meta = (session.metadata ?? {}) as Record<string, unknown>;

  // Declared payment pre-confirmation (official flow): 1=Sim, 2=outra forma.
  const declared = meta.declaredPayment as "PIX" | "CARD" | "CASH" | undefined;
  if (declared && !session.paymentMethod) {
    if (/^\s*1\s*$/.test(text)) {
      session.metadata = { ...meta, declaredPayment: undefined };
      session.paymentMethod = declared;
      return finalizePayment(session);
    }
    if (/^\s*2\s*$/.test(text)) {
      session.metadata = { ...meta, declaredPayment: undefined };
      return done(session, "PAYMENT_INFO", askPaymentReply(session), [], false);
    }
  }

  // Numeric selection over the configured option order (Fute parity).
  const optionOrder = Array.isArray(meta.paymentOptionOrder) ? (meta.paymentOptionOrder as Array<"PIX" | "CARD" | "CASH">) : null;
  if (optionOrder && !session.paymentMethod) {
    const n = text.match(/^\s*([1-9])\s*$/);
    if (n && n[1]) {
      const picked = optionOrder[parseInt(n[1], 10) - 1];
      if (picked) {
        session.paymentMethod = picked;
        return finalizePayment(session);
      }
    }
  }

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
    return done(session, "PAYMENT_INFO", askPaymentReply(session), [], false);
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
      return done(session, "CONFIRMATION", askPaymentReply(session), [], false);
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

  // Explicit item-level cancel
  if (CANCEL_ITEM_RE.test(text)) return cancelPendingItem(session, menu);

  const hasDraft      = session.selectedItems.length > 0;
  const maxCandidates = Math.min(u.candidates.length, 3);
  const numericSel    = /^\s*\d+\s*$/.test(text) ? parseInt(text.trim(), 10) : NaN;

  if (!isNaN(numericSel)) {
    // Last numbered option = "Deixar sem X" (only when draft has items)
    if (hasDraft && numericSel === maxCandidates + 1) {
      return cancelPendingItem(session, menu);
    }
    // Numbered candidate selection: "1" → first candidate, "2" → second, etc.
    if (numericSel >= 1 && numericSel <= maxCandidates) {
      const chosen   = u.candidates[numericSel - 1]!;
      const menuItem = menu.find(m => m.isAvailable && norm(m.name) === norm(chosen));
      if (menuItem) {
        const unitPrice = channelPrice(
          { price: menuItem.price, priceDelivery: menuItem.priceDelivery },
          "DELIVERY",
        );
        const res: WaOrderItem = {
          rawText: u.rawText, quantity: u.quantity,
          menuItemId: menuItem.id, menuItemName: menuItem.name,
          options: [], extras: [], unitPrice, lineTotal: round(unitPrice * u.quantity),
        };
        session.selectedItems.push(res);
        session.unresolvedItems  = session.unresolvedItems.slice(1);
        session.missingQuestions = mergeMissing(session, menu);
        return continueAfterItems(session, null, menu);
      }
    }
  }

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
    return continueAfterItems(session, null, menu);
  }

  // No match — build numbered options list for re-ask
  const label      = titleCase(normalizePluralAndSpelling(stripQty(u.rawText)));
  const answerNorm = norm(text);
  const numOpts    = u.candidates.slice(0, 3).map((c, i) => `${formatOptionNumber(i + 1)} ${titleCase(c)}`);
  if (hasDraft) numOpts.push(`${numOpts.length + 1} — Deixar sem ${label}`);
  const optsList = numOpts.join("\n");

  // Format/size mismatch: customer asked for "lata" when only 2L exists → targeted reply
  const mentionedFormat  = answerNorm.match(FORMAT_KEYWORD_RE)?.[0];
  const isFormatMismatch = mentionedFormat != null &&
    !u.candidates.some(c => norm(c).includes(mentionedFormat));
  const prefix = isFormatMismatch
    ? `Não encontrei essa versão d${articleFor(label) === "a " ? "a" : "o"} ${label}. Tenho essas opções:`
    : `Não entendi. Para ${articleFor(label)}${label}, qual você quer?`;

  return done(session, "ANSWER_TO_OPTION", `${prefix}\n${optsList}`, [], false);
}

// ── Intent classification (context-aware) ──────────────────────────────────────

const CONFIRM_RE = /\b(sim|isso|pode ser|fechado|confirmo|confirmar|ok|t[aá] bom|beleza|certo|perfeito|isso mesmo)\b/i;
const CANCEL_RE  = /\b(cancela|cancelar|desisto|deixa pra l[aá]|esquece)\b/i;
// Cancels only the PENDING unresolved item — not the whole order.
// "não quero / não quero mais / tira / remove / sem essa" during ambiguity.
const CANCEL_ITEM_RE = /\b(n[aã]o\s+quero(?:\s+mais)?|tira(?:r)?|remov(?:e|er)|n[aã]o\s+precisa|sem\s+ess[ae]|sem\s+isso)\b/i;
// Format/size terms. When the customer names a format not present in any candidate,
// we reply with a targeted "not available in that format" message.
const FORMAT_KEYWORD_RE = /\b(lata|garrafa|2\s*l(?:itro)?s?|1\s*l(?:itro)?|500\s*ml|350\s*ml|zero|diet|light|pequen[ao]|grande|familiar|gigante)\b/i;
// A message that is ONLY a greeting/social opener (no product content). Anchored to
// the whole string so "quero 1 coca, bom dia" is NOT caught — only pure greetings.
const GREETING_ONLY_RE =
  /^(oi+|ol[aá]+|ola+|bom dia|boa tarde|boa noite|hey|hi|hello|e a[íi]|eai|opa|al[oô]|tudo bem|tudo bom|boas|fala|menu|in[ií]cio|inicio|come[çc]ar)[\s!?.,]*$/i;

// Order-status / follow-up signals — must NEVER be fed to the product matcher.
// Catches "cadê", "ué", "onde está", "quanto tempo falta", etc. — phrases that
// are meaningful status questions but would produce "Não encontrei 'cadê' no
// cardápio" if sent to handleItemCollection.
// Notes:
//   - `(?!\w)` is used after accented chars (ê/é/á are \W in JS, so `\b` after
//     them never matches — the negative lookahead is the correct alternative).
//   - Alternatives that end in a regular word char use the normal `\b`.
const ORDER_FOLLOWUP_RE =
  /\bcad[eê](?!\w)|\bu[eé](?!\w)|\bonde est[aá](?!\w)|\be o pedido\b|\bt[aá] saindo\b|\best[aá] demorando\b|\bquanto tempo falta\b|\bprevis[aã]o de entrega\b|\bstatus do pedido\b/i;

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

/** Terminal stages exit the flow — no "0. menu" footer on goodbye/handoff. */
const NO_FOOTER_STAGES = new Set(["CANCELLED", "HANDOFF_REQUIRED", "EXPIRED"]);

function done(
  session: WaPersistedSession,
  intent:  WaDetectedIntent,
  reply:   string,
  actions: WaDeferredAction[],
  handoff: boolean,
): AdvanceResult {
  // Product rule: every ACTIVE-flow message ends with exactly `0. menu`.
  const suggestedReply =
    handoff || NO_FOOTER_STAGES.has(session.stage) || intent === "MENU_RETURN"
      ? reply
      : withMenuFooter(reply);
  return { session, intent, suggestedReply, actions, handoff, operatorSummary: operatorSummaryOf(session) };
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
