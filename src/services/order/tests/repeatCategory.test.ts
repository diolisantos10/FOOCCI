import { describe, it, expect } from "vitest";
import {
  REPEAT_CATEGORY_ID,
  REPEAT_CATEGORY_NAME,
  shouldShowRepeatCategory,
  buildDisplayCategories,
} from "../repeatCategory";

interface Item { id: string; name?: string }
interface Cat { id: string; name: string; description: string | null; imageUrl: string | null; items: Item[] }

const menu: Cat[] = [
  { id: "c1", name: "Combos", description: null, imageUrl: null, items: [{ id: "a" }] },
  { id: "c2", name: "Bebidas", description: null, imageUrl: null, items: [{ id: "b" }] },
];

describe("repeatCategory", () => {
  it("hides the repeat category when there is no history", () => {
    expect(shouldShowRepeatCategory([])).toBe(false);
    const out = buildDisplayCategories(menu, []);
    expect(out).toHaveLength(menu.length);
    expect(out.some((c) => c.id === REPEAT_CATEGORY_ID)).toBe(false);
  });

  it("prepends the virtual 'Pedir de novo' category when there is history", () => {
    const repeat: Item[] = [{ id: "a" }, { id: "x" }];
    expect(shouldShowRepeatCategory(repeat)).toBe(true);
    const out = buildDisplayCategories(menu, repeat);
    expect(out[0].id).toBe(REPEAT_CATEGORY_ID);
    expect(out[0].name).toBe(REPEAT_CATEGORY_NAME);
    expect(out[0].items.map((i) => i.id)).toEqual(["a", "x"]); // order preserved (last-order-first)
    // original menu categories are kept, after the virtual one
    expect(out.slice(1).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("does not mutate the inputs", () => {
    const repeat: Item[] = [{ id: "a" }];
    const before = menu.length;
    buildDisplayCategories(menu, repeat);
    expect(menu.length).toBe(before);
  });
});
