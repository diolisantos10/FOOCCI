import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentImprovementProposal: { findMany: vi.fn(), update: vi.fn() },
  agentSimulationOpportunity: { findMany: vi.fn(), update: vi.fn() },
  waiterTrainingSuggestion: { findMany: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const store = vi.hoisted(() => ({ insertApprovedLearning: vi.fn() }));
vi.mock("@/services/waiterTraining/WaiterTrainingSuggestionStore", () => store);

import {
  listInbox,
  decideInbox,
  normalizeAgent,
  normalizeRisk,
  isCodePatchText,
  recordProposalLearningOnApproval,
} from "./approvalInbox";

beforeEach(() => {
  vi.clearAllMocks();
  db.agentImprovementProposal.findMany.mockResolvedValue([]);
  db.agentSimulationOpportunity.findMany.mockResolvedValue([]);
  db.waiterTrainingSuggestion.findMany.mockResolvedValue([]);
  db.agentImprovementProposal.update.mockResolvedValue({
    id: "p1", agentType: "WHATSAPP_ORDERING", title: "Prop", proposedPatchText: null, riskLevel: "LOW", reviewerNotes: null,
  });
  db.agentSimulationOpportunity.update.mockResolvedValue({
    id: "o1", agentSlug: "waiter", title: "Opp", recommendation: null, severity: "INFO",
  });
  db.waiterTrainingSuggestion.update.mockResolvedValue({});
  store.insertApprovedLearning.mockResolvedValue({ id: "learn_1" });
});

describe("normalizeAgent — one canonical key for the many identifiers", () => {
  it("classifies every agent vocabulary", () => {
    expect(normalizeAgent("WHATSAPP_ORDERING")).toBe("whatsapp");
    expect(normalizeAgent("WA_RECEPTIONIST")).toBe("whatsapp");
    expect(normalizeAgent("WA_WAITER")).toBe("waiter"); // waiter wins over the WA prefix
    expect(normalizeAgent("waiter")).toBe("waiter");
    expect(normalizeAgent("garcom")).toBe("waiter");
    expect(normalizeAgent("CRM")).toBe("crm");
    expect(normalizeAgent("ANALYTICS")).toBe("analytics");
    expect(normalizeAgent("")).toBe("outro");
    expect(normalizeAgent(null)).toBe("outro");
  });
});

describe("normalizeRisk — collapse to 3 levels", () => {
  it("maps P0/P1/P2/INFO/CRITICAL correctly", () => {
    expect(normalizeRisk("P0")).toBe("HIGH");
    expect(normalizeRisk("CRITICAL")).toBe("HIGH");
    expect(normalizeRisk("P1")).toBe("MEDIUM");
    expect(normalizeRisk("MEDIUM")).toBe("MEDIUM");
    expect(normalizeRisk("P2")).toBe("LOW");
    expect(normalizeRisk("INFO")).toBe("LOW");
    expect(normalizeRisk(null)).toBe("LOW");
  });
});

describe("listInbox — the unified queue", () => {
  it("aggregates + normalizes every source into one rich shape, newest first", async () => {
    db.agentImprovementProposal.findMany.mockResolvedValue([
      { id: "p1", agentType: "WHATSAPP_ORDERING", title: "Prop", problemSummary: "prob", rootCause: "causa raiz", proposedChangeType: "PROMPT_PATCH", proposedPatchText: "fix", expectedImpact: "menos erros", beforeScore: 60, afterScoreEstimate: 85, riskLevel: "HIGH", createdAt: new Date("2026-06-22T10:00:00Z") },
    ]);
    db.agentSimulationOpportunity.findMany.mockResolvedValue([
      { id: "o1", agentSlug: "waiter", title: "Opp", summary: "sum", recommendation: "rec", type: "MISSED_SALE", expectedImpact: "recupera venda", severity: "P1", createdAt: new Date("2026-06-22T12:00:00Z") },
    ]);
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([
      { id: "w1", agentSlug: "waiter", title: "Sug", problemDetected: "pd", situationSummary: "cliente pediu desconto", customerIntent: "quer economizar", idealResponse: "ofereça o combo", trainingRule: "tr", expectedImpact: "+ticket médio", suggestedActionType: "UPSELL_BEHAVIOR", sanitizedCustomerExcerpt: "tem desconto?", sanitizedWaiterExcerpt: "não", riskLevel: "LOW", createdAt: new Date("2026-06-22T11:00:00Z") },
    ]);

    const { items, countsByAgent, total } = await listInbox();
    expect(total).toBe(3);
    // newest first: opp(12h) → sug(11h) → prop(10h)
    expect(items.map((i) => i.id)).toEqual(["opportunity:o1", "waiter_suggestion:w1", "improvement:p1"]);

    // improvement: friendly change label + score-delta impact
    const prop = items.find((i) => i.id === "improvement:p1")!;
    expect(prop.agentKey).toBe("whatsapp");
    expect(prop.changeLabel).toBe("Ajuste de fala do agente");
    expect(prop.context).toBe("causa raiz");
    expect(prop.impact).toContain("60");
    expect(prop.impact).toContain("85");

    // waiter suggestion: real example (excerpts) + business-language change label
    const sug = items.find((i) => i.id === "waiter_suggestion:w1")!;
    expect(sug.example).toContain("Cliente:");
    expect(sug.example).toContain("Agente:");
    expect(sug.changeLabel).toBe("Venda extra (upsell)");
    expect(sug.context).toContain("cliente pediu desconto");
    expect(sug.impact).toBe("+ticket médio");
    expect(sug.recommendation).toBe("ofereça o combo");

    // per-agent counts power the "salas" filter
    expect(countsByAgent.whatsapp).toBe(1);
    expect(countsByAgent.waiter).toBe(2);
  });

  it("filters by agent", async () => {
    db.agentSimulationOpportunity.findMany.mockResolvedValue([
      { id: "o1", agentSlug: "waiter", title: "Opp", summary: "s", recommendation: "r", severity: "INFO", createdAt: new Date() },
    ]);
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([
      { id: "w1", agentSlug: "crm", title: "S", problemDetected: "p", idealResponse: "i", trainingRule: "t", riskLevel: "LOW", createdAt: new Date() },
    ]);
    const { items } = await listInbox("waiter");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("opportunity:o1");
  });

  it("one failing source never breaks the inbox", async () => {
    db.agentImprovementProposal.findMany.mockRejectedValue(new Error("db down"));
    db.waiterTrainingSuggestion.findMany.mockResolvedValue([
      { id: "w1", agentSlug: "waiter", title: "S", problemDetected: "p", idealResponse: "i", trainingRule: "t", riskLevel: "LOW", createdAt: new Date() },
    ]);
    const { total } = await listInbox();
    expect(total).toBe(1); // survived the failure
  });
});

describe("decideInbox — routes the decision to the right table", () => {
  it("approve/reject hit the correct producer with the correct status", async () => {
    await decideInbox("improvement:p1", "APPROVE");
    expect(db.agentImprovementProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ status: "APPROVED" }) }),
    );

    await decideInbox("opportunity:o1", "REJECT");
    expect(db.agentSimulationOpportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, data: expect.objectContaining({ status: "REJECTED" }) }),
    );

    await decideInbox("waiter_suggestion:w1", "APPROVE");
    expect(db.waiterTrainingSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "w1" }, data: expect.objectContaining({ status: "APPROVED" }) }),
    );
  });

  it("rejects an invalid composite id", async () => {
    await expect(decideInbox("nope", "APPROVE")).rejects.toThrow();
    await expect(decideInbox("badsource:x", "APPROVE")).rejects.toThrow();
  });
});
