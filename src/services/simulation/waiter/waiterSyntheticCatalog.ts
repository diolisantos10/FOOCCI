/**
 * Synthetic catalog for Waiter simulations — a self-authored, fictional menu used
 * ONLY in the sandbox. No real restaurant data; safe to ship in code. Shaped like
 * the real V2CatalogItem so decide() behaves exactly as in production.
 */

import type { V2CatalogItem } from "@/services/ai/WaiterBrainV2";

export function waiterSyntheticCatalog(): V2CatalogItem[] {
  return [
    { id: "uramaki", name: "Uramaki Salmão", categoryName: "Uramakis", price: 28, sortOrder: 1 },
    { id: "hotfila", name: "Hot Roll Filadélfia", categoryName: "Hot Rolls", price: 30, sortOrder: 2 },
    { id: "temaki", name: "Temaki Salmão", categoryName: "Temakis", price: 24, sortOrder: 3 },
    { id: "yakisoba", name: "Yakisoba de Frango", categoryName: "Quentes", price: 33, sortOrder: 4 },
    { id: "combo40", name: "Combinado 40 peças", categoryName: "Combos", price: 120, sortOrder: 5, servingSize: 4 },
    { id: "festival", name: "Festival Família", categoryName: "Combos", price: 180, sortOrder: 6, servingSize: 6 },
    { id: "porc-gyoza", name: "Porção de Gyoza", categoryName: "Porções", price: 22, sortOrder: 7, description: "pastel japonês de legumes" },
    { id: "porc-haru", name: "Porção de Harumaki", categoryName: "Porções", price: 20, sortOrder: 8, description: "rolinho de legumes" },
    { id: "porc-eda", name: "Porção de Edamame", categoryName: "Porções", price: 18, sortOrder: 9, description: "vagem de soja (vegano)" },
    { id: "brownie", name: "Brownie", categoryName: "Sobremesas", price: 16, sortOrder: 10 },
    { id: "mochi", name: "Mochi", categoryName: "Sobremesas", price: 14, sortOrder: 11 },
    { id: "coca", name: "Coca-Cola", categoryName: "Bebidas", price: 8, sortOrder: 12 },
    { id: "suco", name: "Suco de Laranja", categoryName: "Bebidas", price: 10, sortOrder: 13 },
    { id: "sunomono", name: "Sunomono", categoryName: "Saladas", price: 16, sortOrder: 14, description: "salada de pepino (vegano)" },
    { id: "pepino", name: "Uramaki Pepino", categoryName: "Uramakis", price: 19, sortOrder: 15, description: "pepino e arroz (vegano)" },
  ];
}

/** Real catalog prices — used by the evaluator to detect fabricated prices. */
export function catalogPrices(catalog: V2CatalogItem[]): Set<number> {
  return new Set(catalog.map((i) => i.price));
}
