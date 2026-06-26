/**
 * AnalyticsInsightService
 *
 * Deterministic insight engine for the Analytics Agent.
 * Interprets AnalyticsOverview data and produces typed insights,
 * an executive summary, and period comparison — no LLM required.
 *
 * All insights are grounded in real restaurant data. No numbers are invented.
 */

import type { AnalyticsOverview, KpiOverview } from "./AnalyticsService";

// ─── Public types ─────────────────────────────────────────────────────────────

export type InsightSeverity = "GOOD" | "INFO" | "WARNING" | "CRITICAL" | "OPPORTUNITY";

export interface AgentInsight {
  id:             string;
  type:           string;
  severity:       InsightSeverity;
  title:          string;
  explanation:    string;
  metric?:        string;
  recommendation: string;
  ctaLabel?:      string;
  ctaTarget?:     string;
}

export interface ComparisonPoint {
  current:  number;
  previous: number;
  deltaPct: number;
  trend:    "UP" | "DOWN" | "STABLE";
}

export interface PeriodComparison {
  available:          boolean;
  unavailableReason?: string;
  revenue:            ComparisonPoint;
  orders:             ComparisonPoint;
  avgTicket:          ComparisonPoint;
}

export type DataQuality = "NONE" | "LOW" | "SUFFICIENT";

export interface AgentReport {
  summary:     string;
  insights:    AgentInsight[];
  comparison:  PeriodComparison;
  hasData:     boolean;
  dataQuality: DataQuality;
}

// ─── Main service ─────────────────────────────────────────────────────────────

export class AnalyticsInsightService {
  static buildReport(
    overview:    AnalyticsOverview,
    prevKpi:     { revenue: number; orders: number; avgTicket: number } | null,
    periodLabel = "no período selecionado",
  ): AgentReport {
    const { kpi } = overview;

    const dataQuality: DataQuality =
      kpi.orders === 0 ? "NONE" :
      kpi.orders  <  6 ? "LOW"  :
      "SUFFICIENT";

    const hasData   = kpi.orders > 0;
    const insights  = this.buildInsights(overview);
    const comparison = this.buildComparison(kpi, prevKpi);
    const summary   = this.buildSummary(overview, insights, periodLabel, dataQuality);

    return { summary, insights, comparison, hasData, dataQuality };
  }

  // ─── Insight engine ──────────────────────────────────────────────────────────

  private static buildInsights(overview: AnalyticsOverview): AgentInsight[] {
    const { kpi, attachRates, topProducts, segments, tiers } = overview;
    const insights: AgentInsight[] = [];

    const drinks   = attachRates.find((a) => a.label === "Bebidas");
    const desserts = attachRates.find((a) => a.label === "Sobremesas");

    const frioCount  = segments.find((s) => s.segment === "FRIO")?.count  ?? 0;
    const mornoCount = segments.find((s) => s.segment === "MORNO")?.count ?? 0;
    const vipCount   =
      (tiers.find((t) => t.tier === "OURO")?.count    ?? 0) +
      (tiers.find((t) => t.tier === "DIAMANTE")?.count ?? 0);

    // ── Dessert attach ──────────────────────────────────────────────────────
    if (desserts && desserts.total > 5 && desserts.rate < 20) {
      insights.push({
        id:             "dessert_attach_low",
        type:           "DESSERT_ATTACH_LOW",
        severity:       "OPPORTUNITY",
        title:          "Sobremesas estão ficando dinheiro na mesa",
        explanation:    `Apenas ${desserts.rate.toFixed(0)}% dos pedidos incluíram sobremesa — a maioria dos clientes fechou sem ela.`,
        metric:         `${desserts.rate.toFixed(0)}% de attach`,
        recommendation: "Crie uma campanha para clientes recorrentes estimulando sobremesa no próximo pedido.",
        ctaLabel:       "Criar ação de sobremesa",
        ctaTarget:      "/crm?tab=acoes&action=aumentar-sobremesas",
      });
    }

    // ── Drink attach ────────────────────────────────────────────────────────
    if (drinks && drinks.total > 5 && drinks.rate < 30) {
      insights.push({
        id:             "drink_attach_low",
        type:           "DRINK_ATTACH_LOW",
        severity:       "OPPORTUNITY",
        title:          "Bebidas podem aumentar o ticket médio",
        explanation:    `${drinks.rate.toFixed(0)}% dos pedidos incluíram bebida. Cada bebida adicionada eleva o ticket médio diretamente.`,
        metric:         `${drinks.rate.toFixed(0)}% de attach`,
        recommendation: "Use o CRM para estimular bebida no próximo pedido dos clientes recorrentes.",
        ctaLabel:       "Criar ação de bebidas",
        ctaTarget:      "/crm?tab=acoes&action=aumentar-bebidas",
      });
    }

    // ── Cold customers ──────────────────────────────────────────────────────
    if (frioCount > 0) {
      insights.push({
        id:          "cold_customers",
        type:        "COLD_CUSTOMERS",
        severity:    frioCount > 20 ? "WARNING" : "INFO",
        title:       frioCount > 20 ? "Clientes frios precisam de recuperação" : "Há clientes frios na base",
        explanation: `${frioCount} cliente${frioCount > 1 ? "s" : ""} frio${frioCount > 1 ? "s" : ""} — sem pedidos há mais de 30 dias.`,
        metric:      `${frioCount} clientes frios`,
        recommendation: "Inicie uma ação de reativação com uma oferta personalizada antes que esfriem mais.",
        ctaLabel:    "Recuperar clientes frios",
        ctaTarget:   "/crm?tab=acoes&action=recuperar-frios",
      });
    }

    // ── Warm customers ──────────────────────────────────────────────────────
    if (mornoCount > 0) {
      insights.push({
        id:          "warm_customers",
        type:        "WARM_CUSTOMERS",
        severity:    "INFO",
        title:       "Clientes mornos prontos para reativar",
        explanation: `${mornoCount} cliente${mornoCount > 1 ? "s" : ""} morno${mornoCount > 1 ? "s" : ""} — compraram antes, mas estão esfriando.`,
        metric:      `${mornoCount} clientes mornos`,
        recommendation: "Um empurrãozinho com uma campanha pode converter esses clientes antes que esfriem de vez.",
        ctaLabel:    "Reativar clientes mornos",
        ctaTarget:   "/crm?tab=acoes&action=reativar-mornos",
      });
    }

    // ── VIP customers ───────────────────────────────────────────────────────
    if (vipCount > 2) {
      insights.push({
        id:          "vip_opportunity",
        type:        "VIP_OPPORTUNITY",
        severity:    "OPPORTUNITY",
        title:       "Clientes VIP sem tratamento especial",
        explanation: `${vipCount} cliente${vipCount > 1 ? "s" : ""} Ouro/Diamante na base. Eles têm maior propensão de responder a ações exclusivas.`,
        metric:      `${vipCount} clientes VIP`,
        recommendation: "Crie uma campanha exclusiva para VIPs — reconhecimento e oferta especial aumentam retenção.",
        ctaLabel:    "Criar ação VIP",
        ctaTarget:   "/crm?tab=acoes&action=clientes-vip",
      });
    }

    // ── Product concentration ───────────────────────────────────────────────
    if (topProducts.length > 1 && kpi.revenue > 0) {
      const top    = topProducts[0]!;
      const second = topProducts[1]!;
      if (top.revenue > second.revenue * 3) {
        const topShare = ((top.revenue / kpi.revenue) * 100).toFixed(0);
        insights.push({
          id:          "product_concentration",
          type:        "PRODUCT_CONCENTRATION",
          severity:    "INFO",
          title:       `"${top.name}" é o produto campeão`,
          explanation: `"${top.name}" concentra cerca de ${topShare}% da receita. Dependência alta de um único item é um risco.`,
          metric:      `${topShare}% da receita`,
          recommendation: "Diversifique destaques no cardápio e crie combos ao redor do produto campeão.",
        });
      }
    }

    // ── High cancellation ───────────────────────────────────────────────────
    if (kpi.cancellationRate > 10) {
      insights.push({
        id:          "high_cancellation",
        type:        "HIGH_CANCELLATION",
        severity:    kpi.cancellationRate > 20 ? "CRITICAL" : "WARNING",
        title:       "Taxa de cancelamento alta",
        explanation: `${kpi.cancellationRate.toFixed(1)}% dos pedidos foram cancelados no período.`,
        metric:      `${kpi.cancellationRate.toFixed(1)}% cancelados`,
        recommendation: "Investigue os motivos — tempo de preparo, pagamento não confirmado ou estoque em falta costumam ser as causas.",
      });
    }

    // ── No new customers ────────────────────────────────────────────────────
    if (kpi.orders > 5 && kpi.newCustomers === 0) {
      insights.push({
        id:          "no_new_customers",
        type:        "NO_NEW_CUSTOMERS",
        severity:    "WARNING",
        title:       "Nenhum cliente novo no período",
        explanation: "Todos os pedidos vieram de clientes já existentes. A base pode estar estagnando.",
        recommendation: "Invista em canais de aquisição e use links rastreáveis para medir de onde vêm os clientes.",
        ctaLabel:    "Ver canais rastreáveis",
        ctaTarget:   "/crm?tab=acoes&action=pedido-avaliacao",
      });
    }

    // ── Good performance (positive) ─────────────────────────────────────────
    if (
      kpi.orders > 5 &&
      kpi.cancellationRate < 3 &&
      drinks   && drinks.rate   >= 40 &&
      desserts && desserts.rate >= 20
    ) {
      insights.push({
        id:          "good_performance",
        type:        "GOOD_PERFORMANCE",
        severity:    "GOOD",
        title:       "Bom desempenho geral!",
        explanation: `Baixo cancelamento (${kpi.cancellationRate.toFixed(1)}%), boa aderência de bebidas (${drinks.rate.toFixed(0)}%) e sobremesas (${desserts.rate.toFixed(0)}%).`,
        recommendation: "Continue o que está funcionando. O próximo passo é crescer a base de novos clientes.",
      });
    }

    // Priority order: CRITICAL → WARNING → OPPORTUNITY → INFO → GOOD
    const PRIORITY: InsightSeverity[] = ["CRITICAL", "WARNING", "OPPORTUNITY", "INFO", "GOOD"];
    insights.sort((a, b) => PRIORITY.indexOf(a.severity) - PRIORITY.indexOf(b.severity));

    return insights.slice(0, 6);
  }

  // ─── Period comparison ───────────────────────────────────────────────────────

  private static buildComparison(
    current:  KpiOverview,
    previous: { revenue: number; orders: number; avgTicket: number } | null,
  ): PeriodComparison {
    if (!previous || previous.orders === 0) {
      const stub = (cur: number): ComparisonPoint => ({ current: cur, previous: 0, deltaPct: 0, trend: "STABLE" });
      return {
        available:          false,
        unavailableReason:  "Comparativo indisponível por falta de dados no período anterior.",
        revenue:   stub(current.revenue),
        orders:    stub(current.orders),
        avgTicket: stub(current.avgTicket),
      };
    }

    const point = (cur: number, prev: number): ComparisonPoint => {
      const deltaPct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
      const trend: "UP" | "DOWN" | "STABLE" =
        deltaPct >  2 ? "UP"   :
        deltaPct < -2 ? "DOWN" :
        "STABLE";
      return { current: cur, previous: prev, deltaPct, trend };
    };

    return {
      available: true,
      revenue:   point(current.revenue,   previous.revenue),
      orders:    point(current.orders,    previous.orders),
      avgTicket: point(current.avgTicket, previous.avgTicket),
    };
  }

  // ─── Executive summary ───────────────────────────────────────────────────────

  private static buildSummary(
    overview:    AnalyticsOverview,
    insights:    AgentInsight[],
    periodLabel: string,
    quality:     DataQuality,
  ): string {
    if (quality === "NONE") {
      return "Seu Gerente Comercial IA será ativado assim que houver pedidos no período.";
    }
    if (quality === "LOW") {
      return "Ainda temos poucos dados, mas já dá para acompanhar os primeiros sinais. Continue operando para obter análises mais completas.";
    }

    const { kpi } = overview;
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const revenue   = fmt(kpi.revenue);
    const ticket    = fmt(kpi.avgTicket);
    const orders    = kpi.orders.toLocaleString("pt-BR");

    let text = `${periodLabel}, o restaurante faturou ${revenue} em ${orders} pedidos. O ticket médio ficou em ${ticket}.`;

    const topOpportunity = insights.find((i) => i.severity === "OPPORTUNITY");
    const topWarning     = insights.find((i) => i.severity === "WARNING" || i.severity === "CRITICAL");

    if (topOpportunity) {
      text += ` A principal oportunidade: ${topOpportunity.explanation}`;
    } else if (topWarning) {
      text += ` Principal alerta: ${topWarning.explanation}`;
    } else if (kpi.cancellationRate < 3 && kpi.orders > 5) {
      text += " O período está com bom aproveitamento e baixa taxa de cancelamento.";
    }

    const firstCta = insights.find((i) => i.ctaLabel);
    if (firstCta) {
      text += ` Próxima ação recomendada: ${firstCta.recommendation}`;
    }

    return text;
  }
}
