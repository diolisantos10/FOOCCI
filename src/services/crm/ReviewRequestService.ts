/**
 * ReviewRequestService — CRM W8
 *
 * Decides whether a customer/order is eligible for a post-order review request
 * and prepares a SAFE, non-spammy draft pointing at the restaurant's real
 * Google / iFood review link.
 *
 * Design (mirrors W2 ContactSafetyService + W6 MessageVariationService):
 *   - `evaluateReviewEligibility()` is a PURE function (no DB) — fully testable.
 *   - `ReviewRequestService.evaluateReviewRequestEligibility()` gathers DB data,
 *     runs ContactSafetyService, then delegates to the pure evaluator.
 *
 * SCOPE GUARD (verbatim constraints):
 *   - NEVER sends a WhatsApp message. NEVER triggers a campaign.
 *   - Draft-only — every decision carries `requiresApproval: true`.
 *   - Respects ContactSafetyService + opt-out.
 *   - Does NOT invent review links — only uses configured googleReviewUrl /
 *     ifoodReviewUrl from RestaurantBrandConfig.
 *   - Tenant-scoped: all DB queries filtered by restaurantId.
 *
 * Review-request tracking: there is no per-order review field in the schema.
 * Dedup reads CRMActionLog rows whose actionType is a review type. Actual
 * logging happens when a request is genuinely sent through the approved
 * campaign/action flow (out of scope here).
 */

import { prisma } from "@/lib/prisma";
import {
  ContactSafetyService,
  type ContactSafetyDecision,
} from "@/services/crm/ContactSafetyService";

// ── Tuning constants ────────────────────────────────────────────────────────

/** Order must be at least this old before asking (avoid asking same-day). */
export const MIN_ORDER_AGE_DAYS = 1;
/** Order older than this is stale — the experience is no longer fresh. */
export const MAX_ORDER_AGE_DAYS = 14;
/** Don't ask the same customer for a review again within this window. */
export const CUSTOMER_REVIEW_COOLDOWN_DAYS = 45;
/** Suggested delay (days after delivery) for the request. */
export const SUGGESTED_TIMING_DAYS = 2;

/** actionType values that count as a prior review request for dedup. */
export const REVIEW_ACTION_TYPES = ["REVIEW_REQUEST", "REVIEW", "AVALIACAO"];

// ── Types ───────────────────────────────────────────────────────────────────

export type ReviewBlockReason =
  | "CUSTOMER_OPTED_OUT"
  | "CUSTOMER_NOT_CONTACTABLE"
  | "MISSING_PHONE"
  | "NO_REVIEW_LINKS"
  | "NO_DELIVERED_ORDER"
  | "ORDER_NOT_DELIVERED"
  | "ORDER_TOO_RECENT"
  | "ORDER_TOO_OLD"
  | "REVIEW_ALREADY_REQUESTED_FOR_ORDER"
  | "CUSTOMER_ASKED_REVIEW_RECENTLY"
  | "SAFETY_BLOCKED"
  | "LOW_SATISFACTION_OR_COMPLAINT"
  | "UNKNOWN_ERROR";

export type ReviewPlatform = "GOOGLE" | "IFOOD";

export interface ReviewLink {
  platform: ReviewPlatform;
  url: string;
}

export interface ReviewRequestDecision {
  eligible: boolean;
  reasons: string[];
  blocks: ReviewBlockReason[];
  preferredPlatform: ReviewPlatform | null;
  preferredReviewLink: string | null;
  availableLinks: ReviewLink[];
  suggestedTimingDays: number;
  messageGoal: "REVIEW_REQUEST";
  draftMessage: string | null;
  safetyDecision: ContactSafetyDecision | null;
  /** Draft-only contract — always true. Never auto-sends. */
  requiresApproval: true;
  computedAt: string;
}

// ── Pure evaluator input ──────────────────────────────────────────────────────

export interface ReviewEligibilityInput {
  customerName: string | null;
  hasOptedOut: boolean;
  crmContactable: boolean;
  phone: string | null;

  // Review links from RestaurantBrandConfig
  googleReviewUrl: string | null;
  ifoodReviewUrl: string | null;

  // Order context (null when no qualifying order found)
  orderStatus: string | null;
  /** Origin channel: pedido | qr | whatsapp | manual | import | ifood */
  orderSource: string | null;
  /** Effective order date (completedAt ?? createdAt ?? importedAt). */
  orderDate: Date | null;

  // Dedup signals (pre-fetched counts keep the evaluator deterministic)
  alreadyRequestedForOrder: boolean;
  customerLastReviewRequestAt: Date | null;

  // Satisfaction gate — conservative; true blocks the request
  hasComplaintSignal: boolean;

  // Safety gate from ContactSafetyService (optional)
  safetyDecision: ContactSafetyDecision | null;

  // Brand tone for the draft (optional)
  tone: string | null;
  emojiUsage: string | null;

  now: Date;
}

// ── Completed-order statuses ──────────────────────────────────────────────────

const DELIVERED_STATUSES = new Set(["DELIVERED"]);

// ── Pure: link selection ──────────────────────────────────────────────────────

function normalizeUrl(url: string | null): string | null {
  const t = (url ?? "").trim();
  return t.length > 0 ? t : null;
}

/** True when the order originated from iFood or an import (iFood-style channel). */
export function isIfoodSource(source: string | null): boolean {
  const s = (source ?? "").toLowerCase();
  return s === "ifood" || s === "import" || s === "imported";
}

/**
 * Select the preferred review link based on configured links + order source.
 * - iFood/imported order + iFood link → iFood
 * - direct (pedido/qr/whatsapp/manual) order + Google link → Google
 * - only one link configured → use it
 * - none → null
 * Never invents a link.
 */
export function selectReviewLink(
  links: { google: string | null; ifood: string | null },
  orderSource: string | null,
): ReviewLink | null {
  const google = normalizeUrl(links.google);
  const ifood = normalizeUrl(links.ifood);

  if (!google && !ifood) return null;
  if (google && !ifood) return { platform: "GOOGLE", url: google };
  if (ifood && !google) return { platform: "IFOOD", url: ifood };

  // Both exist — pick by source.
  if (isIfoodSource(orderSource)) return { platform: "IFOOD", url: ifood! };
  return { platform: "GOOGLE", url: google! };
}

export function availableReviewLinks(
  links: { google: string | null; ifood: string | null },
): ReviewLink[] {
  const out: ReviewLink[] = [];
  const google = normalizeUrl(links.google);
  const ifood = normalizeUrl(links.ifood);
  if (google) out.push({ platform: "GOOGLE", url: google });
  if (ifood) out.push({ platform: "IFOOD", url: ifood });
  return out;
}

// ── Pure: draft message ───────────────────────────────────────────────────────

function firstName(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0]!;
}

/**
 * Build a short, human, non-spammy review-request draft.
 * - No pressure, no fake urgency, no invented reward.
 * - Includes only the real link.
 * - Light emoji unless emojiUsage is "none".
 */
export function buildReviewMessage(args: {
  customerName: string | null;
  platform: ReviewPlatform;
  url: string;
  emojiUsage: string | null;
}): string {
  const name = firstName(args.customerName);
  const greeting = name ? `Oi, ${name}` : "Oi";
  const emoji = (args.emojiUsage ?? "").toLowerCase() === "none" ? "" : " 😊";
  const where = args.platform === "IFOOD" ? "no iFood" : "no Google";
  return (
    `${greeting}${emoji} Obrigado pelo seu pedido! ` +
    `Se você curtiu, sua avaliação ${where} ajuda muito a gente. ` +
    `Pode deixar sua opinião aqui: ${args.url}`
  );
}

// ── Pure: eligibility evaluation ──────────────────────────────────────────────

/**
 * Pure eligibility decision. No DB, no network. Deterministic given input.
 */
export function evaluateReviewEligibility(
  input: ReviewEligibilityInput,
): ReviewRequestDecision {
  const blocks: ReviewBlockReason[] = [];
  const reasons: string[] = [];

  const links = { google: input.googleReviewUrl, ifood: input.ifoodReviewUrl };
  const available = availableReviewLinks(links);
  const selected = selectReviewLink(links, input.orderSource);

  // ── Contactability gates ───────────────────────────────────────────────────
  if (input.hasOptedOut) {
    blocks.push("CUSTOMER_OPTED_OUT");
    reasons.push("Cliente optou por não receber mensagens.");
  }
  if (!input.crmContactable) {
    blocks.push("CUSTOMER_NOT_CONTACTABLE");
    reasons.push("Cliente marcado como não contactável.");
  }
  if (!input.phone || input.phone.trim() === "") {
    blocks.push("MISSING_PHONE");
    reasons.push("Cliente sem telefone cadastrado.");
  }

  // ── Review-link gate ─────────────────────────────────────────────────────────
  if (available.length === 0) {
    blocks.push("NO_REVIEW_LINKS");
    reasons.push("Nenhum link de avaliação (Google/iFood) configurado em Marca.");
  }

  // ── Order gates ──────────────────────────────────────────────────────────────
  if (!input.orderStatus || !input.orderDate) {
    blocks.push("NO_DELIVERED_ORDER");
    reasons.push("Nenhum pedido entregue encontrado para este cliente.");
  } else if (!DELIVERED_STATUSES.has(input.orderStatus)) {
    blocks.push("ORDER_NOT_DELIVERED");
    reasons.push(`Pedido com status ${input.orderStatus} — só pedimos avaliação após entrega.`);
  } else {
    const days = Math.floor((input.now.getTime() - input.orderDate.getTime()) / 86_400_000);
    if (days < MIN_ORDER_AGE_DAYS) {
      blocks.push("ORDER_TOO_RECENT");
      reasons.push(`Pedido há ${days} dia(s) — aguarde ao menos ${MIN_ORDER_AGE_DAYS} dia.`);
    } else if (days > MAX_ORDER_AGE_DAYS) {
      blocks.push("ORDER_TOO_OLD");
      reasons.push(`Pedido há ${days} dias — experiência não está mais fresca (máx ${MAX_ORDER_AGE_DAYS}).`);
    }
  }

  // ── Dedup gates ────────────────────────────────────────────────────────────
  if (input.alreadyRequestedForOrder) {
    blocks.push("REVIEW_ALREADY_REQUESTED_FOR_ORDER");
    reasons.push("Avaliação já solicitada para este pedido.");
  }
  if (input.customerLastReviewRequestAt) {
    const daysSince = Math.floor(
      (input.now.getTime() - input.customerLastReviewRequestAt.getTime()) / 86_400_000,
    );
    if (daysSince < CUSTOMER_REVIEW_COOLDOWN_DAYS) {
      blocks.push("CUSTOMER_ASKED_REVIEW_RECENTLY");
      reasons.push(
        `Cliente recebeu pedido de avaliação há ${daysSince} dia(s) ` +
        `(cooldown ${CUSTOMER_REVIEW_COOLDOWN_DAYS} dias).`,
      );
    }
  }

  // ── Satisfaction gate (conservative) ─────────────────────────────────────────
  if (input.hasComplaintSignal) {
    blocks.push("LOW_SATISFACTION_OR_COMPLAINT");
    reasons.push("Sinal de insatisfação/reclamação recente — não pedir avaliação.");
  }

  // ── Safety gate ──────────────────────────────────────────────────────────────
  if (input.safetyDecision && !input.safetyDecision.sendable) {
    blocks.push("SAFETY_BLOCKED");
    reasons.push(
      `Bloqueado por segurança de contato: ${input.safetyDecision.reason ?? "desconhecido"}.`,
    );
  }

  const eligible = blocks.length === 0;

  if (eligible && selected) {
    reasons.push(`Elegível — avaliação ${selected.platform === "IFOOD" ? "iFood" : "Google"}.`);
  }

  const draftMessage =
    eligible && selected
      ? buildReviewMessage({
          customerName: input.customerName,
          platform: selected.platform,
          url: selected.url,
          emojiUsage: input.emojiUsage,
        })
      : null;

  return {
    eligible,
    reasons,
    blocks,
    preferredPlatform: selected?.platform ?? null,
    preferredReviewLink: selected?.url ?? null,
    availableLinks: available,
    suggestedTimingDays: SUGGESTED_TIMING_DAYS,
    messageGoal: "REVIEW_REQUEST",
    draftMessage,
    safetyDecision: input.safetyDecision,
    requiresApproval: true,
    computedAt: input.now.toISOString(),
  };
}

// ── Service (DB orchestration) ────────────────────────────────────────────────

export interface EvaluateReviewRequestInput {
  restaurantId: string;
  customerId: string;
  orderId?: string;
  channel?: "WHATSAPP";
  /** Skip ContactSafetyService (e.g. lightweight preview). Default false. */
  skipSafety?: boolean;
  now?: Date;
}

export class ReviewRequestService {
  /**
   * Full eligibility check. Read-only. Never sends.
   */
  static async evaluateReviewRequestEligibility(
    input: EvaluateReviewRequestInput,
  ): Promise<ReviewRequestDecision> {
    const now = input.now ?? new Date();

    try {
      // ── Parallel loads, tenant-scoped ─────────────────────────────────────
      const [brandConfig, customer, order] = await Promise.all([
        prisma.restaurantBrandConfig.findUnique({
          where: { restaurantId: input.restaurantId },
          select: { googleReviewUrl: true, ifoodReviewUrl: true, tone: true, emojiUsage: true },
        }),
        prisma.customer.findFirst({
          where: { id: input.customerId, restaurantId: input.restaurantId },
          select: { id: true, name: true, phone: true, hasOptedOut: true, crmContactable: true },
        }),
        input.orderId
          ? prisma.order.findFirst({
              where: { id: input.orderId, restaurantId: input.restaurantId },
              select: { id: true, status: true, source: true, completedAt: true, createdAt: true, importedAt: true, customerId: true },
            })
          : prisma.order.findFirst({
              // Most recent DELIVERED order for this customer
              where: {
                restaurantId: input.restaurantId,
                customerId: input.customerId,
                status: "DELIVERED",
              },
              orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
              select: { id: true, status: true, source: true, completedAt: true, createdAt: true, importedAt: true, customerId: true },
            }),
      ]);

      const orderDate =
        order?.completedAt ?? order?.createdAt ?? order?.importedAt ?? null;

      // ── Dedup: prior review requests via CRMActionLog ─────────────────────
      const cooldownStart = new Date(
        now.getTime() - CUSTOMER_REVIEW_COOLDOWN_DAYS * 86_400_000,
      );

      const [alreadyForOrder, lastReviewLog] = await Promise.all([
        order
          ? prisma.cRMActionLog.findFirst({
              where: {
                restaurantId: input.restaurantId,
                customerId: input.customerId,
                actionType: { in: REVIEW_ACTION_TYPES },
                orderId: order.id,
              },
              select: { id: true },
            })
          : Promise.resolve(null),
        prisma.cRMActionLog.findFirst({
          where: {
            restaurantId: input.restaurantId,
            customerId: input.customerId,
            actionType: { in: REVIEW_ACTION_TYPES },
            createdAt: { gte: cooldownStart },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

      // ── Safety gate (read-only; never sends) ──────────────────────────────
      let safetyDecision: ContactSafetyDecision | null = null;
      if (!input.skipSafety && customer) {
        safetyDecision = await ContactSafetyService.assertSendable({
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          phone: customer.phone,
          hasOptedOut: customer.hasOptedOut,
          crmContactable: customer.crmContactable,
          // Manual/approval path — don't enforce time windows or daily cap here.
          enforceTimeWindows: false,
          enforceDailyCap: false,
          now,
        }).catch(() => null);
      }

      return evaluateReviewEligibility({
        customerName: customer?.name ?? null,
        hasOptedOut: customer?.hasOptedOut ?? true,
        crmContactable: customer?.crmContactable ?? false,
        phone: customer?.phone ?? null,
        googleReviewUrl: brandConfig?.googleReviewUrl ?? null,
        ifoodReviewUrl: brandConfig?.ifoodReviewUrl ?? null,
        orderStatus: order?.status ?? null,
        orderSource: order?.source ?? null,
        orderDate,
        alreadyRequestedForOrder: !!alreadyForOrder,
        customerLastReviewRequestAt: lastReviewLog?.createdAt ?? null,
        // No sentiment data available — conservative default.
        hasComplaintSignal: false,
        safetyDecision,
        tone: brandConfig?.tone ?? null,
        emojiUsage: brandConfig?.emojiUsage ?? null,
        now,
      });
    } catch (err) {
      console.error("[ReviewRequestService] evaluate error:", err);
      return {
        eligible: false,
        reasons: ["Erro ao avaliar elegibilidade."],
        blocks: ["UNKNOWN_ERROR"],
        preferredPlatform: null,
        preferredReviewLink: null,
        availableLinks: [],
        suggestedTimingDays: SUGGESTED_TIMING_DAYS,
        messageGoal: "REVIEW_REQUEST",
        draftMessage: null,
        safetyDecision: null,
        requiresApproval: true,
        computedAt: now.toISOString(),
      };
    }
  }

  /** Read review-link configuration status for a restaurant (UI helper). */
  static async getReviewLinkStatus(
    restaurantId: string,
  ): Promise<{ google: boolean; ifood: boolean; availableLinks: ReviewLink[] }> {
    const cfg = await prisma.restaurantBrandConfig.findUnique({
      where: { restaurantId },
      select: { googleReviewUrl: true, ifoodReviewUrl: true },
    });
    const available = availableReviewLinks({
      google: cfg?.googleReviewUrl ?? null,
      ifood: cfg?.ifoodReviewUrl ?? null,
    });
    return {
      google: !!normalizeUrl(cfg?.googleReviewUrl ?? null),
      ifood: !!normalizeUrl(cfg?.ifoodReviewUrl ?? null),
      availableLinks: available,
    };
  }
}
