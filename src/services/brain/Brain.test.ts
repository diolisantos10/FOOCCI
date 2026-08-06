import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  menuItem: { count: vi.fn(), findMany: vi.fn() },
  businessHours: { findMany: vi.fn() },
  promotion: { findMany: vi.fn() },
  restaurantKnowledgeItem: { findMany: vi.fn() },
  agentLibrarySource: { count: vi.fn() },
  waiterResultEvidence: { count: vi.fn() },
  deliveryZone: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { BRAIN_SAFETY, assertBrainSafety } from "./core/BrainSafety";
import {
  submitChangeRequest,
  decideChangeRequest,
  __resetBrainDirector,
} from "./director/BrainDirectorService";
import { classifyChangeRisk, requiresHumanApproval } from "./director/BrainGovernancePolicy";
import { selectEngine, configuredProviders } from "./engines/AIEngineRouter";
import { restaurantKnowledgeAdapter } from "./knowledge/RestaurantKnowledgeAdapter";
import { reasonViaBrain } from "./reasoning/WaiterBrainReasoningAdapter";
import { canUseCommercially } from "./evidence/BrainEvidenceContract";

beforeEach(() => {
  vi.clearAllMocks();
  __resetBrainDirector();
  db.restaurant.findUnique.mockResolvedValue({
    name: "Sushi Cazza",
    paymentSettings: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    deliveryConfig: { enabled: true, pickupEnabled: true },
    brandConfig: { tone: "friendly" },
  });
  db.menuItem.count.mockResolvedValue(42);
  db.menuItem.findMany.mockResolvedValue([
    { name: "Combo Salmão 20 peças", price: 59.9, priceDelivery: 62.9, priceDineIn: null, isAvailable: true, category: { name: "Combos" } },
  ]);
  db.businessHours.findMany.mockResolvedValue([
    { dayOfWeek: 2, isOpen: true, openTime: "18:00", closeTime: "23:00", periodsJson: null },
  ]);
  db.promotion.findMany.mockResolvedValue([]);
  db.restaurantKnowledgeItem.findMany.mockResolvedValue([
    { category: "RODIZIO_INFO", title: "Tem rodízio?", answer: "Sim, todos os dias, R$ 89,90." },
  ]);
  db.agentLibrarySource.count.mockResolvedValue(3);
  db.waiterResultEvidence.count.mockResolvedValue(7);
  db.deliveryZone.findMany.mockResolvedValue([]);
});

describe("(1) Contrato e segurança do Brain", () => {
  it("invariantes do Brain: nunca toca runtime, nunca envia, nunca aceita PII", () => {
    expect(BRAIN_SAFETY.touchesRuntime).toBe(false);
    expect(BRAIN_SAFETY.sendsMessages).toBe(false);
    expect(BRAIN_SAFETY.createsOrdersOrPayments).toBe(false);
    expect(BRAIN_SAFETY.acceptsRawPII).toBe(false);
    expect(BRAIN_SAFETY.agentsCanMutateBrain).toBe(false);
    expect(() => assertBrainSafety()).not.toThrow();
  });
});

describe("(2-4) Brain Director", () => {
  it("(2) cria change request sem alterar nada (status PENDING_APPROVAL)", () => {
    const req = submitChangeRequest({
      requestedBy: "TRAINING_CENTER",
      target: "TRAINING_RULE",
      summary: "Nova regra de pagamento",
      rationale: "Casos reais aprovados",
    });
    expect(req.status).toBe("PENDING_APPROVAL");
    expect(req.runtimeImpact).toBe("NONE");
  });

  it("(3) risco alto/critical exige aprovação humana; PRODUCTION = CRITICAL + gate", () => {
    const prod = submitChangeRequest({
      requestedBy: "CEO", target: "AGENT_POLICY", summary: "x", rationale: "y", runtimeImpact: "PRODUCTION",
    });
    expect(prod.riskLevel).toBe("CRITICAL");
    expect(prod.requiresQualityGate).toBe(true);
    expect(requiresHumanApproval(prod)).toBe(true);
    // engine routing é HIGH por padrão
    expect(classifyChangeRisk({ requestedBy: "CEO", target: "AI_ENGINE_ROUTING", summary: "x", rationale: "y" })).toBe("HIGH");
  });

  it("(4) agente não altera o Brain diretamente: requests de AGENT nunca nascem aprovados e AGENT/SYSTEM não decidem", () => {
    const req = submitChangeRequest({ requestedBy: "AGENT", target: "REASONING_RULE", summary: "x", rationale: "y" });
    expect(req.status).toBe("PENDING_APPROVAL");
    expect(req.riskLevel).not.toBe("LOW"); // agente nunca é risco baixo
    expect(() => decideChangeRequest(req.id, "APPROVED", "AGENT")).toThrow(/humano/i);
    expect(() => decideChangeRequest(req.id, "APPROVED", "SYSTEM")).toThrow(/humano/i);
    const decided = decideChangeRequest(req.id, "APPROVED", "diego");
    expect(decided.status).toBe("APPROVED");
    expect(decided.decidedBy).toBe("diego");
  });
});

describe("(5-6) AI Engine Router", () => {
  it("(5) escolhe o default atual (OpenAI gpt-4o-mini) sem trocar produção", () => {
    const sel = selectEngine("waiter", { env: { OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv });
    expect(sel.provider).toBe("OPENAI");
    expect(sel.model).toBe("gpt-4o-mini");
  });

  it("(6) suporta provider por agente, com fallback seguro quando não configurado", () => {
    const env = { OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv;
    const sel = selectEngine("crm", { env, preferences: { crm: "CLAUDE" } });
    // CLAUDE não configurado → cai no default (OpenAI), nunca quebra
    expect(sel.provider).toBe("OPENAI");
    expect(sel.reason).toContain("não configurado");
    // sem nenhum provider → MOCK determinístico
    const none = selectEngine("waiter", { env: {} as NodeJS.ProcessEnv });
    expect(none.provider).toBe("MOCK");
    expect(configuredProviders({} as NodeJS.ProcessEnv)).toEqual(["MOCK"]);
  });
});

describe("(7) Restaurant Knowledge Adapter", () => {
  it("retorna snapshot FACT-LEVEL sem PII e com missingContext honesto", async () => {
    const snap = await restaurantKnowledgeAdapter.getSnapshot("r1");
    expect(snap.businessType).toBe("RESTAURANT");
    expect(snap.truthSources.payments).toEqual({ pix: true, cartao: true, dinheiro: true, link: false });
    // v2: fatos reais, não contagens — nomes, preços (incl. canal), resumo primeiro
    // v3 (06/08/2026): o cabeçalho ganhou a legenda de canal. A comparação segue
    // EXATA de propósito — é ela que barra uma chave nova entrando na ficha sem
    // ninguém olhar (foi assim que este teste pegou a mudança).
    expect(snap.truthSources.products?.[0]).toEqual({
      totalItens: 42,
      listados: 1,
      legendaCanais: "canais: E=entrega (vai ao carrinho) · S=salão (presencial) · ES=os dois",
      regraDeCanal: "Item marcado só com S EXISTE e pode ser contado com preço, mas NUNCA entra em pedido de entrega.",
    });
    expect(snap.truthSources.products?.[1]).toMatchObject({
      nome: "Combo Salmão 20 peças",
      preco: 59.9,
      precoDelivery: 62.9,
      categoria: "Combos",
      canais: "ES", // v3: todo item declara o canal, não só os de salão
    });
    // horários reais chegam ao snapshot
    expect(snap.truthSources.hours).toMatchObject({ funcionamento: { ter: "18:00-23:00" }, delivery: true, retirada: true });
    // o Q&A curado (ACTIVE) é verdade de primeira classe — o caso rodízio
    expect(JSON.stringify(snap.truthSources.policies)).toMatch(/rod[íi]zio/i);
    // cardápio parcial declarado honestamente (1 de 42)
    expect(snap.missingContext.join(" ")).toMatch(/cardápio parcial/i);
    expect(snap.missingContext.join(" ")).toMatch(/Alelo|refei/i);
    // sem PII: nenhum telefone/email/nome de cliente no snapshot
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/@|\(\d{2}\)\s?\d{4,5}-?\d{4}/);
  });
});

describe("(8-10) Waiter como consumidor do Brain", () => {
  it("(8) caso Alelo preservado via adapter: PAYMENT_BENEFIT_QUESTION + coerência PASS + runtimeTouched=false", async () => {
    const result = await reasonViaBrain({
      businessId: "r1",
      businessType: "RESTAURANT",
      agentId: "waiter",
      agentRole: "Garçom vendedor de IA",
      sourceType: "MANUAL_TEST",
      sanitizedInput: "Aceita Alelo Refeição?",
      currentResponse: "[handoff:AI_ESCALATION]",
    });
    expect(result.primaryIntent).toBe("PAYMENT_BENEFIT_QUESTION");
    expect(/recomend|mais pedidos|prato/i.test(result.idealResponse)).toBe(false);
    expect(result.coherenceCheck.verdict).toBe("PASS");
    expect(result.coherenceCheck.answersUserQuestion).toBe(true);
    expect(result.runtimeTouched).toBe(false);
  });

  it("(9) agentes não conectados são recusados explicitamente (P0-safe, sem caminho mágico)", async () => {
    await expect(
      reasonViaBrain({
        businessId: "r1", businessType: "RESTAURANT", agentId: "crm", agentRole: "CRM",
        sourceType: "MANUAL_TEST", sanitizedInput: "olá",
      }),
    ).rejects.toThrow(/não está conectado/i);
  });

  it("(10) evidência só vira uso comercial com aprovação humana + flag", () => {
    expect(canUseCommercially({ status: "DRAFT", isPublicCandidate: true })).toBe(false);
    expect(canUseCommercially({ status: "APPROVED", isPublicCandidate: false })).toBe(false);
    expect(canUseCommercially({ status: "APPROVED", isPublicCandidate: true })).toBe(true);
  });
});
