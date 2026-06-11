/**
 * OrderDraftAbandonmentService
 *
 * Detects stale OPEN OrderDrafts and marks them ABANDONED so Phase 3 can
 * send recovery messages to eligible customers.
 *
 * Eligibility rules — ALL must be true to mark a draft ABANDONED:
 *   1. status = OPEN
 *   2. updatedAt < NOW − thresholdMinutes  (inactive long enough)
 *   3. draft has at least one item
 *   4. customer has NOT placed a non-cancelled Order after draft.updatedAt
 *      (finalized order means the cart was already converted — not abandoned)
 *   5. customer has NO AWAITING_PAYMENT order for the same restaurant
 *      (customer is still in the payment flow — do not interrupt)
 *
 * Idempotent: already-ABANDONED and already-CONFIRMED drafts are never
 * touched. Running the job twice in the same window has no extra effect.
 *
 * Phase 3 (future): query ABANDONED drafts where abandonedAt > now − 24h
 * and send a single recovery WhatsApp message per eligible customer.
 */

import { prisma } from "@/lib/prisma";

export interface AbandonmentResult {
  checked:               number;
  markedAbandoned:       number;
  skippedConfirmedOrder: number;
  skippedPendingPayment: number;
  skippedNoItems:        number; // guard (should be 0 — query filters them out)
  thresholdMinutes:      number;
  dryRun:                boolean;
  durationMs:            number;
}

export class OrderDraftAbandonmentService {
  /**
   * Marks stale OPEN drafts as ABANDONED.
   *
   * @param thresholdMinutes - drafts inactive for this long become candidates
   * @param dryRun           - if true, counts are computed but DB is not mutated
   */
  static async markAbandonedDrafts({
    thresholdMinutes = 60,
    dryRun = false,
  }: {
    thresholdMinutes?: number;
    dryRun?: boolean;
  } = {}): Promise<AbandonmentResult> {
    const startMs      = Date.now();
    const thresholdDate = new Date(Date.now() - thresholdMinutes * 60_000);

    // ── Step 1: fetch all candidate drafts ──────────────────────────────────
    // Candidate = OPEN + stale + has at least one item.
    const candidates = await prisma.orderDraft.findMany({
      where: {
        status:    "OPEN",
        updatedAt: { lt: thresholdDate },
        items:     { some: {} },
      },
      select: {
        id:           true,
        restaurantId: true,
        customerId:   true,
        updatedAt:    true,
      },
      orderBy: { updatedAt: "asc" },
    });

    if (candidates.length === 0) {
      return {
        checked:               0,
        markedAbandoned:       0,
        skippedConfirmedOrder: 0,
        skippedPendingPayment: 0,
        skippedNoItems:        0,
        thresholdMinutes,
        dryRun,
        durationMs: Date.now() - startMs,
      };
    }

    // ── Step 2: pre-fetch customers with AWAITING_PAYMENT orders ────────────
    // One query for all candidates to avoid per-draft DB round trips for this
    // common check (customers still in Pix flow must never be interrupted).
    const uniqueCustomerIds  = [...new Set(candidates.map((d) => d.customerId))];
    const uniqueRestaurantIds = [...new Set(candidates.map((d) => d.restaurantId))];

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

    // ── Step 3: per-draft eligibility check + mark ───────────────────────────
    let markedAbandoned       = 0;
    let skippedConfirmedOrder = 0;
    let skippedPendingPayment = 0;
    let skippedNoItems        = 0;

    for (const draft of candidates) {
      const key = `${draft.restaurantId}:${draft.customerId}`;

      // Rule 5: Pix/payment pending — do not interrupt
      if (pendingSet.has(key)) {
        skippedPendingPayment++;
        continue;
      }

      // Rule 4: a real order was placed at or around the time of this draft session.
      // 30-min lookback guards against draft.updatedAt being bumped a few seconds
      // AFTER order creation (same fix as OrderDraftRecoverySendService Rule 7).
      const rule4Lookback = new Date(draft.updatedAt.getTime() - 30 * 60_000);
      const recentOrder = await prisma.order.findFirst({
        where: {
          restaurantId: draft.restaurantId,
          customerId:   draft.customerId,
          status:       { not: "CANCELLED" },
          createdAt:    { gte: rule4Lookback },
        },
        select: { id: true },
      });
      if (recentOrder) {
        skippedConfirmedOrder++;
        continue;
      }

      // Eligible — mark ABANDONED
      if (!dryRun) {
        await prisma.orderDraft.update({
          where: { id: draft.id },
          data:  { status: "ABANDONED", abandonedAt: new Date() },
        });
      }
      markedAbandoned++;
    }

    return {
      checked:               candidates.length,
      markedAbandoned,
      skippedConfirmedOrder,
      skippedPendingPayment,
      skippedNoItems,
      thresholdMinutes,
      dryRun,
      durationMs: Date.now() - startMs,
    };
  }
}
