/**
 * OrderDraftRecoverySendService
 *
 * Phase 3 of abandoned cart recovery: sends a single WhatsApp recovery
 * message to identified customers who have an OPEN draft that has been
 * inactive long enough to signal real abandonment intent.
 *
 * Designed for fast food-delivery cadence — default threshold is 2 minutes.
 * The goal is to catch customers who added items and then drifted away.
 *
 * Eligibility rules — ALL must be true:
 *   1.  status = OPEN
 *   2.  updatedAt < NOW − inactivityMinutes
 *   3.  draft has at least one item
 *   4.  customer has a real (non-guest) phone
 *   5.  recoveryAttempts = 0 on this draft (one recovery per draft, ever)
 *   6.  no other draft for this customer+restaurant already has lastRecoveryAt
 *       within the last 24 hours (one recovery per customer per day)
 *   7.  no non-cancelled Order after draft.updatedAt
 *   8.  no AWAITING_PAYMENT order for the same restaurant
 *
 * Idempotent: recoveryAttempts + lastRecoveryAt are written atomically after
 * a successful send; re-running within the same window sends nothing extra.
 *
 * Message template (Portuguese):
 *   "Oi, {firstName}! Percebi que seu pedido não foi finalizado 😊
 *
 *    Você precisa de alguma ajuda para concluir?
 *
 *    👉 Retomar pedido: {shortRecoveryUrl}"
 *
 * {shortRecoveryUrl} is a short HMAC-signed /r/{token} redirect that signs a
 * fresh waToken server-side and bounces to /pedido/[slug]?waToken=...&src=recovery.
 *
 * Recommended cron schedule: every 1 minute.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { signRecoveryToken } from "@/lib/recovery-token";
import { isGuestIdentifier } from "@/lib/guest";
import { getPublicSiteUrl } from "@/lib/public-url";
import { isRestaurantOpenNow } from "@/lib/business-hours";
import { ConversationStatus } from "@prisma/client";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

export interface RecoverySendResult {
  checked:                 number;
  eligible:                number;
  sent:                    number;
  skippedNoPhone:          number;
  skippedAlreadySent:      number;
  skippedDailyLimit:       number;
  skippedOrderedAfter:     number;
  skippedPendingPayment:   number;
  skippedNoConfig:         number; // restaurant has no Evolution/WhatsApp integration configured
  skippedRestaurantClosed: number; // restaurant is closed — recovery deferred, attempts NOT incremented
  failed:                  number; // Evolution API was called but returned an error
  dryRun:                  boolean;
  inactivityMinutes:       number;
  durationMs:              number;
}

function buildShortRecoveryUrl(
  draftId: string,
  customerId: string,
  restaurantId: string,
): string {
  const token = signRecoveryToken({ draftId, customerId, restaurantId });
  return `${getPublicSiteUrl()}/r/${token}`;
}

function buildRecoveryMessage(name: string | null, shortRecoveryUrl: string): string {
  const firstName = name?.trim().split(/\s+/)[0] ?? "você";
  return (
    `Oi, ${firstName}! Percebi que seu pedido não foi finalizado 😊\n\n` +
    `Você precisa de alguma ajuda para concluir?\n\n` +
    `👉 Retomar pedido: ${shortRecoveryUrl}`
  );
}

const ACTIVE_CONV_STATUSES = [
  ConversationStatus.OPEN,
  ConversationStatus.HUMAN,
  ConversationStatus.BOT,
  ConversationStatus.AI_ATENDENDO,
] as const;

/**
 * Finds (or creates) the WhatsApp conversation for a customer, logs the
 * recovery message as an outbound AI message, and sets contextType to
 * "CART_RECOVERY" so that the next inbound reply triggers human handoff.
 * This is fire-and-forget from the caller's perspective.
 */
async function logRecoveryToConversation(
  restaurantId: string,
  customerId:   string,
  customerPhone: string,
  customerName:  string | null,
  messageContent: string,
  draftId: string,
  sentAt: Date,
): Promise<void> {
  let conversation = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      status: { in: [...ACTIVE_CONV_STATUSES] },
      channel: "WHATSAPP",
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        restaurantId,
        customerId,
        channel:      "WHATSAPP",
        status:       ConversationStatus.OPEN,
        customerPhone,
        customerName:  customerName ?? undefined,
        contextType:  "CART_RECOVERY",
      },
      select: { id: true },
    });
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction:      "OUTBOUND",
        senderType:     "AI",
        content:        messageContent,
        type:           "TEXT",
        sentAt,
        metadata:       { source: "CART_RECOVERY", draftId },
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data:  { lastMessageAt: sentAt, contextType: "CART_RECOVERY" },
    }),
  ]);
}

export class OrderDraftRecoverySendService {
  static async sendCartRecoveryMessages({
    inactivityMinutes = 2,
    limit             = 50,
    dryRun            = false,
  }: {
    inactivityMinutes?: number;
    limit?:             number;
    dryRun?:            boolean;
  } = {}): Promise<RecoverySendResult> {
    const startMs        = Date.now();
    const thresholdDate  = new Date(Date.now() - inactivityMinutes * 60_000);
    const oneDayAgo      = new Date(Date.now() - 24 * 60 * 60_000);

    // ── Step 1: fetch candidate drafts ──────────────────────────────────────
    // OPEN + stale + has items + no recovery already sent on this exact draft
    const candidates = await prisma.orderDraft.findMany({
      where: {
        status:           "OPEN",
        updatedAt:        { lt: thresholdDate },
        recoveryAttempts: 0,
        items:            { some: {} },
      },
      select: {
        id:           true,
        restaurantId: true,
        customerId:   true,
        updatedAt:    true,
        customer: {
          select: {
            id:    true,
            name:  true,
            phone: true,
          },
        },
        restaurant: {
          select: {
            slug: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      take:    limit,
    });

    if (candidates.length === 0) {
      return {
        checked: 0, eligible: 0, sent: 0,
        skippedNoPhone: 0, skippedAlreadySent: 0, skippedDailyLimit: 0,
        skippedOrderedAfter: 0, skippedPendingPayment: 0, skippedNoConfig: 0,
        skippedRestaurantClosed: 0, failed: 0,
        dryRun, inactivityMinutes,
        durationMs: Date.now() - startMs,
      };
    }

    // ── Step 2: batch-fetch customers who already got a recovery in last 24h ─
    // Check via drafts that have lastRecoveryAt set recently — avoids adding
    // a field to the Customer model.
    const uniqueCustomerIds   = [...new Set(candidates.map((d) => d.customerId))];
    const uniqueRestaurantIds = [...new Set(candidates.map((d) => d.restaurantId))];

    const recentlyRecoveredDrafts = await prisma.orderDraft.findMany({
      where: {
        customerId:    { in: uniqueCustomerIds },
        lastRecoveryAt: { gt: oneDayAgo },
      },
      select: { customerId: true, restaurantId: true },
    });
    // Key: customerId — daily limit is global across restaurants
    const dailyLimitSet = new Set(recentlyRecoveredDrafts.map((d) => d.customerId));

    // ── Step 3: batch-fetch AWAITING_PAYMENT orders ─────────────────────────
    const pendingPaymentOrders = await prisma.order.findMany({
      where: {
        status:       "AWAITING_PAYMENT",
        customerId:   { in: uniqueCustomerIds },
        restaurantId: { in: uniqueRestaurantIds },
      },
      select: { customerId: true, restaurantId: true },
    });
    const pendingSet = new Set(
      pendingPaymentOrders.map((o) => `${o.restaurantId}:${o.customerId}`),
    );

    // ── Step 4: per-draft eligibility + send ────────────────────────────────
    let eligible                = 0;
    let sent                    = 0;
    let skippedNoPhone          = 0;
    let skippedAlreadySent      = 0;
    let skippedDailyLimit       = 0;
    let skippedOrderedAfter     = 0;
    let skippedPendingPayment   = 0;
    let skippedNoConfig         = 0;
    let skippedRestaurantClosed = 0;
    let failed                  = 0;

    // Cache open/closed status per restaurant for this tick — avoids N DB round-trips
    // when multiple drafts belong to the same restaurant.
    const restaurantOpenCache = new Map<string, boolean>();
    const isOpen = async (restaurantId: string): Promise<boolean> => {
      if (restaurantOpenCache.has(restaurantId)) return restaurantOpenCache.get(restaurantId)!;
      const open = await isRestaurantOpenNow(restaurantId);
      restaurantOpenCache.set(restaurantId, open);
      return open;
    };

    for (const draft of candidates) {
      const customer = draft.customer;
      const key      = `${draft.restaurantId}:${draft.customerId}`;

      // Rule 4: real phone required (no guest identifiers)
      if (!customer.phone || isGuestIdentifier(customer.phone)) {
        skippedNoPhone++;
        continue;
      }
      // Normalize phone for Evolution: digits only, no leading "+", no spaces/dashes.
      // E.164 phones from /pedido are stored as "+5511999990000"; webhook phones as "+5511999990000".
      // Full digit-strip matches the proven pattern in OrderNotificationService.
      const toPhone = customer.phone.replace(/\D/g, "");
      if (!toPhone.match(/^\d{10,15}$/)) {
        skippedNoPhone++;
        continue;
      }

      // Rule 5: defensive check — DB query already filters recoveryAttempts=0
      // but handle edge case of concurrent cron runs
      if (dailyLimitSet.has(draft.customerId)) {
        skippedDailyLimit++;
        continue;
      }

      // Rule 8: Pix/payment pending — do not interrupt
      if (pendingSet.has(key)) {
        skippedPendingPayment++;
        continue;
      }

      // Rule 7: non-cancelled order placed after draft was last touched
      const recentOrder = await prisma.order.findFirst({
        where: {
          restaurantId: draft.restaurantId,
          customerId:   draft.customerId,
          status:       { not: "CANCELLED" },
          createdAt:    { gt: draft.updatedAt },
        },
        select: { id: true },
      });
      if (recentOrder) {
        skippedOrderedAfter++;
        continue;
      }

      // Business hours gate — do NOT increment recoveryAttempts when closed.
      // Recovery is deferred until the next tick when the restaurant reopens.
      // Returns true (open) when no BusinessHours row is configured.
      if (!(await isOpen(draft.restaurantId))) {
        skippedRestaurantClosed++;
        continue;
      }

      eligible++;

      if (dryRun) {
        sent++;
        continue;
      }

      // ── Send ──────────────────────────────────────────────────────────────
      try {
        const configResult = await EvolutionConfigService.getSnapshot(draft.restaurantId);
        if (!configResult.ok) {
          console.info(`[OrderDraftRecoverySendService] skipped no evolution config`, {
            draftId:      draft.id,
            restaurantId: draft.restaurantId,
            slug:         draft.restaurant.slug,
          });
          skippedNoConfig++;
          continue;
        }
        const config           = configResult.data;
        const shortRecoveryUrl = buildShortRecoveryUrl(draft.id, draft.customerId, draft.restaurantId);
        const message          = buildRecoveryMessage(customer.name, shortRecoveryUrl);

        console.info(`[OrderDraftRecoverySendService] sending recovery`, {
          draftId:      draft.id,
          customerId:   customer.id,
          restaurantId: draft.restaurantId,
          phoneMasked:  maskPhone(customer.phone),
          instanceName: config.instanceName,
        });

        await EvolutionClient.sendTextMessage(config, toPhone, message);

        // Atomic: stamp draft so it never fires again
        const now = new Date();
        await prisma.orderDraft.update({
          where: { id: draft.id },
          data: {
            recoveryAttempts: { increment: 1 },
            lastRecoveryAt:   now,
          },
        });

        dailyLimitSet.add(draft.customerId); // guard remaining iterations

        // Log outbound message to conversation so Atendimento shows it and
        // so that a customer reply triggers human handoff (contextType guard).
        logRecoveryToConversation(
          draft.restaurantId,
          draft.customerId,
          customer.phone,
          customer.name,
          message,
          draft.id,
          now,
        ).catch((err) =>
          console.warn(`[OrderDraftRecoverySendService] conversation log failed`, {
            draftId: draft.id,
            error:   err instanceof Error ? err.message : String(err),
          }),
        );

        console.info(`[OrderDraftRecoverySendService] recovery sent`, {
          draftId:      draft.id,
          customerId:   customer.id,
          restaurantId: draft.restaurantId,
        });
        sent++;
      } catch (err) {
        const isApiErr = err instanceof EvolutionApiError;
        console.error(`[OrderDraftRecoverySendService] send failed`, {
          draftId:      draft.id,
          restaurantId: draft.restaurantId,
          phoneMasked:  maskPhone(customer.phone),
          errorMessage: err instanceof Error ? err.message : String(err),
          ...(isApiErr
            ? { statusCode: (err as EvolutionApiError).status, responseBody: (err as EvolutionApiError).body }
            : {}),
        });
        failed++;
      }
    }

    return {
      checked:                 candidates.length,
      eligible,
      sent,
      skippedNoPhone,
      skippedAlreadySent,
      skippedDailyLimit,
      skippedOrderedAfter,
      skippedPendingPayment,
      skippedNoConfig,
      skippedRestaurantClosed,
      failed,
      dryRun,
      inactivityMinutes,
      durationMs: Date.now() - startMs,
    };
  }
}
