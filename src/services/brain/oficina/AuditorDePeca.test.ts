import { describe, it, expect, beforeEach } from "vitest";

import { auditarPeca } from "./AuditorDePeca";
import { registerKnowledgeAdapter } from "../knowledge/KnowledgeAdapterRegistry";

const COM_VERDADE = "TIPO_AUDITORIA";
const SEM_VERDADE = "TIPO_AUDITORIA_VAZIO";

beforeEach(() => {
  registerKnowledgeAdapter({
    businessType: COM_VERDADE,
    getSnapshot: async () => ({
      businessId: "r1",
      businessType: COM_VERDADE,
      truthSources: { products: [{ nome: "picanha de quinta" }], prices: ["R$ 79,90"] },
      missingContext: [],
      safetyNotes: [],
      completenessScore: 0.9,
    }),
  });
  registerKnowledgeAdapter({
    businessType: SEM_VERDADE,
    getSnapshot: async () => ({
      businessId: "r1", businessType: SEM_VERDADE,
      truthSources: {}, missingContext: ["cardápio"], safetyNotes: [], completenessScore: 0,
    }),
  });
});

const base = {
  businessType: COM_VERDADE,
  businessId: "r1",
  dominio: "restaurante",
  agentId: "crm",
  intencao: "mensagem de recuperação de cliente",
  formato: "WhatsApp, 1 linha",
};

describe("auditarPeca", () => {
  it("aprova peça ancorada num fato real do negócio", async () => {
    const a = await auditarPeca({ ...base, peca: "A picanha de quinta saiu agora — guardo uma pra você?" });
    expect(a.nota.aprovado).toBe(true);
    expect(a.fatosDisponiveis).toBeGreaterThan(0);
  });

  it("reprova a mensagem genérica que todo restaurante manda", async () => {
    const a = await auditarPeca({ ...base, peca: "Sentimos sua falta! Volte a pedir com a gente 😊" });
    expect(a.nota.aprovado).toBe(false);
    expect(a.nota.graves).toBeGreaterThan(0);
  });

  it("reprova preço que não existe no cardápio", async () => {
    const a = await auditarPeca({ ...base, peca: "Picanha de quinta hoje por R$ 29,90!" });
    expect(a.nota.aprovado).toBe(false);
    expect(a.nota.motivos.join(" ")).toMatch(/29/);
  });

  it("aceita o preço que existe", async () => {
    const a = await auditarPeca({ ...base, peca: "Picanha de quinta por R$ 79,90 hoje." });
    expect(a.nota.aprovado).toBe(true);
  });

  it("não cobra briefing de peça pronta — só o resultado", async () => {
    const a = await auditarPeca({ ...base, peca: "Picanha de quinta saindo agora." });
    // público/tom vazios na ficha sintética não podem reprovar
    expect(a.ficha.publico).toBe("");
    expect(a.nota.aprovado).toBe(true);
  });

  it("marca fatosDisponiveis=0 quando não há verdade — sinal de juízo fraco", async () => {
    const a = await auditarPeca({ ...base, businessType: SEM_VERDADE, peca: "qualquer mensagem" });
    expect(a.fatosDisponiveis).toBe(0);
  });

  it("domínio sem manual reprova por construção", async () => {
    const a = await auditarPeca({ ...base, dominio: "dominio-inexistente", peca: "picanha de quinta agora" });
    expect(a.nota.aprovado).toBe(false);
  });
});
