import { describe, it, expect, beforeEach, vi } from "vitest";

const store = vi.hoisted(() => ({ listApprovedLearnings: vi.fn() }));
vi.mock("@/services/waiterTraining/WaiterTrainingSuggestionStore", () => store);

import { listApprovedLearningsForBrain } from "./BrainTrainingContract";

beforeEach(() => {
  vi.clearAllMocks();
  store.listApprovedLearnings.mockResolvedValue([]);
});

describe("BrainTrainingContract — o pool aprovado chega ao agente CERTO", () => {
  it("REGRESSÃO SLUG: 'whatsapp' também busca 'whatsapp-receptionist' (o aprendizado ao vivo)", async () => {
    store.listApprovedLearnings.mockImplementation((slug: string) =>
      Promise.resolve(
        slug === "whatsapp-receptionist"
          ? [{ id: "s1", title: "Rodízio", trainingRule: "Sempre confirmar rodízio na base", suggestedActionType: "RULE", riskLevel: "LOW", sourceType: "REAL_CONVERSATION" }]
          : [],
      ),
    );
    const learnings = await listApprovedLearningsForBrain("whatsapp");
    const slugsQueried = store.listApprovedLearnings.mock.calls.map((c) => c[0]);
    expect(slugsQueried).toContain("whatsapp");
    expect(slugsQueried).toContain("whatsapp-receptionist");
    expect(learnings).toHaveLength(1);
    expect(learnings[0]!.trainingRule).toMatch(/rodízio/i);
  });

  it("waiter continua consultando só o próprio slug", async () => {
    await listApprovedLearningsForBrain("waiter");
    expect(store.listApprovedLearnings.mock.calls.map((c) => c[0])).toEqual(["waiter"]);
  });
});
