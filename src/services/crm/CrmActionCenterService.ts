/**
 * CrmActionCenterService
 *
 * Produces a ranked feed of CRM opportunities ("What should I do now?")
 * for the restaurant owner to act on.
 *
 * Design:
 *   - `computeActions()` is a PURE function (no DB) — fully unit-testable.
 *   - `CrmActionCenterService.getActionCenter()` gathers DB data then delegates.
 *
 * SCOPE GUARD:
 *   - Read-only. Never sends messages. Never triggers campaigns.
 *   - Tenant-scoped: all DB queries are filtered by restaurantId.
 *   - Respects contactability: hasOptedOut, crmContactable, phone presence.
 *
 * Phase: CRM W5.
 */

import { prisma } from "@/lib/prisma";
import { getSegmentConfig, DEFAULT_SEGMENT_CONFIG, type SegmentConfig } from "@/lib/crm-segments";
import { resolveCustomerSegment } from "@/services/crm/CustomerSegmentService";
import type { CustomerSegmentValue } from "@/services/crm/crm-helpers";
import { isWhatsAppChannelConnected } from "./crmWhatsAppChannel";

// ─── Public types ──────────────────────────────────────────────────────────────

export type CrmActionType =
  | "RECOVER_COLD_CUSTOMERS"
  | "RECOVER_LOST_CUSTOMERS"
  | "WARM_CUSTOMERS"
  | "VIP_APPRECIATION"
  | "REVIEW_REQUEST"
  | "BIRTHDAY_CAMPAIGN"
  | "COUPON_OPPORTUNITY"
  | "NO_ORDER_FIRST_PURCHASE"
  | "HIGH_VALUE_CUSTOMER_ATTENTION"
  | "CAMPAIGN_PERFORMANCE_ALERT"
  | "SAFETY_ISSUE_ALERT";

export type ActionPriority = "HIGH" | "MEDIUM" | "LOW";

export type ActionSafetyStatus = "READY" | "PARTIAL" | "BLOCKED";

export interface CrmAction {
  id: string;
  type: CrmActionType;
  title: string;
  description: string;
  priority: ActionPriority;
  estimatedAudienceCount: number;
  estimatedRevenueOpportunity: number;
  safetyStatus: ActionSafetyStatus;
  eligibleCount: number;
  blockedCount: number;
  blockerReasons: string[];
  suggestedNextStep: string;
  recommendedCampaignType: string | null;
  linkedCustomerSample: { id: string; name: string; phone: string }[];
  reason: string;
  computedAt: string;
}

export interface ActionCenterSummary {
  totalActions: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  totalOpportunityRevenue: number;
}

export interface ActionCenterResult {
  summary: ActionCenterSummary;
  actions: CrmAction[];
  generatedAt: string;
  warnings: string[];
}

// ─── Pure-computation input ────────────────────────────────────────────────────

export interface CustomerComputeRow {
  id: string;
  name: string;
  phone: string | null;
  hasOptedOut: boolean;
  crmContactable: boolean;
  totalSpend: number;
  totalOrders: number;
  lastOrderAt: Date | null;
  importedOrderCount: number | null;
  importedTotalSpent: number | null;
  importedLastOrderAt: Date | null;
  averageTicket: number | null;
  tier: string | null;
  birthDate: Date | null;
}

export interface ComputeActionsInput {
  customers: CustomerComputeRow[];
  now: Date;
  /** Canal WhatsApp oficial conectado. Sem ele, nenhuma campanha sai. */
  hasWhatsAppChannel: boolean;
  couponUserIds: Set<string>;
  segmentConfig: SegmentConfig;
  recentCampaignStats: { sentCount: number; convertedCount: number } | null;
  restaurantAvgTicket: number;
  /** Whether a Google/iFood review link is configured (W8). Defaults true for back-compat. */
  hasReviewLink?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ActionPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const TYPE_SORT_BONUS: Partial<Record<CrmActionType, number>> = {
  SAFETY_ISSUE_ALERT: -2,
  BIRTHDAY_CAMPAIGN: -1,
  HIGH_VALUE_CUSTOMER_ATTENTION: -1,
};

function rankScore(a: CrmAction): number {
  const priorityScore = PRIORITY_ORDER[a.priority] * 10_000;
  const bonus = (TYPE_SORT_BONUS[a.type] ?? 0) * 1_000;
  const revenueScore = -(a.estimatedRevenueOpportunity);
  return priorityScore + bonus + revenueScore;
}

function isContactable(c: CustomerComputeRow): boolean {
  return !c.hasOptedOut && c.crmContactable && !!c.phone && c.phone.trim() !== "";
}

function blockReason(c: CustomerComputeRow): string {
  if (c.hasOptedOut) return "opt-out";
  if (!c.phone || c.phone.trim() === "") return "sem-telefone";
  if (!c.crmContactable) return "não-contactável";
  return "outro";
}

function summarizeBlockers(blocked: CustomerComputeRow[]): string[] {
  const counts = new Map<string, number>();
  for (const c of blocked) {
    const r = blockReason(c);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([r, n]) => `${n}× ${r}`);
}

function customerAvgTicket(c: CustomerComputeRow, fallback: number): number {
  if (c.averageTicket !== null && c.averageTicket > 0) return c.averageTicket;
  if (c.totalOrders > 0) return c.totalSpend / c.totalOrders;
  return fallback;
}

function estimateRevenue(matched: CustomerComputeRow[], conversionRate: number, fallback: number): number {
  if (conversionRate === 0) return 0;
  const contactable = matched.filter(isContactable);
  const total = contactable.reduce((sum, c) => sum + customerAvgTicket(c, fallback), 0);
  return Math.round(total * conversionRate);
}

function safetyStatus(eligibleCount: number, blockedCount: number): ActionSafetyStatus {
  if (eligibleCount === 0) return "BLOCKED";
  if (blockedCount > 0) return "PARTIAL";
  return "READY";
}

function buildSample(matched: CustomerComputeRow[], limit = 5): { id: string; name: string; phone: string }[] {
  const sorted = [
    ...matched.filter(isContactable),
    ...matched.filter((c) => !isContactable(c)),
  ];
  return sorted.slice(0, limit).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone ?? "",
  }));
}

// ─── Pure computation ──────────────────────────────────────────────────────────

/**
 * Computes all CRM actions from pre-fetched data.
 * No DB access. Deterministic given the same input.
 */
export function computeActions(input: ComputeActionsInput): CrmAction[] {
  const {
    customers,
    now,
    hasWhatsAppChannel,
    couponUserIds,
    segmentConfig,
    recentCampaignStats,
    restaurantAvgTicket,
    hasReviewLink = true,
  } = input;

  const nowMs = now.getTime();
  const actions: CrmAction[] = [];

  // ── Segment resolver (in-memory, no DB) ───────────────────────────────────
  function getSegment(c: CustomerComputeRow): CustomerSegmentValue {
    return resolveCustomerSegment({
      lastOrderAt: c.lastOrderAt,
      importedLastOrderAt: c.importedLastOrderAt,
      totalOrders: c.totalOrders,
      importedOrderCount: c.importedOrderCount,
      cfg: segmentConfig,
      now,
    }).segment;
  }

  // ── Action builder ─────────────────────────────────────────────────────────
  function addAction(
    type: CrmActionType,
    title: string,
    description: string,
    priority: ActionPriority,
    matched: CustomerComputeRow[],
    opts: {
      suggestedNextStep: string;
      recommendedCampaignType: string | null;
      reason: string;
      conversionRate: number;
    },
  ) {
    const contactable = matched.filter(isContactable);
    const blocked = matched.filter((c) => !isContactable(c));
    actions.push({
      id: `${type.toLowerCase().replace(/_/g, "-")}-${nowMs}`,
      type,
      title,
      description,
      priority,
      estimatedAudienceCount: matched.length,
      estimatedRevenueOpportunity: estimateRevenue(matched, opts.conversionRate, restaurantAvgTicket),
      safetyStatus: safetyStatus(contactable.length, blocked.length),
      eligibleCount: contactable.length,
      blockedCount: blocked.length,
      blockerReasons: summarizeBlockers(blocked),
      suggestedNextStep: opts.suggestedNextStep,
      recommendedCampaignType: opts.recommendedCampaignType,
      linkedCustomerSample: buildSample(matched),
      reason: opts.reason,
      computedAt: now.toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. SAFETY_ISSUE_ALERT — canal WhatsApp fora do ar
  // ─────────────────────────────────────────────────────────────────────────
  if (!hasWhatsAppChannel) {
    actions.push({
      id: `safety-issue-alert-${nowMs}`,
      type: "SAFETY_ISSUE_ALERT",
      title: "WhatsApp não conectado",
      description:
        "O WhatsApp oficial (Meta) não está conectado. Nenhuma campanha pode ser enviada.",
      priority: "HIGH",
      estimatedAudienceCount: customers.length,
      estimatedRevenueOpportunity: 0,
      safetyStatus: "BLOCKED",
      eligibleCount: 0,
      blockedCount: customers.length,
      blockerReasons: ["sem-whatsapp"],
      suggestedNextStep: "Conectar o WhatsApp oficial em Integrações → WhatsApp.",
      recommendedCampaignType: null,
      linkedCustomerSample: [],
      reason: "Sem canal WhatsApp conectado, nenhum envio CRM é possível.",
      computedAt: now.toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. BIRTHDAY_CAMPAIGN — today ± 7 days
  // ─────────────────────────────────────────────────────────────────────────
  const todayBirthdays: CustomerComputeRow[] = [];
  const upcomingBirthdays: CustomerComputeRow[] = [];

  for (const c of customers) {
    if (!c.birthDate) continue;
    const bm = c.birthDate.getMonth();
    const bd = c.birthDate.getDate();
    const nm = now.getMonth();
    const nd = now.getDate();
    if (bm === nm && bd === nd) {
      todayBirthdays.push(c);
    } else {
      for (let i = 1; i <= 7; i++) {
        const future = new Date(nowMs + i * 86_400_000);
        if (bm === future.getMonth() && bd === future.getDate()) {
          upcomingBirthdays.push(c);
          break;
        }
      }
    }
  }

  const allBirthdays = [...todayBirthdays, ...upcomingBirthdays];
  if (allBirthdays.length > 0) {
    const isToday = todayBirthdays.length > 0;
    const title = isToday
      ? `${todayBirthdays.length} aniversário(s) hoje — envie agora!`
      : `${allBirthdays.length} aniversário(s) esta semana`;
    addAction(
      "BIRTHDAY_CAMPAIGN",
      title,
      "Clientes com aniversário próximo. Mensagem especial tem altíssima taxa de abertura.",
      isToday ? "HIGH" : "MEDIUM",
      allBirthdays,
      {
        suggestedNextStep: "Criar campanha de aniversário com oferta especial.",
        recommendedCampaignType: "aniversariantes",
        reason: isToday
          ? "Aniversários hoje — momento ideal para mensagem imediata."
          : "Aniversários nos próximos 7 dias — planeje com antecedência.",
        conversionRate: 0.8,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. HIGH_VALUE_CUSTOMER_ATTENTION — DIAMANTE não-QUENTE
  // ─────────────────────────────────────────────────────────────────────────
  const diamanteAtRisk = customers.filter(
    (c) => (c.tier ?? "BRONZE") === "DIAMANTE" && getSegment(c) !== "QUENTE",
  );
  if (diamanteAtRisk.length > 0) {
    addAction(
      "HIGH_VALUE_CUSTOMER_ATTENTION",
      `${diamanteAtRisk.length} cliente(s) Diamante sem pedir`,
      "Seus melhores clientes estão inativos. Alto risco de perda de receita VIP.",
      "HIGH",
      diamanteAtRisk,
      {
        suggestedNextStep: "Contato personalizado com oferta exclusiva para clientes Diamante.",
        recommendedCampaignType: "vip-reativacao",
        reason: "Clientes Diamante (maior histórico de gasto) não estão pedindo ativamente.",
        conversionRate: 0.7,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. RECOVER_LOST_CUSTOMERS — PERDIDO
  // ─────────────────────────────────────────────────────────────────────────
  const perdido = customers.filter((c) => getSegment(c) === "PERDIDO");
  if (perdido.length > 0) {
    addAction(
      "RECOVER_LOST_CUSTOMERS",
      `Recuperar ${perdido.length} cliente(s) perdido(s)`,
      `Clientes sem pedidos há mais de ${segmentConfig.lostMinDays} dias. Oferta forte pode reativá-los.`,
      perdido.length >= 5 ? "HIGH" : "MEDIUM",
      perdido,
      {
        suggestedNextStep: "Criar campanha de recuperação com oferta de reativação.",
        recommendedCampaignType: "recuperar-perdidos",
        reason: `Clientes sem pedidos por mais de ${segmentConfig.lostMinDays} dias — alto risco de perda definitiva.`,
        conversionRate: 0.15,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. RECOVER_COLD_CUSTOMERS — FRIO
  // ─────────────────────────────────────────────────────────────────────────
  const frio = customers.filter((c) => getSegment(c) === "FRIO");
  if (frio.length > 0) {
    const frioPriority: ActionPriority =
      frio.length >= 10 ? "HIGH" : frio.length >= 3 ? "MEDIUM" : "LOW";
    addAction(
      "RECOVER_COLD_CUSTOMERS",
      `Reativar ${frio.length} cliente(s) frio(s)`,
      `Clientes entre ${segmentConfig.warmMaxDays + 1} e ${segmentConfig.lostMinDays - 1} dias sem pedir. Oferta de retorno pode funcionar.`,
      frioPriority,
      frio,
      {
        suggestedNextStep: "Criar campanha de reativação com desconto ou brinde.",
        recommendedCampaignType: "recuperar-frios",
        reason: `Clientes inativos há mais de ${segmentConfig.warmMaxDays} dias, mas ainda recuperáveis.`,
        conversionRate: 0.25,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. VIP_APPRECIATION — OURO/DIAMANTE QUENTE
  // ─────────────────────────────────────────────────────────────────────────
  const vipQuente = customers.filter((c) => {
    const tier = c.tier ?? "BRONZE";
    return (tier === "DIAMANTE" || tier === "OURO") && getSegment(c) === "QUENTE";
  });
  if (vipQuente.length > 0) {
    const hasDiamante = vipQuente.some((c) => (c.tier ?? "BRONZE") === "DIAMANTE");
    addAction(
      "VIP_APPRECIATION",
      `${vipQuente.length} cliente(s) VIP merecem reconhecimento`,
      "Seus melhores clientes estão ativos. Uma mensagem de valorização fortalece o vínculo.",
      hasDiamante ? "HIGH" : "MEDIUM",
      vipQuente,
      {
        suggestedNextStep: "Enviar mensagem de agradecimento com benefício exclusivo VIP.",
        recommendedCampaignType: "vip-appreciation",
        reason: "Clientes Ouro/Diamante ativos — fidelizar os melhores aumenta o LTV.",
        conversionRate: 0.6,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. WARM_CUSTOMERS — MORNO
  // ─────────────────────────────────────────────────────────────────────────
  const morno = customers.filter((c) => getSegment(c) === "MORNO");
  if (morno.length > 0) {
    addAction(
      "WARM_CUSTOMERS",
      `Engajar ${morno.length} cliente(s) morno(s)`,
      `Clientes entre ${segmentConfig.hotMaxDays + 1} e ${segmentConfig.warmMaxDays} dias sem pedir. Reengajamento agora evita que esfriem.`,
      "MEDIUM",
      morno,
      {
        suggestedNextStep: "Criar campanha de engajamento com novidade ou oferta.",
        recommendedCampaignType: "engajar-mornos",
        reason: "Clientes esfriando — intervir antes que se tornem Frio.",
        conversionRate: 0.35,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. REVIEW_REQUEST — pedido há 1–5 dias
  // ─────────────────────────────────────────────────────────────────────────
  const reviewReady = customers.filter((c) => {
    if (!c.lastOrderAt) return false;
    const days = Math.floor((nowMs - c.lastOrderAt.getTime()) / 86_400_000);
    return days >= 1 && days <= 5;
  });
  if (reviewReady.length > 0) {
    addAction(
      "REVIEW_REQUEST",
      `Pedir avaliação de ${reviewReady.length} cliente(s)`,
      hasReviewLink
        ? "Clientes com pedido de 1–5 dias atrás. Momento ideal para solicitar avaliação no Google ou iFood."
        : "Clientes com pedido de 1–5 dias atrás — mas nenhum link de avaliação (Google/iFood) está configurado em Marca.",
      "MEDIUM",
      reviewReady,
      {
        suggestedNextStep: hasReviewLink
          ? "Gerar pedido de avaliação Google/iFood personalizado (requer aprovação)."
          : "Configurar link de avaliação em Marca antes de pedir avaliações.",
        recommendedCampaignType: hasReviewLink ? "solicitar-avaliacao" : null,
        reason: "Experiência recente em memória → avaliação mais provável e honesta.",
        conversionRate: 0,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. NO_ORDER_FIRST_PURCHASE — SEM_PEDIDOS
  // ─────────────────────────────────────────────────────────────────────────
  const semPedidos = customers.filter((c) => getSegment(c) === "SEM_PEDIDOS");
  if (semPedidos.length > 0) {
    addAction(
      "NO_ORDER_FIRST_PURCHASE",
      `${semPedidos.length} cliente(s) nunca pediram`,
      "Clientes cadastrados mas sem pedido. Uma oferta de primeiro pedido pode convertê-los.",
      semPedidos.length >= 20 ? "MEDIUM" : "LOW",
      semPedidos,
      {
        suggestedNextStep: "Criar campanha com cupom ou incentivo para primeiro pedido.",
        recommendedCampaignType: "primeiro-pedido",
        reason: "Clientes registrados mas não convertidos — potencial de primeira compra.",
        conversionRate: 0.1,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. COUPON_OPPORTUNITY — clientes que usaram cupons
  // ─────────────────────────────────────────────────────────────────────────
  const couponUsers = customers.filter((c) => couponUserIds.has(c.id));
  if (couponUsers.length > 0) {
    addAction(
      "COUPON_OPPORTUNITY",
      `${couponUsers.length} cliente(s) usaram cupons`,
      "Clientes que usam cupons têm maior sensibilidade a ofertas. Cupom exclusivo gera pedido imediato.",
      "LOW",
      couponUsers,
      {
        suggestedNextStep: "Enviar cupom exclusivo ou oferta de fidelidade.",
        recommendedCampaignType: "recompensa-fidelidade",
        reason: "Clientes sensíveis a ofertas — probabilidade de conversão acima da média.",
        conversionRate: 0.3,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 11. CAMPAIGN_PERFORMANCE_ALERT — taxa de conversão < 5%
  // ─────────────────────────────────────────────────────────────────────────
  if (recentCampaignStats !== null && recentCampaignStats.sentCount >= 10) {
    const convRate =
      recentCampaignStats.sentCount > 0
        ? recentCampaignStats.convertedCount / recentCampaignStats.sentCount
        : 0;
    if (convRate < 0.05) {
      actions.push({
        id: `campaign-performance-alert-${nowMs}`,
        type: "CAMPAIGN_PERFORMANCE_ALERT",
        title: "Campanhas com baixa conversão",
        description: `Taxa de conversão recente: ${Math.round(convRate * 100)}% (abaixo de 5%). Revise mensagens e segmentação.`,
        priority: "MEDIUM",
        estimatedAudienceCount: 0,
        estimatedRevenueOpportunity: 0,
        safetyStatus: "READY",
        eligibleCount: 0,
        blockedCount: 0,
        blockerReasons: [],
        suggestedNextStep: "Revisar templates de campanha e segmentação de audiência.",
        recommendedCampaignType: null,
        linkedCustomerSample: [],
        reason: `Taxa de conversão das campanhas dos últimos 30 dias: ${Math.round(convRate * 100)}%.`,
        computedAt: now.toISOString(),
      });
    }
  }

  // ─── Rank and return ──────────────────────────────────────────────────────
  return actions.sort((a, b) => rankScore(a) - rankScore(b));
}

// ─── Service class ─────────────────────────────────────────────────────────────

export class CrmActionCenterService {
  static async getActionCenter(
    restaurantId: string,
    opts?: { now?: Date },
  ): Promise<ActionCenterResult> {
    const now = opts?.now ?? new Date();

    const [customers, hasWhatsAppChannel, couponRows, segmentConfig, campaignStats, brandConfig] =
      await Promise.all([
        prisma.customer.findMany({
          where: { restaurantId, isActive: true, isGuest: false },
          select: {
            id: true,
            name: true,
            phone: true,
            hasOptedOut: true,
            crmContactable: true,
            totalSpend: true,
            totalOrders: true,
            lastOrderAt: true,
            importedOrderCount: true,
            importedTotalSpent: true,
            importedLastOrderAt: true,
            averageTicket: true,
            tier: true,
            birthDate: true,
          },
        }),

        // A pergunta deixou de ser "existe config da Evolution?" e passou a ser
        // "o canal oficial está conectado?". O helper falha fechado: erro = false,
        // que aqui vira o alerta de segurança em vez de um painel otimista.
        isWhatsAppChannelConnected(restaurantId),

        prisma.order
          .groupBy({
            by: ["customerId"],
            where: { restaurantId, couponCode: { not: null } },
          })
          .then((rows) => rows.map((r) => r.customerId)),

        getSegmentConfig(restaurantId),

        // Campaign conversion stats for last 30 days
        Promise.all([
          prisma.campaignExecution.count({
            where: {
              restaurantId,
              sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
              status: { in: ["SENT", "DELIVERED", "READ"] },
            },
          }),
          prisma.campaignExecution.count({
            where: {
              restaurantId,
              sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
              converted: true,
            },
          }),
        ]).then(([sentCount, convertedCount]) => ({ sentCount, convertedCount })),

        prisma.restaurantBrandConfig.findUnique({
          where: { restaurantId },
          select: { googleReviewUrl: true, ifoodReviewUrl: true },
        }),
      ]);

    const couponUserIds = new Set(couponRows);
    const hasReviewLink =
      !!brandConfig?.googleReviewUrl?.trim() || !!brandConfig?.ifoodReviewUrl?.trim();

    // Compute restaurant-level average ticket as fallback for customers with no history
    const ticketSamples = customers
      .map((c) => {
        if (Number(c.averageTicket) > 0) return Number(c.averageTicket);
        if (c.totalOrders > 0) return Number(c.totalSpend) / c.totalOrders;
        return 0;
      })
      .filter((t) => t > 0);
    const restaurantAvgTicket =
      ticketSamples.length > 0
        ? ticketSamples.reduce((s, t) => s + t, 0) / ticketSamples.length
        : 50;

    const customerRows: CustomerComputeRow[] = customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      hasOptedOut: c.hasOptedOut,
      crmContactable: c.crmContactable,
      totalSpend: Number(c.totalSpend),
      totalOrders: c.totalOrders,
      lastOrderAt: c.lastOrderAt,
      importedOrderCount: c.importedOrderCount,
      importedTotalSpent: c.importedTotalSpent !== null ? Number(c.importedTotalSpent) : null,
      importedLastOrderAt: c.importedLastOrderAt,
      averageTicket: c.averageTicket !== null ? Number(c.averageTicket) : null,
      tier: c.tier,
      birthDate: c.birthDate,
    }));

    const actions = computeActions({
      customers: customerRows,
      now,
      hasWhatsAppChannel,
      couponUserIds,
      segmentConfig,
      recentCampaignStats: campaignStats,
      restaurantAvgTicket,
      hasReviewLink,
    });

    const warnings: string[] = [];
    if (!hasWhatsAppChannel) {
      warnings.push("WhatsApp oficial (Meta) não conectado — campanhas bloqueadas.");
    }
    if (!hasReviewLink) {
      warnings.push("Nenhum link de avaliação (Google/iFood) configurado — pedidos de avaliação bloqueados. Configure em Marca.");
    }

    return {
      summary: {
        totalActions: actions.length,
        highPriority: actions.filter((a) => a.priority === "HIGH").length,
        mediumPriority: actions.filter((a) => a.priority === "MEDIUM").length,
        lowPriority: actions.filter((a) => a.priority === "LOW").length,
        totalOpportunityRevenue: actions.reduce(
          (sum, a) => sum + a.estimatedRevenueOpportunity,
          0,
        ),
      },
      actions,
      generatedAt: now.toISOString(),
      warnings,
    };
  }
}
