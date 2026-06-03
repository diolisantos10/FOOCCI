/**
 * AnalyticsDiagnosisService
 *
 * Deterministic root-cause diagnosis engine for the Analytics Agent (W1).
 *
 * Given the current-period AnalyticsOverview and the previous comparable
 * period, it produces structured findings (what changed + likely causes +
 * recommended action), threshold-based anomalies, and an executive summary.
 *
 * NON-NEGOTIABLE PRINCIPLES:
 *  - 100% deterministic. No LLM. No randomness. Same input → same output.
 *  - Pure: no I/O, no DB, no network, no global state. Fully unit-testable.
 *  - Never invents numbers. Every value comes from the supplied overview.
 *  - Never claims certainty from correlation. Causes are hedged in pt-BR:
 *      "provável", "indício", "principal fator observado",
 *      "não há dados suficientes para afirmar".
 *  - Small samples never trigger loud CRITICAL alerts (noise guard).
 *  - When the previous period is missing, comparison-based findings are
 *    suppressed and the gap is reported under `limitations` — not faked.
 */

import type {
  AnalyticsOverview,
  ProductRow,
  AttachRate,
  ChannelRow,
} from "./AnalyticsService";

// ─── Public types ─────────────────────────────────────────────────────────────

export type DiagnosisSeverity = "GOOD" | "INFO" | "WARNING" | "CRITICAL" | "OPPORTUNITY";
export type Confidence        = "LOW" | "MEDIUM" | "HIGH";
export type DiagnosisDataQuality = "NONE" | "LOW" | "SUFFICIENT";

export interface RelatedEntities {
  /** Product names (the overview exposes names, not ids). */
  products?:      string[];
  /** Category names. */
  categories?:    string[];
  campaignIds?:   string[];
  channel?:       string;
  paymentMethod?: string;
}

export interface Finding {
  id:                string;
  title:             string;
  severity:          DiagnosisSeverity;
  metric:            string;   // human label of the metric, e.g. "Receita"
  currentValue:      number;
  previousValue:     number;
  deltaAbs:          number;
  deltaPct:          number;   // signed %, 0 when previous is 0/absent
  likelyCauses:      string[]; // ranked, hedged language — never certainty
  evidence:          string[]; // concrete numbers backing the finding
  confidence:        Confidence;
  recommendedAction: string;
  relatedEntities:   RelatedEntities;
}

export interface Anomaly {
  id:                string;
  severity:          DiagnosisSeverity;
  metric:            string;
  threshold:         string;   // the rule that fired, e.g. "queda > 20%"
  observedValue:     number;
  whyItMatters:      string;
  recommendedAction: string;
}

export interface DiagnosisPeriodMeta {
  from:  string; // YYYY-MM-DD
  to:    string; // YYYY-MM-DD
  label: string;
}

export interface DiagnosisReport {
  period:             DiagnosisPeriodMeta;
  comparisonPeriod:   DiagnosisPeriodMeta | null;
  summary:            string;
  findings:           Finding[];
  anomalies:          Anomaly[];
  recommendedActions: string[];
  limitations:        string[];
  dataQuality:        DiagnosisDataQuality;
  hasComparison:      boolean;
}

// Optional extra signals — present only when the caller wired them. The engine
// degrades gracefully (and records a limitation) when they are absent.
export interface CampaignDiagnosisInput {
  sends:           number;
  conversions:     number;
  revenue:         number;
  prevSends?:      number;
  prevConversions?: number;
  prevRevenue?:    number;
  campaignIds?:    string[];
}

export interface RecoveryDiagnosisInput {
  abandonedDrafts:     number;
  recoveredDrafts:     number;
  prevAbandonedDrafts?: number;
  prevRecoveredDrafts?: number;
}

export interface DiagnosisThresholds {
  minOrdersForTrend:            number; // below this sample → no loud alerts
  revenueDropWarnPct:           number;
  revenueDropCriticalPct:       number;
  ordersDropWarnPct:            number;
  ticketDropWarnPct:            number;
  attachDropRelPct:             number; // relative drop in attach rate
  topProductDropPct:            number;
  cancellationRateWarnLevel:    number; // absolute % level
  cancellationRateCriticalLevel: number;
  cancellationRiseWarnPoints:   number; // pp rise vs previous
  pixPendingSpikeFactor:        number; // current >= factor × previous
  pixPendingMinCount:           number;
  campaignMinSends:             number;
  campaignLowConversionPct:     number;
  recoveryAbandonMin:           number;
}

export const DEFAULT_THRESHOLDS: DiagnosisThresholds = {
  minOrdersForTrend:             6,
  revenueDropWarnPct:            20,
  revenueDropCriticalPct:        35,
  ordersDropWarnPct:             20,
  ticketDropWarnPct:             15,
  attachDropRelPct:              20,
  topProductDropPct:             50,
  cancellationRateWarnLevel:     10,
  cancellationRateCriticalLevel: 20,
  cancellationRiseWarnPoints:    5,
  pixPendingSpikeFactor:         2,
  pixPendingMinCount:            3,
  campaignMinSends:              30,
  campaignLowConversionPct:      1,
  recoveryAbandonMin:            5,
};

export interface DiagnosisInput {
  current:          AnalyticsOverview;
  previous:         AnalyticsOverview | null;
  period:           DiagnosisPeriodMeta;
  comparisonPeriod: DiagnosisPeriodMeta | null;
  campaign?:        CampaignDiagnosisInput;
  recovery?:        RecoveryDiagnosisInput;
  thresholds?:      Partial<DiagnosisThresholds>;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
/** Signed percentage change. Returns 0 when the base is non-positive. */
function pctChange(cur: number, prev: number): number {
  if (prev <= 0) return 0;
  return round1(((cur - prev) / prev) * 100);
}
function signedPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function attachRate(rates: AttachRate[], label: string): AttachRate | undefined {
  return rates.find((a) => a.label === label);
}
function productByName(rows: ProductRow[], name: string): ProductRow | undefined {
  return rows.find((p) => p.name === name);
}
function channelBySource(rows: ChannelRow[], source: string): ChannelRow | undefined {
  return rows.find((c) => c.source === source);
}

// ─── Main service ─────────────────────────────────────────────────────────────

export class AnalyticsDiagnosisService {
  /**
   * Produce a full diagnosis report. Pure — no side effects.
   */
  static diagnose(input: DiagnosisInput): DiagnosisReport {
    const t = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
    const { current, previous, period, comparisonPeriod } = input;

    const curKpi = current.kpi;
    const dataQuality: DiagnosisDataQuality =
      curKpi.orders === 0 ? "NONE" :
      curKpi.orders <  t.minOrdersForTrend ? "LOW" :
      "SUFFICIENT";

    const hasComparison =
      previous !== null && previous.kpi.orders > 0;

    const findings:    Finding[] = [];
    const anomalies:   Anomaly[] = [];
    const limitations: string[]  = [];

    // A sample is trustworthy for trend alerts when BOTH periods have enough orders.
    const sampleOkForTrend =
      hasComparison &&
      curKpi.orders        >= t.minOrdersForTrend &&
      previous!.kpi.orders >= t.minOrdersForTrend;

    if (!hasComparison) {
      limitations.push(
        "Não há período anterior comparável com pedidos suficientes — o diagnóstico fica limitado a sinais absolutos do período atual (não é possível afirmar tendências de alta/queda).",
      );
    } else if (!sampleOkForTrend) {
      limitations.push(
        `Amostra pequena (${fmtNum(curKpi.orders)} pedido(s) no período atual, ${fmtNum(previous!.kpi.orders)} no anterior). Variações percentuais podem ser ruído estatístico; alertas críticos de tendência foram suprimidos.`,
      );
    }

    // ── Comparison-based findings (A–E + part of F) ──────────────────────────
    if (hasComparison) {
      this.diagnoseRevenue(current, previous!, t, sampleOkForTrend, findings);
      this.diagnoseOrders(current, previous!, t, sampleOkForTrend, findings);
      this.diagnoseAvgTicket(current, previous!, t, sampleOkForTrend, findings);
      this.diagnoseTopProduct(current, previous!, t, sampleOkForTrend, findings);
      this.diagnoseAttach(current, previous!, t, sampleOkForTrend, "Bebidas", findings);
      this.diagnoseAttach(current, previous!, t, sampleOkForTrend, "Sobremesas", findings);
      this.diagnoseUpsell(current, previous!, t, sampleOkForTrend, findings);
    }

    // ── Absolute-level anomalies (fire with or without a previous period) ────
    this.anomalyCancellation(current, previous, t, anomalies);
    this.anomalyPixPending(current, previous, t, anomalies);
    this.anomalyZeroSales(current, previous, hasComparison, findings);

    // ── Optional signals: campaign & recovery ────────────────────────────────
    if (input.campaign) {
      this.diagnoseCampaign(input.campaign, t, findings, anomalies);
    } else {
      limitations.push(
        "Diagnóstico de campanhas não incluído nesta análise (dados de campanha não fornecidos).",
      );
    }

    if (input.recovery) {
      this.diagnoseRecovery(input.recovery, t, findings);
    }

    // ── Sort by severity, then build summary & action list ───────────────────
    const PRIORITY: DiagnosisSeverity[] = ["CRITICAL", "WARNING", "OPPORTUNITY", "INFO", "GOOD"];
    findings.sort((a, b) => PRIORITY.indexOf(a.severity) - PRIORITY.indexOf(b.severity));
    anomalies.sort((a, b) => PRIORITY.indexOf(a.severity) - PRIORITY.indexOf(b.severity));

    const recommendedActions = this.collectActions(findings, anomalies);
    const summary = this.buildSummary(
      current, period, findings, anomalies, dataQuality, hasComparison,
    );

    return {
      period,
      comparisonPeriod,
      summary,
      findings,
      anomalies,
      recommendedActions,
      limitations,
      dataQuality,
      hasComparison,
    };
  }

  // ── A. Revenue drop (decomposed into orders × ticket + sub-causes) ─────────

  private static diagnoseRevenue(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    t: DiagnosisThresholds,
    sampleOk: boolean,
    out: Finding[],
  ): void {
    const c = cur.kpi.revenue;
    const p = prev.kpi.revenue;
    const delta = pctChange(c, p);

    // Positive case — surface a GOOD finding for meaningful growth.
    if (delta >= 15 && sampleOk) {
      out.push({
        id:            "revenue_up",
        title:         "Receita em alta vs. período anterior",
        severity:      "GOOD",
        metric:        "Receita",
        currentValue:  c,
        previousValue: p,
        deltaAbs:      round1(c - p),
        deltaPct:      delta,
        likelyCauses:  [
          this.driverNarrative(cur, prev, "up"),
        ],
        evidence: [
          `Receita: ${fmtBRL(p)} → ${fmtBRL(c)} (${signedPct(delta)})`,
          `Pedidos: ${fmtNum(prev.kpi.orders)} → ${fmtNum(cur.kpi.orders)}`,
          `Ticket médio: ${fmtBRL(prev.kpi.avgTicket)} → ${fmtBRL(cur.kpi.avgTicket)}`,
        ],
        confidence:        "HIGH",
        recommendedAction: "Mantenha o que está funcionando e destaque o produto campeão no cardápio para sustentar o crescimento.",
        relatedEntities:   {},
      });
      return;
    }

    if (delta > -t.revenueDropWarnPct) return; // not a material drop

    const isCritical = sampleOk && delta <= -t.revenueDropCriticalPct;
    const severity: DiagnosisSeverity = isCritical ? "CRITICAL" : "WARNING";

    const ordersDelta = pctChange(cur.kpi.orders, prev.kpi.orders);
    const ticketDelta = pctChange(cur.kpi.avgTicket, prev.kpi.avgTicket);

    // Rank the structural driver: did fewer orders or a lower ticket dominate?
    const causes: string[] = [];
    if (ordersDelta < 0 || ticketDelta < 0) {
      if (Math.abs(ordersDelta) >= Math.abs(ticketDelta)) {
        causes.push(`Queda no número de pedidos é o principal fator observado (${signedPct(ordersDelta)}).`);
        if (ticketDelta < -2) causes.push(`Ticket médio também recuou (${signedPct(ticketDelta)}), efeito secundário.`);
      } else {
        causes.push(`Queda no ticket médio é o principal fator observado (${signedPct(ticketDelta)}).`);
        if (ordersDelta < -2) causes.push(`Número de pedidos também caiu (${signedPct(ordersDelta)}), efeito secundário.`);
      }
    } else {
      causes.push("Não há dados suficientes para afirmar o fator estrutural — receita caiu sem queda clara de pedidos ou ticket.");
    }

    const related: RelatedEntities = {};

    // Sub-cause: a channel that lost the most revenue.
    const channelDrop = this.biggestChannelDrop(cur.channels, prev.channels);
    if (channelDrop && channelDrop.deltaAbs < 0) {
      causes.push(`Indício de queda no canal "${channelDrop.source}" (${fmtBRL(channelDrop.prev)} → ${fmtBRL(channelDrop.cur)}).`);
      related.channel = channelDrop.source;
    }

    // Sub-cause: cancellations rose.
    const cancRise = round1(cur.kpi.cancellationRate - prev.kpi.cancellationRate);
    if (cancRise >= t.cancellationRiseWarnPoints) {
      causes.push(`Aumento de cancelamentos é um fator provável (${prev.kpi.cancellationRate.toFixed(1)}% → ${cur.kpi.cancellationRate.toFixed(1)}%).`);
    }

    // Sub-cause: the previous champion product fell.
    const topDrop = this.previousTopProductDrop(cur.topProducts, prev.topProducts, t.topProductDropPct);
    if (topDrop) {
      causes.push(`Indício: o produto campeão anterior "${topDrop.name}" caiu ${signedPct(topDrop.deltaPct)} em receita.`);
      related.products = [topDrop.name];
    }

    out.push({
      id:            "revenue_drop",
      title:         "Receita caiu vs. período anterior",
      severity,
      metric:        "Receita",
      currentValue:  c,
      previousValue: p,
      deltaAbs:      round1(c - p),
      deltaPct:      delta,
      likelyCauses:  causes,
      evidence: [
        `Receita: ${fmtBRL(p)} → ${fmtBRL(c)} (${signedPct(delta)})`,
        `Pedidos: ${fmtNum(prev.kpi.orders)} → ${fmtNum(cur.kpi.orders)} (${signedPct(ordersDelta)})`,
        `Ticket médio: ${fmtBRL(prev.kpi.avgTicket)} → ${fmtBRL(cur.kpi.avgTicket)} (${signedPct(ticketDelta)})`,
      ],
      confidence:        sampleOk ? "MEDIUM" : "LOW",
      recommendedAction: Math.abs(ordersDelta) >= Math.abs(ticketDelta)
        ? "Investigar a queda no volume de pedidos: reativar clientes mornos/frios e revisar canais de aquisição."
        : "Investigar a queda no ticket médio: reforçar sugestão de bebida/sobremesa e revisar descontos aplicados.",
      relatedEntities:   related,
    });
  }

  // ── B. Order count drop ─────────────────────────────────────────────────────

  private static diagnoseOrders(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    t: DiagnosisThresholds,
    sampleOk: boolean,
    out: Finding[],
  ): void {
    const c = cur.kpi.orders;
    const p = prev.kpi.orders;
    const delta = pctChange(c, p);
    if (delta > -t.ordersDropWarnPct) return;

    const causes: string[] = [];
    const related: RelatedEntities = {};

    const newDelta = pctChange(cur.kpi.newCustomers, prev.kpi.newCustomers);
    if (cur.kpi.newCustomers < prev.kpi.newCustomers) {
      causes.push(`Queda na entrada de novos clientes é um fator provável (${fmtNum(prev.kpi.newCustomers)} → ${fmtNum(cur.kpi.newCustomers)}, ${signedPct(newDelta)}).`);
    }
    if (cur.kpi.newCustomers === 0 && prev.kpi.newCustomers > 0) {
      causes.push("Nenhum cliente novo no período — indício de estagnação na aquisição.");
    }

    const channelDrop = this.biggestChannelDrop(cur.channels, prev.channels);
    if (channelDrop && channelDrop.deltaAbs < 0) {
      causes.push(`Indício de retração no canal "${channelDrop.source}".`);
      related.channel = channelDrop.source;
    }

    if (causes.length === 0) {
      causes.push("Não há dados suficientes para afirmar a causa — a queda não se explica por novos clientes ou canais isolados.");
    }

    out.push({
      id:            "orders_drop",
      title:         "Número de pedidos caiu",
      severity:      "WARNING",
      metric:        "Pedidos",
      currentValue:  c,
      previousValue: p,
      deltaAbs:      round1(c - p),
      deltaPct:      delta,
      likelyCauses:  causes,
      evidence: [
        `Pedidos: ${fmtNum(p)} → ${fmtNum(c)} (${signedPct(delta)})`,
        `Novos clientes: ${fmtNum(prev.kpi.newCustomers)} → ${fmtNum(cur.kpi.newCustomers)}`,
      ],
      confidence:        sampleOk ? "MEDIUM" : "LOW",
      recommendedAction: "Criar campanha de reativação para clientes mornos/frios e revisar links rastreáveis de aquisição.",
      relatedEntities:   related,
    });
  }

  // ── C. Average ticket drop ──────────────────────────────────────────────────

  private static diagnoseAvgTicket(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    t: DiagnosisThresholds,
    sampleOk: boolean,
    out: Finding[],
  ): void {
    const c = cur.kpi.avgTicket;
    const p = prev.kpi.avgTicket;
    const delta = pctChange(c, p);
    if (delta > -t.ticketDropWarnPct) return;

    const causes: string[] = [];
    const related: RelatedEntities = {};

    // Upsell revenue share fell.
    const upShareDelta = round1(cur.upsellRevenue.revenueShare - prev.upsellRevenue.revenueShare);
    if (upShareDelta < -2) {
      causes.push(`Menos upsell: participação da receita incremental caiu de ${prev.upsellRevenue.revenueShare.toFixed(1)}% para ${cur.upsellRevenue.revenueShare.toFixed(1)}%.`);
    }

    // Drink / dessert attach fell.
    for (const label of ["Bebidas", "Sobremesas"]) {
      const a = attachRate(cur.attachRates, label);
      const b = attachRate(prev.attachRates, label);
      if (a && b && b.rate > 0) {
        const ad = pctChange(a.rate, b.rate);
        if (ad <= -t.attachDropRelPct) {
          causes.push(`Queda na taxa de ${label.toLowerCase()} (${b.rate.toFixed(0)}% → ${a.rate.toFixed(0)}%) reduz o ticket — fator provável.`);
          related.categories = [...(related.categories ?? []), label];
        }
      }
    }

    if (causes.length === 0) {
      causes.push("Indício de mudança no mix de produtos (itens de menor preço dominando), mas não há dado isolado suficiente para afirmar a causa única.");
    }

    out.push({
      id:            "avg_ticket_drop",
      title:         "Ticket médio caiu",
      severity:      "WARNING",
      metric:        "Ticket médio",
      currentValue:  c,
      previousValue: p,
      deltaAbs:      round1(c - p),
      deltaPct:      delta,
      likelyCauses:  causes,
      evidence: [
        `Ticket médio: ${fmtBRL(p)} → ${fmtBRL(c)} (${signedPct(delta)})`,
        `Upsell: ${prev.upsellRevenue.revenueShare.toFixed(1)}% → ${cur.upsellRevenue.revenueShare.toFixed(1)}% da receita`,
      ],
      confidence:        sampleOk ? "MEDIUM" : "LOW",
      recommendedAction: "Ativar/destacar sugestão de bebida e sobremesa no pedido e revisar combos para elevar o ticket.",
      relatedEntities:   related,
    });
  }

  // ── D. Top product disappeared / collapsed ──────────────────────────────────

  private static diagnoseTopProduct(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    t: DiagnosisThresholds,
    sampleOk: boolean,
    out: Finding[],
  ): void {
    const drop = this.previousTopProductDrop(cur.topProducts, prev.topProducts, t.topProductDropPct);
    if (!drop) return;

    const wasUnavailable = cur.zeroSalesProducts.some(
      (z) => z.name === drop.name && !z.isAvailable,
    );

    const causes: string[] = [
      `O produto "${drop.name}" era o campeão de receita e caiu ${signedPct(drop.deltaPct)} (${fmtBRL(drop.prevRevenue)} → ${fmtBRL(drop.curRevenue)}).`,
    ];
    if (wasUnavailable) {
      causes.push(`Indício forte: "${drop.name}" aparece como esgotado/indisponível no cardápio no período.`);
    } else if (drop.curRevenue === 0) {
      causes.push("Produto sem nenhuma venda no período — verificar disponibilidade, preço ou posição no cardápio.");
    } else {
      causes.push("Não há dado de disponibilidade que confirme a causa — pode ser preço, sazonalidade ou posição no cardápio.");
    }

    out.push({
      id:            "top_product_drop",
      title:         `Produto campeão "${drop.name}" perdeu força`,
      severity:      drop.curRevenue === 0 ? "WARNING" : "OPPORTUNITY",
      metric:        "Receita do produto",
      currentValue:  drop.curRevenue,
      previousValue: drop.prevRevenue,
      deltaAbs:      round1(drop.curRevenue - drop.prevRevenue),
      deltaPct:      drop.deltaPct,
      likelyCauses:  causes,
      evidence: [
        `"${drop.name}": ${fmtBRL(drop.prevRevenue)} → ${fmtBRL(drop.curRevenue)} (${signedPct(drop.deltaPct)})`,
      ],
      confidence:        wasUnavailable ? "HIGH" : (sampleOk ? "MEDIUM" : "LOW"),
      recommendedAction: wasUnavailable
        ? `Revisar disponibilidade de "${drop.name}" — repor estoque ou reativar no cardápio.`
        : `Revisar preço, foto e posição de "${drop.name}" no cardápio e considerar destaque ou combo.`,
      relatedEntities:   { products: [drop.name] },
    });
  }

  // ── E. Attach-rate anomaly (drinks / desserts) ──────────────────────────────

  private static diagnoseAttach(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    t: DiagnosisThresholds,
    sampleOk: boolean,
    label: string,
    out: Finding[],
  ): void {
    const a = attachRate(cur.attachRates, label);
    const b = attachRate(prev.attachRates, label);
    if (!a || !b || b.rate <= 0 || a.total < t.minOrdersForTrend) return;

    const delta = pctChange(a.rate, b.rate);
    if (delta > -t.attachDropRelPct) return;

    out.push({
      id:            `attach_drop_${label.toLowerCase()}`,
      title:         `Aderência de ${label.toLowerCase()} caiu`,
      severity:      "OPPORTUNITY",
      metric:        `Attach ${label}`,
      currentValue:  round1(a.rate),
      previousValue: round1(b.rate),
      deltaAbs:      round1(a.rate - b.rate),
      deltaPct:      delta,
      likelyCauses: [
        `Menos pedidos incluíram ${label.toLowerCase()} (${b.rate.toFixed(0)}% → ${a.rate.toFixed(0)}%) — impacto direto no ticket médio.`,
        "Provável enfraquecimento da sugestão de complemento no fluxo de pedido.",
      ],
      evidence: [
        `Attach ${label}: ${b.rate.toFixed(0)}% → ${a.rate.toFixed(0)}% (${signedPct(delta)})`,
        `Receita de ${label.toLowerCase()}: ${fmtBRL(b.addedRevenue)} → ${fmtBRL(a.addedRevenue)}`,
      ],
      confidence:        sampleOk ? "MEDIUM" : "LOW",
      recommendedAction: `Ativar sugestão de ${label.toLowerCase()} no pedido e criar combo para recuperar a aderência.`,
      relatedEntities:   { categories: [label] },
    });
  }

  // ── E (cont). Upsell revenue anomaly ────────────────────────────────────────

  private static diagnoseUpsell(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    t: DiagnosisThresholds,
    sampleOk: boolean,
    out: Finding[],
  ): void {
    const c = cur.upsellRevenue.revenue;
    const p = prev.upsellRevenue.revenue;
    if (p <= 0) return; // no baseline to drop from
    const delta = pctChange(c, p);
    if (delta > -t.attachDropRelPct) return;

    out.push({
      id:            "upsell_drop",
      title:         "Receita incremental (upsell) caiu",
      severity:      "OPPORTUNITY",
      metric:        "Receita de upsell",
      currentValue:  c,
      previousValue: p,
      deltaAbs:      round1(c - p),
      deltaPct:      delta,
      likelyCauses: [
        `A receita gerada por sugestões caiu de ${fmtBRL(p)} para ${fmtBRL(c)} (${signedPct(delta)}).`,
        "Provável queda na conversão das sugestões do agente no fluxo de pedido.",
      ],
      evidence: [
        `Upsell: ${fmtBRL(p)} → ${fmtBRL(c)} (${signedPct(delta)})`,
        `Pedidos com upsell: ${fmtNum(prev.upsellRevenue.ordersWithUpsell)} → ${fmtNum(cur.upsellRevenue.ordersWithUpsell)}`,
      ],
      confidence:        sampleOk ? "MEDIUM" : "LOW",
      recommendedAction: "Revisar o agente de sugestões no pedido e reforçar ofertas de bebida/sobremesa no checkout.",
      relatedEntities:   {},
    });
  }

  // ── F. Cancellation anomaly (absolute level + rise) ─────────────────────────

  private static anomalyCancellation(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview | null,
    t: DiagnosisThresholds,
    out: Anomaly[],
  ): void {
    if (cur.kpi.orders + cur.kpi.cancelledOrders < t.minOrdersForTrend) return;
    const rate = cur.kpi.cancellationRate;

    const rise = prev ? round1(rate - prev.kpi.cancellationRate) : null;
    const breachesLevel = rate >= t.cancellationRateWarnLevel;
    const breachesRise  = rise !== null && rise >= t.cancellationRiseWarnPoints;
    if (!breachesLevel && !breachesRise) return;

    const severity: DiagnosisSeverity =
      rate >= t.cancellationRateCriticalLevel ? "CRITICAL" : "WARNING";

    const riseTxt = rise !== null ? ` (${signedPct(rise)} pp vs. anterior)` : "";

    out.push({
      id:            "cancellation_spike",
      severity,
      metric:        "Taxa de cancelamento",
      threshold:     `nível ≥ ${t.cancellationRateWarnLevel}% ou alta ≥ ${t.cancellationRiseWarnPoints}pp`,
      observedValue: round1(rate),
      whyItMatters:  `${cur.kpi.cancelledOrders} pedido(s) cancelado(s) representam receita perdida${riseTxt}. Cancelamentos altos costumam indicar problema de pagamento, tempo de preparo ou ruptura de estoque.`,
      recommendedAction: "Investigar o aumento de pedidos cancelados — revisar checkout/Pix, tempo de preparo e disponibilidade de itens.",
    });
  }

  // ── F (cont). Pix / unpaid pending spike ────────────────────────────────────

  private static anomalyPixPending(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview | null,
    t: DiagnosisThresholds,
    out: Anomaly[],
  ): void {
    const c = cur.kpi.awaitingPaymentCount;
    if (c < t.pixPendingMinCount) return;

    const p = prev?.kpi.awaitingPaymentCount ?? 0;
    const spiked = prev ? (p > 0 ? c >= p * t.pixPendingSpikeFactor : c >= t.pixPendingMinCount) : true;
    if (prev && !spiked) return;

    out.push({
      id:            "pix_pending_spike",
      severity:      "WARNING",
      metric:        "Pagamentos pendentes",
      threshold:     prev ? `≥ ${t.pixPendingSpikeFactor}× o período anterior` : `≥ ${t.pixPendingMinCount} pendências`,
      observedValue: c,
      whyItMatters:  `${fmtNum(c)} pedido(s) aguardando pagamento (${fmtBRL(cur.kpi.awaitingPaymentTotal)} parados). Pendências de Pix não confirmadas viram receita não realizada e podem virar cancelamento.`,
      recommendedAction: "Rever o checkout Pix: confirmar geração do QR, lembrete de pagamento e prazo de expiração.",
    });
  }

  // ── D (cont). Zero-sales product that previously sold ───────────────────────

  private static anomalyZeroSales(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview | null,
    hasComparison: boolean,
    out: Finding[],
  ): void {
    if (!hasComparison || !prev) return;

    // A product that sold in the previous period but is now flagged zero-sales.
    const prevSellers = new Set(prev.topProducts.filter((p) => p.revenue > 0).map((p) => p.name));
    const stalled = cur.zeroSalesProducts.filter((z) => prevSellers.has(z.name));
    if (stalled.length === 0) return;

    const names = stalled.slice(0, 5).map((s) => s.name);
    const anyUnavailable = stalled.some((s) => !s.isAvailable);

    out.push({
      id:            "stalled_products",
      title:         `Produto(s) que vendiam pararam de vender`,
      severity:      "WARNING",
      metric:        "Produtos parados",
      currentValue:  0,
      previousValue: stalled.length,
      deltaAbs:      -stalled.length,
      deltaPct:      -100,
      likelyCauses: [
        `${stalled.length} produto(s) que tiveram venda no período anterior ficaram sem nenhuma venda agora: ${names.join(", ")}.`,
        anyUnavailable
          ? "Indício: ao menos um deles aparece como esgotado/indisponível."
          : "Não há dado de disponibilidade que confirme a causa — verificar preço, posição no cardápio ou sazonalidade.",
      ],
      evidence: [
        `Produtos parados que antes vendiam: ${names.join(", ")}`,
      ],
      confidence:        anyUnavailable ? "HIGH" : "MEDIUM",
      recommendedAction: "Revisar disponibilidade/preço dos produtos parados e considerar uma promoção leve para reativá-los.",
      relatedEntities:   { products: names },
    });
  }

  // ── G. Campaign anomaly (optional input) ────────────────────────────────────

  private static diagnoseCampaign(
    camp: CampaignDiagnosisInput,
    t: DiagnosisThresholds,
    findings: Finding[],
    anomalies: Anomaly[],
  ): void {
    if (camp.sends < t.campaignMinSends) {
      // Not enough sends to judge — stay silent (avoid noisy alerts).
      return;
    }
    const convPct = camp.sends > 0 ? round1((camp.conversions / camp.sends) * 100) : 0;

    if (convPct < t.campaignLowConversionPct) {
      anomalies.push({
        id:            "campaign_low_conversion",
        severity:      "WARNING",
        metric:        "Conversão de campanha",
        threshold:     `< ${t.campaignLowConversionPct}% após ≥ ${t.campaignMinSends} envios`,
        observedValue: convPct,
        whyItMatters:  `${fmtNum(camp.sends)} envios geraram apenas ${fmtNum(camp.conversions)} conversão(ões) (${convPct.toFixed(1)}%). Conversão baixa com volume alto indica mensagem, oferta ou público mal ajustados.`,
        recommendedAction: "Revisar oferta e segmentação da campanha — testar cupom mais atrativo ou público mais quente.",
      });
    }

    if (camp.prevConversions !== undefined && camp.prevSends !== undefined && camp.prevSends >= t.campaignMinSends) {
      const prevConvPct = camp.prevSends > 0 ? round1((camp.prevConversions / camp.prevSends) * 100) : 0;
      const delta = pctChange(convPct, prevConvPct);
      if (delta <= -t.attachDropRelPct && prevConvPct > 0) {
        findings.push({
          id:            "campaign_conversion_drop",
          title:         "Conversão de campanha caiu",
          severity:      "WARNING",
          metric:        "Conversão de campanha",
          currentValue:  convPct,
          previousValue: prevConvPct,
          deltaAbs:      round1(convPct - prevConvPct),
          deltaPct:      delta,
          likelyCauses: [
            `Conversão caiu de ${prevConvPct.toFixed(1)}% para ${convPct.toFixed(1)}% (${signedPct(delta)}).`,
            "Provável fadiga de público ou oferta menos atrativa que o período anterior.",
          ],
          evidence: [
            `Envios: ${fmtNum(camp.prevSends)} → ${fmtNum(camp.sends)}`,
            `Conversões: ${fmtNum(camp.prevConversions)} → ${fmtNum(camp.conversions)}`,
          ],
          confidence:        "MEDIUM",
          recommendedAction: "Renovar a oferta da campanha e evitar reenviar para o mesmo público em curto intervalo.",
          relatedEntities:   { campaignIds: camp.campaignIds ?? [] },
        });
      }
    }
  }

  // ── H. Recovery anomaly (optional input) ────────────────────────────────────

  private static diagnoseRecovery(
    rec: RecoveryDiagnosisInput,
    t: DiagnosisThresholds,
    out: Finding[],
  ): void {
    if (rec.abandonedDrafts < t.recoveryAbandonMin) return;

    const recoveredRate = rec.abandonedDrafts > 0
      ? round1((rec.recoveredDrafts / rec.abandonedDrafts) * 100)
      : 0;

    // Only flag when recovery is materially weak.
    if (recoveredRate >= 20) return;

    out.push({
      id:            "recovery_weak",
      title:         "Carrinhos abandonados pouco recuperados",
      severity:      "OPPORTUNITY",
      metric:        "Recuperação de carrinho",
      currentValue:  rec.recoveredDrafts,
      previousValue: rec.abandonedDrafts,
      deltaAbs:      round1(rec.recoveredDrafts - rec.abandonedDrafts),
      deltaPct:      -round1(100 - recoveredRate),
      likelyCauses: [
        `${fmtNum(rec.abandonedDrafts)} carrinho(s) abandonado(s) e apenas ${fmtNum(rec.recoveredDrafts)} recuperado(s) (${recoveredRate.toFixed(0)}%).`,
        "Indício de oportunidade de receita parada no funil de checkout.",
      ],
      evidence: [
        `Abandonados: ${fmtNum(rec.abandonedDrafts)} · Recuperados: ${fmtNum(rec.recoveredDrafts)} (${recoveredRate.toFixed(0)}%)`,
      ],
      confidence:        "MEDIUM",
      recommendedAction: "Revisar o fluxo de recuperação de carrinho — lembrete mais rápido e oferta de incentivo no retorno.",
      relatedEntities:   {},
    });
  }

  // ── Shared sub-signal helpers ───────────────────────────────────────────────

  /** The previous-period #1 product and how much its revenue fell now. */
  private static previousTopProductDrop(
    curProducts: ProductRow[],
    prevProducts: ProductRow[],
    dropPct: number,
  ): { name: string; prevRevenue: number; curRevenue: number; deltaPct: number } | null {
    const prevTop = prevProducts[0];
    if (!prevTop || prevTop.revenue <= 0) return null;
    const curMatch = productByName(curProducts, prevTop.name);
    const curRevenue = curMatch?.revenue ?? 0;
    const delta = pctChange(curRevenue, prevTop.revenue);
    if (delta > -dropPct) return null;
    return { name: prevTop.name, prevRevenue: prevTop.revenue, curRevenue, deltaPct: delta };
  }

  /** The channel that lost the most absolute revenue between periods. */
  private static biggestChannelDrop(
    curChannels: ChannelRow[],
    prevChannels: ChannelRow[],
  ): { source: string; prev: number; cur: number; deltaAbs: number } | null {
    let worst: { source: string; prev: number; cur: number; deltaAbs: number } | null = null;
    for (const prev of prevChannels) {
      const cur = channelBySource(curChannels, prev.source)?.revenue ?? 0;
      const deltaAbs = round1(cur - prev.revenue);
      if (deltaAbs < 0 && (!worst || deltaAbs < worst.deltaAbs)) {
        worst = { source: prev.source, prev: prev.revenue, cur, deltaAbs };
      }
    }
    return worst;
  }

  /** Narrative describing whether orders or ticket drove the change. */
  private static driverNarrative(
    cur: AnalyticsOverview,
    prev: AnalyticsOverview,
    direction: "up" | "down",
  ): string {
    const ordersDelta = pctChange(cur.kpi.orders, prev.kpi.orders);
    const ticketDelta = pctChange(cur.kpi.avgTicket, prev.kpi.avgTicket);
    const verb = direction === "up" ? "crescimento" : "queda";
    if (Math.abs(ordersDelta) >= Math.abs(ticketDelta)) {
      return `O ${verb} foi puxado principalmente pelo volume de pedidos (${signedPct(ordersDelta)}).`;
    }
    return `O ${verb} foi puxado principalmente pelo ticket médio (${signedPct(ticketDelta)}).`;
  }

  // ── Action list + summary ───────────────────────────────────────────────────

  private static collectActions(findings: Finding[], anomalies: Anomaly[]): string[] {
    const seen = new Set<string>();
    const actions: string[] = [];
    const push = (a: string) => {
      const key = a.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      actions.push(a.trim());
    };
    // Findings first (already severity-sorted), then anomalies.
    for (const f of findings) push(f.recommendedAction);
    for (const a of anomalies) push(a.recommendedAction);
    return actions.slice(0, 6);
  }

  private static buildSummary(
    cur: AnalyticsOverview,
    period: DiagnosisPeriodMeta,
    findings: Finding[],
    anomalies: Anomaly[],
    quality: DiagnosisDataQuality,
    hasComparison: boolean,
  ): string {
    if (quality === "NONE") {
      return `Sem pedidos no Foocci ${period.label.toLowerCase()} — não há base para diagnóstico de tendências neste período.`;
    }

    const k = cur.kpi;
    let text = `${period.label}: ${fmtBRL(k.revenue)} em ${fmtNum(k.orders)} pedido(s), ticket médio ${fmtBRL(k.avgTicket)}.`;

    if (!hasComparison) {
      text += " Sem período anterior comparável — diagnóstico limitado a sinais absolutos.";
    }

    const critical = findings.find((f) => f.severity === "CRITICAL")
      ?? anomalies.find((a) => a.severity === "CRITICAL");
    const warning = findings.find((f) => f.severity === "WARNING")
      ?? anomalies.find((a) => a.severity === "WARNING");
    const opportunity = findings.find((f) => f.severity === "OPPORTUNITY");

    if (critical) {
      const title = "title" in critical ? critical.title : critical.metric;
      text += ` Alerta crítico: ${title}.`;
    } else if (warning) {
      const title = "title" in warning ? warning.title : warning.metric;
      text += ` Principal alerta: ${title}.`;
    } else if (opportunity) {
      text += ` Principal oportunidade: ${opportunity.title}.`;
    } else if (hasComparison) {
      text += " Nenhum alerta relevante — indicadores estáveis ou em alta.";
    }

    const firstAction = findings[0]?.recommendedAction ?? anomalies[0]?.recommendedAction;
    if (firstAction) {
      text += ` Ação recomendada: ${firstAction}`;
    }

    return text;
  }
}
