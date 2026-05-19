/**
 * CRMAttributionService
 *
 * Closes the revenue attribution loop: CRM send → customer reply → order placed.
 *
 * When an order becomes CRM-countable (confirmed/paid), this service searches
 * for a recent CRM interaction for the same customer within a 7-day window and
 * persists conversion attribution to both the matched record AND campaign aggregates.
 *
 * Attribution priority (highest to lowest):
 *   1. CRMActionLog where responded=true AND converted=false (AI sent + customer replied)
 *   2. CRMActionLog where converted=false  (AI sent, no reply required)
 *   3. CampaignExecution where status=READ AND converted=false (bulk campaign, customer replied)
 *   4. CampaignExecution where status IN [SENT,DELIVERED] AND converted=false (bulk campaign send)
 *
 * Idempotency:
 *   - Every query filters converted=false → already-attributed records are never re-matched.
 *   - Called from CustomerMetricsSyncService which has its own crmSyncedAt guard,
 *     so attribution runs at most once per order in the normal hot path.
 *
 * Money convention: Decimal(10,2) for per-record revenue, Decimal(12,2) for campaign aggregate.
 * Matches existing CRMActionLog.revenue and Campaign.totalRevenue schema types.
 */

import { prisma } from "@/lib/prisma";
import { isCrmCountable } from "@/services/crm/crm-countable";
import { Decimal } from "@prisma/client/runtime/library";

const ATTRIBUTION_WINDOW_DAYS = 7;

// ── Result type ───────────────────────────────────────────────────────────────

export type AttributionResult =
  | {
      result:      "attributed_action_log";
      orderId:     string;
      customerId:  string;
      actionLogId: string;
      revenue:     number;
      source:      "responded" | "any";
    }
  | {
      result:             "attributed_campaign";
      orderId:            string;
      customerId:         string;
      campaignExecutionId: string;
      campaignId:         string;
      revenue:            number;
    }
  | { result: "skipped_no_customer";           orderId: string }
  | { result: "skipped_cancelled";             orderId: string }
  | { result: "skipped_not_countable";         orderId: string }
  | { result: "skipped_no_recent_crm_context"; orderId: string; customerId: string }
  | { result: "failed";                        orderId: string; error: string };

// ── Service ───────────────────────────────────────────────────────────────────

export class CRMAttributionService {
  /**
   * Attribute a recently-countable order to the best recent CRM interaction.
   * Fully persistent — updates CRMActionLog or CampaignExecution + Campaign counters.
   * Safe to call multiple times — converted=false guards prevent double-attribution.
   */
  static async attributeOrderToRecentCrmAction(orderId: string): Promise<AttributionResult> {
    try {
      // ── Load & validate order ──────────────────────────────────────────────

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id:           true,
          customerId:   true,
          restaurantId: true,
          status:       true,
          total:        true,
          createdAt:    true,
          payment:  { select: { paymentMode: true, status: true } },
          customer: { select: { isGuest: true } },
        },
      });

      if (!order)               return { result: "skipped_not_countable", orderId };
      if (!order.customerId)    return { result: "skipped_no_customer",   orderId };
      if (order.status === "CANCELLED") return { result: "skipped_cancelled", orderId };
      if (!isCrmCountable(order))       return { result: "skipped_not_countable", orderId };
      if (order.customer?.isGuest)      return { result: "skipped_no_customer",   orderId };

      const { customerId, restaurantId } = order;
      const revenue     = Number(order.total);
      const revDecimal  = new Decimal(revenue);
      const windowStart = new Date(order.createdAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 86_400_000);
      const now         = new Date();

      // ── Priority 1 & 2: CRMActionLog ──────────────────────────────────────

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
            convertedAt: now,
            revenue:     revDecimal,
            orderId,
          },
        });

        const source = respondedLog ? "responded" : "any";
        console.info(
          `[CRMAttribution] action_log order:${orderId} log:${targetLog.id}` +
          ` customer:${customerId} R$${revenue.toFixed(2)} source:${source}`
        );

        return { result: "attributed_action_log", orderId, customerId, actionLogId: targetLog.id, revenue, source };
      }

      // ── Priority 3 & 4: CampaignExecution ─────────────────────────────────

      const readExec = await prisma.campaignExecution.findFirst({
        where: {
          restaurantId,
          customerId,
          status:    "READ",
          converted: false,
          sentAt:    { gte: windowStart, lte: order.createdAt },
        },
        orderBy: { sentAt: "desc" },
        select:  { id: true, campaignId: true },
      });

      const targetExec = readExec ?? await prisma.campaignExecution.findFirst({
        where: {
          restaurantId,
          customerId,
          status:    { in: ["SENT", "DELIVERED"] },
          converted: false,
          sentAt:    { gte: windowStart, lte: order.createdAt },
        },
        orderBy: { sentAt: "desc" },
        select:  { id: true, campaignId: true },
      });

      if (targetExec) {
        // Persist to CampaignExecution and bump Campaign aggregate counters atomically
        await prisma.$transaction([
          prisma.campaignExecution.update({
            where: { id: targetExec.id },
            data: {
              converted:        true,
              convertedAt:      now,
              revenue:          revDecimal,
              convertedOrderId: orderId,
            },
          }),
          prisma.campaign.update({
            where: { id: targetExec.campaignId },
            data: {
              totalConverted: { increment: 1 },
              totalRevenue:   { increment: revDecimal },
            },
          }),
        ]);

        console.info(
          `[CRMAttribution] campaign order:${orderId} exec:${targetExec.id}` +
          ` campaign:${targetExec.campaignId} customer:${customerId} R$${revenue.toFixed(2)}`
        );

        return {
          result:             "attributed_campaign",
          orderId,
          customerId,
          campaignExecutionId: targetExec.id,
          campaignId:          targetExec.campaignId,
          revenue,
        };
      }

      // ── No CRM context ────────────────────────────────────────────────────

      console.info(`[CRMAttribution] no_context order:${orderId} customer:${customerId}`);
      return { result: "skipped_no_recent_crm_context", orderId, customerId };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[CRMAttribution] failed order:${orderId}`, err);
      return { result: "failed", orderId, error };
    }
  }
}
