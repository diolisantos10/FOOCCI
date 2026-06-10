import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  waiterResultEvidence: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
    update: vi.fn(),
  },
  conversation: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { createEvidence, reviewEvidence, computeIncrementalValue } from "./WaiterEvidenceService";
import { collectEvidence, type FetchConversationsForEvidence } from "./WaiterEvidenceCollector";

beforeEach(() => {
  vi.clearAllMocks();
  db.waiterResultEvidence.create.mockImplementation(async (args: { data: unknown }) => ({ id: "ev1", ...(args.data as object) }));
  db.waiterResultEvidence.findMany.mockResolvedValue([]);
  db.waiterResultEvidence.update.mockResolvedValue({ id: "ev1", status: "APPROVED" });
});

describe("WaiterEvidenceService — Provas de Resultado", () => {
  it("(1) cria evidência manual como DRAFT (revisão humana obrigatória)", async () => {
    await createEvidence({
      restaurantId: "r1", sourceType: "MANUAL_NOTE", title: "Upsell de sobremesa",
      summary: "Waiter sugeriu sobremesa e cliente aceitou.", evidenceType: "UPSELL",
    });
    const data = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.isPublicCandidate).toBe(false);
  });

  it("(2/5) sanitiza o excerpt ANTES de persistir — PII não vaza", async () => {
    await createEvidence({
      restaurantId: "r1", sourceType: "CONVERSATION", sourceId: "c1",
      title: "Elogio", summary: "Cliente elogiou.", evidenceType: "QUALITATIVE_PROOF",
      excerpt: "Obrigado! Sou o João Silva, meu telefone é (11) 97777-1234 e email joao@exemplo.com",
    });
    const data = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(data.sanitizedExcerpt).not.toContain("97777");
    expect(data.sanitizedExcerpt).not.toContain("joao@exemplo.com");
    expect(data.sanitizedExcerpt).toContain("[telefone]");
    expect(data.sanitizedExcerpt).toContain("[email]");
  });

  it("(3) revisão humana: APPROVED / REJECTED / BACKLOG", async () => {
    await reviewEvidence("ev1", "APPROVED", "diego");
    expect(db.waiterResultEvidence.update).toHaveBeenCalledWith({
      where: { id: "ev1" },
      data: expect.objectContaining({ status: "APPROVED", reviewedBy: "diego" }),
    });
    await reviewEvidence("ev1", "BACKLOG");
    expect(db.waiterResultEvidence.update).toHaveBeenLastCalledWith({
      where: { id: "ev1" },
      data: expect.objectContaining({ status: "BACKLOG" }),
    });
  });

  it("(4) upsell calcula incrementalValue quando antes/depois existem — e nunca inventa", async () => {
    expect(computeIncrementalValue(40, 55.5)).toBe(15.5);
    expect(computeIncrementalValue(null, 55.5)).toBeNull();
    expect(computeIncrementalValue(40, undefined)).toBeNull();
    await createEvidence({
      restaurantId: "r1", sourceType: "ORDER", title: "t", summary: "s",
      evidenceType: "UPSELL", valueBefore: 40, valueAfter: 55.5,
    });
    const data = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(data.incrementalValue).toBe(15.5);
  });
});

describe("WaiterEvidenceCollector — detecção inicial", () => {
  const CONV = {
    id: "conv-9",
    restaurantId: "r1",
    messages: [
      { senderType: "CUSTOMER", direction: "INBOUND", content: "Muito bom o atendimento, obrigado! Meu CPF é 123.456.789-00" },
      { senderType: "AI", direction: "OUTBOUND", content: "Obrigado você!" },
    ],
  };
  const fetchOne: FetchConversationsForEvidence = async () => [CONV];

  it("detecta elogio, sanitiza o trecho e cria DRAFT (6: não altera a conversa original)", async () => {
    const r = await collectEvidence({}, { fetch: fetchOne });
    expect(r.created).toBe(1);
    expect(r.byType.QUALITATIVE_PROOF).toBe(1);
    expect(r.runtimeTouched).toBe(false);
    const data = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.sanitizedExcerpt).not.toContain("123.456.789-00");
    expect(data.sanitizedExcerpt).toContain("[cpf]");
    // read-only: nenhuma mutação em conversation
    expect(Object.keys(db.conversation)).toEqual(["findMany"]);
  });

  it("é idempotente por (sourceId, evidenceType)", async () => {
    db.waiterResultEvidence.findMany.mockResolvedValue([{ sourceId: "conv-9", evidenceType: "QUALITATIVE_PROOF" }]);
    const r = await collectEvidence({}, { fetch: fetchOne });
    expect(r.created).toBe(0);
    expect(r.skipped).toBeGreaterThan(0);
    expect(db.waiterResultEvidence.create).not.toHaveBeenCalled();
  });
});
