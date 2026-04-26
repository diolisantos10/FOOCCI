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
 * The filter is additive: vegan implies vegetarian; vegetarian implies no_fish + no_seafood + no_pork.
 * If no dietary signal is detected, the full menu is returned unchanged.
 */

import type { MenuCategoryContext, MenuItemContext } from "./types";

// ── Exclusion keyword lists ───────────────────────────────────────────────────
//
// Checked against `${categoryName} ${item.name} ${item.description} ${item.ingredients}` (lowercase).
// Expand as needed — no schema migration required.

const FISH_KEYWORDS = [
  "peixe", "atum", "salmão", "salmao", "tilápia", "tilapia",
  "bacalhau", "sardinha", "anchova", "moqueca", "file de peixe",
];

const SEAFOOD_KEYWORDS = [
  "camarão", "camarao", "lagosta", "caranguejo", "mariscos",
  "frutos do mar", "polvo", "lula", "ostra", "mexilhão", "mexilhao",
];

const PORK_KEYWORDS = [
  "porco", "bacon", "presunto", "linguiça", "linguica",
  "chouriço", "chourico", "pernil", "salame", "pepperoni", "peperoni",
  "lombo suíno", "lombo suino", "bisteca",
];

const MEAT_KEYWORDS = [
  "carne", "frango", "bife", "costela", "hambúrguer", "hamburguer",
  "churrasco", "steak", "filé", "file", "fraldinha", "picanha",
  "alcatra", "acém", "acem", "contrafilé", "contrafile",
  ...FISH_KEYWORDS,
  ...SEAFOOD_KEYWORDS,
  ...PORK_KEYWORDS,
];

const DAIRY_KEYWORDS = [
  "queijo", "requeijão", "requeijao", "leite", "manteiga",
  "creme de leite", "iogurte", "nata", "ricota", "chantilly", "mussarela",
];

const EGG_KEYWORDS = ["ovo", "ovos", "clara", "gema"];

const LACTOSE_KEYWORDS = [...DAIRY_KEYWORDS];

const GLUTEN_KEYWORDS = [
  "trigo", "farinha de trigo", "glúten", "gluten",
  "macarrão", "macarrao", "massa", "pão", "pao", "cerveja",
];

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
  "não como peixe", "nao como peixe", "não como nada de animal",
];

const NO_FISH_TRIGGERS = [
  "sem peixe", "não como peixe", "nao como peixe",
  "alergia a peixe", "alergia ao peixe", "não gosto de peixe",
  "nao gosto de peixe", "não quero peixe", "nao quero peixe",
];

const NO_SEAFOOD_TRIGGERS = [
  "sem frutos do mar", "sem mariscos", "sem camarão", "sem camarao",
  "não como frutos do mar", "nao como frutos do mar",
  "alergia a frutos do mar", "alergia ao camarão", "alergia a camarao",
  "não gosto de camarão", "nao gosto de camarao",
];

const NO_PORK_TRIGGERS = [
  "sem porco", "sem carne de porco", "sem bacon", "sem presunto",
  "não como porco", "nao como porco", "não como bacon", "nao como bacon",
  "não como carne suína", "nao como carne suina",
  "halal", "kosher",
];

const NO_LACTOSE_TRIGGERS = [
  "sem lactose", "intolerante a lactose", "intolerância a lactose",
  "intolerancia a lactose", "lactose intolerant", "alergia ao leite",
  "alergia a leite", "sem leite", "não bebo leite", "nao bebo leite",
];

const NO_GLUTEN_TRIGGERS = [
  "sem glúten", "sem gluten", "celíaco", "celiaco",
  "intolerante ao glúten", "intolerante ao gluten",
  "alergia ao glúten", "alergia ao gluten", "doença celíaca",
];

// ── Dietary flag type ─────────────────────────────────────────────────────────

type DietaryFlag =
  | "vegan"
  | "vegetarian"
  | "no_fish"
  | "no_seafood"
  | "no_pork"
  | "no_lactose"
  | "no_gluten";

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

  const isVegan      = dietary.has("vegan");
  const isVegetarian = isVegan || dietary.has("vegetarian");
  const noFish       = isVegetarian || dietary.has("no_fish");
  const noSeafood    = isVegetarian || dietary.has("no_seafood");
  const noPork       = isVegetarian || dietary.has("no_pork");
  const noLactose    = dietary.has("no_lactose");
  const noGluten     = dietary.has("no_gluten");

  if (!isVegetarian && !noFish && !noSeafood && !noPork && !noLactose && !noGluten) {
    return menu; // nothing to filter
  }

  // Build combined exclusion list for this request
  const exclusions: string[] = [];

  if (isVegan) {
    exclusions.push(...VEGAN_EXCLUSIONS);
  } else if (isVegetarian) {
    exclusions.push(...VEGETARIAN_EXCLUSIONS);
  } else {
    if (noFish)    exclusions.push(...FISH_KEYWORDS);
    if (noSeafood) exclusions.push(...SEAFOOD_KEYWORDS);
    if (noPork)    exclusions.push(...PORK_KEYWORDS);
  }

  if (noLactose) exclusions.push(...LACTOSE_KEYWORDS);
  if (noGluten)  exclusions.push(...GLUTEN_KEYWORDS);

  const unique = [...new Set(exclusions)];

  return menu
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) => !itemMatchesExclusion(item, cat.name, unique)
      ),
    }))
    .filter((cat) => cat.items.length > 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Combine profile labels + message detection into a canonical Set of dietary flags.
 */
function normalizeDietary(
  profileLabels: string[],
  message: string
): Set<DietaryFlag> {
  const out = new Set<DietaryFlag>();
  const lower = message.toLowerCase();

  // From persistent profile
  for (const label of profileLabels) {
    const l = label.toLowerCase();
    if (VEGAN_TRIGGERS.some((t) => l.includes(t)))       out.add("vegan");
    if (VEGETARIAN_TRIGGERS.some((t) => l.includes(t)))  out.add("vegetarian");
    if (NO_FISH_TRIGGERS.some((t) => l.includes(t)))     out.add("no_fish");
    if (NO_SEAFOOD_TRIGGERS.some((t) => l.includes(t)))  out.add("no_seafood");
    if (NO_PORK_TRIGGERS.some((t) => l.includes(t)))     out.add("no_pork");
    if (NO_LACTOSE_TRIGGERS.some((t) => l.includes(t)))  out.add("no_lactose");
    if (NO_GLUTEN_TRIGGERS.some((t) => l.includes(t)))   out.add("no_gluten");
  }

  // From current message
  if (VEGAN_TRIGGERS.some((t) => lower.includes(t)))       out.add("vegan");
  if (VEGETARIAN_TRIGGERS.some((t) => lower.includes(t)))  out.add("vegetarian");
  if (NO_FISH_TRIGGERS.some((t) => lower.includes(t)))     out.add("no_fish");
  if (NO_SEAFOOD_TRIGGERS.some((t) => lower.includes(t)))  out.add("no_seafood");
  if (NO_PORK_TRIGGERS.some((t) => lower.includes(t)))     out.add("no_pork");
  if (NO_LACTOSE_TRIGGERS.some((t) => lower.includes(t)))  out.add("no_lactose");
  if (NO_GLUTEN_TRIGGERS.some((t) => lower.includes(t)))   out.add("no_gluten");

  return out;
}

/**
 * Returns true if this item should be excluded.
 * Checks category name + item name + description + ingredients (all lowercase).
 */
function itemMatchesExclusion(
  item: MenuItemContext,
  categoryName: string,
  exclusions: string[]
): boolean {
  const text = `${categoryName} ${item.name} ${item.description ?? ""} ${item.ingredients ?? ""}`.toLowerCase();
  return exclusions.some((kw) => text.includes(kw));
}
