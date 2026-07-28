import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  menuItem:   { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { inventariarMidia, inventariarVarios } from "./mediaInventory";

function item(nome: string, imageUrl: string | null, categoria = "Lanches") {
  return { id: `id-${nome}`, name: nome, imageUrl, category: { name: categoria } };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({ id: "r1", name: "Boteco do Zé" });
});

describe("inventariarMidia", () => {
  it("conta o que tem e o que não tem foto", async () => {
    db.menuItem.findMany.mockResolvedValue([
      item("Burger", "https://foocci/1.jpg"),
      item("Picanha", null),
      item("Batata", null),
    ]);
    const inv = await inventariarMidia("r1");
    expect(inv?.total).toBe(3);
    expect(inv?.comFoto).toBe(1);
    expect(inv?.semFoto).toBe(2);
    expect(inv?.cobertura).toBe(33);
  });

  it("lista NOME por nome o que precisa de foto — é o que vai pro cliente", async () => {
    db.menuItem.findMany.mockResolvedValue([item("Burger", "u"), item("Picanha", null, "Carnes")]);
    const inv = await inventariarMidia("r1");
    expect(inv?.itensSemFoto).toEqual([{ id: "id-Picanha", nome: "Picanha", categoria: "Carnes" }]);
  });

  it("imageUrl em branco NÃO conta como foto", async () => {
    db.menuItem.findMany.mockResolvedValue([item("Burger", "   "), item("Picanha", "")]);
    const inv = await inventariarMidia("r1");
    expect(inv?.comFoto).toBe(0);
    expect(inv?.semFoto).toBe(2);
  });

  it("cardápio completo dá leitura de campanha só com realce", async () => {
    db.menuItem.findMany.mockResolvedValue([item("Burger", "u"), item("Picanha", "u")]);
    const inv = await inventariarMidia("r1");
    expect(inv?.cobertura).toBe(100);
    expect(inv?.leitura).toMatch(/só com realce/i);
  });

  it("cardápio sem nenhuma foto manda usar peça gráfica", async () => {
    db.menuItem.findMany.mockResolvedValue([item("Burger", null)]);
    const inv = await inventariarMidia("r1");
    expect(inv?.leitura).toMatch(/peça gráfica/i);
  });

  it("cardápio vazio pede cadastro antes de planejar criativo", async () => {
    db.menuItem.findMany.mockResolvedValue([]);
    const inv = await inventariarMidia("r1");
    expect(inv?.total).toBe(0);
    expect(inv?.leitura).toMatch(/cadastre os itens/i);
  });

  it("restaurante inexistente devolve null, não explode", async () => {
    db.restaurant.findUnique.mockResolvedValue(null);
    expect(await inventariarMidia("nope")).toBeNull();
  });
});

describe("inventariarVarios", () => {
  it("inventaria os três clientes de uma vez", async () => {
    db.restaurant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      ({ id: where.id, name: `Cliente ${where.id}` }));
    db.menuItem.findMany.mockResolvedValue([item("Burger", "u"), item("Picanha", null)]);

    const { inventarios, naoEncontrados } = await inventariarVarios(["a", "b", "c"]);
    expect(inventarios).toHaveLength(3);
    expect(naoEncontrados).toEqual([]);
    expect(inventarios[0]?.cobertura).toBe(50);
  });

  it("id errado não derruba os outros — vai pra naoEncontrados", async () => {
    db.restaurant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "ruim" ? null : { id: where.id, name: "ok" });
    db.menuItem.findMany.mockResolvedValue([item("Burger", "u")]);

    const { inventarios, naoEncontrados } = await inventariarVarios(["bom", "ruim"]);
    expect(inventarios).toHaveLength(1);
    expect(naoEncontrados).toEqual(["ruim"]);
  });

  it("ignora id repetido e espaço em branco", async () => {
    db.menuItem.findMany.mockResolvedValue([]);
    const { inventarios } = await inventariarVarios(["r1", " r1 ", "", "  "]);
    expect(inventarios).toHaveLength(1);
  });

  it("banco que explode num restaurante não derruba o lote", async () => {
    db.restaurant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "quebra") throw new Error("db down");
      return { id: where.id, name: "ok" };
    });
    db.menuItem.findMany.mockResolvedValue([]);

    const { inventarios, naoEncontrados } = await inventariarVarios(["bom", "quebra"]);
    expect(inventarios).toHaveLength(1);
    expect(naoEncontrados).toEqual(["quebra"]);
  });
});
