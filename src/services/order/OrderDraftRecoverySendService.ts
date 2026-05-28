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
 *   "Oi, {firstName}! Seu pedido ficou quase pronto por aqui 😊
 *    Quer que eu te ajude a finalizar?
 *
 *    👉 {pedidoUrl}"
 *
 * Recommended cron schedule: every 1 minute.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { signWaToken } from "@/lib/wa-token";
import { isGuestIdentifier } from "@/lib/guest";
import { getPublicMenuUrl } from "@/lib/public-url";

export interface RecoverySendResult {
  checked:               number;
  eligible:              number;
  sent:                  number;
  skippedNoPhone:        number;
  skippedAlreadySent:    number;
  skippedDailyLimit:     number;
  skippedOrderedAfter:   number;
  skippedPendingPayment: number;
  failed:                number;
  dryRun:                boolean;
  inactivityMinutes:     number;
  durationMs:            number;
}

function buildIdentifiedPedidoUrl(slug: string, phone: string, name: string | null): string {
  const base = getPublicMenuUrl(slug);
  try {
    const token = signWaToken({
      phone,
      ...(name ? { name: name.trim().split(/\s+/)[0] } : {}),
    });
    const url = new URL(base);
    url.searchParams.set("waToken", token);
    url.searchParams.set("src", "recovery");
    return url.toString();
  } catch {
    const url = new URL(base);
    url.searchParams.set("src", "recovery");
    return url.toString();
  }
}

function buildRecoveryMessage(name: string | null, pedidoUrl: string): string {
  const firstName = name?.trim().split(/\s+/)[0] ?? "você";
  return (
    `Oi, ${firstName}! Seu pedido ficou quase pronto por aqui 😊\n` +
    `Quer que eu te ajude a finalizar?\n\n` +
    `👉 ${pedidoUrl}`
  );
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
        skippedOrderedAfter: 0, skippedPendingPayment: 0, failed: 0,
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
    let eligible              = 0;
    let sent                  = 0;
    let skippedNoPhone        = 0;
    let skippedAlreadySent    = 0;
    let skippedDailyLimit     = 0;
    let skippedOrderedAfter   = 0;
    let skippedPendingPayment = 0;
    let failed                = 0;

    for (const draft of candidates) {
      const customer = draft.customer;
      const key      = `${draft.restaurantId}:${draft.customerId}`;

      // Rule 4: real phone required (no guest identifiers)
      if (!customer.phone || isGuestIdentifier(customer.phone)) {
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

      eligible++;

      if (dryRun) {
        sent++;
        continue;
      }

      // ── Send ──────────────────────────────────────────────────────────────
      try {
        const configResult = await EvolutionConfigService.getSnapshot(draft.restaurantId);
        if (!configResult.ok) {
          console.warn(
            `[OrderDraftRecoverySendService] no evolution config for restaurant=${draft.restaurantId}, skipping draft=${draft.id}`,
          );
          failed++;
          continue;
        }
        const config    = configResult.data;
        const pedidoUrl = buildIdentifiedPedidoUrl(draft.restaurant.slug, customer.phone, customer.name);
        const message   = buildRecoveryMessage(customer.name, pedidoUrl);

        await EvolutionClient.sendTextMessage(config, customer.phone, message);

        // Atomic: stamp draft so it never fires again; add to daily-limit set
        await prisma.orderDraft.update({
          where: { id: draft.id },
          data: {
            recoveryAttempts: { increment: 1 },
            lastRecoveryAt:   new Date(),
          },
        });

        dailyLimitSet.add(draft.customerId); // guard remaining iterations
        sent++;
      } catch (err) {
        console.error(
          `[OrderDraftRecoverySendService] send failed draft=${draft.id}`,
          err,
        );
        failed++;
      }
    }

    return {
      checked:               candidates.length,
      eligible,
      sent,
      skippedNoPhone,
      skippedAlreadySent,
      skippedDailyLimit,
      skippedOrderedAfter,
      skippedPendingPayment,
      failed,
      dryRun,
      inactivityMinutes,
      durationMs: Date.now() - startMs,
    };
  }
}
