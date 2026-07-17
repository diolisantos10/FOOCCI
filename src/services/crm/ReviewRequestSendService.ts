/**
 * ReviewRequestSendService — CRM Sprint B
 *
 * The human-confirmed send path for post-order review requests.
 *
 * This is intentionally SEPARATE from ReviewRequestService (which is strictly
 * draft-only / read-only). This service performs the actual WhatsApp send, but
 * ONLY when a human explicitly confirms (`confirm: true`). It NEVER runs on a
 * timer, NEVER runs autonomously, and NEVER bypasses ContactSafetyService.
 *
 * Flow on send():
 *   1. Re-run ReviewRequestService.evaluateReviewRequestEligibility (eligibility
 *      + ContactSafetyService) — the UI preview is advisory only; the server
 *      re-checks at send time.
 *   2. Resolve the platform + real review link (no invention).
 *   3. Resolve the final message (operator edit allowed, must keep the link).
 *   4. Send via the existing safe Evolution path.
 *   5. Log a Message into the customer's WhatsApp conversation (Atendimento).
 *   6. Log a CRMActionLog row (status in metadata) for audit + dedup.
 *
 * Dedup: a SENT review request is logged with actionType "REVIEW_REQUEST"
 * (counted by ReviewRequestService.REVIEW_ACTION_TYPES). Failed/skipped attempts
 * are logged with distinct actionTypes so they NEVER block a legitimate retry.
 *
 * SCOPE GUARD:
 *   - No autonomous sends. `confirm: true` is mandatory.
 *   - Opt-out / safety / phone / link / cooldown all re-enforced server-side.
 *   - Tenant-scoped: every query and log row carries restaurantId.
 */

import { prisma } from "@/lib/prisma";
import { ConversationStatus } from "@prisma/client";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { sendWhatsAppText } from "@/services/whatsapp/activeProvider";
import {
  ReviewRequestService,
  type ReviewRequestDecision,
  type ReviewPlatform,
} from "@/services/crm/ReviewRequestService";

// ── Action-type taxonomy ──────────────────────────────────────────────────────
// Only ACTION_TYPE_SENT is part of ReviewRequestService.REVIEW_ACTION_TYPES, so
// failed/skipped rows never count toward the dedup / cooldown gates.
export const REVIEW_ACTION_TYPE_SENT = "REVIEW_REQUEST";
export const REVIEW_ACTION_TYPE_FAILED = "REVIEW_REQUEST_FAILED";
export const REVIEW_ACTION_TYPE_SKIPPED = "REVIEW_REQUEST_SKIPPED";

export type ReviewSendStatus = "sent" | "failed" | "skipped";

// ── Pure planner ──────────────────────────────────────────────────────────────

export type ReviewPlatformRequest = "GOOGLE" | "IFOOD" | "AUTO";

export interface ReviewSendPlanInput {
  eligibility: ReviewRequestDecision;
  /** Operator-selected platform; AUTO/undefined → service preferred platform. */
  requestedPlatform?: ReviewPlatformRequest;
  /** Operator-edited message; null/empty → use the generated draft. */
  customMessage?: string | null;
  /** Hard gate — a human must explicitly confirm. */
  confirm: boolean;
}

export interface ReviewSendPlan {
  /** "ready" → safe to send; "blocked" → do NOT send. */
  status: "ready" | "blocked";
  blockReasons: string[];
  platform: ReviewPlatform | null;
  link: string | null;
  message: string | null;
}

/**
 * Pure decision: given an eligibility result + operator choices, decide whether
 * a send is allowed and with what platform/link/message. No I/O. Deterministic.
 */
export function resolveReviewSendPlan(input: ReviewSendPlanInput): ReviewSendPlan {
  const blockReasons: string[] = [];

  // Human-confirmation gate is the first, inviolable check.
  if (!input.confirm) {
    return { status: "blocked", blockReasons: ["CONFIRM_REQUIRED"], platform: null, link: null, message: null };
  }

  const d = input.eligibility;

  // Eligibility / safety must hold at send time.
  if (!d.eligible) {
    for (const b of d.blocks) blockReasons.push(b);
    if (blockReasons.length === 0) blockReasons.push("NOT_ELIGIBLE");
  }

  // Resolve platform + link from the configured (real) links only.
  let platform: ReviewPlatform | null = null;
  let link: string | null = null;

  const req = input.requestedPlatform ?? "AUTO";
  if (req === "AUTO") {
    platform = d.preferredPlatform;
    link = d.preferredReviewLink;
  } else {
    const match = d.availableLinks.find((l) => l.platform === req);
    if (match) {
      platform = match.platform;
      link = match.url;
    } else {
      blockReasons.push("PLATFORM_NOT_AVAILABLE");
    }
  }

  if (!link || !platform) {
    if (!blockReasons.includes("NO_REVIEW_LINKS") && !blockReasons.includes("PLATFORM_NOT_AVAILABLE")) {
      blockReasons.push("NO_REVIEW_LINK_RESOLVED");
    }
  }

  // Resolve the final message. Operator edits are allowed but must keep the real
  // review link — we never send a review request without its link.
  const trimmed = (input.customMessage ?? "").trim();
  let message: string | null = null;
  if (trimmed.length > 0) {
    if (link && !trimmed.includes(link)) {
      blockReasons.push("MESSAGE_MISSING_LINK");
    } else {
      message = trimmed;
    }
  } else {
    message = d.draftMessage;
    if (!message) blockReasons.push("NO_MESSAGE");
  }

  const status = blockReasons.length === 0 ? "ready" : "blocked";
  return {
    status,
    blockReasons,
    platform,
    link,
    message: status === "ready" ? message : null,
  };
}

// ── Pure: CRMActionLog row builder ─────────────────────────────────────────────

export interface ReviewActionLogRow {
  restaurantId: string;
  customerId: string | null;
  actionType: string;
  messageStyle: "FRIENDLY";
  messageText: string;
  orderId: string | null;
  metadata: {
    status: ReviewSendStatus;
    platform: ReviewPlatform | null;
    reviewLink: string | null;
    channel: "WHATSAPP";
    error?: string;
  };
}

/**
 * Build the CRMActionLog row for a review-request outcome. Pure — the caller
 * persists it. SENT uses the dedup-counted actionType; FAILED/SKIPPED use
 * distinct types so they don't block retries.
 */
export function buildReviewActionLog(args: {
  status: ReviewSendStatus;
  restaurantId: string;
  customerId: string | null;
  orderId: string | null;
  platform: ReviewPlatform | null;
  reviewLink: string | null;
  messageText: string;
  error?: string;
}): ReviewActionLogRow {
  const actionType =
    args.status === "sent"
      ? REVIEW_ACTION_TYPE_SENT
      : args.status === "failed"
        ? REVIEW_ACTION_TYPE_FAILED
        : REVIEW_ACTION_TYPE_SKIPPED;

  return {
    restaurantId: args.restaurantId,
    customerId: args.customerId,
    actionType,
    messageStyle: "FRIENDLY",
    messageText: args.messageText,
    orderId: args.orderId,
    metadata: {
      status: args.status,
      platform: args.platform,
      reviewLink: args.reviewLink,
      channel: "WHATSAPP",
      ...(args.error ? { error: args.error } : {}),
    },
  };
}

// ── Service (DB orchestration) ─────────────────────────────────────────────────

export interface SendReviewRequestInput {
  restaurantId: string;
  customerId: string;
  orderId?: string;
  platform?: ReviewPlatformRequest;
  /** Operator-edited final message (optional). */
  message?: string | null;
  /** Mandatory human confirmation. */
  confirm: boolean;
  now?: Date;
}

export interface SendReviewRequestResult {
  status: ReviewSendStatus;
  platform: ReviewPlatform | null;
  reviewLink: string | null;
  messageText: string | null;
  /** Evolution message id when sent. */
  messageId?: string;
  blockReasons: string[];
  /** Block/skip reasons in human-readable form (mirrors eligibility reasons). */
  reasons: string[];
  /** The full eligibility decision (advisory detail for the UI). */
  eligibility: ReviewRequestDecision;
  error?: string;
  actionLogId?: string;
}

export class ReviewRequestSendService {
  /**
   * Send a review request to a customer — only when `confirm: true`.
   * Never autonomous. Re-checks eligibility + safety + dedup server-side.
   */
  static async sendReviewRequest(
    input: SendReviewRequestInput,
  ): Promise<SendReviewRequestResult> {
    const now = input.now ?? new Date();

    // 1. Re-evaluate eligibility (eligibility + ContactSafetyService + dedup).
    const eligibility = await ReviewRequestService.evaluateReviewRequestEligibility({
      restaurantId: input.restaurantId,
      customerId: input.customerId,
      orderId: input.orderId,
      channel: "WHATSAPP",
      now,
    });

    // 2. Decide the send plan (pure).
    const plan = resolveReviewSendPlan({
      eligibility,
      requestedPlatform: input.platform,
      customMessage: input.message ?? null,
      confirm: input.confirm,
    });

    // 3. Blocked → log a SKIPPED audit row (does not affect dedup) and return.
    if (plan.status === "blocked" || !plan.message || !plan.link) {
      // Only persist a skip row if a human actually confirmed (avoids noise from
      // the validation-only CONFIRM_REQUIRED path).
      let actionLogId: string | undefined;
      if (input.confirm) {
        const row = buildReviewActionLog({
          status: "skipped",
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          platform: plan.platform,
          reviewLink: plan.link,
          messageText: plan.message ?? eligibility.draftMessage ?? "",
          error: plan.blockReasons.join(","),
        });
        const created = await prisma.cRMActionLog.create({ data: row, select: { id: true } });
        actionLogId = created.id;
      }
      return {
        status: "skipped",
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        blockReasons: plan.blockReasons,
        reasons: eligibility.reasons,
        eligibility,
        actionLogId,
      };
    }

    // 4. Resolve the customer phone (tenant-scoped).
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, restaurantId: input.restaurantId },
      select: { id: true, name: true, phone: true },
    });
    const phone = customer?.phone?.replace(/^\+/, "") ?? "";
    if (!customer || !phone) {
      const row = buildReviewActionLog({
        status: "skipped",
        restaurantId: input.restaurantId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        error: "MISSING_PHONE",
      });
      const created = await prisma.cRMActionLog.create({ data: row, select: { id: true } });
      return {
        status: "skipped",
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        blockReasons: ["MISSING_PHONE"],
        reasons: eligibility.reasons,
        eligibility,
        actionLogId: created.id,
      };
    }

    // 5. Load Evolution config — only required when Evolution is the ACTIVE provider.
    // A Meta-official restaurant sends via stored Cloud API credentials instead.
    const activeProviderName = await prisma.restaurant
      .findUnique({ where: { id: input.restaurantId }, select: { whatsappProvider: true } })
      .then((r) => r?.whatsappProvider ?? "EVOLUTION")
      .catch(() => "EVOLUTION");
    const cfgResult = await EvolutionConfigService.getSnapshot(input.restaurantId);
    if (!cfgResult.ok && activeProviderName !== "META_CLOUD_API") {
      const row = buildReviewActionLog({
        status: "skipped",
        restaurantId: input.restaurantId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        error: "NO_EVOLUTION_CONFIG",
      });
      const created = await prisma.cRMActionLog.create({ data: row, select: { id: true } });
      return {
        status: "skipped",
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        blockReasons: ["NO_EVOLUTION_CONFIG"],
        reasons: [...eligibility.reasons, "WhatsApp não configurado."],
        eligibility,
        actionLogId: created.id,
      };
    }

    // 6. Send + log. On Evolution failure, log a FAILED row (retry-safe).
    try {
      const sendRes = await sendWhatsAppText(input.restaurantId, phone, plan.message);
      if (!sendRes.ok) throw new Error(sendRes.errorCode ?? sendRes.error ?? "SEND_FAILED");

      const convId = await findOrCreateReviewConversation(
        input.restaurantId,
        customer.id,
        customer.phone ?? phone,
        customer.name ?? phone,
      );

      const logRow = buildReviewActionLog({
        status: "sent",
        restaurantId: input.restaurantId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
      });

      const [, actionLog] = await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId: convId,
            direction: "OUTBOUND",
            senderType: "AI",
            content: plan.message,
            type: "TEXT",
            sentAt: now,
            externalStatus: "sent",
            provider: sendRes.provider,
            ...(sendRes.providerMessageId
              ? { externalMessageId: sendRes.providerMessageId, providerMessageId: sendRes.providerMessageId }
              : {}),
            metadata: {
              source: "WHATSAPP",
              reviewRequest: true,
              reviewPlatform: plan.platform,
            },
          },
        }),
        prisma.cRMActionLog.create({ data: logRow, select: { id: true } }),
        // Tag conversation so it appears in the CRM "mensagens enviadas" screen.
        // Only set if null — avoids overwriting an active contextType (e.g. CART_RECOVERY).
        prisma.conversation.updateMany({
          where: { id: convId, contextType: null },
          data:  { contextType: "CRM_REVIEW" },
        }),
      ]);

      return {
        status: "sent",
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        messageId: evoResult.key.id,
        blockReasons: [],
        reasons: eligibility.reasons,
        eligibility,
        actionLogId: actionLog.id,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Erro desconhecido ao enviar.";
      const row = buildReviewActionLog({
        status: "failed",
        restaurantId: input.restaurantId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        error,
      });
      const created = await prisma.cRMActionLog
        .create({ data: row, select: { id: true } })
        .catch(() => null);
      return {
        status: "failed",
        platform: plan.platform,
        reviewLink: plan.link,
        messageText: plan.message,
        blockReasons: ["SEND_FAILED"],
        reasons: eligibility.reasons,
        eligibility,
        error,
        actionLogId: created?.id,
      };
    }
  }

  /**
   * Read-only metrics for review requests (sent / failed / skipped counts,
   * platforms used, lastReviewRequestAt). Tenant-scoped.
   */
  static async getMetrics(restaurantId: string): Promise<{
    sent: number;
    failed: number;
    skipped: number;
    byPlatform: { platform: string; count: number }[];
    lastReviewRequestAt: string | null;
  }> {
    const rows = await prisma.cRMActionLog.findMany({
      where: {
        restaurantId,
        actionType: {
          in: [REVIEW_ACTION_TYPE_SENT, REVIEW_ACTION_TYPE_FAILED, REVIEW_ACTION_TYPE_SKIPPED],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { actionType: true, metadata: true, createdAt: true },
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let lastReviewRequestAt: string | null = null;
    const platformCounts: Record<string, number> = {};

    for (const r of rows) {
      if (r.actionType === REVIEW_ACTION_TYPE_SENT) {
        sent++;
        if (!lastReviewRequestAt) lastReviewRequestAt = r.createdAt.toISOString();
        const meta = r.metadata as { platform?: string } | null;
        const p = meta?.platform;
        if (p) platformCounts[p] = (platformCounts[p] ?? 0) + 1;
      } else if (r.actionType === REVIEW_ACTION_TYPE_FAILED) {
        failed++;
      } else {
        skipped++;
      }
    }

    return {
      sent,
      failed,
      skipped,
      byPlatform: Object.entries(platformCounts).map(([platform, count]) => ({ platform, count })),
      lastReviewRequestAt,
    };
  }
}

// ── helper: find or create the customer's WhatsApp conversation ────────────────
// Mirrors CrmCampaignService's helper but WITHOUT campaign tagging — a review
// request is a direct action, not a campaign.
async function findOrCreateReviewConversation(
  restaurantId: string,
  customerId: string,
  phone: string,
  name: string,
): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      channel: "WHATSAPP",
      status: { in: [ConversationStatus.OPEN, ConversationStatus.BOT, ConversationStatus.HUMAN] },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const conv = await prisma.conversation.create({
    data: {
      restaurantId,
      customerId,
      channel:      "WHATSAPP",
      status:       ConversationStatus.OPEN,
      customerPhone: phone,
      customerName:  name,
      contextType:  "CRM_REVIEW",
    },
    select: { id: true },
  });
  return conv.id;
}
