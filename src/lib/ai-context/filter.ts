/**
 * filterMenuForAI — dietary/intent-based menu filtering.
 *
 * Before building the system prompt, narrow the menu to items the AI
 * is allowed to recommend. Items that conflict with the customer's
 * dietary profile or the intent detected in the current message are
 * excluded entirely — the AI never sees them and cannot hallucinate them.
 *
 * Two signal sources (combined):
 *   1. customer.preferences.dietary  (persistent profile)
 *   2. current user message          (in-session intent: "sou vegetariano")
 *
 * The filter is additive: vegan implies vegetarian.
 * If no dietary signal is detected, the full menu is returned unchanged.
 */

import type { MenuCategoryContext, MenuItemContext } from "./types";

// ── Exclusion keyword lists ───────────────────────────────────────────────────
//
// Checked against `${item.name} ${item.description}` (lowercase).
// Expand as needed — no schema migration required.

const MEAT_KEYWORDS = [
  "carne", "frango", "peixe", "porco", "bacon", "linguiça", "chouriço",
  "presunto", "costela", "bife", "hambúrguer", "hamburguer", "salame",
  "pepperoni", "peperoni", "atum", "camarão", "salmão", "tilápia",
  "filé", "file", "pernil", "churrasco", "steak",
];

const DAIRY_KEYWORDS = [
  "queijo", "requeijão", "requeijao", "leite", "manteiga",
  "creme de leite", "iogurte", "nata", "ricota",
];

const EGG_KEYWORDS = ["ovo", "ovos", "clara", "gema"];

const VEGETARIAN_EXCLUSIONS = MEAT_KEYWORDS;

const VEGAN_EXCLUSIONS = [
  ...MEAT_KEYWORDS,
  ...DAIRY_KEYWORDS,
  ...EGG_KEYWORDS,
  "mel",
];

// ── Dietary trigger phrases ───────────────────────────────────────────────────

const VEGAN_TRIGGERS = ["vegano", "vegana", "vegan", "sou vegan"];
const VEGETARIAN_TRIGGERS = [
  "vegetariano", "vegetariana", "sem carne", "plant-based",
  "não como carne", "nao como carne", "não como frango", "nao como frango",
];

// ── Public interface ──────────────────────────────────────────────────────────

export interface MenuFilterOptions {
  /** Persistent dietary tags from customer.preferences.dietary */
  customerDietary?: string[];
  /** Current user message — checked for in-session dietary intent */
  userMessage?: string;
}

/**
 * Returns a filtered copy of the menu.
 * Categories with zero remaining items are dropped entirely.
 * If no dietary signal is found, returns the original array reference.
 */
export function filterMenuForAI(
  menu: MenuCategoryContext[],
  opts: MenuFilterOptions = {}
): MenuCategoryContext[] {
  const dietary = normalizeDietary(
    opts.customerDietary ?? [],
    opts.userMessage ?? ""
  );

  const isVegan       = dietary.has("vegan");
  const isVegetarian  = isVegan || dietary.has("vegetarian");

  if (!isVegetarian) return menu; // nothing to filter

  const exclusions = isVegan ? VEGAN_EXCLUSIONS : VEGETARIAN_EXCLUSIONS;

  return menu
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) => !itemMatchesExclusion(item, exclusions)
      ),
    }))
    .filter((cat) => cat.items.length > 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Combine profile labels + message detection into a canonical Set.
 * Uses two keys: "vegetarian" and "vegan".
 */
function normalizeDietary(
  profileLabels: string[],
  message: string
): Set<"vegetarian" | "vegan"> {
  const out = new Set<"vegetarian" | "vegan">();

  // From persistent profile
  for (const label of profileLabels) {
    const l = label.toLowerCase();
    if (VEGAN_TRIGGERS.some((t) => l.includes(t)))       out.add("vegan");
    if (VEGETARIAN_TRIGGERS.some((t) => l.includes(t)))  out.add("vegetarian");
  }

  // From current message
  const lower = message.toLowerCase();
  if (VEGAN_TRIGGERS.some((t) => lower.includes(t)))      out.add("vegan");
  if (VEGETARIAN_TRIGGERS.some((t) => lower.includes(t))) out.add("vegetarian");

  return out;
}

function itemMatchesExclusion(
  item: MenuItemContext,
  exclusions: string[]
): boolean {
  const text = `${item.name} ${item.description ?? ""}`.toLowerCase();
  return exclusions.some((kw) => text.includes(kw));
}
