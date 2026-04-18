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

// ── Restaurant profile ────────────────────────────────────────────────────────

const CUISINE_SIGNATURES: [string[], string][] = [
  [["sushi", "temaki", "sashimi", "niguiri", "uramaki", "harumaki", "yakissoba", "udon", "gyoza", "missoshiro"], "Restaurante japonês / culinária oriental"],
  [["pizza", "pizzas", "calzone", "mussarela", "pepperoni", "calabresa"], "Pizzaria"],
  [["hamburger", "burger", "smash", "artesanal", "lanche", "hot dog"], "Hamburgueria / lanchonete"],
  [["vegano", "vegetariano", "plant based", "sem carne", "integral", "orgânico"], "Restaurante vegano / vegetariano"],
  [["peixe", "salmão", "camarão", "frutos do mar", "atum", "tilápia", "bacalhau"], "Restaurante de frutos do mar / peixaria"],
  [["churrasco", "picanha", "costela", "espetinho", "fraldinha", "maminha"], "Churrascaria"],
  [["tapioca", "cuscuz", "baião", "macaxeira", "nordestino", "regional"], "Restaurante regional / nordestino"],
  [["massa", "lasanha", "macarrão", "espaguete", "risoto", "nhoque"], "Restaurante italiano / massas"],
];

function detectCuisine(categories: MenuCategoryMeta[]): string {
  const allText = categories
    .flatMap((c) => [c.name, ...c.items.map((i) => `${i.name} ${i.description ?? ""}`)])
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const [keywords, label] of CUISINE_SIGNATURES) {
    const hits = keywords.filter((kw) =>
      allText.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    ).length;
    if (hits >= 2) return label;
  }
  return "Restaurante";
}

const DRINK_KEYWORDS_DETECT = ["bebida", "bebidas", "suco", "refrigerante", "agua", "cerveja", "limonada", "cha", "cafe", "drink", "drinks"];
const DESSERT_KEYWORDS_DETECT = ["sobremesa", "sobremesas", "doce", "pudim", "sorvete", "brownie", "torta", "bolo", "mousse", "acai", "waffle"];

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findUpsellCategory(categories: MenuCategoryMeta[], type: "drink" | "dessert"): MenuCategoryMeta | null {
  const kws = type === "drink" ? DRINK_KEYWORDS_DETECT : DESSERT_KEYWORDS_DETECT;
  return categories.find((c) => kws.some((kw) => norm(c.name).includes(kw)))
    ?? categories.find((c) => c.items.some((i) => kws.some((kw) => norm(i.name).includes(kw))))
    ?? null;
}

function buildRestaurantProfileBlock(categories: MenuCategoryMeta[]): string {
  const active = categories.filter((c) => c.items.length > 0);
  const cuisine = detectCuisine(active);
  const catNames = active.map((c) => c.name).join(", ");

  const drinkCat = findUpsellCategory(active, "drink");
  const dessertCat = findUpsellCategory(active, "dessert");

  const drinkLine = drinkCat
    ? `Bebidas disponíveis (${drinkCat.name}): ${drinkCat.items.map((i) => `${i.name} — R$${Number(i.price).toFixed(2)}`).join(", ")}`
    : "Sem categoria de bebidas no cardápio.";

  const dessertLine = dessertCat
    ? `Sobremesas disponíveis (${dessertCat.name}): ${dessertCat.items.map((i) => `${i.name} — R$${Number(i.price).toFixed(2)}`).join(", ")}`
    : "Sem categoria de sobremesas no cardápio.";

  return [
    `━━━ PERFIL DO RESTAURANTE (use para calibrar sugestões) ━━━`,
    `Tipo: ${cuisine}`,
    `Categorias do cardápio: ${catNames}`,
    drinkLine,
    dessertLine,
    `REGRA CRÍTICA: Só sugira itens que existam EXATAMENTE no cardápio acima. Nunca invente ou assuma itens não listados.`,
  ].join("\n");
}

// ── Menu block ────────────────────────────────────────────────────────────────

function buildMenuBlock(categories: MenuCategoryMeta[]): string {
  const active = categories.filter((c) => c.items.length > 0);
  if (active.length === 0) return "Cardápio temporariamente indisponível.";

  return active
    .map((cat) => {
      const rows = cat.items
        .map((item) => {
          const price = `R$ ${Number(item.price).toFixed(2)}`;
          const desc = item.description ? ` (${item.description})` : "";
          const ing  = item.ingredients ? `\n    Ingredientes: ${item.ingredients}` : "";
          return `  • ${item.name} — ${price}${desc}${ing}`;
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
  const menuBlock = buildMenuBlock(context.categories);
  const cartBlock = buildCartBlock(context.cart, context.categories, context.deliveryMethod);
  const lastItem  = context.cart.at(-1)?.name ?? null;

  // Sales layer and its constraint are only meaningful during BROWSE.
  // At checkout stages the AI must follow the stage script, not a sales mode.
  const isBrowse = context.stage === "BROWSE";

  const profileBlock = buildRestaurantProfileBlock(context.categories);

  return [
    buildPersonalityLayer(personality, context.restaurantName, context.stage),

    profileBlock,

    `━━━ CARDÁPIO (referência interna — NÃO repita para o cliente) ━━━\n${menuBlock}`,

    `━━━ CONTEXTO DO PEDIDO ━━━\n${cartBlock}`,

    // Sales layer: only during BROWSE (or active upsell which is also BROWSE-adjacent)
    isBrowse ? buildSalesLayer(sales, context.upsellOffered, lastItem, context.suggestedItem) : "",

    // Protocol layer: passes collected checkout data at non-BROWSE stages so
    // the stage script can tell the AI what was already collected.
    buildProtocolLayer(context.stage, context.deliveryMethod, {
      address:       context.collectedAddress,
      customerName:  context.collectedCustomerName,
      paymentMethod: context.collectedPaymentMethod,
    }),

    // Mode constraint is LAST — highest recency weight.
    // BROWSE → experience hard rules; DRINK/DESSERT → single-item enforcement.
    // Returns "" at non-BROWSE non-upsell stages (no-op).
    isBrowse ? buildSalesConstraintBlock(context.upsellOffered, context.stage) : "",
  ].filter(Boolean).join("\n\n");
}
