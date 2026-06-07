/**
 * WhatsAppOrderDraftBuilder — pure draft/comanda assembly + completeness check.
 *
 * Builds a WhatsApp-safe order summary from a session's resolved items, including
 * delivery fee and total. Validates whether the session is ready to create an
 * order. No I/O, no order creation here.
 */

import { calculateDraftSummary } from "./orderCalculator";
import type { WaPersistedSession, WaDraftSummary } from "./types";

export interface WaFullDraft {
  summary:      WaDraftSummary;
  subtotal:     number;
  deliveryFee:  number;
  total:        number;
  comandaText:  string;
}

export interface WaCompleteness {
  ready:    boolean;
  missing:  string[]; // human-readable list of what's still needed
}

/** Builds the full draft (subtotal + delivery fee + total + WhatsApp text). */
export function buildFullDraft(session: WaPersistedSession): WaFullDraft {
  const missingReqs = session.missingQuestions.map(q => `${q.itemName}: ${q.groupName}`);
  const summary     = calculateDraftSummary(session.selectedItems, missingReqs);
  const subtotal    = summary.subtotal;
  const deliveryFee = session.deliveryType === "PICKUP"
    ? 0
    : (session.deliveryQuote?.fee ?? 0);
  const total       = Math.round((subtotal + deliveryFee) * 100) / 100;

  return {
    summary,
    subtotal,
    deliveryFee,
    total,
    comandaText: renderComanda(session, subtotal, deliveryFee, total),
  };
}

/** Renders the WhatsApp-safe order summary text. */
export function renderComanda(
  session:     WaPersistedSession,
  subtotal:    number,
  deliveryFee: number,
  total:       number,
): string {
  const lines: string[] = ["Resumo do pedido:"];
  for (const item of session.selectedItems) {
    const extras = [
      ...item.options.map(o => o.optionName),
      ...item.extras.map(e => e.extraName),
    ];
    const variant = item.variantName ? ` ${item.variantName}` : "";
    const suffix  = extras.length > 0 ? ` (${extras.join(", ")})` : "";
    lines.push(`${item.quantity}x ${item.menuItemName}${variant}${suffix} — R$ ${item.lineTotal.toFixed(2)}`);
  }
  if (session.deliveryType === "DELIVERY") {
    lines.push(`Entrega — R$ ${deliveryFee.toFixed(2)}`);
  } else if (session.deliveryType === "PICKUP") {
    lines.push("Retirada — R$ 0,00");
  }
  lines.push(`Total — R$ ${total.toFixed(2)}`);
  return lines.join("\n");
}

/** Checks whether the session has everything needed to create an order. */
export function checkCompleteness(session: WaPersistedSession): WaCompleteness {
  const missing: string[] = [];

  if (session.selectedItems.length === 0) missing.push("nenhum item no pedido");
  if (session.unresolvedItems.length > 0) missing.push("itens não identificados");
  if (session.missingQuestions.length > 0) missing.push("opções obrigatórias pendentes");

  if (!session.deliveryType) {
    missing.push("entrega ou retirada não definida");
  } else if (session.deliveryType === "DELIVERY") {
    if (!session.address || !session.address.street) missing.push("endereço de entrega");
    if (!session.deliveryQuote || session.deliveryQuote.status !== "ok") missing.push("taxa de entrega não calculada");
  }

  if (!session.paymentMethod) missing.push("forma de pagamento");

  return { ready: missing.length === 0, missing };
}
