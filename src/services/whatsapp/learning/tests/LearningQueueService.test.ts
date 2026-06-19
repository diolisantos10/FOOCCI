/**
 * WhatsAppLearningQueueService — approve/reject/backlog ONLY changes the
 * learning's status + review metadata. It must never call the live agent,
 * config, prompt, or any production-mutating surface.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const updateMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    waiterTrainingSuggestion: {
      findFirst: (...a: unknown[]) => findFirstMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
      findMany: vi.fn(),
    },
  },
}));

import { decideLearning } from "../WhatsAppLearningQueueService";

const ROW = {
  id: "l1", status: "APPROVED", title: "t", situationSummary: "s", customerIntent: "ci",
  whatHappened: "wh", problemDetected: "pd", idealResponse: "ir", trainingRule: "tr",
  expectedImpact: "ei", suggestedActionType: "APROVAR_TREINAMENTO", riskLevel: "HIGH",
  technicalDetails: { occurrences: 3 }, createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  updateMock.mockReset();
  findFirstMock.mockReset();
});

describe("decideLearning", () => {
  it("aprovar muda status para APPROVED e grava revisor", async () => {
    findFirstMock.mockResolvedValue({ id: "l1" });
    updateMock.mockResolvedValue({ ...ROW, status: "APPROVED" });

    const view = await decideLearning("l1", "APPROVE", "diego");
    expect(view?.status).toBe("APPROVED");
    const arg = updateMock.mock.calls[0][0];
    expect(arg.data.status).toBe("APPROVED");
    expect(arg.data.reviewedBy).toBe("diego");
    // (11) Only status/review metadata is written — no agent/config/prompt fields.
    expect(Object.keys(arg.data).sort()).toEqual(["reviewedAt", "reviewedBy", "status"]);
  });

  it("rejeitar → REJECTED", async () => {
    findFirstMock.mockResolvedValue({ id: "l1" });
    updateMock.mockResolvedValue({ ...ROW, status: "REJECTED" });
    const view = await decideLearning("l1", "REJECT");
    expect(view?.status).toBe("REJECTED");
  });

  it("guardar para depois → BACKLOG", async () => {
    findFirstMock.mockResolvedValue({ id: "l1" });
    updateMock.mockResolvedValue({ ...ROW, status: "BACKLOG" });
    const view = await decideLearning("l1", "BACKLOG");
    expect(view?.status).toBe("BACKLOG");
  });

  it("aprendizado inexistente → null (não grava)", async () => {
    findFirstMock.mockResolvedValue(null);
    const view = await decideLearning("nope", "APPROVE");
    expect(view).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
