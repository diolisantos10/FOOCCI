import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainChangeRequest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  createChangeRequest,
  reviewChangeRequest,
  approve,
  reject,
  backlog,
  markApplied,
  getRiskSummary,
} from "./PersistentBrainDirectorService";

beforeEach(() => {
  vi.clearAllMocks();
  db.brainChangeRequest.create.mockImplementation(async (args: { data: unknown }) => ({ id: "bcr1", ...(args.data as object) }));
  db.brainChangeRequest.update.mockImplementation(async (args: { where: { id: string }; data: unknown }) => ({ id: args.where.id, ...(args.data as object) }));
  db.brainChangeRequest.findUnique.mockResolvedValue({ id: "bcr1", status: "PENDING_APPROVAL" });
  db.brainChangeRequest.findMany.mockResolvedValue([]);
  db.brainChangeRequest.count.mockResolvedValue(0);
});

describe("PersistentBrainDirectorService", () => {
  it("(1) createChangeRequest persiste via prisma e (2) AGENT nunca nasce aprovado", async () => {
    const req = await createChangeRequest({
      requestedByType: "AGENT", target: "REASONING_RULE", summary: "Nova regra", rationale: "Casos reais",
    });
    expect(db.brainChangeRequest.create).toHaveBeenCalledOnce();
    expect(req.status).toBe("PENDING_APPROVAL");
    expect(req.riskLevel).not.toBe(undefined);
    // agente nunca produz risco LOW estrutural
    const data = db.brainChangeRequest.create.mock.calls[0]![0].data;
    expect(["MEDIUM", "HIGH", "CRITICAL"]).toContain(data.riskLevel);
  });

  it("(3) runtimeImpact PRODUCTION força CRITICAL + Quality Gate", async () => {
    await createChangeRequest({
      requestedByType: "CEO", target: "AGENT_POLICY", summary: "x", rationale: "y", runtimeImpact: "PRODUCTION",
    });
    const data = db.brainChangeRequest.create.mock.calls[0]![0].data;
    expect(data.riskLevel).toBe("CRITICAL");
    expect(data.requiresQualityGate).toBe(true);
  });

  it("(4) decisão exige humano — AGENT/SYSTEM são recusados", async () => {
    await expect(reviewChangeRequest({ id: "bcr1", action: "APPROVED", reviewedBy: "AGENT" })).rejects.toThrow(/humano/i);
    await expect(reviewChangeRequest({ id: "bcr1", action: "APPROVED", reviewedBy: "system" })).rejects.toThrow(/humano/i);
    await expect(reviewChangeRequest({ id: "bcr1", action: "APPROVED", reviewedBy: "" })).rejects.toThrow(/humano/i);
  });

  it("(5) approve só muda status — não aplica nada (nenhuma outra tabela tocada)", async () => {
    const r = await approve("bcr1", "diego", "ok");
    expect(r.status).toBe("APPROVED");
    const data = db.brainChangeRequest.update.mock.calls[0]![0].data;
    expect(data.status).toBe("APPROVED");
    expect(data.reviewedBy).toBe("diego");
    expect(data.reviewedAt).toBeInstanceOf(Date);
    // só a tabela de change requests é tocada — aplicar é outro fluxo
    expect(Object.keys(db)).toEqual(["brainChangeRequest"]);
  });

  it("(6/7) reject e backlog gravam motivo + revisor", async () => {
    await reject("bcr1", "diego", "fora de escopo");
    expect(db.brainChangeRequest.update.mock.calls[0]![0].data).toMatchObject({
      status: "REJECTED", reviewedBy: "diego", decisionReason: "fora de escopo",
    });
    db.brainChangeRequest.findUnique.mockResolvedValue({ id: "bcr2", status: "PENDING_APPROVAL" });
    await backlog("bcr2", "diego", "depois");
    expect(db.brainChangeRequest.update.mock.calls[1]![0].data).toMatchObject({
      status: "BACKLOG", decisionReason: "depois",
    });
  });

  it("(8) getRiskSummary retorna pending/highRisk/productionImpact + runtimeTouched=false", async () => {
    db.brainChangeRequest.count
      .mockResolvedValueOnce(5)  // pending
      .mockResolvedValueOnce(2)  // high risk
      .mockResolvedValueOnce(1)  // production impact
      .mockResolvedValueOnce(9); // decided
    const s = await getRiskSummary();
    expect(s).toMatchObject({ pendingCount: 5, highRiskCount: 2, productionImpactCount: 1, decidedCount: 9, runtimeTouched: false });
  });

  it("não decide duas vezes; markApplied exige APPROVED", async () => {
    db.brainChangeRequest.findUnique.mockResolvedValue({ id: "bcr1", status: "APPROVED" });
    await expect(reviewChangeRequest({ id: "bcr1", action: "REJECTED", reviewedBy: "diego" })).rejects.toThrow(/já decidido/i);
    const applied = await markApplied("bcr1", "diego");
    expect(applied.status).toBe("APPLIED");
    db.brainChangeRequest.findUnique.mockResolvedValue({ id: "bcr1", status: "PENDING_APPROVAL" });
    await expect(markApplied("bcr1", "diego")).rejects.toThrow(/APPROVED/);
  });

  it("valida requestedByType/target e exige summary/rationale", async () => {
    await expect(createChangeRequest({ requestedByType: "HACKER" as never, target: "REASONING_RULE", summary: "x", rationale: "y" })).rejects.toThrow(/inválido/);
    await expect(createChangeRequest({ requestedByType: "CEO", target: "X" as never, summary: "x", rationale: "y" })).rejects.toThrow(/inválido/);
    await expect(createChangeRequest({ requestedByType: "CEO", target: "KNOWLEDGE_BASE", summary: " ", rationale: "y" })).rejects.toThrow(/obrigat/);
  });
});
