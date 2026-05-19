/**
 * CRMAttributionService
 *
 * Closes the revenue attribution loop: CRM send → customer reply → order placed.
 *
 * When an order becomes CRM-countable (confirmed/paid), this service searches
 * for a recent CRM interaction for the same customer within a 7-day window.
 * If found, it marks the CRMActionLog as converted with the order's revenue.
 *
 * Attribution priority (highest to lowest):
 *   1. CRMActionLog where responded=true AND converted=false (AI sent + customer replied)
 *   2. CRMActionLog where converted=false (AI sent, no reply required)
 *   3. CampaignExecution where status=READ (bulk campaign, customer opened/replied)
 *   4. CampaignExecution where status=SENT (bulk campaign send, no reply detected)
 *
 * For CampaignExecution matches: CampaignExecution has no converted/revenue fields,
 * so attribution is logged only. No schema change is forced.
 *
 * Idempotency:
 *   - CRMActionLog is fetched with converted=false guard — already-converted records
 *     are never double-attributed.
 *   - Called from CustomerMetricsSyncService which has its own crmSyncedAt guard,
 *     so attribution runs at most once per order in normal flow.
 *
 * Safety:
 *   - Never throws; always returns a result.
 *   - Never modifies Order, Payment, or Customer records.
 *   - Respects CANCELLED + guest + no-customerId guards.
 */

import { prisma } from "@/lib/prisma";
import { isCrmCountable } from "@/services/crm/crm-countable";
import { Decimal } from "@prisma/client/runtime/library";

const ATTRIBUTION_WINDOW_DAYS = 7;

export type AttributionResult =
  | { result: "attributed";                    orderId: string; customerId: string; actionLogId: string; revenue: number; source: "action_log_responded" | "action_log_any" }
  | { result: "attributed_campaign_log_only";  orderId: string; customerId: string; campaignExecutionId: string; campaignId: string; revenue: number }
  | { result: "skipped_no_customer";           orderId: string }
  | { result: "skipped_cancelled";             orderId: string }
  | { result: "skipped_not_countable";         orderId: string }
  | { result: "skipped_no_recent_crm_context"; orderId: string; customerId: string }
  | { result: "skipped_already_attributed";    orderId: string; customerId: string }
  | { result: "failed";                        orderId: string; error: string };

export class CRMAttributionService {
  /**
   * Attribute a recently-countable order to the best recent CRM interaction.
   * Safe to call multiple times — idempotent via converted=false guard.
   */
  static async attributeOrderToRecentCrmAction(orderId: string): Promise<AttributionResult> {
    try {
      // Load order with minimal fields
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id:          true,
          customerId:  true,
          restaurantId:true,
          status:      true,
          total:       true,
          createdAt:   true,
          payment: { select: { paymentMode: true, status: true } },
          customer: { select: { isGuest: true } },
        },
      });

      if (!order) {
        return { result: "skipped_not_countable", orderId };
      }

      if (!order.customerId) {
        return { result: "skipped_no_customer", orderId };
      }

      if (order.status === "CANCELLED") {
        return { result: "skipped_cancelled", orderId };
      }

      if (!isCrmCountable(order)) {
        return { result: "skipped_not_countable", orderId };
      }

      if (order.customer?.isGuest) {
        return { result: "skipped_no_customer", orderId };
      }

      const { customerId, restaurantId } = order;
      const revenue = Number(order.total);
      const windowStart = new Date(order.createdAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 86_400_000);

      // ── Priority 1 & 2: CRMActionLog ────────────────────────────────────────
      // Try responded=true first, then any unconverted log.
      // Using findFirst with ORDER BY createdAt DESC to pick the most recent match.

      const respondedLog = await prisma.cRMActionLog.findFirst({
        where: {
          restaurantId,
          customerId,
          responded: true,
          converted: false,
          createdAt: { gte: windowStart, lte: order.createdAt },
        },
        orderBy: { createdAt: "desc" },
        select:  { id: true },
      });

      const targetLog = respondedLog ?? await prisma.cRMActionLog.findFirst({
        where: {
          restaurantId,
          customerId,
          converted: false,
          createdAt: { gte: windowStart, lte: order.createdAt },
        },
        orderBy: { createdAt: "desc" },
        select:  { id: true },
      });

      if (targetLog) {
        await prisma.cRMActionLog.update({
          where: { id: targetLog.id },
          data: {
            converted:   true,
            convertedAt: new Date(),
            revenue:     new Decimal(revenue),
          },
        });

        console.info(
          `[CRMAttribution] attributed order ${orderId} → actionLog ${targetLog.id}` +
          ` customer:${customerId} revenue:R$${revenue.toFixed(2)}` +
          ` source:${respondedLog ? "action_log_responded" : "action_log_any"}`
        );

        return {
          result:      respondedLog ? "attributed" : "attributed",
          orderId,
          customerId,
          actionLogId: targetLog.id,
          revenue,
          source:      respondedLog ? "action_log_responded" : "action_log_any",
        };
      }

      // ── Priority 3 & 4: CampaignExecution (no schema fields to update) ───────
      // Find the most recent CRM send for this customer within the window.
      // Prefer READ status (customer replied) over SENT.

      const readExec = await prisma.campaignExecution.findFirst({
        where: {
          restaurantId,
          customerId,
          status:  "READ",
          sentAt:  { gte: windowStart, lte: order.createdAt },
        },
        orderBy: { sentAt: "desc" },
        select:  { id: true, campaignId: true },
      });

      const targetExec = readExec ?? await prisma.campaignExecution.findFirst({
        where: {
          restaurantId,
          customerId,
          status:  { in: ["SENT", "DELIVERED"] },
          sentAt:  { gte: windowStart, lte: order.createdAt },
        },
        orderBy: { sentAt: "desc" },
        select:  { id: true, campaignId: true },
      });

      if (targetExec) {
        // CampaignExecution has no converted/revenue fields — log attribution only.
        // Campaign totalConverted/totalRevenue don't exist — no aggregate update.
        console.info(
          `[CRMAttribution] campaign attribution (log-only) order:${orderId}` +
          ` execution:${targetExec.id} campaign:${targetExec.campaignId}` +
          ` customer:${customerId} revenue:R$${revenue.toFixed(2)}`
        );

        return {
          result:               "attributed_campaign_log_only",
          orderId,
          customerId,
          campaignExecutionId:  targetExec.id,
          campaignId:           targetExec.campaignId,
          revenue,
        };
      }

      // ── No CRM context found ─────────────────────────────────────────────────
      console.info(
        `[CRMAttribution] no recent CRM context for order:${orderId} customer:${customerId}`
      );
      return { result: "skipped_no_recent_crm_context", orderId, customerId };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[CRMAttribution] failed for order:${orderId}`, err);
      return { result: "failed", orderId, error };
    }
  }
}
