/**
 * A esteira: as duas metades.
 *
 * METADE 1 — ela GRAVA amostra quando deve, na trilha que a régua já lê.
 * METADE 2 — ela NÃO contamina a contagem de produção e NÃO entrega mensagem a
 *            ninguém: toda linha sai com sampleOrigin TRAINING, o destinatário é
 *            uma chave de caso, e o resultado carrega messagesSent = 0.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  customer: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  orderItem: { groupBy: vi.fn() },
  campaign: { findFirst: vi.fn() },
  menuItem: { findMany: vi.fn() },
  tierSettings: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const reasoner = vi.hoisted(() => ({ reasonCrmMessageForSnapshot: vi.fn() }));
vi.mock("@/services/crm/CrmAgentReasoner", () => reasoner);

const evidence = vi.hoisted(() => ({ recordShadowOutcome: vi.fn() }));
vi.mock("@/services/brain/runtime/BrainShadowEvidenceService", () => evidence);

const segments = vi.hoisted(() => ({
  getSegmentConfig: vi.fn(async () => ({ quenteMaxDays: 30, mornoMaxDays: 60, frioMaxDays: 120 })),
}));
vi.mock("@/lib/crm-segments", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, ...segments };
});

import { runCrmShadowTraining, montarLote } from "./CrmShadowTrainingService";
import { SYNTHETIC_RECIPIENT } from "./CrmTrainingCases";

function clienteReal(over: Record<string, unknown> = {}) {
  return {
    id: "cust_real_1",
    totalOrders: 6,
    totalSpend: 480,
    averageTicket: 80,
    lastOrderAt: new Date("2026-03-01T00:00:00Z"), // >120 dias
    importedLastOrderAt: null,
    importedOrderCount: null,
    importedTotalSpent: null,
    hasOptedOut: false,
    crmContactable: true,
    contactStatus: "CONTACTABLE",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.customer.groupBy.mockResolvedValue([{ restaurantId: "r1", _count: { _all: 4440 } }]);
  db.customer.count.mockResolvedValue(4440);
  db.customer.findMany.mockResolvedValue([clienteReal(), clienteReal({ id: "cust_real_2" })]);
  db.orderItem.groupBy.mockResolvedValue([]);
  db.campaign.findFirst.mockResolvedValue(null);
  db.menuItem.findMany.mockResolvedValue([{ name: "Pizza Calabresa" }]);
  db.tierSettings.findUnique.mockResolvedValue(null);
  evidence.recordShadowOutcome.mockResolvedValue(undefined);
  reasoner.reasonCrmMessageForSnapshot.mockResolvedValue({
    ok: true,
    message: "Oi! Que tal pedir sua Pizza Calabresa hoje?",
    passedCritic: true,
    reasoningMode: "LLM",
    coherence: "PASS",
    confidence: 0.82,
    shouldEscalate: false,
    sent: false,
  });
});

describe("runCrmShadowTraining — METADE 1: gera amostra quando deve", () => {
  it("compõe, julga e grava uma amostra por caso do lote", async () => {
    const r = await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 10 });
    expect(r.totalCases).toBeGreaterThan(0);
    expect(r.totalRecorded).toBe(r.totalCases);
    expect(evidence.recordShadowOutcome).toHaveBeenCalledTimes(r.totalCases);
    expect(r.restaurants[0]!.errors).toBe(0);
  });

  it("o lote mistura perfil real e adversarial — a régua precisa ver os dois", async () => {
    const lote = await montarLote("r1", 10, new Date("2026-08-05T12:00:00Z"));
    expect(lote.perfisReais).toBeGreaterThan(0);
    expect(lote.adversariais).toBeGreaterThan(0);
    expect(lote.casos.length).toBe(lote.perfisReais + lote.adversariais);
  });

  it("base vazia ainda produz os casos adversariais — esteira não pode zerar em silêncio", async () => {
    db.customer.count.mockResolvedValue(0);
    db.customer.findMany.mockResolvedValue([]);
    const lote = await montarLote("r1", 10, new Date("2026-08-05T12:00:00Z"));
    expect(lote.perfisReais).toBe(0);
    expect(lote.adversariais).toBeGreaterThan(0);
    expect(lote.note).toContain("perfis reais");
  });

  it("passa pelo MESMO caminho do agente de produção (reasonCrmMessageForSnapshot)", async () => {
    await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 4 });
    expect(reasoner.reasonCrmMessageForSnapshot).toHaveBeenCalled();
    const [restaurantId, snapshot] = reasoner.reasonCrmMessageForSnapshot.mock.calls[0]!;
    expect(restaurantId).toBe("r1");
    expect(snapshot.id).toMatch(/^treino:/);
  });

  it("o veredito do portão vai para o campo que a régua lê (coherence), rebaixado quando o caso reprova", async () => {
    reasoner.reasonCrmMessageForSnapshot.mockResolvedValue({
      ok: true,
      // mentira sobre o mundo para um perfil sem cupom: prometeu desconto
      message: "Oi! Tenho um cupom de 30% de desconto só pra você!",
      passedCritic: true,
      reasoningMode: "LLM",
      coherence: "PASS", // o crítico do Brain passou…
      confidence: 0.9,
      shouldEscalate: false,
      sent: false,
    });
    const r = await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 4 });
    expect(r.byVerdict.FAIL).toBeGreaterThan(0); // …e o portão do caso rebaixou
    const gravado = evidence.recordShadowOutcome.mock.calls[0]![0];
    expect(gravado.coherence).toBe("FAIL");
    expect(gravado.wouldReply).toContain("DESCONTO"); // o alerta carrega a evidência
  });

  it("erro num caso não derruba o lote — e é CONTADO", async () => {
    reasoner.reasonCrmMessageForSnapshot
      .mockRejectedValueOnce(new Error("motor caiu"))
      .mockResolvedValue({ ok: true, message: "Oi!", passedCritic: true, reasoningMode: "LLM", coherence: "PASS", confidence: 0.7, shouldEscalate: false, sent: false });
    const r = await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 4 });
    expect(r.restaurants[0]!.errors).toBe(1);
    expect(r.totalRecorded).toBe(r.totalCases - 1);
  });
});

describe("runCrmShadowTraining — METADE 2: não contamina produção, não envia nada", () => {
  it("TODA amostra sai com sampleOrigin TRAINING — nenhuma se passa por produção", async () => {
    await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 8 });
    expect(evidence.recordShadowOutcome).toHaveBeenCalled();
    for (const [rec] of evidence.recordShadowOutcome.mock.calls) {
      expect(rec.sampleOrigin).toBe("TRAINING");
      expect(rec.agentId).toBe("crm");
    }
  });

  it("o destinatário gravado é a chave do caso, nunca um telefone", async () => {
    await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 8 });
    for (const [rec] of evidence.recordShadowOutcome.mock.calls) {
      expect(rec.conversationId).toMatch(/^crm-treino:/);
      expect(rec.conversationId).not.toMatch(/\d{8,}/); // nada que pareça telefone
      expect(rec.intent).toMatch(/^treino:/);
    }
  });

  it("o snapshot enviado ao agente nunca carrega telefone discável", async () => {
    await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 8 });
    for (const [, snapshot] of reasoner.reasonCrmMessageForSnapshot.mock.calls) {
      if (snapshot.phone !== null) expect(snapshot.phone).toBe(SYNTHETIC_RECIPIENT);
    }
  });

  it("a leitura do cadastro não pede nome nem telefone ao banco", async () => {
    await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 8 });
    const select = db.customer.findMany.mock.calls[0]![0].select;
    expect(select).not.toHaveProperty("phone");
    expect(select).not.toHaveProperty("name");
    expect(select).not.toHaveProperty("email");
  });

  it("as invariantes do resultado: runtimeTouched false e messagesSent 0", async () => {
    const r = await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 4 });
    expect(r.runtimeTouched).toBe(false);
    expect(r.messagesSent).toBe(0);
  });

  it("dryRun monta o lote e NÃO chama a IA nem grava evidência", async () => {
    const r = await runCrmShadowTraining({ restaurantId: "r1", casesPerRestaurant: 8, dryRun: true });
    expect(r.totalCases).toBeGreaterThan(0);
    expect(r.totalRecorded).toBe(0);
    expect(reasoner.reasonCrmMessageForSnapshot).not.toHaveBeenCalled();
    expect(evidence.recordShadowOutcome).not.toHaveBeenCalled();
  });

  it("cupom só entra se existir campanha real com ele — nunca inventado", async () => {
    const semCampanha = await montarLote("r1", 6, new Date("2026-08-05T12:00:00Z"));
    expect(semCampanha.casos.every((c) => c.input.couponCode === null)).toBe(true);

    db.campaign.findFirst.mockResolvedValue({ couponCode: "VOLTA10" });
    const comCampanha = await montarLote("r1", 6, new Date("2026-08-05T12:00:00Z"));
    expect(comCampanha.casos.every((c) => c.input.couponCode === "VOLTA10")).toBe(true);
  });
});
