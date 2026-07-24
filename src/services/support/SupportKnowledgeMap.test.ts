import { describe, it, expect } from "vitest";
import { matchFailureModes, FAILURE_MODES, buildKnowledgeMapContext } from "./SupportKnowledgeMap";

describe("SupportKnowledgeMap — casamento sintoma → modo de falha", () => {
  it("relato de WhatsApp que parou casa com o modo de falha do Meta inbound", () => {
    const hits = matchFailureModes("os pedidos pararam de chegar no whatsapp mas eu consigo enviar");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((m) => m.subsystem)).toContain("whatsapp_meta");
  });

  it("relato de sistema fora do ar casa com exaustão de conexão do banco", () => {
    const hits = matchFailureModes("o sistema todo ficou fora do ar, erro ao abrir qualquer tela");
    expect(hits.some((m) => m.subsystem === "database")).toBe(true);
  });

  it("relato de impressora casa com o subsistema de impressão (Carteiro)", () => {
    for (const report of [
      "a impressora não está imprimindo os pedidos",
      "as comandas não saem na cozinha",
      "o carteiro parou de imprimir",
    ]) {
      const hits = matchFailureModes(report);
      expect(hits[0]?.subsystem, report).toBe("printing");
    }
  });

  it("relato de impressora NÃO casa pagamento nem outro subsistema no topo (regressão)", () => {
    const hits = matchFailureModes("minha impressora não imprime a comanda");
    expect(hits.map((m) => m.subsystem)).not.toContain("payments");
    expect(hits[0]?.subsystem).toBe("printing");
  });

  it("relato sem relação não casa nada (não força diagnóstico)", () => {
    const hits = matchFailureModes("qual o telefone do suporte");
    expect(hits.length).toBe(0);
  });

  it("todo modo de falha tem gatilhos, runbook e severidade", () => {
    for (const m of FAILURE_MODES) {
      expect(m.triggers.length, m.key).toBeGreaterThan(0);
      expect(m.runbook.length).toBeGreaterThan(0);
      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(m.severity);
    }
  });

  it("o bloco de contexto do mapa é montável", () => {
    const ctx = buildKnowledgeMapContext();
    expect(ctx).toContain("MAPA DO SISTEMA FOOCCI");
    expect(ctx).toContain("MODOS DE FALHA");
  });
});
