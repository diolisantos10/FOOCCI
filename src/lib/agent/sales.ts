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
  gentle:    (item) => `→ BEBIDA: Sugira UMA bebida afirmativamente: "Esse pedido fica ainda melhor com uma bebida gelada — tem uma que combina muito bem com ${item}."`,
  moderate:  (item) => `→ BEBIDA: "Uma bebida gelada vai muito bem com ${item} 🧊" — sugira UMA pelo nome.`,
  proactive: (item) => `→ BEBIDA ATIVA: "Já separei a bebida que fica perfeita com ${item} — dá uma olhada! 🧊" — sugira UMA pelo nome.`,
};

const DESSERT_UPSELL: Record<UpsellKey, (item: string) => string> = {
  gentle:    (_) => `→ SOBREMESA: Sugira UMA sobremesa afirmativamente: "Para fechar o pedido com chave de ouro, temos [sobremesa] — combina perfeitamente com o que você pediu."`,
  moderate:  (_) => `→ SOBREMESA: "Uma sobremesa vai fechar com chave de ouro — tem uma que combina muito bem 🍰" — sugira UMA pelo nome.`,
  proactive: (_) => `→ SOBREMESA ATIVA: "Só falta a sobremesa para o pedido perfeito 🍰" — sugira UMA pelo nome.`,
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
      `→ A sugestão deve ser coerente com o tipo de culinária do restaurante (veja PERFIL DO RESTAURANTE acima).`,
      `→ Nunca sugira bebidas, sobremesas ou itens de outras categorias neste modo.`,
      `→ NUNCA invente pratos. Só mencione itens que existam no cardápio listado.`,
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
      `→ Modelo de frase afirmativa: "${suggested.itemName} ${suggested.reason} 😊 — dá uma olhada 👇"`,
      `→ NUNCA use "Quer X?" — use sempre frases afirmativas que apresentam o item.`,
      `→ Tom: ${tone}. Uma única menção — se o cliente recusar, agradeça e continue.`,
    ].join("\n");
  }

  // Fallback: no specific item pre-selected — AI must choose from menu
  const key = resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity);
  const typeLabel2 = upsellOffered === "drink" ? "BEBIDA" : "SOBREMESA";

  return [
    `━━━ ESTRATÉGIA — MODO CONVERSÃO ━━━`,
    focus,
    ``,
    `UPSELL ATIVO — ${typeLabel2}:`,
    `→ Consulte o PERFIL DO RESTAURANTE acima para ver as opções disponíveis de ${typeLabel2.toLowerCase()}.`,
    `→ Escolha O item mais adequado para o pedido atual — considere o tipo de culinária, restrições dietéticas e o que o cliente pediu.`,
    `→ Sugira pelo nome exato que aparece no cardápio. NUNCA invente itens.`,
    `→ Use frase afirmativa (sem "Quer X?"). Tom: ${key === "proactive" ? "entusiasmado mas não insistente" : "consultivo e casual"}.`,
  ].join("\n");
}
