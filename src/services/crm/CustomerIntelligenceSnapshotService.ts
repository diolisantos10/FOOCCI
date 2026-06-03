/**
 * CustomerIntelligenceSnapshotService
 *
 * Produces a single, cached-friendly "Customer Intelligence Snapshot" that answers:
 *   "Who is this customer and what should we do next?"
 *
 * It unifies value, recency, frequency, preferences, behavior, campaign history,
 * safety and a deterministic Next Best Action (NBA) into one object.
 *
 * Design:
 *   - The heavy classification logic is a PURE function (computeSnapshot) that takes
 *     already-fetched data — easy to test and reuse, no DB.
 *   - getSnapshot() is the DB-facing entry point: it fetches everything for a
 *     customer (tenant-scoped) and delegates to computeSnapshot().
 *   - buildCustomerIntelligenceContext() compiles a compact, no-invented-facts
 *     text block safe to feed a future CRM Agent prompt.
 *
 * IMPORTANT (W4 scope):
 *   - Deterministic logic only. No AI message generation. No sends. No campaigns.
 *   - Never invents facts. Unknown fields are marked, not guessed.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveCustomerClassification,
  type DataSource,
} from "./CustomerSegmentService";
import {
  RelationshipProgramService,
  type TierSettingsInput,
} from "./RelationshipProgramService";
import { getSegmentConfig, type SegmentConfig } from "@/lib/crm-segments";
import type { CustomerSegmentValue, CustomerTierValue } from "./crm-helpers";

// ── Public types ────────────────────────────────────────────────────────────────

export type ContactabilitySnapshot = "CONTACTABLE" | "NO_PHONE" | "OPTED_OUT" | "NOT_CONTACTABLE";

export type NextBestActionType =
  | "WELCOME_FIRST_ORDER"
  | "VIP_APPRECIATION"
  | "REVIEW_REQUEST"
  | "PREMIUM_OFFER"
  | "GENTLE_REMINDER"
  | "REACTIVATION"
  | "WINBACK"
  | "LOYALTY_THANK_YOU"
  | "DATA_ENRICHMENT"
  | "NO_ACTION";

export type ActionPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type RecommendedChannel = "WHATSAPP" | "INTERNAL" | "NONE";

export type SuggestedOfferType =
  | "NONE"
  | "FIRST_ORDER_INCENTIVE"
  | "DISCOUNT"
  | "STRONG_DISCOUNT"
  | "FREEBIE_OR_GIFT"
  | "PREMIUM_EXPERIENCE"
  | "NO_DISCOUNT_NEEDED";

export interface FavoriteItem {
  name:  string;
  count: number;
}

export interface NextBestAction {
  actionType:           NextBestActionType;
  priority:             ActionPriority;
  priorityScore:        number; // 0–100, deterministic ranking weight
  reason:               string;
  recommendedChannel:   RecommendedChannel;
  safeToContact:        boolean;
  suggestedCampaignType: string | null;
  suggestedOfferType:   SuggestedOfferType;
  suggestedMessageGoal: string; // a goal, NOT a final message
}

export interface CustomerIntelligenceSnapshot {
  // identity
  id:    string;
  name:  string;
  phone: string | null;
  contactability: ContactabilitySnapshot;

  // value
  totalOrders:   number;
  totalSpent:    number;
  averageTicket: number | null;
  tier:          CustomerTierValue;

  // recency
  lastOrderAt:        string | null;
  daysSinceLastOrder: number | null;
  segment:            CustomerSegmentValue;
  source:             DataSource;

  // frequency
  averageDaysBetweenOrders: number | null;
  orderFrequencyLabel:      string;

  // preferences
  favoriteProducts:   FavoriteItem[];
  favoriteCategories: FavoriteItem[];
  lastProducts:       string[];

  // behavior
  couponUser:           boolean;
  campaignReceivedCount: number;
  lastCampaignAt:       string | null;
  responseCount:        number;
  lastResponseAt:       string | null;

  // safety
  hasOptedOut:    boolean;
  crmContactable: boolean;
  safetyStatus:   string | null;

  // opportunity
  nextBestAction: NextBestAction;
}

// ── Input shape for the pure computation ─────────────────────────────────────────

export interface SnapshotComputeInput {
  customer: {
    id:                  string;
    name:                string;
    phone:               string | null;
    totalOrders:         number;
    totalSpend:          number;
    averageTicket:       number | null;
    lastOrderAt:         Date | null;
    importedLastOrderAt: Date | null;
    importedOrderCount:  number | null;
    importedTotalSpent:  number | null;
    hasOptedOut:         boolean;
    crmContactable:      boolean;
    contactStatus:       string | null;
  };
  favoriteProducts:   FavoriteItem[];
  favoriteCategories: FavoriteItem[];
  lastProducts:       string[];
  orderDates:         Date[];      // native countable order dates, for frequency
  couponOrderCount:   number;
  campaignReceivedCount: number;
  lastCampaignAt:     Date | null;
  responseCount:      number;
  lastResponseAt:     Date | null;
  lastOrderDelivered: boolean;
  segmentConfig:      SegmentConfig;
  tierSettings:       TierSettingsInput;
  now?:               Date;
}

// ── Frequency helpers ────────────────────────────────────────────────────────────

function computeAverageDaysBetweenOrders(orderDates: Date[]): number | null {
  if (orderDates.length < 2) return null;
  const sorted = [...orderDates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / 86_400_000);
  }
  if (gaps.length === 0) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

function frequencyLabel(avgDays: number | null, totalOrders: number): string {
  if (totalOrders === 0) return "sem pedidos";
  if (totalOrders === 1) return "primeiro pedido";
  if (avgDays === null)  return "dados insuficientes";
  if (avgDays <= 7)   return "semanal";
  if (avgDays <= 15)  return "quinzenal";
  if (avgDays <= 35)  return "mensal";
  if (avgDays <= 75)  return "esporádico";
  return "raro";
}

// ── Next Best Action engine (deterministic) ─────────────────────────────────────

interface NbaContext {
  contactability: ContactabilitySnapshot;
  segment:        CustomerSegmentValue;
  tier:           CustomerTierValue;
  totalOrders:    number;
  averageTicket:  number | null;
  couponUser:     boolean;
  daysSinceLastOrder: number | null;
  lastOrderDelivered: boolean;
}

const HIGH_TICKET_THRESHOLD = 120; // R$ — average ticket considered "premium"
const REVIEW_WINDOW_MIN_DAYS = 1;
const REVIEW_WINDOW_MAX_DAYS = 5;

/**
 * Deterministic Next Best Action. Pure — no DB, no randomness.
 * Precedence is intentional and documented inline.
 */
export function computeNextBestAction(ctx: NbaContext): NextBestAction {
  const isVip = ctx.tier === "OURO" || ctx.tier === "DIAMANTE";
  const highTicket = (ctx.averageTicket ?? 0) >= HIGH_TICKET_THRESHOLD;

  // 1. Opted out — never contact.
  if (ctx.contactability === "OPTED_OUT") {
    return {
      actionType:           "NO_ACTION",
      priority:             "NONE",
      priorityScore:        0,
      reason:               "Cliente solicitou opt-out — não deve receber mensagens de marketing.",
      recommendedChannel:   "NONE",
      safeToContact:        false,
      suggestedCampaignType: null,
      suggestedOfferType:   "NONE",
      suggestedMessageGoal: "Nenhuma ação de contato permitida.",
    };
  }

  // 2. No phone / not contactable — data enrichment only, no WhatsApp.
  if (ctx.contactability === "NO_PHONE" || ctx.contactability === "NOT_CONTACTABLE") {
    return {
      actionType:           "DATA_ENRICHMENT",
      priority:             "LOW",
      priorityScore:        20,
      reason: ctx.contactability === "NO_PHONE"
        ? "Cliente sem telefone válido — não é possível contato por WhatsApp."
        : "Cliente marcado como não contatável — revisar cadastro antes de qualquer contato.",
      recommendedChannel:   "INTERNAL",
      safeToContact:        false,
      suggestedCampaignType: null,
      suggestedOfferType:   "NONE",
      suggestedMessageGoal: "Enriquecer cadastro (telefone/contato) por canal interno ou manual.",
    };
  }

  // From here on: contactable.

  // 3. No orders yet — welcome / first-order incentive.
  if (ctx.segment === "SEM_PEDIDOS" || ctx.totalOrders === 0) {
    return {
      actionType:           "WELCOME_FIRST_ORDER",
      priority:             "MEDIUM",
      priorityScore:        55,
      reason:               "Cliente cadastrado sem pedidos — oportunidade de converter o primeiro pedido.",
      recommendedChannel:   "WHATSAPP",
      safeToContact:        true,
      suggestedCampaignType: "primeira-compra",
      suggestedOfferType:   "FIRST_ORDER_INCENTIVE",
      suggestedMessageGoal: "Dar boas-vindas e incentivar o primeiro pedido com um benefício simples.",
    };
  }

  // 4. Lost customer — stronger comeback offer.
  if (ctx.segment === "PERDIDO") {
    return {
      actionType:           "WINBACK",
      priority:             "HIGH",
      priorityScore:        85,
      reason:               `Cliente perdido (${ctx.daysSinceLastOrder ?? "?"} dias sem pedir) — requer oferta de retorno mais forte.`,
      recommendedChannel:   "WHATSAPP",
      safeToContact:        true,
      suggestedCampaignType: "recuperar-perdidos",
      // Lost customers genuinely need a stronger pull — keep the discount even for coupon users.
      suggestedOfferType:   "STRONG_DISCOUNT",
      suggestedMessageGoal: "Reconquistar o cliente com uma oferta de retorno atraente e sem fricção.",
    };
  }

  // 5. Cold customer — reactivation.
  if (ctx.segment === "FRIO") {
    return {
      actionType:           "REACTIVATION",
      priority:             "HIGH",
      priorityScore:        75,
      reason:               `Cliente frio (${ctx.daysSinceLastOrder ?? "?"} dias sem pedir) — momento de reativar antes de perder.`,
      recommendedChannel:   "WHATSAPP",
      safeToContact:        true,
      suggestedCampaignType: "recuperar-frios",
      suggestedOfferType:   ctx.couponUser ? "FREEBIE_OR_GIFT" : "DISCOUNT",
      suggestedMessageGoal: "Reativar com um lembrete caloroso e um incentivo de retorno.",
    };
  }

  // 6. Hot customer.
  if (ctx.segment === "QUENTE") {
    // 6a. VIP appreciation for high-tier hot customers.
    if (isVip) {
      return {
        actionType:           "VIP_APPRECIATION",
        priority:             "HIGH",
        priorityScore:        80,
        reason:               `Cliente VIP ativo (tier ${ctx.tier}) — alto valor, merece reconhecimento e tratamento premium.`,
        recommendedChannel:   "WHATSAPP",
        safeToContact:        true,
        suggestedCampaignType: "clientes-vip",
        suggestedOfferType:   ctx.couponUser ? "PREMIUM_EXPERIENCE" : "PREMIUM_EXPERIENCE",
        suggestedMessageGoal: "Reconhecer o cliente VIP e oferecer uma experiência/benefício premium ou pedir avaliação.",
      };
    }

    // 6b. Recent delivered order in the review window — ask for a review.
    if (
      ctx.lastOrderDelivered &&
      ctx.daysSinceLastOrder !== null &&
      ctx.daysSinceLastOrder >= REVIEW_WINDOW_MIN_DAYS &&
      ctx.daysSinceLastOrder <= REVIEW_WINDOW_MAX_DAYS
    ) {
      return {
        actionType:           "REVIEW_REQUEST",
        priority:             "MEDIUM",
        priorityScore:        60,
        reason:               `Pedido recente entregue há ${ctx.daysSinceLastOrder} dias — janela ideal para pedir avaliação.`,
        recommendedChannel:   "WHATSAPP",
        safeToContact:        true,
        suggestedCampaignType: "pedido-avaliacao",
        suggestedOfferType:   "NO_DISCOUNT_NEEDED",
        suggestedMessageGoal: "Agradecer o pedido e pedir uma avaliação honesta, sem oferecer desconto.",
      };
    }

    // 6c. High average ticket — premium offer.
    if (highTicket) {
      return {
        actionType:           "PREMIUM_OFFER",
        priority:             "MEDIUM",
        priorityScore:        58,
        reason:               `Cliente ativo com ticket médio alto (R$${(ctx.averageTicket ?? 0).toFixed(2)}) — bom alvo para oferta premium.`,
        recommendedChannel:   "WHATSAPP",
        safeToContact:        true,
        suggestedCampaignType: "alto-ticket",
        suggestedOfferType:   ctx.couponUser ? "NO_DISCOUNT_NEEDED" : "PREMIUM_EXPERIENCE",
        suggestedMessageGoal: "Apresentar uma novidade ou combo premium alinhado ao alto ticket do cliente.",
      };
    }

    // 6d. Otherwise loyalty / thank-you.
    return {
      actionType:           "LOYALTY_THANK_YOU",
      priority:             "LOW",
      priorityScore:        45,
      reason:               "Cliente ativo e recente — manter o relacionamento aquecido sem pressa.",
      recommendedChannel:   "WHATSAPP",
      safeToContact:        true,
      suggestedCampaignType: "clientes-quentes",
      suggestedOfferType:   ctx.couponUser ? "NO_DISCOUNT_NEEDED" : "NONE",
      suggestedMessageGoal: "Agradecer a preferência e reforçar o vínculo, sem necessariamente oferecer desconto.",
    };
  }

  // 7. Warm customer — gentle reminder.
  if (ctx.segment === "MORNO") {
    return {
      actionType:           "GENTLE_REMINDER",
      priority:             "MEDIUM",
      priorityScore:        50,
      reason:               `Cliente morno (${ctx.daysSinceLastOrder ?? "?"} dias sem pedir) — lembrete leve para manter a recorrência.`,
      recommendedChannel:   "WHATSAPP",
      safeToContact:        true,
      suggestedCampaignType: "reativar-mornos",
      suggestedOfferType:   ctx.couponUser ? "NO_DISCOUNT_NEEDED" : "DISCOUNT",
      suggestedMessageGoal: "Lembrar o cliente do restaurante de forma leve e convidativa.",
    };
  }

  // 8. Fallback — no clear action.
  return {
    actionType:           "NO_ACTION",
    priority:             "NONE",
    priorityScore:        0,
    reason:               "Nenhuma ação prioritária identificada para este cliente no momento.",
    recommendedChannel:   "NONE",
    safeToContact:        true,
    suggestedCampaignType: null,
    suggestedOfferType:   "NONE",
    suggestedMessageGoal: "Aguardar sinal mais claro antes de agir.",
  };
}

// ── Pure snapshot computation ────────────────────────────────────────────────────

export function computeSnapshot(input: SnapshotComputeInput): CustomerIntelligenceSnapshot {
  const c   = input.customer;
  const now = input.now ?? new Date();

  // Contactability
  let contactability: ContactabilitySnapshot;
  if (c.hasOptedOut) {
    contactability = "OPTED_OUT";
  } else if (!c.phone) {
    contactability = "NO_PHONE";
  } else if (!c.crmContactable) {
    contactability = "NOT_CONTACTABLE";
  } else {
    contactability = "CONTACTABLE";
  }

  // Classification (segment + tier) via the authoritative resolver.
  const classification = resolveCustomerClassification({
    lastOrderAt:         c.lastOrderAt,
    importedLastOrderAt: c.importedLastOrderAt,
    totalOrders:         c.totalOrders,
    importedOrderCount:  c.importedOrderCount,
    totalSpend:          c.totalSpend,
    importedTotalSpent:  c.importedTotalSpent,
    cfg:                 input.segmentConfig,
    settings:            input.tierSettings,
    now,
  });

  // Effective recency (native wins over imported).
  const effectiveLast =
    (c.totalOrders > 0 && c.lastOrderAt) ? c.lastOrderAt : c.importedLastOrderAt;
  const daysSinceLastOrder = effectiveLast
    ? Math.floor((now.getTime() - effectiveLast.getTime()) / 86_400_000)
    : null;

  // Effective value figures.
  const effectiveOrders = c.totalOrders > 0 ? c.totalOrders : (c.importedOrderCount ?? 0);
  const effectiveSpent  = c.totalOrders > 0 ? c.totalSpend  : (c.importedTotalSpent ?? 0);
  const averageTicket =
    c.averageTicket !== null && c.averageTicket !== undefined && c.averageTicket > 0
      ? c.averageTicket
      : (effectiveOrders > 0 ? effectiveSpent / effectiveOrders : null);

  // Frequency.
  const averageDaysBetweenOrders = computeAverageDaysBetweenOrders(input.orderDates);
  const orderFrequencyLabel      = frequencyLabel(averageDaysBetweenOrders, effectiveOrders);

  const nextBestAction = computeNextBestAction({
    contactability,
    segment:            classification.segment,
    tier:               classification.tier,
    totalOrders:        effectiveOrders,
    averageTicket,
    couponUser:         input.couponOrderCount > 0,
    daysSinceLastOrder,
    lastOrderDelivered: input.lastOrderDelivered,
  });

  return {
    id:    c.id,
    name:  c.name,
    phone: c.phone,
    contactability,

    totalOrders:   effectiveOrders,
    totalSpent:    effectiveSpent,
    averageTicket,
    tier:          classification.tier,

    lastOrderAt:        effectiveLast?.toISOString() ?? null,
    daysSinceLastOrder,
    segment:            classification.segment,
    source:             classification.source,

    averageDaysBetweenOrders,
    orderFrequencyLabel,

    favoriteProducts:   input.favoriteProducts,
    favoriteCategories: input.favoriteCategories,
    lastProducts:       input.lastProducts,

    couponUser:            input.couponOrderCount > 0,
    campaignReceivedCount: input.campaignReceivedCount,
    lastCampaignAt:        input.lastCampaignAt?.toISOString() ?? null,
    responseCount:         input.responseCount,
    lastResponseAt:        input.lastResponseAt?.toISOString() ?? null,

    hasOptedOut:    c.hasOptedOut,
    crmContactable: c.crmContactable,
    safetyStatus:   c.contactStatus,

    nextBestAction,
  };
}

// ── DB-facing service ────────────────────────────────────────────────────────────

export class CustomerIntelligenceSnapshotService {
  /**
   * Build the full intelligence snapshot for one customer.
   * Tenant-scoped: every query is constrained by restaurantId.
   *
   * Returns null when the customer does not exist in this restaurant.
   */
  static async getSnapshot(
    restaurantId: string,
    customerId:   string,
    opts?: { now?: Date },
  ): Promise<CustomerIntelligenceSnapshot | null> {
    const customer = await prisma.customer.findFirst({
      where:  { id: customerId, restaurantId },
      select: {
        id: true, name: true, phone: true,
        totalOrders: true, totalSpend: true, averageTicket: true,
        lastOrderAt: true, importedLastOrderAt: true,
        importedOrderCount: true, importedTotalSpent: true,
        hasOptedOut: true, crmContactable: true, contactStatus: true,
      },
    });

    if (!customer) return null;

    const now = opts?.now ?? new Date();

    const [
      tierSettings,
      segmentConfig,
      favProductRows,
      favCategoryRows,
      recentOrders,
      countableOrders,
      couponOrderCount,
      campaignAgg,
      lastCampaign,
      responseAgg,
      lastResponse,
    ] = await Promise.all([
      RelationshipProgramService.getSettings(restaurantId),
      getSegmentConfig(restaurantId),

      // Favorite products (by quantity), last 180 days, non-cancelled.
      prisma.orderItem.groupBy({
        by:    ["name"],
        where: {
          order: {
            customerId, restaurantId,
            status: { not: "CANCELLED" },
          },
        },
        _sum:    { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take:    5,
      }),

      // Favorite categories (by quantity), using categoryName snapshot.
      prisma.orderItem.groupBy({
        by:    ["categoryName"],
        where: {
          order: {
            customerId, restaurantId,
            status: { not: "CANCELLED" },
          },
          categoryName: { not: null },
        },
        _sum:    { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take:    5,
      }),

      // Last products ordered (most recent order's items).
      prisma.order.findFirst({
        where:   { customerId, restaurantId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        select:  {
          status: true,
          items: { select: { name: true }, take: 10 },
        },
      }),

      // Countable native order dates for frequency.
      prisma.order.findMany({
        where:   { customerId, restaurantId, status: { not: "CANCELLED" } },
        select:  { createdAt: true, importedAt: true },
        orderBy: { createdAt: "desc" },
        take:    50,
      }),

      // Coupon usage — orders with a coupon code.
      prisma.order.count({
        where: { customerId, restaurantId, couponCode: { not: null } },
      }),

      // Campaigns received (SENT or beyond).
      prisma.campaignExecution.count({
        where: { customerId, restaurantId, status: { in: ["SENT", "DELIVERED", "READ"] } },
      }),
      prisma.campaignExecution.findFirst({
        where:   { customerId, restaurantId, status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select:  { sentAt: true },
      }),

      // Responses — CRM action logs that got a reply.
      prisma.cRMActionLog.count({
        where: { customerId, restaurantId, responded: true },
      }),
      prisma.cRMActionLog.findFirst({
        where:   { customerId, restaurantId, responded: true, respondedAt: { not: null } },
        orderBy: { respondedAt: "desc" },
        select:  { respondedAt: true },
      }),
    ]);

    const favoriteProducts: FavoriteItem[] = favProductRows
      .filter((r) => (r._sum.quantity ?? 0) > 0)
      .map((r) => ({ name: r.name, count: r._sum.quantity ?? 0 }));

    const favoriteCategories: FavoriteItem[] = favCategoryRows
      .filter((r) => r.categoryName !== null && (r._sum.quantity ?? 0) > 0)
      .map((r) => ({ name: r.categoryName as string, count: r._sum.quantity ?? 0 }));

    const lastProducts: string[] = recentOrders?.items.map((i) => i.name) ?? [];
    const lastOrderDelivered = recentOrders?.status === "DELIVERED";

    const orderDates = countableOrders.map((o) => o.importedAt ?? o.createdAt);

    return computeSnapshot({
      customer: {
        id:                  customer.id,
        name:                customer.name,
        phone:               customer.phone,
        totalOrders:         customer.totalOrders,
        totalSpend:          Number(customer.totalSpend),
        averageTicket:       customer.averageTicket !== null ? Number(customer.averageTicket) : null,
        lastOrderAt:         customer.lastOrderAt,
        importedLastOrderAt: customer.importedLastOrderAt,
        importedOrderCount:  customer.importedOrderCount,
        importedTotalSpent:  customer.importedTotalSpent !== null ? Number(customer.importedTotalSpent) : null,
        hasOptedOut:         customer.hasOptedOut,
        crmContactable:      customer.crmContactable,
        contactStatus:       customer.contactStatus,
      },
      favoriteProducts,
      favoriteCategories,
      lastProducts,
      orderDates,
      couponOrderCount,
      campaignReceivedCount: campaignAgg,
      lastCampaignAt:        lastCampaign?.sentAt ?? null,
      responseCount:         responseAgg,
      lastResponseAt:        lastResponse?.respondedAt ?? null,
      lastOrderDelivered,
      segmentConfig,
      tierSettings,
      now,
    });
  }
}

// ── Prompt context builder ───────────────────────────────────────────────────────

/**
 * Compile a compact, safe text context from a snapshot for a future CRM Agent prompt.
 *
 * Rules:
 *   - Never invents facts. Unknown values are explicitly marked "desconhecido".
 *   - Only includes useful facts; omits empty preference lists.
 *   - States the recommended action as a GOAL, never as a final message.
 */
export function buildCustomerIntelligenceContext(snap: CustomerIntelligenceSnapshot): string {
  const unknown = "desconhecido";
  const lines: string[] = [];

  lines.push(`Cliente: ${snap.name || unknown}`);
  lines.push(`Contatabilidade: ${snap.contactability}`);
  lines.push(`Segmento: ${snap.segment} | Tier: ${snap.tier} | Origem dos dados: ${snap.source}`);

  // Value
  lines.push(
    `Valor: ${snap.totalOrders} pedido(s), total R$${snap.totalSpent.toFixed(2)}, ` +
    `ticket médio ${snap.averageTicket !== null ? `R$${snap.averageTicket.toFixed(2)}` : unknown}`,
  );

  // Recency
  lines.push(
    `Recência: ${snap.lastOrderAt
      ? `último pedido há ${snap.daysSinceLastOrder ?? unknown} dia(s)`
      : "sem pedido registrado"}`,
  );

  // Frequency — only when meaningful
  if (snap.averageDaysBetweenOrders !== null) {
    lines.push(`Frequência: ~${snap.averageDaysBetweenOrders} dia(s) entre pedidos (${snap.orderFrequencyLabel})`);
  } else {
    lines.push(`Frequência: ${snap.orderFrequencyLabel}`);
  }

  // Preferences — only when present
  if (snap.favoriteProducts.length > 0) {
    lines.push(`Produtos favoritos: ${snap.favoriteProducts.map((p) => p.name).join(", ")}`);
  }
  if (snap.favoriteCategories.length > 0) {
    lines.push(`Categorias favoritas: ${snap.favoriteCategories.map((c) => c.name).join(", ")}`);
  }
  if (snap.lastProducts.length > 0) {
    lines.push(`Últimos itens pedidos: ${snap.lastProducts.slice(0, 5).join(", ")}`);
  }

  // Behavior
  lines.push(`Usa cupom: ${snap.couponUser ? "sim" : "não"}`);
  lines.push(
    `Campanhas recebidas: ${snap.campaignReceivedCount}` +
    (snap.lastCampaignAt ? ` (última registrada)` : "") +
    ` | Respostas: ${snap.responseCount}`,
  );

  // Safety
  lines.push(
    `Segurança: opt-out=${snap.hasOptedOut ? "sim" : "não"}, ` +
    `contatável=${snap.crmContactable ? "sim" : "não"}` +
    (snap.safetyStatus ? `, status=${snap.safetyStatus}` : ""),
  );

  // Next best action — stated as a goal
  const nba = snap.nextBestAction;
  lines.push(
    `Próxima melhor ação: ${nba.actionType} (prioridade ${nba.priority}). ` +
    `Motivo: ${nba.reason} ` +
    `Canal recomendado: ${nba.recommendedChannel}. Seguro contatar: ${nba.safeToContact ? "sim" : "não"}. ` +
    `Objetivo da mensagem (NÃO é a mensagem final): ${nba.suggestedMessageGoal}`,
  );

  lines.push(
    "IMPORTANTE: use apenas os fatos acima. Não invente dados. Campos marcados como 'desconhecido' não devem ser presumidos.",
  );

  return lines.join("\n");
}
