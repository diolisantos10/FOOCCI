import { describe, it, expect, beforeEach, vi } from "vitest";

const reasonAsAgent = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/services/brain/reasoning/BrainReasoner", () => ({ reasonAsAgent }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { reasonSupportIncident } from "./SupportIncidentReasoner";

const NOW = new Date("2026-07-24T23:00:00Z");

function llmOutcome(text: string) {
  return {
    reasoningMode: "LLM",
    result: { idealResponse: text, coherenceCheck: { verdict: "PASS" }, confidence: 0.8 },
    snapshot: { truthSources: {} },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.DATABASE_URL = "postgres://x";
  process.env.ENCRYPTION_KEY = "k";
  process.env.NEXTAUTH_SECRET = "s";
  process.env.MP_WEBHOOK_SECRET = "m";
});

describe("SupportIncidentReasoner — diagnostica, explica, escala (shadow-safe)", () => {
  it("incidente de WhatsApp: classifica INCIDENT, aponta subsistema e NUNCA executa", async () => {
    reasonAsAgent.mockResolvedValue(llmOutcome("A integração está conectada, mas os webhooks de entrada pararam. Vou propor reprocessar a fila."));
    const d = await reasonSupportIncident({ restaurantId: "r1", report: "os pedidos pararam de chegar no whatsapp", now: NOW });

    expect(d.ok).toBe(true);
    expect(d.classification).toBe("INCIDENT");
    expect(d.suspectedSubsystem).toBe("whatsapp_meta");
    expect(d.executed).toBe(false);       // invariante
    expect(d.canExecuteNow).toBe(false);  // sombra
    expect(d.escalate).toBe(true);
    expect(d.explanation).toContain("webhooks");
    expect(d.runbook.length).toBeGreaterThan(0);
  });

  it("pedido destrutivo não vira ação: sem ação candidata, escala", async () => {
    reasonAsAgent.mockResolvedValue(llmOutcome("Não posso apagar pedidos — isso está fora do que eu executo. Posso abrir um chamado."));
    const d = await reasonSupportIncident({ restaurantId: "r1", report: "apaga todos os pedidos de teste do banco", now: NOW });

    expect(d.proposedActionKey).toBeNull();
    expect(d.canExecuteNow).toBe(false);
    expect(d.executed).toBe(false);
  });

  it("IA indisponível: cai na explicação determinística, nunca fica mudo", async () => {
    reasonAsAgent.mockRejectedValue(new Error("engine down"));
    const d = await reasonSupportIncident({ restaurantId: "r1", report: "o whatsapp parou de receber mensagens", now: NOW });

    expect(d.ok).toBe(true);
    expect(d.explanation.length).toBeGreaterThan(0);
    expect(d.executed).toBe(false);
    expect(d.note).toMatch(/IA indisponível/i);
  });

  it("relato vazio pede mais informação", async () => {
    const d = await reasonSupportIncident({ restaurantId: "r1", report: "  ", now: NOW });
    expect(d.classification).toBe("NEEDS_MORE_INFO");
    expect(reasonAsAgent).not.toHaveBeenCalled();
  });

  it("usa o agentId 'suporte-tecnico' no portão do Brain", async () => {
    reasonAsAgent.mockResolvedValue(llmOutcome("ok"));
    await reasonSupportIncident({ restaurantId: "r1", report: "o whatsapp caiu", now: NOW });
    expect(reasonAsAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: "suporte-tecnico" }));
  });
});
