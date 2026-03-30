/**
 * Mock menu fixture for deterministic QA runs.
 *
 * Represents a typical FOOCCI restaurant with three categories:
 *   - Pizzas (main)
 *   - Bebidas (drinks)
 *   - Sobremesas (desserts)
 *
 * Product IDs and prices are stable — scenarios reference them by name.
 */

import type { MenuCategoryFixture } from "../types";

export const mockMenu: MenuCategoryFixture[] = [
  {
    id: "cat-pizza",
    name: "Pizzas",
    imageUrl: null,
    items: [
      {
        id: "item-calabresa",
        name: "Pizza Calabresa",
        price: 42.90,
        description: "Calabresa, cebola roxa, azeitona preta",
        imageUrl: null,
      },
      {
        id: "item-mussarela",
        name: "Pizza Mussarela",
        price: 39.90,
        description: "Mussarela premium, tomate, manjericão",
        imageUrl: null,
      },
      {
        id: "item-frango",
        name: "Pizza Frango",
        price: 44.90,
        description: "Frango desfiado, catupiry, milho",
        imageUrl: null,
      },
    ],
  },
  {
    id: "cat-bebida",
    name: "Bebidas",
    imageUrl: null,
    items: [
      {
        id: "item-coca",
        name: "Coca-Cola 2L",
        price: 12.90,
        description: null,
        imageUrl: null,
      },
      {
        id: "item-suco-laranja",
        name: "Suco de Laranja",
        price: 8.90,
        description: "Natural, 500ml",
        imageUrl: null,
      },
    ],
  },
  {
    id: "cat-sobremesa",
    name: "Sobremesas",
    imageUrl: null,
    items: [
      {
        id: "item-brigadeiro",
        name: "Brigadeiro",
        price: 6.90,
        description: "Tradicional, 3 unidades",
        imageUrl: null,
      },
      {
        id: "item-pudim",
        name: "Pudim",
        price: 9.90,
        description: "Pudim de leite condensado",
        imageUrl: null,
      },
    ],
  },
];
