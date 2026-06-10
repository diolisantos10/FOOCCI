import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentSimulationExample: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  waiterTrainingSuggestion: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { intakeRealConversations, getIntakeStatus, nextIntakeEstimate } from "./realConversationIntake";
import type { FetchConversations } from "./SimulationExampleExtractor";

const CONV = {
  id: "conv-1",
  channel: "CARDAPIO",
  restaurantId: "r1",
  messages: [
    { senderType: "CUSTOMER", direction: "INBOUND", content: "Oi, meu telefone é (11) 98888-7777 e meu email é joao@x.com, tô com muita fome" },
    { senderType: "AI", direction: "OUTBOUND", content: "Te mostro opções que sustentam bem!" },
  ],
};
const fetchOne: FetchConversations = async () => [CONV];

beforeEach(() => {
  vi.clearAllMocks();
  db.agentSimulationExample.findMany.mockResolvedValue([]); // nothing extracted yet
  db.agentSimulationExample.create.mockResolvedValue({ id: "ex1" });
  db.waiterTrainingSuggestion.findMany.mockResolvedValue([]);
  db.waiterTrainingSuggestion.create.mockResolvedValue({ id: "s1" });
});

describe("intakeRealConversations — coleta automática de casos reais", () => {
  it("(1) sanitiza a conversa ANTES de persistir e (2) nunca salva transcript bruto", async () => {
    await intakeRealConversations({}, { fetch: fetchOne });
    expect(db.agentSimulationExample.create).toHaveBeenCalledOnce();
    const data = db.agentSimulationExample.create.mock.calls[0]![0].data;
    expect(data.sanitizedTranscript).not.toContain("98888");
    expect(data.sanitizedTranscript).not.toContain("joao@x.com");
    expect(data.sanitizedTranscript).toContain("[telefone]");
    expect(data.sanitizedTranscript).toContain("[email]");
    // nenhum campo guarda o texto bruto
    expect(JSON.stringify(data)).not.toContain("joao@x.com");
  });

  it("(3) cria o caso como PENDING_REVIEW com origem REAL_CONVERSATION", async () => {
    await intakeRealConversations({}, { fetch: fetchOne });
    const data = db.agentSimulationExample.create.mock.calls[0]![0].data;
    expect(data.status).toBe("PENDING_REVIEW");
    expect(data.isApprovedForSimulation).toBe(false);
    expect(data.sourceType).toBe("REAL_CONVERSATION");
    expect(data.sourceId).toBe("conv-1");
  });

  it("(4) é idempotente — conversa já coletada não duplica", async () => {
    db.agentSimulationExample.findMany.mockResolvedValue([{ sourceId: "conv-1" }]);
    const r = await intakeRealConversations({}, { fetch: fetchOne });
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
    expect(db.agentSimulationExample.create).not.toHaveBeenCalled();
  });

  it("(5) declara runtimeTouched=false e informa próxima coleta", async () => {
    const r = await intakeRealConversations({}, { fetch: fetchOne });
    expect(r.runtimeTouched).toBe(false);
    expect(r.nextIntakeEstimate).toBeTruthy();
    expect(new Date(r.nextIntakeEstimate).getUTCHours()).toBe(6);
  });

  it("classifica a situação do cliente (fome → HUNGRY_BIG)", async () => {
    await intakeRealConversations({}, { fetch: fetchOne });
    const data = db.agentSimulationExample.create.mock.calls[0]![0].data;
    expect(data.scenarioType).toBe("HUNGRY_BIG");
  });
});

describe("getIntakeStatus", () => {
  it("retorna última coleta + coletados hoje", async () => {
    const when = new Date("2026-06-10T06:20:00Z");
    db.agentSimulationExample.findFirst.mockResolvedValue({ createdAt: when });
    db.agentSimulationExample.count.mockResolvedValue(3);
    const s = await getIntakeStatus();
    expect(s.lastIntakeAt).toBe(when.toISOString());
    expect(s.collectedToday).toBe(3);
  });
});

describe("nextIntakeEstimate", () => {
  it("aponta para o próximo 06:15 UTC", () => {
    expect(nextIntakeEstimate(new Date("2026-06-10T05:00:00Z"))).toBe("2026-06-10T06:15:00.000Z");
    expect(nextIntakeEstimate(new Date("2026-06-10T07:00:00Z"))).toBe("2026-06-11T06:15:00.000Z");
  });
});
