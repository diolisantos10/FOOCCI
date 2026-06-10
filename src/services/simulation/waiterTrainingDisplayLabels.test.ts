import { describe, it, expect } from "vitest";
import {
  severityLabel,
  opportunityTypeLabel,
  scenarioTypeLabel,
  originLabel,
  trainingActionLabel,
  exampleStatusLabel,
  libraryProcessingStatusLabel,
  libraryTechniqueStatusLabel,
  buildTrainingSuggestion,
  APPROVAL_DISCLAIMER,
} from "./waiterTrainingDisplayLabels";

describe("waiterTrainingDisplayLabels — tradução de linguagem técnica", () => {
  it("(1) MISSED_SALE vira 'Oportunidade de venda'", () => {
    expect(opportunityTypeLabel("MISSED_SALE")).toBe("Oportunidade de venda");
  });

  it("(2) HUNGRY_BIG vira 'Cliente com muita fome'", () => {
    expect(scenarioTypeLabel("HUNGRY_BIG")).toBe("Cliente com muita fome");
  });

  it("(3) P2 vira 'Melhoria' (e P0/P1/INFO traduzidos)", () => {
    expect(severityLabel("P2")).toBe("Melhoria");
    expect(severityLabel("P0")).toBe("Crítico");
    expect(severityLabel("P1")).toBe("Importante");
    expect(severityLabel("INFO")).toBe("Informação");
  });

  it("(4) ação Approve vira 'Aprovar treinamento'", () => {
    expect(trainingActionLabel("APPROVED")).toBe("Aprovar treinamento");
    expect(trainingActionLabel("Approve")).toBe("Aprovar treinamento");
    expect(trainingActionLabel("BACKLOGGED")).toBe("Guardar para depois");
  });

  it("(5) o texto de aprovação deixa claro que NÃO muda o runtime agora", () => {
    expect(APPROVAL_DISCLAIMER).toContain("não muda o atendimento real");
    expect(APPROVAL_DISCLAIMER).toContain("Quality Gate");
  });

  it("(6) CRON vira 'Simulação automática' (e demais origens)", () => {
    expect(originLabel("CRON")).toBe("Simulação automática");
    expect(originLabel("MANUAL")).toBe("Simulação manual");
    expect(originLabel("EXAMPLE")).toBe("Conversa real sanitizada");
    expect(originLabel("LIBRARY")).toBe("Material da Biblioteca");
    expect(originLabel(null)).toBe("Detectado pelo Simulador");
  });

  it("(7/8) status de Biblioteca e Casos reais ficam legíveis", () => {
    expect(libraryProcessingStatusLabel("PROCESSING_CHUNKS")).toBe("Processando");
    expect(libraryProcessingStatusLabel("READY")).toBe("Pronta para treino");
    expect(libraryTechniqueStatusLabel("ACTIVE")).toBe("Pronta para treino");
    expect(libraryTechniqueStatusLabel("ARCHIVED")).toBe("Desativada");
    expect(exampleStatusLabel("APPROVED")).toBe("Usado como exemplo");
    expect(exampleStatusLabel("PENDING_REVIEW")).toBe("Aguardando sua revisão");
    expect(exampleStatusLabel("REJECTED")).toBe("Não usar");
  });

  it("(9) opportunity card gera problema + solução + impacto + origem + exemplo", () => {
    const view = buildTrainingSuggestion({
      type: "MISSED_SALE",
      severity: "P2",
      title: "Melhorar resposta para cliente com muita fome",
      summary: "O cliente disse que estava com muita fome, mas o Waiter não conduziu para uma opção mais completa.",
      recommendation: "Treinar o Waiter para oferecer pratos que sustentam mais e conduzir ao próximo passo.",
      expectedImpact: "Aumentar conversão em clientes indecisos ou com fome alta.",
      scenario: { scenarioType: "HUNGRY_BIG", initialMessage: "tô com muita fome, o que vocês recomendam?" },
      run: { mode: "CRON" },
    });
    expect(view.problem).toContain("muita fome");
    expect(view.solution).toContain("sustentam mais");
    expect(view.expectedImpact).toContain("conversão");
    expect(view.customerExample).toContain("muita fome");
    expect(view.origin).toBe("Simulação automática");
    // detalhe técnico colapsado mantém os códigos crus + severidade traduzida
    expect(view.technicalDetail).toBe("HUNGRY_BIG · MISSED_SALE · Melhoria");
  });

  it("usa fallback de impacto quando a oportunidade não traz expectedImpact", () => {
    const view = buildTrainingSuggestion({
      type: "UX_FRICTION", severity: "P1", title: "x", summary: "y", recommendation: "z",
      expectedImpact: null, scenario: null, run: null,
    });
    expect(view.expectedImpact.length).toBeGreaterThan(0);
    expect(view.origin).toBe("Detectado pelo Simulador");
  });
});
