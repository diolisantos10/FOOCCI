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
 * Wired into the live webhook path via WhatsAppTextOrderingRuntimeService, which
 * runs only after the message-aware routing contract approves (order intent OR an
 * active ordering session) and behind the DB-aware enabled/paused/allowlist guards.
 */

import { matchItems } from "./menuMatcher";
import { calculateDraftSummary } from "./orderCalculator";
import { detectIntent, parseTextItems } from "./parser";
import type {
  WaAnalyzeInput,
  WaAnalyzeResult,
  WaDetectedIntent,
  WaMenuItem,
  WaOrderItem,
  WaOrderStage,
  WaUnresolvedItem,
  WaMissingQuestion,
} from "./types";

// Re-exported so existing importers (and tests) keep working after the parser
// was extracted into ./parser.
export { detectIntent, parseTextItems };

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

// ════════════════════════════════════════════════════════════════════════════
//  W2+ STATE-MACHINE ORCHESTRATION
//  processCustomerMessage — runs one customer turn through the state machine and
//  executes deferred I/O actions (delivery quote, order, Pix) per permissions.
//  Persistence is the caller's responsibility (session service / runtime wrapper).
// ════════════════════════════════════════════════════════════════════════════

import { advanceSession } from "./WhatsAppOrderStateMachine";
import { buildFullDraft, checkCompleteness } from "./WhatsAppOrderDraftBuilder";
import { quoteWhatsAppDelivery } from "./WhatsAppDeliveryService";
import { createOrderFromSession } from "./WhatsAppOrderCreationService";
import { generatePix } from "./WhatsAppPaymentService";
import type {
  WaProcessInput,
  WaProcessResult,
  WaPersistedSession,
  WaPaymentInfo,
} from "./types";

const CUSTOMER_FALLBACK_NAME = "Cliente WhatsApp";

function paymentMethodLabel(method: string | null): string {
  if (method === "PIX")  return "Pix";
  if (method === "CARD") return "Cartão";
  if (method === "CASH") return "Dinheiro";
  return "a definir";
}

function buildOrderConfirmedReply(session: WaPersistedSession): string {
  const deliveryLabel = session.deliveryType === "PICKUP" ? "Retirada no balcão" : "Entrega no seu endereço";
  return `Pedido confirmado! ✅\n${deliveryLabel} · ${paymentMethodLabel(session.paymentMethod)}. Já vamos preparar. 🙌`;
}

function buildOrderAnnotatedReply(session: WaPersistedSession): string {
  const deliveryLabel = session.deliveryType === "PICKUP" ? "Retirada no balcão" : "Entrega no seu endereço";
  return `Pedido anotado! ✅\n${deliveryLabel} · ${paymentMethodLabel(session.paymentMethod)}. Um atendente vai confirmar em instantes. 😊`;
}

/** Builds a fresh in-memory session (not persisted). */
export function newTransientSession(input: {
  restaurantId: string;
  phone: string;
  conversationId?: string;
  customerId?: string;
  mode: WaProcessInput["mode"];
}): WaPersistedSession {
  const now = new Date();
  return {
    id:               "transient",
    restaurantId:     input.restaurantId,
    customerId:       input.customerId ?? null,
    conversationId:   input.conversationId ?? null,
    phone:            input.phone,
    status:           "ACTIVE",
    stage:            "IDLE",
    selectedItems:    [],
    unresolvedItems:  [],
    missingQuestions: [],
    deliveryType:     null,
    address:          null,
    deliveryQuote:    null,
    paymentMethod:    null,
    paymentStatus:    null,
    orderDraftId:     null,
    orderId:          null,
    pixPaymentId:     null,
    mode:             input.mode,
    source:           "admin_test",
    metadata:         null,
    lastMessageAt:    now,
    expiresAt:        null,
    createdAt:        now,
    updatedAt:        now,
  };
}

export async function processCustomerMessage(input: WaProcessInput): Promise<WaProcessResult> {
  const canCreateOrder = input.allowSideEffects && input.mode === "ALLOWLIST_FULL_TEST";
  const canCreatePix   = canCreateOrder;

  const safetyNotes: string[] = [];
  const sideEffectsPerformed: string[] = [];
  if (!input.allowSideEffects) {
    safetyNotes.push("dry-run — nenhuma mensagem WhatsApp enviada por este serviço");
  }
  if (!canCreateOrder) safetyNotes.push("nenhum pedido real criado (modo não é FULL_TEST liberado)");
  if (!canCreatePix)   safetyNotes.push("nenhum Pix real gerado (modo não é FULL_TEST liberado)");

  const menu    = input.menu ?? await loadMenuForRestaurant(input.restaurantId);
  const session = input.currentSession ?? newTransientSession(input);

  // Run the pure state machine for this turn
  const advanced = advanceSession(session, input.messageText, menu);
  let s        = advanced.session;
  let reply    = advanced.suggestedReply;
  let payment: WaPaymentInfo | null = null;
  let order: WaProcessResult["order"] = null;

  // ── Deferred action: delivery quote (read-only — safe in every mode) ──────────
  if (advanced.actions.includes("QUOTE_DELIVERY") && s.address) {
    const draft = buildFullDraft(s);
    // Injected quoter (audits/tests) skips the DB read; default is DB-backed.
    const quoter = input.deliveryQuoter ?? quoteWhatsAppDelivery;
    const quote = await quoter({
      restaurantId: s.restaurantId,
      subtotal:     draft.subtotal,
      address:      s.address,
    });
    s.deliveryQuote = quote;

    if (quote.status === "ok") {
      s.stage  = "COLLECTING_PAYMENT_METHOD";
      s.status = "AWAITING_CUSTOMER";
      // Rebuild draft with delivery fee now set so comanda shows the correct total
      const draftWithFee = buildFullDraft(s);
      reply = `${draftWithFee.comandaText}\n\nVai pagar no Pix, cartão ou dinheiro?`;
    } else if (quote.status === "out_of_range" || quote.status === "blocked") {
      s.stage  = "HANDOFF_REQUIRED";
      s.status = "HANDOFF_REQUIRED";
      reply = "Esse endereço parece fora da nossa área de entrega. Quer retirar no restaurante ou prefere falar com um atendente?";
    } else {
      s.stage = "COLLECTING_ADDRESS";
      reply = "Não consegui calcular a entrega para esse endereço. Pode confirmar a rua, número e bairro?";
    }
  }

  // ── Deferred action: create order ─────────────────────────────────────────────
  if (advanced.actions.includes("CREATE_ORDER")) {
    const draft = buildFullDraft(s);
    const completeness = checkCompleteness(s);

    if (!completeness.ready) {
      s.status = "AWAITING_CUSTOMER";
      reply = `Antes de finalizar, ainda falta: ${completeness.missing.join(", ")}.`;
    } else {
      const creation = await createOrderFromSession({
        session:      s,
        customerName: (s.metadata?.customerName as string) ?? CUSTOMER_FALLBACK_NAME,
        subtotal:     draft.subtotal,
        deliveryFee:  draft.deliveryFee,
        total:        draft.total,
        allowCreate:  canCreateOrder,
      });
      order = { orderId: creation.orderId, status: creation.status, wouldCreate: creation.wouldCreate };

      if (creation.blockedReply) {
        // Guard blocked order creation (closed / paused) — escalate to human
        s.stage  = "HANDOFF_REQUIRED";
        s.status = "HANDOFF_REQUIRED";
        reply = creation.blockedReply;
      } else {
        if (creation.created && creation.orderId) {
          s.orderId = creation.orderId;
          sideEffectsPerformed.push(`order_created:${creation.orderId}`);
        }
      }

      // ── Deferred action: generate Pix / pay on delivery (only when not blocked) ─
      if (!creation.blockedReply) {
        if (advanced.actions.includes("GENERATE_PIX")) {
          const pix = await generatePix({
            restaurantId: s.restaurantId,
            orderId:      creation.orderId ?? "dry_run_order",
            amount:       draft.total,
            allowReal:    canCreatePix && creation.created,
          });
          payment = pix;
          s.paymentStatus = pix.status;
          s.pixPaymentId  = pix.isDryRunStub ? null : (pix.pixCopyPaste ?? null);
          s.status = "AWAITING_PAYMENT";
          s.stage  = "AWAITING_PIX_PAYMENT";
          if (!pix.isDryRunStub) sideEffectsPerformed.push("pix_generated");
          if (pix.isDryRunStub) {
            reply = "Pix gerado (simulação — código não é real). Assim que o pagamento for confirmado, seu pedido entra para preparo.";
          } else if (pix.status === "FAILED") {
            s.stage  = "HANDOFF_REQUIRED";
            s.status = "HANDOFF_REQUIRED";
            reply = "Houve um problema ao gerar o Pix. Vou chamar um atendente para te ajudar. 🤝";
          } else {
            reply = `Pix gerado! ✅\n\n*Código Pix (copia e cola):*\n${pix.pixCopyPaste}\n\nAssim que identificarmos o pagamento, avisamos e seu pedido entra para preparo. 🙌`;
          }
        } else {
          // Pay on delivery/pickup
          payment = {
            method:    s.paymentMethod,
            status:    "PENDING",
            changeFor: s.metadata?.changeFor as number | undefined,
          };
          s.status = "COMPLETED";
          s.stage  = "COMPLETED";
          reply = creation.created
            ? buildOrderConfirmedReply(s)
            : buildOrderAnnotatedReply(s);
        }
      }
    }
  }

  const draft = s.selectedItems.length > 0 ? buildFullDraft(s) : null;

  return {
    session:          s,
    stage:            s.stage,
    intent:           advanced.intent,
    parsedItems:      parseTextItems(input.messageText),
    matchedItems:     s.selectedItems,
    unresolvedItems:  s.unresolvedItems,
    missingQuestions: s.missingQuestions,
    draft:            draft?.summary ?? null,
    deliveryQuote:    s.deliveryQuote,
    payment,
    order,
    estimatedTotal:   draft?.total ?? 0,
    suggestedReply:   reply,
    operatorSummary:  advanced.operatorSummary,
    actions:          advanced.actions,
    safetyNotes,
    sideEffectsPerformed,
    handoff:          advanced.handoff || s.stage === "HANDOFF_REQUIRED",
  };
}
