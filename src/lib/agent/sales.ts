/**
 * Layer 2 — Sales Strategy
 *
 * Translates SalesConfig into upsell and conversion instructions.
 * This layer is configurable but always subordinate to the Protocol layer —
 * sales instructions can never override ordering rules.
 */

import type { SalesConfig, AgentContext, SuggestedItem, UpsellIntensity, UpsellStyle } from "./types";

type UpsellKey = "gentle" | "moderate" | "proactive";

/**
 * Resolve which upsell line template to use, based on both style and intensity.
 * Intensity can override style (high intensity always → proactive phrasing).
 */
function resolveUpsellKey(style: UpsellStyle, intensity: UpsellIntensity): UpsellKey {
  if (intensity === "high") return "proactive";
  if (intensity === "low")  return "gentle";
  if (style === "proactive" || style === "moderate") return style;
  return "gentle";
}

// All templates are AFFIRMATIVE — no closed yes/no questions.
// The sales constraint block (last in prompt) will further enforce single-item behavior.
const DRINK_UPSELL: Record<UpsellKey, (item: string) => string> = {
  gentle:    (item) => `→ BEBIDA: Sugira UMA bebida afirmativamente: "Esse pedido fica incrível com uma bebida gelada — escolha uma que combine com ${item}."`,
  moderate:  (item) => `→ BEBIDA: "Essa ${item} fica ainda melhor com uma bebida gelada 🧊" — sugira UMA pelo nome.`,
  proactive: (item) => `→ BEBIDA ATIVA: "Já tenho a bebida ideal para acompanhar ${item} — dá uma olhada! 🧊" — sugira UMA pelo nome.`,
};

const DESSERT_UPSELL: Record<UpsellKey, (item: string) => string> = {
  gentle:    (_) => `→ SOBREMESA: Sugira UMA sobremesa afirmativamente: "Para fechar o pedido com chave de ouro, temos [sobremesa] — é o favorito aqui."`,
  moderate:  (_) => `→ SOBREMESA: "A sobremesa vai fechar com chave de ouro 🍰" — sugira UMA pelo nome.`,
  proactive: (_) => `→ SOBREMESA ATIVA: "Falta só a sobremesa para o pedido perfeito! 🍰" — sugira UMA pelo nome.`,
};

function focusInstruction(focus: SalesConfig["focus"]): string {
  switch (focus) {
    case "ticket":  return "Priorize itens de maior valor ao fazer sugestões. Mencione opções premium primeiro.";
    case "volume":  return "Foco em agilidade — coloque itens no carrinho rapidamente e mantenha o ritmo.";
    default:        return "Equilíbrio entre agilidade e experiência — bom fluxo, sugestões úteis.";
  }
}

export function buildSalesLayer(
  sales:         SalesConfig,
  upsellOffered: AgentContext["upsellOffered"],
  lastItemName:  string | null,
  suggested:     SuggestedItem | null,
): string {
  const focus = focusInstruction(sales.focus);

  // ── MODE 1 — EXPERIENCE (no active upsell) ────────────────────────────────
  // Customer is browsing. Behave like a guide, not a seller.
  if (sales.upsellStyle === "none" || !upsellOffered) {
    return [
      `━━━ ESTRATÉGIA — MODO EXPERIÊNCIA ━━━`,
      focus,
      ``,
      `MODO EXPERIÊNCIA ativo — o cliente está navegando pelo cardápio.`,
      `→ Quando um item for adicionado: valide a escolha e reforce o apelo (sabor, textura, popularidade).`,
      `→ Pode sugerir NO MÁXIMO UM item da MESMA categoria do item adicionado.`,
      `→ Nunca sugira bebidas, sobremesas ou itens de outras categorias neste modo.`,
    ].join("\n");
  }

  // ── MODE 2 — CONVERSION (upsell phase active) ─────────────────────────────
  const typeLabel = upsellOffered === "drink" ? "BEBIDA" : "SOBREMESA";

  // Specific item selected by the suggestion engine
  if (suggested) {
    const tone =
      resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity) === "proactive"
        ? "entusiasmado mas não insistente"
        : "consultivo e casual";

    return [
      `━━━ ESTRATÉGIA — MODO CONVERSÃO ━━━`,
      focus,
      ``,
      `UPSELL ATIVO — ${typeLabel}:`,
      `→ Reconheça o item que o cliente escolheu.`,
      `→ Sugira especificamente: "${suggested.itemName}"${suggested.itemDescription ? ` — ${suggested.itemDescription.slice(0, 70)}` : ""}`,
      `→ Motivo para usar: "${suggested.reason}"`,
      `→ Modelo de frase afirmativa: "Esse pedido fica ainda melhor com ${suggested.itemName} — ${suggested.reason} 😊"`,
      `→ NUNCA use "Quer X?" — use sempre frases afirmativas que apresentam o item.`,
      `→ Tom: ${tone}. Uma única menção — se o cliente recusar, agradeça e continue.`,
    ].join("\n");
  }

  // Fallback: no specific item found in menu
  const item = lastItemName ?? "sua escolha";
  const key  = resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity);
  const upsellLine =
    upsellOffered === "drink"
      ? DRINK_UPSELL[key](item)
      : DESSERT_UPSELL[key](item);

  return [
    `━━━ ESTRATÉGIA — MODO CONVERSÃO ━━━`,
    focus,
    ``,
    `UPSELL ATIVO:`,
    upsellLine,
  ].join("\n");
}
