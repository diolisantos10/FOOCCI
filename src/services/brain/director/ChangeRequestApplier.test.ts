import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainEngineRouting: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  brainFreeFormConfig: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const repo = vi.hoisted(() => ({ findChangeRequest: vi.fn() }));
vi.mock("./BrainDirectorRepository", () => repo);

const director = vi.hoisted(() => ({ markApplied: vi.fn() }));
vi.mock("./PersistentBrainDirectorService", () => director);

import { applyChangeRequest } from "./ChangeRequestApplier";

function approvedCR(over: Record<string, unknown> = {}) {
  return {
    id: "cr_1",
    status: "APPROVED",
    target: "AI_ENGINE_ROUTING",
    requiresQualityGate: false,
    proposedChange: { agentId: "crm", provider: "CLAUDE", taskProfile: "GENERATE" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findChangeRequest.mockResolvedValue(approvedCR());
  director.markApplied.mockResolvedValue({});
  db.brainEngineRouting.findFirst.mockResolvedValue(null);
  db.brainEngineRouting.create.mockResolvedValue({});
  db.brainEngineRouting.update.mockResolvedValue({});
  db.brainFreeFormConfig.findUnique.mockResolvedValue(null);
  db.brainFreeFormConfig.upsert.mockResolvedValue({});
});

describe("ChangeRequestApplier — aprovar passou a APLICAR (com gate no apply)", () => {
  it("agente/sistema NUNCA aplicam — só humano identificado", async () => {
    for (const who of ["agent", "SYSTEM", "bot", "ai", " "]) {
      const r = await applyChangeRequest({ id: "cr_1", appliedBy: who });
      expect(r.success).toBe(false);
    }
    expect(db.brainEngineRouting.create).not.toHaveBeenCalled();
    expect(db.brainEngineRouting.update).not.toHaveBeenCalled();
  });

  it("só APPROVED pode ser aplicado", async () => {
    repo.findChangeRequest.mockResolvedValue(approvedCR({ status: "PENDING_APPROVAL" }));
    const r = await applyChangeRequest({ id: "cr_1", appliedBy: "diego" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/APPROVED/);
  });

  it("AI_ENGINE_ROUTING aplicado: grava a linha de roteamento + markApplied (troca de piloto governada)", async () => {
    const r = await applyChangeRequest({ id: "cr_1", appliedBy: "diego" });
    expect(r.success).toBe(true);
    expect(db.brainEngineRouting.create).toHaveBeenCalledTimes(1);
    const args = db.brainEngineRouting.create.mock.calls[0][0];
    expect(args.data).toMatchObject({ agentId: "crm", provider: "CLAUDE", taskProfile: "GENERATE", appliedFromChangeRequestId: "cr_1" });
    expect(director.markApplied).toHaveBeenCalledWith("cr_1", "diego");
  });

  it("gate exigido REPROVADO no apply → nada é aplicado", async () => {
    // agentId sem gate registrado → runGateForBrain reprova por construção
    repo.findChangeRequest.mockResolvedValue(
      approvedCR({ requiresQualityGate: true, proposedChange: { agentId: "agente-sem-gate", provider: "CLAUDE" } }),
    );
    const r = await applyChangeRequest({ id: "cr_1", appliedBy: "diego" });
    expect(r.success).toBe(false);
    expect(r.gate?.passed).toBe(false);
    expect(db.brainEngineRouting.create).not.toHaveBeenCalled();
    expect(db.brainEngineRouting.update).not.toHaveBeenCalled();
    expect(director.markApplied).not.toHaveBeenCalled();
  });

  it("AGENT_POLICY freeForm aplicado grava o modo + trilha do CR", async () => {
    repo.findChangeRequest.mockResolvedValue(
      approvedCR({ target: "AGENT_POLICY", proposedChange: { freeForm: { restaurantId: "r1", mode: "SHADOW_ONLY" } } }),
    );
    const r = await applyChangeRequest({ id: "cr_1", appliedBy: "diego" });
    expect(r.success).toBe(true);
    expect(db.brainFreeFormConfig.upsert).toHaveBeenCalledTimes(1);
  });

  it("target sem executor é recusado explicitamente (sem caminho mágico)", async () => {
    repo.findChangeRequest.mockResolvedValue(approvedCR({ target: "KNOWLEDGE_SCHEMA", proposedChange: {} }));
    const r = await applyChangeRequest({ id: "cr_1", appliedBy: "diego" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não tem executor/);
  });
});
