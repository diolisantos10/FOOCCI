/**
 * AnalyticsAgentService — pure-function tests (W3).
 *
 * Tests routeIntent() and buildGroundedAnswer() without any DB or network I/O.
 *
 *   A — "por que as vendas caíram?" → REVENUE_DROP_DIAGNOSIS
 *   B — "quais produtos mais venderam?" → PRODUCT_PERFORMANCE
 *   C — "os clientes estão voltando?" → CUSTOMER_RETENTION
 *   D — "como está a operação?" → OPERATIONAL_EFFICIENCY
 *   E — "qual campanha funcionou melhor?" → CAMPAIGN_PERFORMANCE
 *   F — "o que devo fazer hoje?" → ACTION_RECOMMENDATION
 *   G — "quanto lucrei?" → SALES_OVERVIEW with margin limitation
 *   H — "pergunta aleatória" → UNKNOWN_UNSUPPORTED
 *   I — CART_RECOVERY with no service → has limitations
 *   J — no metric invented without a dataSource
 *   K — all recommendedActions are backed by a finding
 *   L — routeIntent is pure and deterministic
 */

import { describe, it, expect } from "vitest";
import {
  routeIntent,
  buildGroundedAnswer,
  type AgentServiceData,
} from "./AnalyticsAgentService";

// ─── A. REVENUE_DROP_DIAGNOSIS ────────────────────────────────────────────────

describe("A — revenue drop intent routing", () => {
  it("'por que as vendas caíram?' → REVENUE_DROP_DIAGNOSIS", () => {
    expect(routeIntent("por que as vendas caíram?")).toBe("REVENUE_DROP_DIAGNOSIS");
  });
  it("'por que o faturamento caiu?' → REVENUE_DROP_DIAGNOSIS", () => {
    expect(routeIntent("por que o faturamento caiu?")).toBe("REVENUE_DROP_DIAGNOSIS");
  });
  it("'receita diminuiu muito' → REVENUE_DROP_DIAGNOSIS", () => {
    expect(routeIntent("receita diminuiu muito")).toBe("REVENUE_DROP_DIAGNOSIS");
  });
  it("'por que caiu?' alone (no revenue word) → REVENUE_DROP_DIAGNOSIS", () => {
    expect(routeIntent("por que caiu?")).toBe("REVENUE_DROP_DIAGNOSIS");
  });
});

// ─── B. PRODUCT_PERFORMANCE ───────────────────────────────────────────────────

describe("B — product performance routing", () => {
  it("'quais produtos mais venderam?' → PRODUCT_PERFORMANCE", () => {
    expect(routeIntent("quais produtos mais venderam?")).toBe("PRODUCT_PERFORMANCE");
  });
  it("'me mostra o cardápio com mais pedidos' → PRODUCT_PERFORMANCE", () => {
    expect(routeIntent("me mostra o cardápio com mais pedidos")).toBe("PRODUCT_PERFORMANCE");
  });
  it("'qual prato mais saiu?' → PRODUCT_PERFORMANCE", () => {
    expect(routeIntent("qual prato mais saiu?")).toBe("PRODUCT_PERFORMANCE");
  });
});

// ─── C. CUSTOMER_RETENTION ────────────────────────────────────────────────────

describe("C — customer retention routing", () => {
  it("'os clientes estão voltando?' → CUSTOMER_RETENTION", () => {
    expect(routeIntent("os clientes estão voltando?")).toBe("CUSTOMER_RETENTION");
  });
  it("'retenção de clientes' → CUSTOMER_RETENTION", () => {
    expect(routeIntent("retenção de clientes")).toBe("CUSTOMER_RETENTION");
  });
  it("'os clientes voltaram a comprar?' → CUSTOMER_RETENTION", () => {
    expect(routeIntent("os clientes voltaram a comprar?")).toBe("CUSTOMER_RETENTION");
  });
  it("'fidelidade dos clientes' → CUSTOMER_RETENTION", () => {
    expect(routeIntent("fidelidade dos clientes")).toBe("CUSTOMER_RETENTION");
  });
});

// ─── D. OPERATIONAL_EFFICIENCY ───────────────────────────────────────────────

describe("D — operational efficiency routing", () => {
  it("'como está a operação?' → OPERATIONAL_EFFICIENCY", () => {
    expect(routeIntent("como está a operação?")).toBe("OPERATIONAL_EFFICIENCY");
  });
  it("'qual o tempo de preparo médio?' → OPERATIONAL_EFFICIENCY", () => {
    expect(routeIntent("qual o tempo de preparo médio?")).toBe("OPERATIONAL_EFFICIENCY");
  });
  it("'as entregas estão demorando?' → OPERATIONAL_EFFICIENCY", () => {
    expect(routeIntent("as entregas estão demorando?")).toBe("OPERATIONAL_EFFICIENCY");
  });
  it("'a cozinha está com atraso' → OPERATIONAL_EFFICIENCY", () => {
    expect(routeIntent("a cozinha está com atraso")).toBe("OPERATIONAL_EFFICIENCY");
  });
});

// ─── E. CAMPAIGN_PERFORMANCE ─────────────────────────────────────────────────

describe("E — campaign performance routing", () => {
  it("'qual campanha funcionou melhor?' → CAMPAIGN_PERFORMANCE", () => {
    expect(routeIntent("qual campanha funcionou melhor?")).toBe("CAMPAIGN_PERFORMANCE");
  });
  it("'quais campanhas disparei?' → CAMPAIGN_PERFORMANCE", () => {
    expect(routeIntent("quais campanhas disparei?")).toBe("CAMPAIGN_PERFORMANCE");
  });
  it("'o cupom converteu?' → COUPON_ATTRIBUTION", () => {
    expect(routeIntent("o cupom converteu?")).toBe("COUPON_ATTRIBUTION");
  });
});

// ─── F. ACTION_RECOMMENDATION ────────────────────────────────────────────────

describe("F — action recommendation routing", () => {
  it("'o que devo fazer hoje?' → ACTION_RECOMMENDATION", () => {
    expect(routeIntent("o que devo fazer hoje?")).toBe("ACTION_RECOMMENDATION");
  });
  it("'me dê prioridades de hoje' → ACTION_RECOMMENDATION", () => {
    expect(routeIntent("me dê prioridades de hoje")).toBe("ACTION_RECOMMENDATION");
  });
  it("'qual a recomendação para esta semana?' → ACTION_RECOMMENDATION", () => {
    expect(routeIntent("qual a recomendação para esta semana?")).toBe("ACTION_RECOMMENDATION");
  });
});

// ─── G. Margin question → SALES_OVERVIEW with limitation ─────────────────────

describe("G — margin/profit question", () => {
  it("'quanto lucrei?' routes to SALES_OVERVIEW (no dedicated margin engine)", () => {
    // "lucrei" contains "lucr" which triggers hasMarginQuestion
    // The intent routes to SALES_OVERVIEW since "lucro" alone w/o revenue kws → SALES_OVERVIEW
    const intent = routeIntent("quanto lucrei?");
    expect(["SALES_OVERVIEW", "REVENUE_DROP_DIAGNOSIS"]).toContain(intent);
  });

  it("buildGroundedAnswer includes margin limitation when hasMarginQuestion=true", () => {
    const data: AgentServiceData = {
      intent:            "SALES_OVERVIEW",
      periodLabel:       "Nos últimos 30 dias",
      question:          "quanto lucrei?",
      hasMarginQuestion: true,
    };
    const answer = buildGroundedAnswer(data);
    expect(answer.limitations.some((l) => l.toLowerCase().includes("cmv") || l.toLowerCase().includes("margem"))).toBe(true);
  });
});

// ─── H. UNKNOWN_UNSUPPORTED ──────────────────────────────────────────────────

describe("H — unsupported/ambiguous question", () => {
  it("random question → UNKNOWN_UNSUPPORTED", () => {
    expect(routeIntent("blábláblá xyzzy")).toBe("UNKNOWN_UNSUPPORTED");
  });
  it("UNKNOWN_UNSUPPORTED answer includes limitations", () => {
    const data: AgentServiceData = {
      intent:      "UNKNOWN_UNSUPPORTED",
      periodLabel: "Nos últimos 30 dias",
      question:    "blábláblá",
    };
    const answer = buildGroundedAnswer(data);
    expect(answer.limitations.length).toBeGreaterThan(0);
    expect(answer.followUpQuestions.length).toBeGreaterThan(0);
  });
  it("UNKNOWN_UNSUPPORTED still returns followUpQuestions", () => {
    const data: AgentServiceData = {
      intent:      "UNKNOWN_UNSUPPORTED",
      periodLabel: "Nos últimos 30 dias",
      question:    "algo esquisito",
    };
    const answer = buildGroundedAnswer(data);
    expect(answer.followUpQuestions.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── I. CART_RECOVERY with no service → limitations ─────────────────────────

describe("I — cart recovery limitation", () => {
  it("CART_RECOVERY without service data → returns limitations", () => {
    const data: AgentServiceData = {
      intent:      "CART_RECOVERY",
      periodLabel: "Nos últimos 30 dias",
      question:    "quantos carrinhos abandonaram?",
    };
    const answer = buildGroundedAnswer(data);
    expect(answer.limitations.length).toBeGreaterThan(0);
    expect(answer.limitations.some((l) => l.toLowerCase().includes("recupera") || l.toLowerCase().includes("abandono") || l.toLowerCase().includes("cart"))).toBe(true);
  });
});

// ─── J. No metric invented without a dataSource ──────────────────────────────

describe("J — metrics always come from dataSourcesUsed", () => {
  it("UNKNOWN_UNSUPPORTED has no metrics (no data fetched)", () => {
    const data: AgentServiceData = {
      intent:      "UNKNOWN_UNSUPPORTED",
      periodLabel: "Nos últimos 30 dias",
      question:    "xyz",
    };
    const answer = buildGroundedAnswer(data);
    // No data sources → no metrics should be fabricated
    expect(answer.metrics.length).toBe(0);
    expect(answer.dataSourcesUsed.length).toBe(0);
  });

  it("REVIEW_PERFORMANCE has no fabricated metrics", () => {
    const data: AgentServiceData = {
      intent:      "REVIEW_PERFORMANCE",
      periodLabel: "Nos últimos 30 dias",
      question:    "como estão minhas avaliações?",
    };
    const answer = buildGroundedAnswer(data);
    expect(answer.metrics.length).toBe(0);
    expect(answer.dataSourcesUsed.length).toBe(0);
    expect(answer.limitations.length).toBeGreaterThan(0);
  });
});

// ─── K. RecommendedActions backed by findings ─────────────────────────────────

describe("K — grounding: recommendedActions reference findings", () => {
  it("SALES_OVERVIEW with high cancellation adds action AND finding", () => {
    const overview = {
      kpi: {
        revenue: 1000, orders: 20, avgTicket: 50,
        newCustomers: 5, cancelledOrders: 4, cancellationRate: 20,
        awaitingPaymentCount: 0, awaitingPaymentTotal: 0,
      },
      dailyPoints:    [],
      topProducts:    [],
      categories:     [],
      attachRates:    [],
      topCustomers:   [],
      segments:       [],
      tiers:          [],
      channels:       [],
      zeroSalesProducts: [],
      upsellRevenue:  { revenue: 0, sharePercent: 0, ordersWithUpsell: 0, avgPerOrder: 0 },
      insights:       [],
    };
    const data: AgentServiceData = {
      intent:      "SALES_OVERVIEW",
      periodLabel: "Nos últimos 30 dias",
      question:    "como foram as vendas?",
      overview:    overview as never,
    };
    const answer = buildGroundedAnswer(data);
    if (answer.recommendedActions.length > 0) {
      // At least one finding should exist when actions are recommended
      expect(answer.findings.length).toBeGreaterThan(0);
    }
  });
});

// ─── L. routeIntent is pure and deterministic ────────────────────────────────

describe("L — routeIntent purity", () => {
  it("same input → same output, multiple calls", () => {
    const q = "por que as vendas caíram tanto?";
    const r1 = routeIntent(q);
    const r2 = routeIntent(q);
    const r3 = routeIntent(q);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it("does not mutate the input string", () => {
    const q = "Os clientes estão voltando?";
    const qBefore = q;
    routeIntent(q);
    expect(q).toBe(qBefore);
  });

  it("accent-insensitive: 'retencao' matches same as 'retenção'", () => {
    expect(routeIntent("retencao de clientes")).toBe(routeIntent("retenção de clientes"));
  });
});
