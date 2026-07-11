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

  it("prepends the virtual category when there is history and NO best-sellers category", () => {
    const repeat: Item[] = [{ id: "a" }, { id: "x" }];
    expect(shouldShowRepeatCategory(repeat)).toBe(true);
    const out = buildDisplayCategories(menu, repeat);
    expect(out[0].id).toBe(REPEAT_CATEGORY_ID);
    expect(out[0].name).toBe(REPEAT_CATEGORY_NAME); // "Comprar novamente"
    expect(out[0].items.map((i) => i.id)).toEqual(["a", "x"]); // order preserved (last-order-first)
    expect(out.slice(1).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("inserts the virtual category right AFTER a 'Mais vendidos' category", () => {
    const menuWithBest: Cat[] = [
      { id: "best", name: "Mais vendidos", description: null, imageUrl: null, items: [{ id: "m" }] },
      { id: "c1",   name: "Combos",        description: null, imageUrl: null, items: [{ id: "a" }] },
    ];
    const out = buildDisplayCategories(menuWithBest, [{ id: "a" }]);
    expect(out.map((c) => c.id)).toEqual(["best", REPEAT_CATEGORY_ID, "c1"]); // after best-sellers
  });

  it("caps the virtual category to the last 10 items", () => {
    const many: Item[] = Array.from({ length: 15 }, (_, i) => ({ id: `i${i}` }));
    const out = buildDisplayCategories(menu, many);
    expect(out[0].items).toHaveLength(10);
    expect(out[0].items[0].id).toBe("i0"); // most-recent-first order kept
  });

  it("does not mutate the inputs", () => {
    const repeat: Item[] = [{ id: "a" }];
    const before = menu.length;
    buildDisplayCategories(menu, repeat);
    expect(menu.length).toBe(before);
  });
});
