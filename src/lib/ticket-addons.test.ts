import { describe, it, expect } from "vitest";
import { parseTicketAddons } from "@/lib/ticket-addons";

describe("parseTicketAddons", () => {
  it("REGRESSION: the checkout { options, extras } object shape prints every choice", () => {
    // This is exactly what CheckoutFinalizationService stores. The old parser
    // returned [] here (object, not array) → 'Refri' printed with no flavor.
    const addonsJson = {
      options: [
        { groupId: "g1", groupName: "Refrigerante", optionId: "o1", optionName: "Coca-Cola", qty: 1, priceAdjustment: 0 },
        { groupId: "g2", groupName: "Ponto da carne", optionId: "o2", optionName: "Grelhado", qty: 1, priceAdjustment: 0 },
      ],
      extras: [
        { extraId: "e1", name: "Bacon", unitPrice: 4, qty: 2 },
      ],
    };
    const parsed = parseTicketAddons(addonsJson);
    const names = parsed.map((p) => p.name);
    expect(names).toContain("Coca-Cola");
    expect(names).toContain("Grelhado");
    expect(names).toContain("2x Bacon"); // qty prefix
    const bacon = parsed.find((p) => p.name === "2x Bacon");
    expect(bacon?.price).toBe(4);
  });

  it("accepts a JSON string of the object shape", () => {
    const parsed = parseTicketAddons(JSON.stringify({ options: [{ optionName: "Guaraná" }], extras: [] }));
    expect(parsed.map((p) => p.name)).toEqual(["Guaraná"]);
  });

  it("still handles a legacy flat array of {name, price}", () => {
    const parsed = parseTicketAddons([{ name: "Queijo", price: 3 }, { label: "Sem cebola" }]);
    expect(parsed.map((p) => p.name)).toEqual(["Queijo", "Sem cebola"]);
    expect(parsed[0]?.price).toBe(3);
  });

  it("handles an array of plain strings", () => {
    expect(parseTicketAddons(["Bem passado", "Sem gelo"]).map((p) => p.name)).toEqual(["Bem passado", "Sem gelo"]);
  });

  it("zero / null price is treated as no price", () => {
    const parsed = parseTicketAddons({ options: [{ optionName: "Coca-Cola", priceAdjustment: 0 }] });
    expect(parsed[0]?.price).toBeUndefined();
  });

  it("empty / nullish inputs return []", () => {
    expect(parseTicketAddons(null)).toEqual([]);
    expect(parseTicketAddons(undefined)).toEqual([]);
    expect(parseTicketAddons("")).toEqual([]);
    expect(parseTicketAddons({ options: [], extras: [] })).toEqual([]);
    expect(parseTicketAddons("not json")).toEqual([]);
  });
});
