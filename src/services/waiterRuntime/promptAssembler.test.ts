import { describe, it, expect } from "vitest";
import { assembleLibraryPromptBlock, isUsableTechnique, ABSOLUTE_MAX_TECHNIQUES } from "./promptAssembler";
import type { RuntimeTechnique } from "./types";

function tech(over: Partial<RuntimeTechnique> = {}): RuntimeTechnique {
  return {
    id: "t1",
    name: "Sugestão de bebida ancorada",
    category: "Vendas",
    application: "Após o prato principal, ofereça uma bebida que combine, citando o porquê.",
    usageRule: "Máximo 1 sugestão de bebida por pedido.",
    qualityTest: "A bebida combina com o prato escolhido?",
    priority: 1,
    ...over,
  };
}

describe("isUsableTechnique", () => {
  it("rejects empty / too-short / substance-less techniques", () => {
    expect(isUsableTechnique(null)).toBe(false);
    expect(isUsableTechnique(tech({ name: "X", application: "", usageRule: "" }))).toBe(false);
    expect(isUsableTechnique(tech({ application: "curto", usageRule: "x" }))).toBe(false);
  });
  it("keeps a technique with a substantial application OR usageRule", () => {
    expect(isUsableTechnique(tech())).toBe(true);
    expect(isUsableTechnique(tech({ application: "", usageRule: "Sempre confirme o pedido antes do checkout." }))).toBe(true);
  });
});

describe("assembleLibraryPromptBlock", () => {
  it("(P4.2) includes the techniques as an explicit, separate block", () => {
    const { promptBlock, used } = assembleLibraryPromptBlock([tech()]);
    expect(used).toHaveLength(1);
    expect(promptBlock).toContain("TÉCNICAS OPERACIONAIS ATIVAS DO WAITER");
    expect(promptBlock).toContain("Sugestão de bebida ancorada");
    expect(promptBlock).toContain("Aplicação:");
  });

  it("(P4.3) reinforces that the real catalog is the source of truth", () => {
    const { promptBlock } = assembleLibraryPromptBlock([tech()]);
    expect(promptBlock).toContain("fonte da verdade");
    expect(promptBlock).toMatch(/NUNCA invente produto/i);
    expect(promptBlock).toMatch(/NUNCA pule o checkout/i);
  });

  it("(P4.4) cannot inject a fake product/price — only names usage guidance, no item IDs", () => {
    const { promptBlock } = assembleLibraryPromptBlock([tech({ application: "Ofereça a sobremesa da casa." })]);
    // No "[ID: ...]" tokens and no "R$" prices come from techniques.
    expect(promptBlock).not.toMatch(/\[ID:/);
    expect(promptBlock).not.toMatch(/R\$\s?\d/);
  });

  it("(P12.5) respects maxTechniques and the absolute cap", () => {
    const many = Array.from({ length: 20 }, (_, i) => tech({ id: `t${i}`, name: `Técnica número ${i}` }));
    expect(assembleLibraryPromptBlock(many, { maxTechniques: 3 }).used).toHaveLength(3);
    expect(assembleLibraryPromptBlock(many, { maxTechniques: 999 }).used).toHaveLength(ABSOLUTE_MAX_TECHNIQUES);
  });

  it("returns an empty block when nothing usable survives (clean CURRENT fallback)", () => {
    const { promptBlock, used } = assembleLibraryPromptBlock([tech({ name: "X", application: "", usageRule: "" })]);
    expect(used).toHaveLength(0);
    expect(promptBlock).toBe("");
  });
});
