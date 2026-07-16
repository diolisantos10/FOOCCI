import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  message: { findMany: vi.fn(), findFirst: vi.fn() },
  restaurantExperience: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Sanitizador real seria pesado de mockar; usamos um stub que marca que passou.
vi.mock("@/services/simulation/simulationSanitizer", () => ({
  sanitizeText: (s: string) => s.replace(/\d{4,}/g, "***").replace(/Diego/gi, "***"),
}));

import { ingestExperiences } from "./ExperienceVaultService";

function agentMsg(over: Record<string, unknown> = {}) {
  return {
    conversationId: "c1",
    content: "Sim, temos rodízio por R$119.",
    sentAt: new Date("2026-07-15T20:00:00Z"),
    metadata: { source: "WHATSAPP_BRAIN", brainIntent: "DÚVIDA" },
    conversation: { restaurantId: "r1", channel: "WHATSAPP" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.message.findMany.mockResolvedValue([agentMsg()]);
  db.message.findFirst.mockResolvedValue({ content: "tem rodízio? meu zap é 11940595223" });
  db.restaurantExperience.create.mockResolvedValue({});
});

describe("ExperienceVaultService — o cofre de experiências", () => {
  it("grava uma experiência sanitizada (sem PII) por resposta de agente", async () => {
    const r = await ingestExperiences({});
    expect(r.created).toBe(1);
    expect(db.restaurantExperience.create).toHaveBeenCalledTimes(1);
    const data = db.restaurantExperience.create.mock.calls[0][0].data;
    expect(data.restaurantId).toBe("r1");
    expect(data.agentId).toBe("whatsapp"); // WHATSAPP + metadata brain
    expect(data.intent).toBe("DÚVIDA");
    expect(data.outcome).toBe("REPLIED");
    // PII do cliente mascarada (o número virou ***)
    expect(data.customerText).not.toMatch(/11940595223/);
    expect(data.customerText).toContain("***");
    expect(Array.isArray(data.tags)).toBe(true);
  });

  it("deriva o agente pelo canal: WEB_AGENT → waiter", async () => {
    db.message.findMany.mockResolvedValue([
      agentMsg({ metadata: {}, conversation: { restaurantId: "r1", channel: "WEB_AGENT" } }),
    ]);
    const r = await ingestExperiences({});
    expect(db.restaurantExperience.create.mock.calls[0][0].data.agentId).toBe("waiter");
    expect(r.byAgent.waiter).toBe(1);
  });

  it("WHATSAPP sem metadata do brain → receptionist", async () => {
    db.message.findMany.mockResolvedValue([
      agentMsg({ metadata: {}, conversation: { restaurantId: "r1", channel: "WHATSAPP" } }),
    ]);
    await ingestExperiences({});
    expect(db.restaurantExperience.create.mock.calls[0][0].data.agentId).toBe("receptionist");
  });

  it("idempotente: violação de unique (dedup) vira skip, não quebra o lote", async () => {
    db.restaurantExperience.create.mockRejectedValueOnce(new Error("unique constraint"));
    const r = await ingestExperiences({});
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it("pula quando não há pergunta de cliente (trigger vazio)", async () => {
    db.message.findFirst.mockResolvedValue(null);
    const r = await ingestExperiences({});
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
    expect(db.restaurantExperience.create).not.toHaveBeenCalled();
  });
});
