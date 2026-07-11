/**
 * repeatCategory — pure helpers for the "Pedir de novo" virtual menu category.
 *
 * "Pedir de novo" is a VISUAL menu category (like "Promoções", "Mais pedidos"),
 * NOT a chat button. It only exists when the identified customer has real
 * repeatable history. Kept pure (no React/DOM) so it is unit-testable, and in a
 * non-bracketed path so vitest can resolve it.
 */

export const REPEAT_CATEGORY_ID = "repeat-order";
export const REPEAT_CATEGORY_NAME = "Comprar novamente";

/** Only the last N repeatable items are shown (most recent first). */
export const REPEAT_MAX_ITEMS = 10;

/** A "best sellers"-style category, after which "Comprar novamente" is inserted. */
const BEST_SELLER_RE = /mais\s*(vendid|pedid)|populares|destaques|^\s*top\b/i;

interface HasId { id: string }

export interface VirtualCategory<TItem extends HasId> {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  items: TItem[];
}

/** True when the repeat category should be shown (real history only). */
export function shouldShowRepeatCategory<T extends HasId>(repeatItems: readonly T[]): boolean {
  return repeatItems.length > 0;
}

/**
 * Returns the categories to render: when there is repeatable history, inserts the
 * virtual "Comprar novamente" category (last N items) right AFTER a best-sellers
 * category if one exists, otherwise at the very top. Returns the menu unchanged
 * when there is no history.
 */
export function buildDisplayCategories<C extends VirtualCategory<T>, T extends HasId>(
  categories: readonly C[],
  repeatItems: readonly T[],
): Array<C | VirtualCategory<T>> {
  if (!shouldShowRepeatCategory(repeatItems)) return [...categories];
  const virtual: VirtualCategory<T> = {
    id: REPEAT_CATEGORY_ID,
    name: REPEAT_CATEGORY_NAME,
    description: null,
    imageUrl: null,
    items: repeatItems.slice(0, REPEAT_MAX_ITEMS),
  };
  const result: Array<C | VirtualCategory<T>> = [...categories];
  const bestIdx = result.findIndex((c) => BEST_SELLER_RE.test(c.name));
  result.splice(bestIdx >= 0 ? bestIdx + 1 : 0, 0, virtual);
  return result;
}
