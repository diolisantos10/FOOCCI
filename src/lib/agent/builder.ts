/**
 * Agent builder — assembles all layers into the final system prompt.
 *
 * Layer order (matters for LLM attention — last = highest recency weight):
 *   1. Personality       — who the agent is
 *   2. Menu              — what it knows
 *   3. Cart context      — what's happening right now
 *   4. Sales             — MODE EXPERIÊNCIA or MODE CONVERSÃO directive
 *   5. Protocol          — absolute rules + current stage script
 *   6. ModeConstraint    — LAST; hard forbidden list for the active mode
 *      BROWSE  → EXPERIENCE constraint (no drinks/desserts/checkout)
 *      DRINK   → single-drink enforcement
 *      DESSERT → single-dessert enforcement
 */

import type { PersonalityConfig, SalesConfig, AgentContext, CartItem, MenuCategoryMeta } from "./types";
import { buildPersonalityLayer }    from "./personality";
import { buildSalesLayer }          from "./sales";
import { buildProtocolLayer, buildSalesConstraintBlock } from "./protocol";

// ── Menu block ────────────────────────────────────────────────────────────────

function buildMenuBlock(categories: MenuCategoryMeta[]): string {
  const active = categories.filter((c) => c.items.length > 0);
  if (active.length === 0) return "Cardápio temporariamente indisponível.";

  return active
    .map((cat) => {
      const rows = cat.items
        .map((item) => {
          const price = `R$ ${Number(item.price).toFixed(2)}`;
          return item.description
            ? `  • ${item.name} — ${price} (${item.description})`
            : `  • ${item.name} — ${price}`;
        })
        .join("\n");
      // Include category description so the AI can present the category naturally
      // when the customer first navigates to it.
      const catHeader = cat.description
        ? `[${cat.name.toUpperCase()}]\n↳ ${cat.description}`
        : `[${cat.name.toUpperCase()}]`;
      return `${catHeader}\n${rows}`;
    })
    .join("\n\n");
}

// ── Cart context block ────────────────────────────────────────────────────────

function buildCartBlock(
  cart: CartItem[],
  categories: MenuCategoryMeta[],
  deliveryMethod: AgentContext["deliveryMethod"],
): string {
  if (cart.length === 0) {
    return "PEDIDO ATUAL: Nenhum item adicionado ainda.";
  }

  const cartNames    = new Set(cart.map((c) => c.name));
  const withItems    = categories.filter((c) => c.items.some((i) => cartNames.has(i.name))).map((c) => c.name);
  const withoutItems = categories.filter((c) => !c.items.some((i) => cartNames.has(i.name))).map((c) => c.name);

  const lines = cart.map(
    (i) => `  • ${i.name} × ${i.qty} — R$ ${(i.price * i.qty).toFixed(2)}`,
  );
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return [
    `PEDIDO ATUAL:`,
    ...lines,
    `Total parcial: R$ ${total.toFixed(2)}`,
    `Categorias COM itens: ${withItems.join(", ") || "nenhuma"}`,
    `Categorias SEM itens: ${withoutItems.join(", ") || "nenhuma"}`,
    `Entrega: ${
      deliveryMethod === "delivery" ? "ENTREGA" :
      deliveryMethod === "pickup"   ? "RETIRADA" :
      "não definida"
    }`,
  ].join("\n");
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function buildAgentPrompt(
  personality: PersonalityConfig,
  sales:       SalesConfig,
  context:     AgentContext,
): string {
  const menuBlock  = buildMenuBlock(context.categories);
  const cartBlock  = buildCartBlock(context.cart, context.categories, context.deliveryMethod);
  const lastItem   = context.cart.at(-1)?.name ?? null;

  return [
    buildPersonalityLayer(personality, context.restaurantName),

    `━━━ CARDÁPIO (referência interna — NÃO repita para o cliente) ━━━\n${menuBlock}`,

    `━━━ CONTEXTO DO PEDIDO ━━━\n${cartBlock}`,

    buildSalesLayer(sales, context.upsellOffered, lastItem, context.suggestedItem),

    buildProtocolLayer(context.stage, context.deliveryMethod),

    // Mode constraint is LAST — highest recency weight.
    // BROWSE → experience hard rules; DRINK/DESSERT → single-item enforcement.
    buildSalesConstraintBlock(context.upsellOffered, context.stage),
  ].filter(Boolean).join("\n\n");
}
