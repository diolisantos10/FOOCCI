/**
 * InvoiceMatchService — pure matching/conversion between items extracted from
 * a purchase invoice (nota fiscal / cupom) and the restaurant's Insumos
 * catalog. No I/O here — fully unit-testable.
 *
 * The AI never applies prices: this module only builds PROPOSALS that the
 * lojista reviews and confirms on screen; the apply step reuses the existing
 * ingredient-cost pipeline (audit + ficha recompute + reprice device).
 */

export interface ExtractedInvoiceItem {
  name: string;
  quantity: number | null;
  unit: string | null; // kg | g | l | ml | un | cx | pct | dz | fardo…
  unitPrice: number | null; // price per `unit`
  totalPrice: number | null;
}

export interface CatalogIngredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number | null;
}

export interface InvoiceProposal {
  extractedName: string;
  extractedUnit: string | null;
  extractedUnitPrice: number | null; // per extracted unit, after deriving from total when needed
  matchedIngredientId: string | null;
  matchedIngredientName: string | null;
  confidence: "high" | "medium" | "none";
  /** Cost converted to the matched ingredient's unit (kg→g etc.); null = needs manual value. */
  suggestedCost: number | null;
  conversionNote: string | null;
}

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "a", "o", "com", "para", "tipo",
  "kg", "g", "gr", "ml", "l", "lt", "un", "und", "unid", "cx", "pct", "pc",
  "resfriado", "congelado", "fresco", "premium", "especial", "extra",
]);

/** lowercase, strip accents/punctuation, drop stopwords and pure numbers. */
export function tokenize(name: string): string[] {
  return name
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+([.,]\d+)?$/.test(t));
}

/**
 * Best catalog match for an extracted name. Score = fraction of the SMALLER
 * token set contained in the other (so "SALMAO FRESCO CONGELADO KG" still
 * hits "Salmão"). high ≥ 1.0 exact containment · medium ≥ 0.5 · else none.
 */
export function matchIngredient(
  extractedName: string,
  catalog: CatalogIngredient[]
): { ingredient: CatalogIngredient; confidence: "high" | "medium" } | null {
  const extTokens = tokenize(extractedName);
  if (extTokens.length === 0) return null;

  let best: { ingredient: CatalogIngredient; score: number } | null = null;
  for (const ing of catalog) {
    const ingTokens = tokenize(ing.name);
    if (ingTokens.length === 0) continue;
    const [small, large] =
      extTokens.length <= ingTokens.length ? [extTokens, ingTokens] : [ingTokens, extTokens];
    const largeSet = new Set(large);
    const hits = small.filter((t) => largeSet.has(t)).length;
    const score = hits / small.length;
    if (score > (best?.score ?? 0)) best = { ingredient: ing, score };
  }

  if (!best || best.score < 0.5) return null;
  return { ingredient: best.ingredient, confidence: best.score >= 1 ? "high" : "medium" };
}

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", quilo: "kg", kilo: "kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  l: "L", lt: "L", litro: "L", litros: "L",
  ml: "ml",
  un: "un", und: "un", unid: "un", unidade: "un", unidades: "un", pc: "un", pca: "un",
};

export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const key = unit.toLocaleLowerCase("pt-BR").replace(/[^a-z]/g, "");
  return UNIT_ALIASES[key] ?? unit.trim();
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Convert a price-per-extracted-unit into the ingredient's unit.
 * kg→g and L→ml divide by 1000 (and vice-versa multiply). Same unit passes
 * through. Anything else (cx, pct, dz…) can't be converted safely → null.
 */
export function convertUnitPrice(
  extractedUnit: string | null,
  unitPrice: number,
  ingredientUnit: string
): { cost: number; note: string | null } | null {
  const from = normalizeUnit(extractedUnit);
  const to = normalizeUnit(ingredientUnit) ?? ingredientUnit;
  if (from === null) return null;
  if (from === to) return { cost: round4(unitPrice), note: null };

  const DOWN: Record<string, string> = { kg: "g", L: "ml" };
  const UP: Record<string, string> = { g: "kg", ml: "L" };
  if (DOWN[from] === to) {
    return { cost: round4(unitPrice / 1000), note: `convertido de R$/${from} para R$/${to}` };
  }
  if (UP[from] === to) {
    return { cost: round4(unitPrice * 1000), note: `convertido de R$/${from} para R$/${to}` };
  }
  return null;
}

/** Price per extracted unit — direct, or derived from total ÷ quantity. */
export function effectiveUnitPrice(item: ExtractedInvoiceItem): number | null {
  if (item.unitPrice !== null && item.unitPrice > 0) return round4(item.unitPrice);
  if (
    item.totalPrice !== null &&
    item.totalPrice > 0 &&
    item.quantity !== null &&
    item.quantity > 0
  ) {
    return round4(item.totalPrice / item.quantity);
  }
  return null;
}

/** One reviewable proposal per extracted line. Never writes anything. */
export function buildProposals(
  extracted: ExtractedInvoiceItem[],
  catalog: CatalogIngredient[]
): InvoiceProposal[] {
  return extracted.map((item) => {
    const unitPrice = effectiveUnitPrice(item);
    const match = matchIngredient(item.name, catalog);

    let suggestedCost: number | null = null;
    let conversionNote: string | null = null;
    if (match && unitPrice !== null) {
      const converted = convertUnitPrice(item.unit, unitPrice, match.ingredient.unit);
      if (converted) {
        suggestedCost = converted.cost;
        conversionNote = converted.note;
      } else {
        conversionNote = `unidade da nota (${normalizeUnit(item.unit) ?? "?"}) difere do insumo (${match.ingredient.unit}) — confira o valor`;
      }
    }

    return {
      extractedName: item.name,
      extractedUnit: normalizeUnit(item.unit),
      extractedUnitPrice: unitPrice,
      matchedIngredientId: match?.ingredient.id ?? null,
      matchedIngredientName: match?.ingredient.name ?? null,
      confidence: match?.confidence ?? "none",
      suggestedCost,
      conversionNote,
    };
  });
}

export const InvoiceMatchService = {
  tokenize,
  matchIngredient,
  normalizeUnit,
  convertUnitPrice,
  effectiveUnitPrice,
  buildProposals,
};
