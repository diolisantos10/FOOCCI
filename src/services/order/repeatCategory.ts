/**
 * repeatCategory — pure helpers for the "Pedir de novo" virtual menu category.
 *
 * "Pedir de novo" is a VISUAL menu category (like "Promoções", "Mais pedidos"),
 * NOT a chat button. It only exists when the identified customer has real
 * repeatable history. Kept pure (no React/DOM) so it is unit-testable, and in a
 * non-bracketed path so vitest can resolve it.
 */

export const REPEAT_CATEGORY_ID = "repeat-order";
export const REPEAT_CATEGORY_NAME = "Pedir de novo";

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
 * Returns the categories to render: when there is repeatable history, prepends
 * the virtual "Pedir de novo" category; otherwise returns the menu unchanged.
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
    items: [...repeatItems],
  };
  return [virtual, ...categories];
}
