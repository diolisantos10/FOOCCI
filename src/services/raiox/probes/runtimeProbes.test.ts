/**
 * As duas metades de cada sonda de operação.
 *
 * Metade 1: acha o problema quando ele existe, com o identificador na evidência.
 * Metade 2: não inventa problema quando o dia foi normal.
 *
 * As sondas de dinheiro têm uma terceira preocupação: não gritar por algo que
 * já se sabe esperado (a fila de NFS-e da Foocci). Alarme que se sabe falso
 * ensina o leitor a ignorar o relatório inteiro.
 */

import { describe, it, expect } from "vitest";
import { available, unavailable, type RaioXSample } from "../types";
import type {
  AiSample, BillingSample, BrainSample, BusinessSample, CartsSample,
  DataSample, GatesSample, JobsSample, MessagesSample, PrintSample,
} from "../types";
import {
  iaCustoProbe, iaRetrabalhoProbe, mensagensPresasProbe, filaImpressaoProbe,
  carrinhoParadoProbe, assinaturasProbe, portoesProbe, cerebroSombraProbe,
  jobsTravadosProbe, dadoMortoProbe, pulsoNegocioProbe,
} from "./runtimeProbes";

const ctx = { runId: "t", now: new Date("2026-08-05T06:00:00Z") };

const AI_OK: AiSample = {
  windowHours: 24, totalCalls: 100, totalFailures: 1, totalCostMicroUsd: 250_000,
  byModel: [{ model: "gpt-4o-mini", calls: 100, failures: 1, totalTokens: 50_000, costMicroUsd: 250_000 }],
  failureSamples: [], heaviestConversations: [],
};
const MSG_OK: MessagesSample = {
  windowHours: 24, outboundTotal: 300, failed: 0, stuckPending: 0, pendingAfterMinutes: 60, samples: [],
};
const PRINT_OK: PrintSample = { dead: 0, stuckPending: 0, pendingAfterMinutes: 15, claimedStale: 0, samples: [] };
const CARTS_OK: CartsSample = {
  staleAfterHours: 24, staleDrafts: 0, staleDraftsValueCents: 0, expiredSessionsNotClosed: 0,
  draftSamples: [], sessionSamples: [],
};
const BILLING_OK: BillingSample = {
  stalledAfterDays: 3, provisionErrors: [], priceSyncErrors: [], stalledSubscriptions: [],
  missingPaymentLink: [], pendingInvoices: 2, pendingInvoicesValueCents: 39_800, oldestPendingInvoiceDays: 5,
};
const GATES_OK: GatesSample = {
  lastRun: { runId: "qar_1", globalStatus: "PASS", ageHours: 3, countsBySeverity: { P0: 0 } },
  expectedWithinHours: 30, blockingFindings: [],
};
const BRAIN_OK: BrainSample = {
  windowHours: 24, shadowSamples: 40, coherencePass: 35, coherenceFail: 3, coherenceNeedsReview: 2,
  fallbackModes: 4, liveConfigs: [], promotionThresholds: { minSamples: 20, minCoherencePassPct: 70 },
};
const JOBS_OK: JobsSample = { stuckAfterHours: 2, stuck: [], pendingCampaignSends: 0, stuckFiscalDocs: 0 };
const DATA_OK: DataSample = {
  windowHours: 24,
  growth: [{ table: "messages", total: 10_000, addedInWindow: 300 }],
  silentRestaurants: [], silentAfterDays: 30,
};
const BUSINESS_OK: BusinessSample = {
  restaurants: [{ restaurantId: "r1", name: "Sushi Cazza", ordersLast24h: 12, avgDailyPrevious7d: 10, revenueLast24hCents: 120_000 }],
  totalOrdersLast24h: 12, totalRevenueLast24hCents: 120_000,
};

function sample(over: Partial<Record<keyof RaioXSample, unknown>> = {}): RaioXSample {
  const base: RaioXSample = {
    collectedAt: ctx.now,
    ai: available(AI_OK), messages: available(MSG_OK), print: available(PRINT_OK),
    carts: available(CARTS_OK), billing: available(BILLING_OK), gates: available(GATES_OK),
    brain: available(BRAIN_OK), jobs: available(JOBS_OK), data: available(DATA_OK),
    business: available(BUSINESS_OK), source: unavailable("não usado neste teste"),
  };
  return { ...base, ...over } as RaioXSample;
}

const worst = (fs: { severity: string }[]) =>
  fs.find((f) => f.severity === "P0") ?? fs.find((f) => f.severity === "P1") ?? fs[0];

// ─────────────────────────────────────────────────────────────────────────────

describe("ia-custo", () => {
  it("NÃO INVENTA: dia normal produz só o número de acompanhamento", () => {
    const out = iaCustoProbe.run(sample(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("PASS");
    expect(out[0].metrics.custoMicroUsd).toBe(250_000);
  });

  it("ACHA: taxa de falha alta com volume vira P1, com o erro na evidência", () => {
    const ai: AiSample = {
      ...AI_OK, totalCalls: 50, totalFailures: 12,
      failureSamples: [{ model: "gpt-4o-mini", error: "429 rate limit", restaurantId: "r1" }],
      byModel: [{ model: "gpt-4o-mini", calls: 50, failures: 12, totalTokens: 100, costMicroUsd: 10 }],
    };
    const out = iaCustoProbe.run(sample({ ai: available(ai) }), ctx);
    const f = worst(out);
    expect(f.severity).toBe("P1");
    expect(out.some((x) => x.evidence.join(" ").includes("429 rate limit"))).toBe(true);
  });

  it("NÃO INVENTA: 3 falhas em 5 chamadas não alarma — volume pequeno é ruído", () => {
    const ai: AiSample = { ...AI_OK, totalCalls: 5, totalFailures: 3 };
    const out = iaCustoProbe.run(sample({ ai: available(ai) }), ctx);
    expect(out.every((f) => f.severity === "INFO")).toBe(true);
  });
});

describe("ia-retrabalho", () => {
  it("ACHA: conversa acima do limite sem pedido entra com id e custo", () => {
    const ai: AiSample = {
      ...AI_OK,
      heaviestConversations: [
        { conversationId: "c1", restaurantId: "r1", calls: 22, costMicroUsd: 800_000, producedOrder: false },
      ],
    };
    const [f] = iaRetrabalhoProbe.run(sample({ ai: available(ai) }), ctx);
    expect(f.status).toBe("WARNING");
    expect(f.evidence[0]).toContain("c1");
  });

  it("NÃO INVENTA: conversa longa que VIROU pedido não é desperdício", () => {
    const ai: AiSample = {
      ...AI_OK,
      heaviestConversations: [
        { conversationId: "c1", restaurantId: "r1", calls: 30, costMicroUsd: 900_000, producedOrder: true },
      ],
    };
    const [f] = iaRetrabalhoProbe.run(sample({ ai: available(ai) }), ctx);
    expect(f.status).toBe("PASS");
  });

  it("NÃO INVENTA: conversa não encontrada (producedOrder null) não vira acusação", () => {
    const ai: AiSample = {
      ...AI_OK,
      heaviestConversations: [
        { conversationId: "c1", restaurantId: "r1", calls: 30, costMicroUsd: 900_000, producedOrder: null },
      ],
    };
    const [f] = iaRetrabalhoProbe.run(sample({ ai: available(ai) }), ctx);
    expect(f.status).toBe("PASS");
  });
});

describe("mensagens-presas", () => {
  it("ACHA: falha declarada pelo provedor vira achado com id da mensagem", () => {
    const m: MessagesSample = {
      ...MSG_OK, failed: 37,
      samples: [{ messageId: "m1", conversationId: "c1", status: "failed", error: "invalid number", ageMinutes: 30 }],
    };
    const [f] = mensagensPresasProbe.run(sample({ messages: available(m) }), ctx);
    expect(f.status).toBe("FAIL");
    expect(f.metrics.falhas).toBe(37);
    expect(f.evidence[0]).toContain("m1");
  });

  it("NÃO INVENTA: 300 mensagens sem falha declarada ⇒ PASS", () => {
    const [f] = mensagensPresasProbe.run(sample(), ctx);
    expect(f.status).toBe("PASS");
  });
});

describe("fila-impressao", () => {
  it("ACHA: comanda morta é P0 e cita o pedido", () => {
    const p: PrintSample = {
      ...PRINT_OK, dead: 2,
      samples: [{ jobId: "j1", restaurantId: "r1", orderId: "o9", status: "DEAD", attempts: 5, ageMinutes: 120, error: "printer offline" }],
    };
    const [f] = filaImpressaoProbe.run(sample({ print: available(p) }), ctx);
    expect(f.severity).toBe("P0");
    expect(f.evidence[0]).toContain("o9");
  });

  it("gradação: só atraso, sem morte, fica em P1", () => {
    const p: PrintSample = { ...PRINT_OK, stuckPending: 3 };
    const [f] = filaImpressaoProbe.run(sample({ print: available(p) }), ctx);
    expect(f.severity).toBe("P1");
  });

  it("NÃO INVENTA: fila limpa ⇒ PASS", () => {
    const [f] = filaImpressaoProbe.run(sample(), ctx);
    expect(f.status).toBe("PASS");
  });
});

describe("carrinho-parado", () => {
  it("ACHA: sessão vencida ainda aberta indica relógio parado (P1)", () => {
    const c: CartsSample = {
      ...CARTS_OK, expiredSessionsNotClosed: 4,
      sessionSamples: [{ sessionId: "s1", restaurantId: "r1", status: "ACTIVE", ageHours: 40 }],
    };
    const out = carrinhoParadoProbe.run(sample({ carts: available(c) }), ctx);
    expect(worst(out).severity).toBe("P1");
  });

  it("NÃO INVENTA: nada encalhado ⇒ um único PASS", () => {
    const out = carrinhoParadoProbe.run(sample(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("PASS");
  });
});

describe("assinaturas", () => {
  it("ACHA: pagou e a conta não nasceu é P0", () => {
    const b: BillingSample = {
      ...BILLING_OK,
      provisionErrors: [{ subscriptionId: "sub1", error: "slug já usado", ageDays: 2 }],
    };
    const out = assinaturasProbe.run(sample({ billing: available(b) }), ctx);
    const f = worst(out);
    expect(f.severity).toBe("P0");
    expect(f.evidence[0]).toContain("sub1");
  });

  it("ACHA: falha ao subir o valor cheio é P0 (cobrança pela metade para sempre)", () => {
    const b: BillingSample = {
      ...BILLING_OK, priceSyncErrors: [{ subscriptionId: "sub2", error: "MP 400", ageDays: 30 }],
    };
    const out = assinaturasProbe.run(sample({ billing: available(b) }), ctx);
    expect(worst(out).title).toContain("metade");
  });

  it("NÃO INVENTA: fila conhecida de NFS-e sai como INFO, nunca como alarme", () => {
    const out = assinaturasProbe.run(sample(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("INFO");
    expect(out[0].metrics.notasNaFila).toBe(2);
  });
});

describe("portoes", () => {
  it("ACHA: auditoria fora do prazo é P0 — portão que parou de rodar bloqueia", () => {
    const g: GatesSample = { ...GATES_OK, lastRun: { ...GATES_OK.lastRun!, ageHours: 50 } };
    const out = portoesProbe.run(sample({ gates: available(g) }), ctx);
    expect(worst(out).severity).toBe("P0");
  });

  it("ACHA: nenhuma auditoria registrada vira UNKNOWN, jamais PASS", () => {
    const g: GatesSample = { ...GATES_OK, lastRun: null };
    const [f] = portoesProbe.run(sample({ gates: available(g) }), ctx);
    expect(f.status).toBe("UNKNOWN");
    expect(f.severity).toBe("P1");
  });

  it("NÃO INVENTA: auditoria recente e sem P0 ⇒ PASS", () => {
    const out = portoesProbe.run(sample(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("PASS");
  });
});

describe("cerebro-sombra", () => {
  it("ACHA: modo fora de SHADOW_ONLY aparece com o restaurante", () => {
    const b: BrainSample = { ...BRAIN_OK, liveConfigs: [{ restaurantId: "r1", mode: "ALLOWLIST", paused: false }] };
    const out = cerebroSombraProbe.run(sample({ brain: available(b) }), ctx);
    expect(out.some((f) => f.title.includes("fora de SHADOW_ONLY"))).toBe(true);
    expect(out.some((f) => f.evidence.join(" ").includes("r1"))).toBe(true);
  });

  it("ACHA: coerência abaixo de 50% com amostra suficiente vira P1", () => {
    const b: BrainSample = { ...BRAIN_OK, coherencePass: 10, coherenceFail: 20, coherenceNeedsReview: 5 };
    const out = cerebroSombraProbe.run(sample({ brain: available(b) }), ctx);
    expect(worst(out).severity).toBe("P1");
  });

  it("NÃO PROMOVE: com limiares atingidos, relata evidência e devolve a decisão ao humano", () => {
    const out = cerebroSombraProbe.run(sample(), ctx);
    const info = out.find((f) => f.severity === "INFO")!;
    expect(info.summary).toContain("material para o CEO avaliar");
    expect(info.recommendation).toContain("decisão humana");
    // e o veredito continua PASS: preparar evidência não é acender alarme
    expect(out.every((f) => f.status === "PASS")).toBe(true);
  });
});

describe("jobs-travados", () => {
  it("ACHA: importação parada há horas entra com id e idade", () => {
    const j: JobsSample = {
      ...JOBS_OK,
      stuck: [{ kind: "importação", jobId: "i1", status: "IMPORTING", ageHours: 9, detail: "clientes.xlsx · 900 linhas" }],
    };
    const [f] = jobsTravadosProbe.run(sample({ jobs: available(j) }), ctx);
    expect(f.status).toBe("WARNING");
    expect(f.evidence[0]).toContain("i1");
  });

  it("ACHA: nota fiscal presa eleva para P1", () => {
    const j: JobsSample = { ...JOBS_OK, stuckFiscalDocs: 3 };
    const [f] = jobsTravadosProbe.run(sample({ jobs: available(j) }), ctx);
    expect(f.severity).toBe("P1");
  });

  it("NÃO INVENTA: nada travado ⇒ PASS", () => {
    const [f] = jobsTravadosProbe.run(sample(), ctx);
    expect(f.status).toBe("PASS");
  });
});

describe("dado-morto", () => {
  it("ACHA: restaurante ativo sem pedido há 30 dias aparece pelo nome", () => {
    const d: DataSample = {
      ...DATA_OK,
      silentRestaurants: [{ restaurantId: "r9", name: "Cantina Velha", silentDays: 45 }],
    };
    const out = dadoMortoProbe.run(sample({ data: available(d) }), ctx);
    expect(out.some((f) => f.evidence.join(" ").includes("Cantina Velha"))).toBe(true);
  });

  it("NÃO INVENTA: sem silêncio, só o número de volumetria", () => {
    const out = dadoMortoProbe.run(sample(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("INFO");
  });
});

describe("pulso-negocio", () => {
  it("ACHA: restaurante com média 8/dia e zero hoje vira P1", () => {
    const b: BusinessSample = {
      ...BUSINESS_OK,
      restaurants: [{ restaurantId: "r1", name: "Sushi Cazza", ordersLast24h: 0, avgDailyPrevious7d: 8, revenueLast24hCents: 0 }],
      totalOrdersLast24h: 0,
    };
    const out = pulsoNegocioProbe.run(sample({ business: available(b) }), ctx);
    expect(worst(out).severity).toBe("P1");
  });

  it("NÃO INVENTA: restaurante de baixo volume em zero não acende alarme (é terça, não pane)", () => {
    const b: BusinessSample = {
      ...BUSINESS_OK,
      restaurants: [{ restaurantId: "r2", name: "Quiosque", ordersLast24h: 0, avgDailyPrevious7d: 1.2, revenueLast24hCents: 0 }],
      totalOrdersLast24h: 0,
    };
    const out = pulsoNegocioProbe.run(sample({ business: available(b) }), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("INFO");
  });
});
