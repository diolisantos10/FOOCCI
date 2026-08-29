/**
 * O TETO DE CONTATOS QUE NÃO TRAVAVA NADA.
 *
 * O defeito, como o CEO viu na tela **Regras de Segurança**, num mesmo cartão:
 *
 *   "Limite de contatos (no total, para sempre)"  ·  Máximo de pessoas: 200
 *   "Contatos restantes 0 de 200"
 *   "Limite de contatos atingido — 2115 pessoas já abordadas."
 *
 * 2115 é dez vezes o teto. E não era erro de rótulo: os dois números medem a
 * MESMA coisa (pessoas diferentes abordadas na vida toda, contadas em
 * `campaign_executions` com SENT/DELIVERED/READ — nenhuma rota de importação
 * escreve nessa tabela). O que faltava era a trava: `contactBudgetTotal` era
 * lido pela tela e por mais ninguém. O portão do envio nunca olhava o número.
 * O guia do lojista prometia, com todas as letras, que "o CRM para de abordar
 * gente nova até você aumentar o Máximo de pessoas". Não parava.
 *
 * Guardrail 4 da casa: prompt é aviso, código é trava. Uma tela que anuncia
 * "Limite de contatos atingido" enquanto o CRM segue abordando gente nova é a
 * pior versão do defeito — produz confiança falsa.
 *
 * Este arquivo trava o conserto pelos dois lados:
 *   1. com o saldo estourado, CONTATO NOVO é reprovado (o defeito antigo);
 *   2. com o saldo estourado, QUEM JÁ ESTÁ NA CONTA continua passando — porque
 *      ele não consome vaga nenhuma. A versão anterior desta trava derrubava a
 *      campanha inteira e por isso foi desligada; proteção não pode ser mais
 *      destrutiva que o problema que ela evita (guardrail 5).
 *
 * Nenhuma mensagem é enviada. Nenhum banco real é tocado.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  campaignExecution: { findMany: vi.fn() },
  customer:          { findUnique: vi.fn(), update: vi.fn() },
  // O portão pergunta ao banco se o cliente tem pedido em andamento.
  order:             { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/business-hours", () => ({ isRestaurantOpenNow: vi.fn(async () => true) }));

import {
  evaluateContactSafety,
  ContactSafetyService,
  type ContactSafetyEvalInput,
} from "../ContactSafetyService";
import { DEFAULT_SAFETY_CONFIG, getContactedCustomerIds } from "@/lib/crm-safety";

/** O cenário do print: teto de 200, 2115 pessoas já abordadas. */
const TETO = 200;
const JA_ABORDADAS = 2115;

function entrada(overrides: Partial<ContactSafetyEvalInput> = {}): ContactSafetyEvalInput {
  return {
    hasOptedOut: false,
    crmContactable: true,
    phone: "+5511999990000",
    sendsWithinCooldown: 0,
    sendsWithinWeek: 0,
    otherCampaignSendsWithin24h: 0,
    sameCampaignSends: 0,
    contactHistoryKnown: true,
    // cenário-base: cliente sem pedido em andamento nem pedido recente
    orderState: { known: true, hasActiveOrder: false, lastRealOrderAt: null },
    contactBudgetUsed: JA_ABORDADAS,
    isNewContact: true,
    enforceFrequency: true, // cenário-base: é abordagem, a frequência vale
    safety: { ...DEFAULT_SAFETY_CONFIG, contactBudgetTotal: TETO },
    whatsappAvailable: true,
    globalSentToday: 0,
    restaurantOpen: true,
    isBirthday: false,
    enforceTimeWindows: false,
    enforceDailyCap: true,
    enforceRestaurantOpen: false,
    sendingWindow: null,
    // Quarta-feira, meio-dia em Brasília — fora do horário de silêncio.
    now: new Date("2024-06-05T15:00:00Z"),
    ...overrides,
  };
}

describe("teto de contatos — o defeito antigo (2115 debaixo de um teto de 200)", () => {
  it("REPRODUZ O DEFEITO: com o teto ignorado, o envio a gente nova passava", () => {
    // É exatamente o que o código fazia antes: `contactBudgetTotal` não entrava
    // na conta do portão. Simulado aqui com o teto DESLIGADO — o mesmo efeito
    // prático de um teto que ninguém lê.
    const antes = evaluateContactSafety(entrada({
      safety: { ...DEFAULT_SAFETY_CONFIG, contactBudgetTotal: 0 },
    }));
    expect(antes.sendable).toBe(true);
  });

  it("AGORA TRAVA: contato novo é reprovado quando o teto estourou", () => {
    const d = evaluateContactSafety(entrada());
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CONTACT_BUDGET_EXHAUSTED");
    // O guardrail 6 da casa: o bloqueio carrega a própria evidência.
    expect(d.detail).toContain(String(JA_ABORDADAS));
    expect(d.detail).toContain(String(TETO));
  });

  it("quem JÁ está na conta continua recebendo — não consome vaga nova", () => {
    const d = evaluateContactSafety(entrada({ isNewContact: false }));
    expect(d.sendable).toBe(true);
    expect(d.reason).toBeNull();
  });

  it("teto zerado = sem limite: contato novo passa mesmo com 2115 abordados", () => {
    const d = evaluateContactSafety(entrada({
      safety: { ...DEFAULT_SAFETY_CONFIG, contactBudgetTotal: 0 },
    }));
    expect(d.sendable).toBe(true);
  });

  it("com saldo sobrando, contato novo passa", () => {
    const d = evaluateContactSafety(entrada({
      contactBudgetUsed: 199,
      safety: { ...DEFAULT_SAFETY_CONFIG, contactBudgetTotal: TETO },
    }));
    expect(d.sendable).toBe(true);
  });

  it("a última vaga é usada, a seguinte não: o corte é em used >= total", () => {
    const ultima = evaluateContactSafety(entrada({ contactBudgetUsed: TETO - 1 }));
    expect(ultima.sendable).toBe(true);

    const seguinte = evaluateContactSafety(entrada({ contactBudgetUsed: TETO }));
    expect(seguinte.sendable).toBe(false);
    expect(seguinte.reason).toBe("CONTACT_BUDGET_EXHAUSTED");
  });

  it("aniversário é isento de FREQUÊNCIA, não de custo: contato novo continua barrado", () => {
    const d = evaluateContactSafety(entrada({ isBirthday: true }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CONTACT_BUDGET_EXHAUSTED");
  });

  it("o aniversariante que JÁ é da casa passa normalmente", () => {
    const d = evaluateContactSafety(entrada({ isBirthday: true, isNewContact: false }));
    expect(d.sendable).toBe(true);
  });

  it("opt-out ganha do teto — o motivo mais grave é o que aparece no log", () => {
    const d = evaluateContactSafety(entrada({ hasOptedOut: true }));
    expect(d.reason).toBe("CUSTOMER_OPTED_OUT");
  });
});

// ── O contador: o que exatamente entra em "2115 pessoas já abordadas" ────────

describe("getContactedCustomerIds — o que o número 2115 está somando", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conta PESSOAS DIFERENTES com envio bem-sucedido do CRM, na vida toda", async () => {
    prismaMock.campaignExecution.findMany.mockResolvedValue([
      { customerId: "c1" }, { customerId: "c2" }, { customerId: "c3" },
    ]);
    const ids = await getContactedCustomerIds("rest-1");
    expect(ids).toEqual(new Set(["c1", "c2", "c3"]));

    const where = prismaMock.campaignExecution.findMany.mock.calls[0][0];
    // Só envio que DEU CERTO conta — bloqueio e falha não gastam vaga.
    expect(where.where.status).toEqual({ in: ["SENT", "DELIVERED", "READ"] });
    // Distinto por cliente: a mesma pessoa em cinco campanhas continua sendo 1.
    expect(where.distinct).toEqual(["customerId"]);
    // Sem recorte de data: é a vida toda, como a tela promete.
    expect(where.where.sentAt).toBeUndefined();
  });
});

// ── A trava é do SERVIDOR, não do formulário ────────────────────────────────

describe("assertSendable — a trava roda no caminho de envio, com dados do banco", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia o contato novo usando o contexto do lote (nenhum envio acontece)", async () => {
    // Histórico de 7 dias deste cliente: vazio.
    prismaMock.campaignExecution.findMany.mockResolvedValue([]);
    prismaMock.customer.findUnique.mockResolvedValue({ hasOptedOut: false, crmContactable: true });

    const contexto = {
      safety: { ...DEFAULT_SAFETY_CONFIG, contactBudgetTotal: TETO },
      whatsappAvailable: true,
      globalSentToday: 0,
      restaurantOpen: true,
      // 2115 pessoas já abordadas — "novo-1" não está entre elas.
      contactedCustomerIds: new Set(
        Array.from({ length: JA_ABORDADAS }, (_, i) => `antigo-${i}`),
      ),
    };

    const novo = await ContactSafetyService.assertSendable({
      restaurantId: "rest-1", customerId: "novo-1", phone: "+5511999990000",
      enforceTimeWindows: false, context: contexto,
    });
    expect(novo.sendable).toBe(false);
    expect(novo.reason).toBe("CONTACT_BUDGET_EXHAUSTED");

    const antigo = await ContactSafetyService.assertSendable({
      restaurantId: "rest-1", customerId: "antigo-7", phone: "+5511999990000",
      enforceTimeWindows: false, context: contexto,
    });
    expect(antigo.sendable).toBe(true);
  });
});
