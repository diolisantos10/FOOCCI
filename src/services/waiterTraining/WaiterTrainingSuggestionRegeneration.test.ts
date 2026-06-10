import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  waiterTrainingSuggestion: { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  restaurant: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { regenerateSuggestions } from "./WaiterTrainingSuggestionRegenerationService";

// An OLD suggestion: "Aceita Alelo Refeição?" wrongly classified as INDECISIVE,
// with a dish recommendation as the (bad) ideal response. Excerpt already sanitized.
const OLD_ALELO = {
  id: "old1",
  restaurantId: "r1",
  status: "PENDING_REVIEW",
  customerIntent: "indeciso",
  title: "Ajudar cliente indeciso",
  situationSummary: "Cliente: “Aceita Alelo Refeição? meu telefone é [telefone]” — indeciso.",
  whatHappened: "O Waiter respondeu: “[handoff:AI_ESCALATION]”",
  problemDetected: "Cliente indeciso.",
  idealResponse: "Posso te recomendar os mais pedidos!",
  trainingRule: "Recomendar pratos populares.",
  expectedImpact: "x",
  suggestedActionType: "RESPONSE_PATTERN",
  riskLevel: "LOW",
  sanitizedCustomerExcerpt: "Aceita Alelo Refeição? meu telefone é [telefone]",
  sanitizedWaiterExcerpt: "[handoff:AI_ESCALATION]",
  technicalDetails: { scenarioType: "INDECISIVE_CUSTOMER", source: "real-case-builder" },
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findUnique.mockResolvedValue({
    name: "Sushi Cazza",
    paymentSettings: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    deliveryConfig: { enabled: true, pickupEnabled: true },
    brandConfig: { tone: "friendly" },
  });
  db.waiterTrainingSuggestion.count.mockResolvedValue(5); // 5 APPROVED/REJECTED protected
  db.waiterTrainingSuggestion.update.mockResolvedValue({ id: "old1" });
});

describe("WaiterTrainingSuggestionRegenerationService", () => {
  it("Alelo legado (INDECISIVE) → PAYMENT_BENEFIT_QUESTION; resposta não recomenda prato", async () => {
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([OLD_ALELO]);
    const r = await regenerateSuggestions({ dryRun: false, useLLM: false });
    expect(r.regenerated).toBe(1);
    const data = db.waiterTrainingSuggestion.update.mock.calls[0]![0].data;
    expect(data.customerIntent).toBe("Pagamento / benefício refeição");
    expect(/recomend|mais pedidos|prato/i.test(data.idealResponse)).toBe(false);
    expect(/pagamento|confirmar|forma/i.test(data.idealResponse)).toBe(true);
    expect(data.technicalDetails.primaryIntent).toBe("PAYMENT_BENEFIT_QUESTION");
    expect(data.technicalDetails.regeneratedAt).toBeTruthy();
    // dry-run sample reflects the intent change
    expect(r.intentChanged).toBe(1);
  });

  it("dry-run não escreve e reporta amostra de mudança de intenção", async () => {
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([OLD_ALELO]);
    const r = await regenerateSuggestions({ dryRun: true });
    expect(r.regenerated).toBe(0);
    expect(r.wouldRegenerate).toBe(1);
    expect(db.waiterTrainingSuggestion.update).not.toHaveBeenCalled();
    expect(r.intentChangeSamples[0]).toMatchObject({ toIntent: "PAYMENT_BENEFIT_QUESTION" });
  });

  it("APPROVED e REJECTED nunca são selecionados/sobrescritos", async () => {
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([OLD_ALELO]);
    await regenerateSuggestions({ dryRun: false, status: ["PENDING_REVIEW", "BACKLOG", "APPROVED", "REJECTED"] });
    // the query must only ever ask for the regenerable statuses
    const where = db.waiterTrainingSuggestion.findMany.mock.calls[0]![0].where;
    expect(where.status.in.sort()).toEqual(["BACKLOG", "PENDING_REVIEW"]);
    expect(where.status.in).not.toContain("APPROVED");
    expect(where.status.in).not.toContain("REJECTED");
  });

  it("PII não vaza e runtimeTouched=false", async () => {
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([OLD_ALELO]);
    const r = await regenerateSuggestions({ dryRun: false });
    expect(r.runtimeTouched).toBe(false);
    const data = db.waiterTrainingSuggestion.update.mock.calls[0]![0].data;
    // excerpt já estava sanitizado; nada de telefone bruto entra
    expect(JSON.stringify(data)).not.toMatch(/\(\d{2}\)\s?\d{4,5}-?\d{4}/);
    // nenhuma mutação de runtime/order/conversation
    expect(Object.keys(db).sort()).toEqual(["restaurant", "waiterTrainingSuggestion"]);
  });

  it("pula sugestão sem excerpt (não consegue raciocinar sem a mensagem)", async () => {
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([{ ...OLD_ALELO, sanitizedCustomerExcerpt: null }]);
    const r = await regenerateSuggestions({ dryRun: false });
    expect(r.wouldRegenerate).toBe(0);
    expect(db.waiterTrainingSuggestion.update).not.toHaveBeenCalled();
  });
});
