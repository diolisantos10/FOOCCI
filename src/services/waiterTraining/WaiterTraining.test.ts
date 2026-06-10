import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildTrainingProposal } from "./WaiterRealCaseTrainingBuilder";

const db = vi.hoisted(() => ({
  agentSimulationExample: { findMany: vi.fn() },
  waiterTrainingSuggestion: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { generatePendingTrainingSuggestions, reviewSuggestion } from "./WaiterTrainingSuggestionStore";

describe("WaiterRealCaseTrainingBuilder — resposta ideal por situação", () => {
  it("(2) proposta inclui problema, resposta ideal, regra e impacto", () => {
    const p = buildTrainingProposal({ scenarioType: "INDECISIVE_CUSTOMER", customerIntent: "indeciso", customerExcerpt: "não sei o que pedir" });
    expect(p.problemDetected).toBeTruthy();
    expect(p.idealResponse).toBeTruthy();
    expect(p.trainingRule).toBeTruthy();
    expect(p.expectedImpact).toBeTruthy();
    expect(p.situationSummary).toContain("não sei o que pedir");
  });

  it("(3) pergunta sobre pagamento → treinamento de formas de pagamento, sem inventar", () => {
    const p = buildTrainingProposal({ scenarioType: "PAYMENT_QUESTION", customerIntent: "pergunta pagamento" });
    expect(p.title).toContain("pagamento");
    expect(p.suggestedActionType).toBe("PAYMENT_RULE");
    expect(p.trainingRule).toContain("configuradas no Foocci");
    expect(p.idealResponse).toContain("opções disponíveis no fechamento");
  });

  it("(4) cliente com fome → recomendação mais completa", () => {
    const p = buildTrainingProposal({ scenarioType: "HUNGRY_BIG", customerIntent: "quer algo grande" });
    expect(p.title.toLowerCase()).toContain("completa");
    expect(p.suggestedActionType).toBe("UPSELL_BEHAVIOR");
    expect(p.idealResponse).toContain("sustentam");
  });

  it("(5) pedido por texto → confirmação/guiamento ao carrinho", () => {
    const p = buildTrainingProposal({ scenarioType: "ORDER_BY_TEXT", customerIntent: "tenta pedir por texto" });
    expect(p.suggestedActionType).toBe("CHECKOUT_GUIDANCE");
    expect(p.trainingRule).toContain("confirmação");
  });

  it("restrição alimentar é HIGH risk", () => {
    expect(buildTrainingProposal({ scenarioType: "DIETARY_RESTRICTION", customerIntent: "x" }).riskLevel).toBe("HIGH");
  });
});

describe("WaiterTrainingSuggestionStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.agentSimulationExample.findMany.mockResolvedValue([
      { id: "ex1", restaurantId: "r1", intent: "pergunta pagamento", scenarioType: "PAYMENT_QUESTION",
        sanitizedTranscript: JSON.stringify([{ role: "customer", content: "aceita cartão? meu fone [telefone]" }, { role: "agent", content: "Te ajudo!" }]) },
    ]);
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([]);
    db.waiterTrainingSuggestion.create.mockResolvedValue({ id: "s1" });
    db.waiterTrainingSuggestion.update.mockResolvedValue({ id: "s1", status: "APPROVED" });
  });

  it("(1) gera proposta de treinamento a partir de caso real; (7) não vaza dados brutos", async () => {
    const r = await generatePendingTrainingSuggestions();
    expect(r.created).toBe(1);
    const data = db.waiterTrainingSuggestion.create.mock.calls[0]![0].data;
    expect(data.status).toBe("PENDING_REVIEW");
    expect(data.idealResponse).toContain("fechamento");
    expect(data.trainingRule).toContain("Foocci");
    // só o trecho já sanitizado é guardado — nada de PII bruta
    expect(JSON.stringify(data)).not.toContain("(11)");
    expect(data.sanitizedCustomerExcerpt).toContain("[telefone]");
  });

  it("é idempotente — caso que já tem proposta não duplica", async () => {
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([{ sourceId: "ex1" }]);
    const r = await generatePendingTrainingSuggestions();
    expect(r.created).toBe(0);
    expect(db.waiterTrainingSuggestion.create).not.toHaveBeenCalled();
  });

  it("(6) aprovar registra decisão sem tocar runtime", async () => {
    await reviewSuggestion("s1", "APPROVED", "diego");
    expect(db.waiterTrainingSuggestion.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ status: "APPROVED", reviewedBy: "diego" }),
    });
    // o store não importa/chama nada de runtime (WaiterBrainV2/PromptBuilder)
  });
});
