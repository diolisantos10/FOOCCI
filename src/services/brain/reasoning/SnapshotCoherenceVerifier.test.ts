import { describe, it, expect } from "vitest";
import { verifyAgainstSnapshot } from "./SnapshotCoherenceVerifier";
import type { BusinessKnowledgeSnapshot } from "../knowledge/BusinessKnowledgeContract";

function snap(truthSources: BusinessKnowledgeSnapshot["truthSources"]): BusinessKnowledgeSnapshot {
  return { businessId: "r1", businessType: "RESTAURANT", truthSources, missingContext: [], safetyNotes: [] };
}

describe("SnapshotCoherenceVerifier — claim-vs-snapshot (o fim do stub doesNotInventFacts:true)", () => {
  it("preço citado que EXISTE na base → passa", () => {
    const r = verifyAgainstSnapshot(
      "O Combo Salmão sai por R$ 59,90! 😊",
      snap({ products: [{ nome: "Combo Salmão", preco: 59.9 }] }),
    );
    expect(r.doesNotInventFacts).toBe(true);
    expect(r.needsReview).toBe(false);
  });

  it("preço INVENTADO (não existe na base) → doesNotInventFacts=false + review", () => {
    const r = verifyAgainstSnapshot(
      "O Combo Salmão sai por R$ 45,00!",
      snap({ products: [{ nome: "Combo Salmão", preco: 59.9 }] }),
    );
    expect(r.doesNotInventFacts).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(r.inventedPrices).toEqual(["R$ 45,00"]);
  });

  it("preço presente só no TEXTO curado (Q&A) também conta como verdade", () => {
    const r = verifyAgainstSnapshot(
      "O rodízio custa R$ 89,90 por pessoa.",
      snap({ policies: [{ pergunta: "Tem rodízio?", resposta: "Sim! R$ 89,90 por pessoa." }] }),
    );
    expect(r.doesNotInventFacts).toBe(true);
    expect(r.needsReview).toBe(false);
  });

  it("REGRESSÃO RODÍZIO: negação de serviço nunca passa direto → review", () => {
    const r = verifyAgainstSnapshot("Não temos rodízio, infelizmente.", snap({}));
    expect(r.needsReview).toBe(true);
    expect(r.serviceDenials.length).toBeGreaterThan(0);
    expect(r.reason).toMatch(/negação/i);
  });

  it("resposta sem claims verificáveis → passa limpa", () => {
    const r = verifyAgainstSnapshot("Claro! Já te ajudo com isso. 😊", snap({}));
    expect(r.doesNotInventFacts).toBe(true);
    expect(r.needsReview).toBe(false);
  });
});
