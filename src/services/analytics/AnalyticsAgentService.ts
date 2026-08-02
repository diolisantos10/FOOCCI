/**
 * AnalyticsAgentService — W3 Conversational Analytics
 *
 * Routes owner questions to the correct deterministic analytics engines and
 * returns a grounded answer. The LLM is used only to format the final text;
 * all numbers and findings come from the existing services.
 *
 * NON-NEGOTIABLE CONSTRAINTS:
 *  - Never invents metrics, causes, or forecasts.
 *  - Every recommendation must reference at least one metric or finding.
 *  - If data is missing, says so explicitly.
 *  - No side effects — read-only, no sends, no mutations.
 *  - Hedged language: "os dados sugerem", "indício", "provável",
 *    "não há dados suficientes".
 *  - LLM falls back to deterministic template if OpenAI fails.
 */

import { selectEngineRouted } from "@/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";
import { prisma } from "@/lib/prisma";
import { AnalyticsService }                    from "./AnalyticsService";
import { AnalyticsDiagnosisService }            from "./AnalyticsDiagnosisService";
import { AnalyticsRetentionService }            from "./AnalyticsRetentionService";
import { AnalyticsOperationalEfficiencyService } from "./AnalyticsOperationalEfficiencyService";
import { AnalyticsInsightService }              from "./AnalyticsInsightService";
import { CampaignAttributionService }           from "@/services/crm/CampaignAttributionService";
import type { DiagnosisReport }                 from "./AnalyticsDiagnosisService";
import type { RetentionReport }                 from "./AnalyticsRetentionService";
import type { OperationalEfficiencyReport }     from "./AnalyticsOperationalEfficiencyService";
import type { AttributionSummary }              from "@/services/crm/CampaignAttributionService";
import type { AnalyticsOverview }               from "./AnalyticsService";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AnalyticsIntent =
  | "SALES_OVERVIEW"
  | "REVENUE_DROP_DIAGNOSIS"
  | "PRODUCT_PERFORMANCE"
  | "CUSTOMER_RETENTION"
  | "OPERATIONAL_EFFICIENCY"
  | "CAMPAIGN_PERFORMANCE"
  | "COUPON_ATTRIBUTION"
  | "UPSELL_PERFORMANCE"
  | "CART_RECOVERY"
  | "REVIEW_PERFORMANCE"
  | "ACTION_RECOMMENDATION"
  | "UNKNOWN_UNSUPPORTED";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface AnalyticsAgentInput {
  restaurantId:    string;
  question:        string;
  from?:           Date;
  to?:             Date;
  /** "7d" | "30d" | "90d" — alternative to from/to, resolved to the last N days */
  period?:         string;
  locale?:         string; // default "pt-BR"
  includeRawData?: boolean;
}

export interface AgentMetric {
  label: string;
  value: string | number;
  unit?: string;
}

export interface AnalyticsAgentAnswer {
  answer:              string;
  summary:             string;
  intent:              AnalyticsIntent;
  confidence:          ConfidenceLevel;
  dataSourcesUsed:     string[];
  metrics:             AgentMetric[];
  findings:            string[];
  recommendedActions:  string[];
  limitations:         string[];
  followUpQuestions:   string[];
  rawData?:            Record<string, unknown>;
}

// ─── Intent router (pure — exported for testing) ──────────────────────────────

/** Removes accents so keyword matching is accent-insensitive. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const DROP_KEYWORDS     = ["caiu", "queda", "por que", "porque", "pq", "diminuiu", "reduziu", "piorou", "baixou", "menos", "caindo", "queda de", "queda nas"];
const REVENUE_KEYWORDS  = ["venda", "faturamento", "receita", "resultado", "vendeu", "vendas", "arrecad", "renda"];
const PRODUCT_KEYWORDS  = ["produto", "mais vendido", "cardapio", "item", "prato", "campeao", "top produto"];
const CUSTOMER_KEYWORDS = ["cliente voltou", "retornou", "retencao", "recorrencia", "fidelidade", "voltaram", "voltando", "voltar", "cliente fiel", "cliente retorn"];
const CLIENTES_KEYWORDS = ["clientes estao", "clientes ficam", "cliente novo", "novos clientes", "base de clientes"];
const OPER_KEYWORDS     = ["demora", "operacao", "entrega", "preparo", "cozinha", "tempo de", "eficiencia", "atraso", "rapido", "lento", "demora"];
const CAMPAIGN_KEYWORDS = ["campanha", "disparos", "crm", "marketing", "disparei", "enviei", "mensagem enviada"];
const COUPON_KEYWORDS   = ["cupom", "desconto", "codigo", "promocao", "voucher", "promo"];
const UPSELL_KEYWORDS   = ["bebida", "sobremesa", "upsell", "adicional", "complemento", "acompanhamento", "attach"];
const CART_KEYWORDS     = ["carrinho", "abandono", "recuperacao", "draft", "abandonou", "perdeu pedido"];
const REVIEW_KEYWORDS   = ["avaliacao", "review", "nota", "google", "ifood reviews", "estrela", "comentario"];
const ACTION_KEYWORDS   = ["o que fazer", "o que devo", "o que eu devo", "acao", "prioridade", "recomendacao", "conselho", "ajuda", "devo fazer", "proximos passos", "sugestao", "me indique"];
const MARGIN_KEYWORDS   = ["lucro", "lucrei", "lucrar", "lucros", "margem", "custo", "cmv", "ganho", "liquido"];

export function routeIntent(question: string): AnalyticsIntent {
  const q = normalize(question);
  const has = (kws: string[]) => kws.some((k) => q.includes(k));

  // Margin questions get special handling (limitation response)
  if (has(MARGIN_KEYWORDS) && !has(REVENUE_KEYWORDS)) return "SALES_OVERVIEW"; // will add limitation
  // Drop + revenue = diagnosis (highest priority)
  if (has(DROP_KEYWORDS) && has(REVENUE_KEYWORDS)) return "REVENUE_DROP_DIAGNOSIS";
  // Drop without revenue (e.g., "por que caiu?" — assume sales)
  if (has(DROP_KEYWORDS) && !has(REVENUE_KEYWORDS)) return "REVENUE_DROP_DIAGNOSIS";

  if (has(CART_KEYWORDS))     return "CART_RECOVERY";
  if (has(REVIEW_KEYWORDS))   return "REVIEW_PERFORMANCE";
  if (has(CAMPAIGN_KEYWORDS)) return "CAMPAIGN_PERFORMANCE";
  if (has(COUPON_KEYWORDS))   return "COUPON_ATTRIBUTION";
  if (has(UPSELL_KEYWORDS))   return "UPSELL_PERFORMANCE";
  if (has(OPER_KEYWORDS))     return "OPERATIONAL_EFFICIENCY";
  if (has(ACTION_KEYWORDS))   return "ACTION_RECOMMENDATION";
  // Customer retention — needs both "cliente" + retention signal
  if (has(CUSTOMER_KEYWORDS) || has(CLIENTES_KEYWORDS)) return "CUSTOMER_RETENTION";
  if (has(PRODUCT_KEYWORDS))  return "PRODUCT_PERFORMANCE";
  if (has(REVENUE_KEYWORDS))  return "SALES_OVERVIEW";

  return "UNKNOWN_UNSUPPORTED";
}

// ─── Period helpers ───────────────────────────────────────────────────────────

interface ResolvedPeriod {
  fromDate:    Date;
  toDate:      Date;
  fromIso:     string;
  toIso:       string;
  periodLabel: string;
  durationDays: number;
}

function parseDateBRT(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!, 3, 0, 0)); // midnight BRT = 03:00 UTC
}

function dateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolvePeriod(
  from?:   Date,
  to?:     Date,
  period?: string,
): ResolvedPeriod {
  let fromDate: Date;
  let toDate:   Date;

  if (from && to) {
    fromDate = from;
    toDate   = new Date(to.getTime() + 86_400_000); // inclusive end
  } else {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    toDate   = new Date(Date.now());
    fromDate = new Date(toDate.getTime() - days * 86_400_000);
  }

  const durationDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000));
  const fromIso = dateIso(fromDate);
  const toIso   = dateIso(new Date(toDate.getTime() - 86_400_000));

  const periodLabel =
    durationDays ===   1 ? "Hoje"                    :
    durationDays ===   7 ? "Nos últimos 7 dias"       :
    durationDays ===  30 ? "Nos últimos 30 dias"      :
    durationDays ===  90 ? "Nos últimos 90 dias"      :
    durationDays === 365 ? "Nos últimos 12 meses"     :
    `Nos últimos ${durationDays} dias`;

  return { fromDate, toDate, fromIso, toIso, periodLabel, durationDays };
}

// ─── Grounded answer builder (pure — exported for testing) ───────────────────

export interface AgentServiceData {
  intent:      AnalyticsIntent;
  periodLabel: string;
  question:    string;
  overview?:   AnalyticsOverview;
  prevKpi?:    { revenue: number; orders: number; avgTicket: number } | null;
  diagnosis?:  DiagnosisReport;
  retention?:  RetentionReport;
  operations?: OperationalEfficiencyReport;
  attribution?: AttributionSummary;
  hasMarginQuestion?: boolean;
  /**
   * How many menu items already have a cost filled in. Undefined means "not checked"
   * and is treated as zero — the margin limitation used to be stated unconditionally,
   * so the agent told merchants "we have no CMV registered" right after they had
   * finished registering it. Denying a number the customer just typed reads as a bug.
   */
  itemsWithCost?: number;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function buildGroundedAnswer(data: AgentServiceData): AnalyticsAgentAnswer {
  const { intent, periodLabel, question } = data;

  const limitations:  string[] = [];
  const metrics:      AgentMetric[] = [];
  const findings:     string[] = [];
  const recommended:  string[] = [];
  const followUp:     string[] = [];
  const sources:      string[] = [];

  // ── Margin limitation — only when the cost really is missing ────────────────
  // This used to fire on every margin question regardless of the data, so a merchant
  // who had just filled in their costs was told the costs did not exist.
  if (data.hasMarginQuestion) {
    const withCost = data.itemsWithCost ?? 0;
    if (withCost === 0) {
      limitations.push(
        "Ainda não temos CMV/margem cadastrados, então consigo analisar receita, não lucro líquido.",
      );
    } else {
      // Say what we have and what is still missing — a partial cardápio gives a real
      // but incomplete CMV, and the merchant has to know which of the two they are
      // looking at (guardrail 7: never sell a pilot number as finished).
      limitations.push(
        `O CMV é calculado sobre os ${withCost} item(ns) que já têm custo cadastrado. ` +
          "Item sem custo fica de fora da conta, então a margem sai incompleta enquanto o cardápio não estiver todo preenchido.",
      );
    }
  }

  // ── iFood integration note ──────────────────────────────────────────────────
  const addIfoodNote = () =>
    limitations.push("O campo de preço iFood existe no sistema, mas a integração com iFood ainda não está ativa.");

  // ── Per-stage kitchen timing note ───────────────────────────────────────────
  const addTimingNote = () =>
    limitations.push(
      "Hoje medimos tempo total (criado → concluído); timestamps por etapa de cozinha ainda não existem.",
    );

  switch (intent) {

    // ────────────────────────────────────────────────────────────────────────────
    case "SALES_OVERVIEW": {
      sources.push("AnalyticsService", "AnalyticsInsightService");
      const ov = data.overview;
      if (!ov || ov.kpi.orders === 0) {
        findings.push("Não há pedidos no período selecionado.");
        break;
      }
      const { kpi } = ov;
      metrics.push(
        { label: "Faturamento",   value: fmt(kpi.revenue),   unit: "BRL" },
        { label: "Pedidos",       value: fmtNum(kpi.orders)               },
        { label: "Ticket médio",  value: fmt(kpi.avgTicket), unit: "BRL" },
        { label: "Cancelamentos", value: fmtPct(kpi.cancellationRate)     },
      );
      if (data.prevKpi && data.prevKpi.orders > 0) {
        const delta = ((kpi.revenue - data.prevKpi.revenue) / data.prevKpi.revenue) * 100;
        metrics.push({ label: "Variação de receita vs período anterior", value: fmtPct(delta) });
      }
      findings.push(`${periodLabel}, o restaurante faturou ${fmt(kpi.revenue)} em ${fmtNum(kpi.orders)} pedidos.`);
      if (kpi.cancellationRate > 10) {
        findings.push(`Atenção: taxa de cancelamento de ${fmtPct(kpi.cancellationRate)} — acima do saudável (<10%).`);
        recommended.push("Investigar motivos de cancelamento (tempo de preparo, estoque, pagamento não confirmado).");
      }
      const drinks   = ov.attachRates.find((a) => a.label === "Bebidas");
      const desserts = ov.attachRates.find((a) => a.label === "Sobremesas");
      if (drinks && drinks.rate < 30 && kpi.orders > 5) {
        findings.push(`Taxa de bebidas: ${fmtPct(drinks.rate)} — baixa (meta ≥ 30%).`);
        recommended.push("Estimular bebidas nos pedidos — cada bebida eleva o ticket médio diretamente.");
      }
      if (desserts && desserts.rate < 20 && kpi.orders > 5) {
        findings.push(`Taxa de sobremesas: ${fmtPct(desserts.rate)} — oportunidade de upsell.`);
        recommended.push("Criar campanha de sobremesa para clientes recorrentes.");
      }
      if (kpi.orders < 6) limitations.push("Amostra pequena (menos de 6 pedidos) — conclusões têm baixa confiança.");
      followUp.push("Quais produtos mais venderam?", "Os clientes estão voltando?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "REVENUE_DROP_DIAGNOSIS": {
      sources.push("AnalyticsDiagnosisService", "AnalyticsService");
      const diag = data.diagnosis;
      if (!diag) {
        findings.push("Não foi possível gerar diagnóstico — dados insuficientes.");
        break;
      }
      findings.push(diag.summary);
      for (const f of diag.findings.slice(0, 5)) {
        if (f.severity === "WARNING" || f.severity === "CRITICAL") {
          findings.push(`${f.title}: ${f.evidence.join("; ")}`);
        }
      }
      for (const a of diag.anomalies.slice(0, 3)) {
        findings.push(`${a.severity} — ${a.metric}: ${a.whyItMatters}`);
      }
      for (const act of diag.recommendedActions.slice(0, 4)) {
        recommended.push(act);
      }
      limitations.push(...diag.limitations);
      const kpi = data.overview?.kpi;
      if (kpi) {
        metrics.push(
          { label: "Faturamento atual",  value: fmt(kpi.revenue),   unit: "BRL" },
          { label: "Pedidos",            value: fmtNum(kpi.orders)               },
          { label: "Ticket médio",       value: fmt(kpi.avgTicket), unit: "BRL" },
        );
      }
      followUp.push("Como está a operação?", "Quais produtos mais venderam?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "PRODUCT_PERFORMANCE": {
      sources.push("AnalyticsService");
      const ov = data.overview;
      if (!ov || ov.kpi.orders === 0) {
        findings.push("Não há pedidos no período para analisar produtos.");
        break;
      }
      const top5 = ov.topProducts.slice(0, 5);
      for (const p of top5) {
        metrics.push({ label: p.name, value: fmt(p.revenue), unit: "BRL" });
        findings.push(`${p.name}: ${fmtNum(p.qty)} un. — ${fmt(p.revenue)} (${p.share.toFixed(1)}% da receita).`);
      }
      if (ov.zeroSalesProducts.length > 0) {
        findings.push(`${ov.zeroSalesProducts.length} produto(s) ativo(s) sem nenhuma venda no período — candidatos a revisão.`);
        recommended.push(`Revisar produtos sem vendas: ${ov.zeroSalesProducts.slice(0, 3).map((z) => z.name).join(", ")}.`);
      }
      if (ov.topProducts.length > 1) {
        const top = ov.topProducts[0]!;
        const sec = ov.topProducts[1]!;
        if (top.revenue > sec.revenue * 3) {
          findings.push(`"${top.name}" concentra ${top.share.toFixed(0)}% da receita — dependência alta de um único produto.`);
          recommended.push(`Diversificar destaques no cardápio para reduzir dependência de "${top.name}".`);
        }
      }
      followUp.push("Qual é a taxa de attach de bebidas e sobremesas?", "Os clientes estão voltando?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "CUSTOMER_RETENTION": {
      sources.push("AnalyticsRetentionService");
      const ret = data.retention;
      if (!ret || !ret.hasData) {
        findings.push("Não há dados suficientes de retenção no período selecionado.");
        limitations.push("Retenção requer pelo menos 2 pedidos do mesmo cliente — base pode ser muito nova ou pequena.");
        followUp.push("Como foram as vendas no período?");
        break;
      }
      const { summary } = ret;
      if (summary.avgRetention30d !== null) {
        metrics.push({ label: "Retenção 30 dias (média)", value: fmtPct(summary.avgRetention30d) });
        findings.push(`Em média, ${fmtPct(summary.avgRetention30d)} dos clientes novos voltaram a comprar em 30 dias.`);
        if (summary.avgRetention30d < 20) {
          findings.push("Os dados sugerem retenção baixa — a maioria dos clientes não voltou em 30 dias.");
          recommended.push("Ativar campanha de reativação para clientes que compraram há mais de 30 dias sem retornar.");
        } else if (summary.avgRetention30d >= 40) {
          findings.push("Indício de boa retenção — uma parcela relevante dos clientes está retornando.");
          recommended.push("Intensificar o que faz clientes voltarem: comunicação, qualidade, promoções de recorrência.");
        }
      }
      if (summary.avgRetention60d !== null) {
        metrics.push({ label: "Retenção 60 dias (média)", value: fmtPct(summary.avgRetention60d) });
      }
      if (summary.bestCohort30d) {
        findings.push(`Melhor cohort por retenção 30d: ${summary.bestCohort30d}.`);
      }
      limitations.push(...ret.limitations);
      followUp.push("O que devo fazer para melhorar a retenção?", "Quais campanhas funcionaram?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "OPERATIONAL_EFFICIENCY": {
      sources.push("AnalyticsOperationalEfficiencyService");
      addTimingNote();
      const ops = data.operations;
      if (!ops || ops.metrics.ordersWithTiming === 0) {
        findings.push("Não há dados de tempo de preparo suficientes no período (pedidos sem completedAt).");
        break;
      }
      const { metrics: m } = ops;
      metrics.push(
        { label: "Tempo médio de entrega",   value: `${m.avgFulfillmentMinutes.toFixed(0)} min`   },
        { label: "Tempo mediano de entrega", value: `${m.medianFulfillmentMinutes.toFixed(0)} min` },
        { label: "P90 tempo de entrega",     value: `${m.p90FulfillmentMinutes.toFixed(0)} min`   },
        { label: "Pedidos com atraso",       value: fmtPct(m.delayedRate)                         },
        { label: "Taxa de cancelamento",     value: fmtPct(m.cancellationRate)                    },
      );
      findings.push(`Tempo médio de entrega: ${m.avgFulfillmentMinutes.toFixed(0)} min (mediana: ${m.medianFulfillmentMinutes.toFixed(0)} min).`);
      if (m.delayedRate > 20) {
        findings.push(`Os dados sugerem problema operacional: ${fmtPct(m.delayedRate)} dos pedidos saiu com atraso.`);
        recommended.push("Investigar causas de atraso — possível gargalo de preparo ou capacidade da cozinha.");
      } else if (m.delayedRate > 0) {
        findings.push(`${fmtPct(m.delayedRate)} dos pedidos com atraso — dentro do aceitável.`);
      }
      for (const b of ops.bottlenecks) {
        if (b.severity === "WARNING" || b.severity === "CRITICAL") {
          findings.push(`Gargalo ${b.stage}: ${b.recommendation}`);
          recommended.push(b.recommendation);
        }
      }
      limitations.push(...ops.limitations);
      followUp.push("Por que as vendas caíram?", "Como estão os clientes?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "CAMPAIGN_PERFORMANCE":
    case "COUPON_ATTRIBUTION": {
      sources.push("CampaignAttributionService");
      const attr = data.attribution;
      if (!attr || attr.rows.length === 0) {
        findings.push("Não há campanhas ou cupons registrados no período.");
        limitations.push("Para análise de campanha, é necessário criar e executar campanhas no CRM.");
        followUp.push("Como foram as vendas no período?", "Quais produtos mais venderam?");
        break;
      }
      const { totals, rows } = attr;
      metrics.push(
        { label: "Campanhas no período",       value: totals.campaigns          },
        { label: "Receita comprovada (cupom)",  value: fmt(totals.couponProvenRevenue), unit: "BRL" },
        { label: "Receita assistida",           value: fmt(totals.assistedRevenue),     unit: "BRL" },
      );
      findings.push(`${totals.campaigns} campanha(s) no período. Receita comprovada via cupom: ${fmt(totals.couponProvenRevenue)}.`);
      const best = rows.sort((a, b) => (b.couponRevenue ?? 0) - (a.couponRevenue ?? 0))[0];
      if (best) {
        findings.push(`Melhor campanha (por receita de cupom): "${best.name}" — ${fmt(best.couponRevenue ?? 0)}.`);
      }
      const noneCount = rows.filter((r) => r.attributionQuality === "NONE").length;
      if (noneCount > 0) {
        limitations.push(`${noneCount} campanha(s) sem atribuição confiável — associe cupons para medir com precisão.`);
      }
      recommended.push("Vincular cupoms às próximas campanhas para rastreamento de receita preciso.");
      followUp.push("Por que as vendas caíram?", "O que devo fazer agora?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "UPSELL_PERFORMANCE": {
      sources.push("AnalyticsService");
      const ov = data.overview;
      if (!ov || ov.kpi.orders === 0) {
        findings.push("Não há pedidos no período para analisar upsell.");
        break;
      }
      const drinks   = ov.attachRates.find((a) => a.label === "Bebidas");
      const desserts = ov.attachRates.find((a) => a.label === "Sobremesas");
      if (drinks) {
        metrics.push({ label: "Attach de bebidas",    value: fmtPct(drinks.rate)   });
        metrics.push({ label: "Receita de bebidas",   value: fmt(drinks.addedRevenue), unit: "BRL" });
        findings.push(`Bebidas: ${fmtPct(drinks.rate)} dos pedidos incluíram bebida — ${fmt(drinks.addedRevenue)} em receita adicionada.`);
        if (drinks.rate < 30) recommended.push("Estimular bebidas — taxa atual abaixo de 30%, meta sugerida.");
      }
      if (desserts) {
        metrics.push({ label: "Attach de sobremesas", value: fmtPct(desserts.rate) });
        metrics.push({ label: "Receita de sobremesas", value: fmt(desserts.addedRevenue), unit: "BRL" });
        findings.push(`Sobremesas: ${fmtPct(desserts.rate)} dos pedidos incluíram sobremesa — ${fmt(desserts.addedRevenue)} em receita adicionada.`);
        if (desserts.rate < 20) recommended.push("Criar campanha de sobremesa — taxa atual abaixo de 20%, oportunidade clara.");
      }
      if (ov.upsellRevenue) {
        metrics.push({ label: "Receita de upsell total", value: fmt(ov.upsellRevenue.revenue), unit: "BRL" });
        metrics.push({ label: "Participação do upsell",  value: fmtPct(ov.upsellRevenue.revenueShare) });
      }
      followUp.push("Como estão as vendas no geral?", "Quais produtos mais venderam?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "CART_RECOVERY": {
      sources.push("OrderDraftService");
      limitations.push(
        "Métricas detalhadas de recuperação de carrinho não estão expostas nesta API ainda. " +
        "Use /api/admin/diagnostics/cart-recovery-qa para dados de diagnóstico completos.",
      );
      findings.push("Os dados sugerem que carrinhos abandonados existem no sistema, mas a API de análise conversacional ainda não expõe essas métricas de forma consolidada.");
      recommended.push("Acessar /api/admin/diagnostics/cart-recovery-qa para ver drafts abandonados, recuperados e taxa de conversão.");
      followUp.push("Como foram as vendas no período?", "O que devo fazer agora?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "REVIEW_PERFORMANCE": {
      addIfoodNote();
      limitations.push(
        "Análise de avaliações externas (Google, iFood) requer integração com a plataforma de reviews — não está disponível ainda.",
        "Acompanhe as avaliações diretamente nas plataformas ou via relatório manual.",
      );
      findings.push("Não há dados de avaliações externas integrados ao sistema no momento.");
      followUp.push("Como estão as vendas?", "Os clientes estão voltando?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "ACTION_RECOMMENDATION": {
      sources.push("AnalyticsDiagnosisService", "AnalyticsInsightService");
      const diag = data.diagnosis;
      const ov   = data.overview;

      // Pull top actions from diagnosis
      if (diag?.recommendedActions?.length) {
        for (const act of diag.recommendedActions.slice(0, 4)) {
          recommended.push(act);
          findings.push(`Baseado no diagnóstico: ${act}`);
        }
      }

      // Pull top insights from insight service
      if (ov) {
        const report = AnalyticsInsightService.buildReport(ov, data.prevKpi ?? null, data.periodLabel);
        for (const ins of report.insights.slice(0, 3)) {
          if (!recommended.includes(ins.recommendation)) {
            recommended.push(ins.recommendation);
            findings.push(`${ins.title}: ${ins.explanation}`);
          }
        }
        metrics.push(
          { label: "Faturamento",  value: fmt(ov.kpi.revenue),   unit: "BRL" },
          { label: "Pedidos",      value: fmtNum(ov.kpi.orders)               },
          { label: "Ticket médio", value: fmt(ov.kpi.avgTicket), unit: "BRL" },
        );
      }

      if (recommended.length === 0) {
        findings.push("Não há dados suficientes para recomendar ações específicas no período.");
        limitations.push("Aumente o volume de pedidos no sistema para obter recomendações mais precisas.");
      }

      followUp.push("Por que as vendas caíram?", "Os clientes estão voltando?", "Como está a operação?");
      break;
    }

    // ────────────────────────────────────────────────────────────────────────────
    case "UNKNOWN_UNSUPPORTED":
    default: {
      findings.push("Não há dados suficientes para responder essa pergunta específica com os motores de análise disponíveis.");
      limitations.push(
        "Esta pergunta está fora do escopo dos dados disponíveis, ou usa terminologia não reconhecida.",
      );
      followUp.push(
        "Por que as vendas caíram?",
        "Quais produtos mais venderam?",
        "Os clientes estão voltando?",
        "Como está a operação?",
        "O que devo fazer hoje?",
      );
      break;
    }
  }

  // ── Enforce grounding: each recommendedAction must have a finding backing ────
  // (Already satisfied by construction above — actions are only added when
  //  a finding or metric is also added. The constraint is documented here.)

  // ── Summary line ─────────────────────────────────────────────────────────────
  const summary = findings[0] ?? "Análise concluída com os dados disponíveis.";

  // ── Confidence ───────────────────────────────────────────────────────────────
  const confidence: ConfidenceLevel =
    limitations.length > 2   ? "LOW"    :
    findings.length    > 2   ? "HIGH"   :
    "MEDIUM";

  // ── Deterministic answer text (used as fallback if LLM fails) ────────────────
  const parts: string[] = [];
  if (findings.length > 0)    parts.push(...findings);
  if (recommended.length > 0) parts.push("Ações recomendadas: " + recommended.join(" | "));
  if (limitations.length > 0) parts.push("Limitações: " + limitations.join(" | "));
  const deterministicAnswer = parts.join("\n\n");

  return {
    answer:             deterministicAnswer,
    summary,
    intent,
    confidence,
    dataSourcesUsed:    sources,
    metrics,
    findings,
    recommendedActions: recommended,
    limitations,
    followUpQuestions:  followUp,
  };
}

// ─── LLM formatting layer ─────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `Você é um analista de dados de restaurante. Responda APENAS com base nos dados fornecidos.
Nunca invente métricas, causas ou previsões não suportadas pelos dados.
Se algum dado estiver faltando, diga explicitamente que está faltando.
Use linguagem de negócio simples, direta, em português brasileiro.
Seja conciso: máximo 3 parágrafos. Não use markdown nem listas — use texto corrido.
Use linguagem cautelosa: "os dados sugerem", "indício de", "provável", "não há dados suficientes".
Nunca afirme causalidade com certeza a partir de correlação.`;

async function formatWithLLM(
  structuredData: { intent: string; question: string; findings: string[]; metrics: AgentMetric[]; recommended: string[]; limitations: string[]; periodLabel: string },
  fallback:        string,
): Promise<string> {
  try {
    const userContent = JSON.stringify({
      question:           structuredData.question,
      intent:             structuredData.intent,
      periodo:            structuredData.periodLabel,
      achados:            structuredData.findings,
      metricas:           structuredData.metrics,
      acoes_recomendadas: structuredData.recommended,
      limitacoes:         structuredData.limitations,
    });

    const selection = await selectEngineRouted("analytics-product", { taskProfile: "GENERATE" });
    const text = (
      await callStructuredJson({
        selection,
        systemPrompt: AGENT_SYSTEM_PROMPT,
        userContent,
        temperature: 0.3,
        maxTokens: 400,
        responseFormat: "text",
      })
    ).trim();
    return text && text.length > 20 ? text : fallback;
  } catch (err) {
    console.error("[AnalyticsAgentService] LLM formatting failed — using template", err);
    return fallback;
  }
}

// ─── KPI-only fetch for previous period ──────────────────────────────────────

async function fetchPrevKpi(
  restaurantId: string,
  from: Date,
  to:   Date,
): Promise<{ revenue: number; orders: number; avgTicket: number }> {
  try {
    type Row = { total_revenue: string; order_count: bigint | number };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END), 0)::text AS total_revenue,
        COUNT(*) FILTER (WHERE status != 'CANCELLED')                                  AS order_count
      FROM orders
      WHERE "restaurantId" = ${restaurantId}
        AND "importedAt" IS NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <  ${to}
    `;
    const row     = rows[0];
    const revenue = Number(row?.total_revenue ?? 0);
    const orders  = Number(row?.order_count   ?? 0);
    return { revenue, orders, avgTicket: orders > 0 ? revenue / orders : 0 };
  } catch {
    return { revenue: 0, orders: 0, avgTicket: 0 };
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function answerQuestion(
  input: AnalyticsAgentInput,
): Promise<AnalyticsAgentAnswer> {
  const { restaurantId, question, from, to, period, includeRawData = false } = input;

  const resolved = resolvePeriod(from, to, period);
  const { fromDate, toDate, fromIso, toIso, periodLabel, durationDays } = resolved;

  const prevTo   = new Date(fromDate.getTime());
  const prevFrom = new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime()));

  const intent = routeIntent(question);
  const hasMarginQuestion = MARGIN_KEYWORDS.some((k) => normalize(question).includes(k));

  const rawData: Record<string, unknown> = {};

  // ── Fetch data based on intent ─────────────────────────────────────────────
  let overview:    AnalyticsOverview                | undefined;
  let prevKpi:     { revenue: number; orders: number; avgTicket: number } | null = null;
  let diagnosis:   DiagnosisReport                  | undefined;
  let retention:   RetentionReport                  | undefined;
  let operations:  OperationalEfficiencyReport       | undefined;
  let attribution: AttributionSummary               | undefined;

  try {
    switch (intent) {

      case "SALES_OVERVIEW":
      case "PRODUCT_PERFORMANCE":
      case "UPSELL_PERFORMANCE": {
        [overview, prevKpi] = await Promise.all([
          AnalyticsService.getOverview(restaurantId, { from: fromDate, to: toDate }),
          fetchPrevKpi(restaurantId, prevFrom, prevTo),
        ]);
        break;
      }

      case "REVENUE_DROP_DIAGNOSIS": {
        const [cur, prev, recCur, recPrev] = await Promise.all([
          AnalyticsService.getOverview(restaurantId, { from: fromDate, to: toDate }),
          AnalyticsService.getOverview(restaurantId, { from: prevFrom, to: prevTo }),
          fetchRecoverySummary(restaurantId, fromDate, toDate),
          fetchRecoverySummary(restaurantId, prevFrom, prevTo),
        ]);
        overview = cur;
        prevKpi  = prev.kpi.orders > 0
          ? { revenue: prev.kpi.revenue, orders: prev.kpi.orders, avgTicket: prev.kpi.avgTicket }
          : null;
        diagnosis = AnalyticsDiagnosisService.diagnose({
          current:  cur,
          previous: prev.kpi.orders > 0 ? prev : null,
          period: { from: fromIso, to: toIso, label: periodLabel },
          comparisonPeriod: {
            from: prevFrom.toISOString().slice(0, 10),
            to:   prevTo.toISOString().slice(0, 10),
            label: "período anterior",
          },
          recovery: {
            abandonedDrafts:     recCur.abandoned,
            recoveredDrafts:     recCur.recovered,
            prevAbandonedDrafts: recPrev.abandoned,
            prevRecoveredDrafts: recPrev.recovered,
          },
        });
        break;
      }

      case "ACTION_RECOMMENDATION": {
        const [cur, prev, recCur, recPrev] = await Promise.all([
          AnalyticsService.getOverview(restaurantId, { from: fromDate, to: toDate }),
          AnalyticsService.getOverview(restaurantId, { from: prevFrom, to: prevTo }),
          fetchRecoverySummary(restaurantId, fromDate, toDate),
          fetchRecoverySummary(restaurantId, prevFrom, prevTo),
        ]);
        overview = cur;
        prevKpi  = prev.kpi.orders > 0
          ? { revenue: prev.kpi.revenue, orders: prev.kpi.orders, avgTicket: prev.kpi.avgTicket }
          : null;
        diagnosis = AnalyticsDiagnosisService.diagnose({
          current:  cur,
          previous: prev.kpi.orders > 0 ? prev : null,
          period: { from: fromIso, to: toIso, label: periodLabel },
          comparisonPeriod: {
            from: prevFrom.toISOString().slice(0, 10),
            to:   prevTo.toISOString().slice(0, 10),
            label: "período anterior",
          },
          recovery: {
            abandonedDrafts:     recCur.abandoned,
            recoveredDrafts:     recCur.recovered,
            prevAbandonedDrafts: recPrev.abandoned,
            prevRecoveredDrafts: recPrev.recovered,
          },
        });
        break;
      }

      case "CUSTOMER_RETENTION": {
        retention = await AnalyticsRetentionService.getReport(
          restaurantId, fromDate, toDate, fromIso, toIso,
        );
        break;
      }

      case "OPERATIONAL_EFFICIENCY": {
        operations = await AnalyticsOperationalEfficiencyService.getReport(
          restaurantId, fromDate, toDate, fromIso, toIso,
        );
        break;
      }

      case "CAMPAIGN_PERFORMANCE":
      case "COUPON_ATTRIBUTION": {
        const attrPeriod =
          durationDays <= 7  ? "7d"  :
          durationDays <= 30 ? "30d" :
          durationDays <= 90 ? "90d" :
          "all";
        attribution = await CampaignAttributionService.getAttribution(
          restaurantId,
          attrPeriod,
        );
        break;
      }

      // CART_RECOVERY, REVIEW_PERFORMANCE, UNKNOWN_UNSUPPORTED — no data fetch
      default:
        break;
    }
  } catch (err) {
    console.error("[AnalyticsAgentService] data fetch error", err);
    // Continue with undefined data — buildGroundedAnswer handles missing data gracefully
  }

  if (includeRawData) {
    if (overview)    rawData.overview    = overview;
    if (diagnosis)   rawData.diagnosis   = diagnosis;
    if (retention)   rawData.retention   = retention;
    if (operations)  rawData.operations  = operations;
    if (attribution) rawData.attribution = attribution;
  }

  // ── Does this restaurant actually have costs registered? ───────────────────
  // Only asked when the question is about margin, so the normal path pays nothing.
  // NOTE: MenuItem has no restaurantId — the tenant scope goes through the category.
  // Querying it any other way leaks one restaurant's menu into another's answer, and
  // `tsc` would not say a word about it.
  let itemsWithCost = 0;
  if (hasMarginQuestion) {
    try {
      itemsWithCost = await prisma.menuItem.count({
        where: { cost: { not: null }, category: { restaurantId } },
      });
    } catch (err) {
      // Counting failed → fall through as "no cost data". Stating the limitation when
      // it may not apply is the safe direction; claiming a margin we cannot back is not.
      console.error("[AnalyticsAgent] cost count failed", err);
    }
  }

  // ── Build deterministic answer ─────────────────────────────────────────────
  const serviceData: AgentServiceData = {
    intent, periodLabel, question,
    overview, prevKpi, diagnosis, retention, operations, attribution,
    hasMarginQuestion, itemsWithCost,
  };
  const groundedAnswer = buildGroundedAnswer(serviceData);

  // ── Format with LLM (fallback to deterministic template) ──────────────────
  const llmAnswer = await formatWithLLM(
    {
      intent:      groundedAnswer.intent,
      question,
      findings:    groundedAnswer.findings,
      metrics:     groundedAnswer.metrics,
      recommended: groundedAnswer.recommendedActions,
      limitations: groundedAnswer.limitations,
      periodLabel,
    },
    groundedAnswer.answer,
  );

  return {
    ...groundedAnswer,
    answer: llmAnswer,
    ...(includeRawData ? { rawData } : {}),
  };
}

// ─── Recovery summary helper (mirror of diagnosis route) ─────────────────────

async function fetchRecoverySummary(
  restaurantId: string,
  from:         Date,
  to:           Date,
): Promise<{ abandoned: number; recovered: number }> {
  try {
    const rows = await prisma.$queryRaw<Array<{ abandoned: bigint | number; recovered: bigint | number }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ABANDONED' OR "recoveryAttempts" > 0) AS abandoned,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND "recoveryAttempts" > 0) AS recovered
      FROM order_drafts
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${from}
        AND "createdAt" <  ${to}
    `;
    const r = rows[0];
    return { abandoned: Number(r?.abandoned ?? 0), recovered: Number(r?.recovered ?? 0) };
  } catch {
    return { abandoned: 0, recovered: 0 };
  }
}
