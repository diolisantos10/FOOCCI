import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ restaurantExperience: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getExperienceBrief, clearExperienceBriefCache } from "./ExperienceBriefService";

function rows(tagsList: string[][]) {
  return tagsList.map((tags) => ({ tags }));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearExperienceBriefCache();
});

describe("ExperienceBriefService — consumo do cofre", () => {
  it("destila os padrões mais comuns num brief (contexto, não verdade)", async () => {
    const many = rows(Array.from({ length: 20 }, () => ["poke", "festival", "bebidas"]));
    db.restaurantExperience.findMany.mockResolvedValue(many);
    const brief = await getExperienceBrief("r1");
    expect(brief).toContain("poke");
    expect(brief).toContain("festival");
    expect(brief).toMatch(/NÃO é fonte de verdade/i);
  });

  it("pouco dado (< mínimo) → brief vazio (não injeta ruído)", async () => {
    db.restaurantExperience.findMany.mockResolvedValue(rows([["poke"], ["combos"]])); // só 2
    expect(await getExperienceBrief("r2")).toBe("");
  });

  it("cacheia — segunda chamada não bate no banco de novo", async () => {
    db.restaurantExperience.findMany.mockResolvedValue(rows(Array.from({ length: 20 }, () => ["poke"])));
    await getExperienceBrief("r3");
    await getExperienceBrief("r3");
    expect(db.restaurantExperience.findMany).toHaveBeenCalledTimes(1);
  });

  it("erro no banco não derruba — brief vazio", async () => {
    db.restaurantExperience.findMany.mockRejectedValue(new Error("db down"));
    expect(await getExperienceBrief("r4")).toBe("");
  });
});
