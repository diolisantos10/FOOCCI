/**
 * Draft order calculator — pure function, no I/O.
 *
 * Produces a human-readable draft summary from matched items.
 * Does NOT create a real Order or OrderDraft.
 */

import type { WaOrderItem, WaDraftSummary, WaDraftLineItem } from "./types";

export function calculateDraftSummary(
  items:    WaOrderItem[],
  missing:  string[] = [],
): WaDraftSummary {
  const lineItems: WaDraftLineItem[] = items.map(item => ({
    name:      item.menuItemName,
    quantity:  item.quantity,
    variant:   item.variantName,
    options:   item.options.map(o => o.optionName),
    extras:    item.extras.map(e => e.extraName),
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }));

  const subtotal = Math.round(
    items.reduce((sum, item) => sum + item.lineTotal, 0) * 100,
  ) / 100;

  return { subtotal, items: lineItems, missingRequirements: missing };
}

/** Formats a draft summary as a short human-readable comanda text. */
export function formatComanda(summary: WaDraftSummary): string {
  const lines = summary.items.map(i => {
    const extras = i.options.length > 0
      ? ` (${[...i.options, ...i.extras].join(", ")})`
      : "";
    return `${i.quantity}× ${i.name}${i.variant ? ` ${i.variant}` : ""}${extras} — R$ ${i.lineTotal.toFixed(2)}`;
  });
  lines.push(`Subtotal: R$ ${summary.subtotal.toFixed(2)}`);
  if (summary.missingRequirements.length > 0) {
    lines.push(`⚠ Faltando: ${summary.missingRequirements.join(", ")}`);
  }
  return lines.join("\n");
}
