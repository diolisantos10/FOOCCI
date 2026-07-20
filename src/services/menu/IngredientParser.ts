/**
 * IngredientParser — turns the free-text MenuItem.ingredients column into a
 * clean list of ingredient names for the Insumos catalog import.
 *
 * Real-world inputs look like "Arroz, salmão e cream cheese", "Alface; tomate;
 * molho da casa", multi-line lists, bullets. Pure function, unit-tested.
 */

const SPLIT_REGEX = /[,;•\n\r/|]+/;
/** " e " / " com " as final-conjunction separators ("arroz, salmão e nirá"). */
const CONJUNCTION_REGEX = /\s+(?:e|com)\s+/gi;
/** Pure quantity tokens ("2", "300g", "1,5 L") are not ingredient names. */
const QUANTITY_ONLY_REGEX = /^\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|un|und|unid|unidades?|fatias?|pcs?)?\.?$/i;

function cleanToken(raw: string): string | null {
  let s = raw
    .replace(/^[\s\-–—*·.]+/, "") // leading bullets/dashes
    .replace(/[\s.]+$/, "") // trailing dots/space
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s.length < 2 || s.length > 60) return null;
  if (QUANTITY_ONLY_REGEX.test(s)) return null;
  // Title Case, Portuguese-friendly: keep short connectives lowercase.
  const LOWER = new Set(["de", "da", "do", "das", "dos", "e", "com", "em", "a", "o", "à", "ao"]);
  s = s
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join(" ");
  return s;
}

/**
 * Parse one product's ingredients text into unique, normalized names.
 * Returns [] for empty/absent text — the import simply skips that product.
 */
export function parseIngredientNames(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  const withCommas = raw.replace(CONJUNCTION_REGEX, ",");
  const seen = new Set<string>();
  const names: string[] = [];
  for (const token of withCommas.split(SPLIT_REGEX)) {
    const name = cleanToken(token);
    if (!name) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
