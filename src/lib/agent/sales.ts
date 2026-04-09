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

const DRINK_UPSELL: Record<UpsellKey, (item: string) => string> = {
  gentle:    (item) => `→ BEBIDA: "Algo para beber com ${item}?"`,
  moderate:  (item) => `→ BEBIDA: "Essa ${item} fica ainda melhor com uma bebida gelada 🧊"`,
  proactive: (item) => `→ BEBIDA ATIVA: "Já separei as bebidas que combinam com ${item} — dá uma olhada! 🧊👇"`,
};

const DESSERT_UPSELL: Record<UpsellKey, (item: string) => string> = {
  gentle:    (_) => `→ SOBREMESA: "Vai querer uma sobremesa?"`,
  moderate:  (_) => `→ SOBREMESA: "A sobremesa vai fechar com chave de ouro 🍰"`,
  proactive: (_) => `→ SOBREMESA ATIVA: "Você vai se arrepender se não pedir a sobremesa 😏 Falta só essa! 🍰👇"`,
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

  if (sales.upsellStyle === "none" || !upsellOffered) {
    return `━━━ ESTRATÉGIA ━━━\n${focus}\nSem upsell ativo neste momento.`;
  }

  const typeLabel = upsellOffered === "drink" ? "BEBIDA" : "SOBREMESA";

  // ── Specific item selected by the suggestion engine ───────────────────────
  if (suggested) {
    const tone =
      resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity) === "proactive"
        ? "entusiasmado mas não insistente"
        : "consultivo e casual";

    return [
      `━━━ ESTRATÉGIA ━━━`,
      focus,
      ``,
      `UPSELL ATIVO — ${typeLabel}:`,
      `→ Reconheça o item que o cliente escolheu.`,
      `→ Sugira especificamente: "${suggested.itemName}"${suggested.itemDescription ? ` — ${suggested.itemDescription.slice(0, 70)}` : ""}`,
      `→ Motivo para usar: "${suggested.reason}"`,
      `→ Tom: ${tone}. Uma única menção — se o cliente recusar, agradeça e continue.`,
    ].join("\n");
  }

  // ── Fallback: no specific item found in menu ──────────────────────────────
  const item = lastItemName ?? "sua escolha";
  const key  = resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity);
  const upsellLine =
    upsellOffered === "drink"
      ? DRINK_UPSELL[key](item)
      : DESSERT_UPSELL[key](item);

  return `━━━ ESTRATÉGIA ━━━\n${focus}\n\nUPSELL ATIVO:\n${upsellLine}`;
}
