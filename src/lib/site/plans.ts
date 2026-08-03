/**
 * Plan pricing for the public site.
 *
 * STATE (2026-08-02): only Crescimento has a closed value — it is the one the OS
 * quotes for the anchoring argument (`os-repaginacao-comercial.md` §2.1). The other
 * two were never committed to the repository, so they are `null` here.
 *
 * `null` is not a placeholder to fill with a plausible number. Decision D3 of the
 * commercial briefing and guardrail 7 both forbid inventing a price on a public page:
 * an invented figure is a commercial liability the moment a lead quotes it back. Every
 * component reads `monthly === null` and renders "sob demonstração" instead.
 *
 * To publish the full table, set the two values here. Nothing else changes.
 */

export interface Plan {
  id: "essencial" | "crescimento" | "performance";
  name: string;
  /** Monthly price in BRL, or null while the CEO has not closed it. */
  monthly: number | null;
  /** The differentiator that opens the card — not a feature list. */
  onlyHere: string;
  forWho: string;
}

export const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    monthly: 179,
    onlyHere: "Seu cardápio e seus pedidos fora do marketplace, com o cliente virando seu.",
    forWho: "Para quem está começando a vender direto.",
  },
  {
    id: "crescimento",
    name: "Crescimento",
    monthly: 429,
    onlyHere: "O CRM que traz o cliente de volta antes de ele sumir — não depois.",
    forWho: "Para quem já vende e quer recorrência.",
  },
  {
    id: "performance",
    name: "Performance",
    monthly: 899,
    onlyHere: "CMV com ficha técnica e reprecificação automática por canal.",
    forWho: "Para quem opera com margem apertada e muitos canais.",
  },
];

/** True while any plan is still missing its value — used to soften the pricing copy. */
export const PRICING_INCOMPLETE = PLANS.some((p) => p.monthly === null);

export function planByIdOrNull(id: Plan["id"]): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}
