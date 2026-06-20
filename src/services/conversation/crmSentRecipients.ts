/**
 * Canonical "has CRM sent" recipient lookup for the Atendimento "CRM enviado" tab.
 *
 * A conversation belongs in "CRM enviado" if its customer received ANY CRM
 * outbound message. The authoritative record is the union of two send logs that
 * every CRM flow already writes to:
 *
 *   - CampaignExecution  → CRM campaigns, recurring campaigns, automations, birthday
 *     (status SENT/DELIVERED/READ = a real send).
 *   - CRMActionLog       → review requests + adaptive CRM (post-order, reactivation,
 *     win-back, VIP appreciation, premium/coupon/promo offer, loyalty, reminder,
 *     manual, …).
 *
 * Using these logs (not the single mutable `Conversation.contextType`) is what makes
 * the filter complete: review/adaptive/manual sends that reused an existing
 * conversation never reliably set contextType, so they were invisible before.
 *
 * Read-only. Bounded by a generous lookback to keep the customerId set reasonable.
 */

import { prisma } from "@/lib/prisma";

export const CRM_SENT_LOOKBACK_DAYS = 365;

export async function getCrmSentCustomerIds(restaurantId: string): Promise<string[]> {
  const since = new Date(Date.now() - CRM_SENT_LOOKBACK_DAYS * 86_400_000);

  try {
    const [execs, actions] = await Promise.all([
      prisma.campaignExecution.findMany({
        where: {
          campaign:  { restaurantId },
          status:    { in: ["SENT", "DELIVERED", "READ"] },
          createdAt: { gte: since },
        },
        select:   { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.cRMActionLog.findMany({
        where: {
          restaurantId,
          customerId: { not: null },
          createdAt:  { gte: since },
        },
        select:   { customerId: true },
        distinct: ["customerId"],
      }),
    ]);

    const ids = new Set<string>();
    for (const e of execs)   if (e.customerId) ids.add(e.customerId);
    for (const a of actions) if (a.customerId) ids.add(a.customerId);
    return [...ids];
  } catch (err) {
    console.error("[getCrmSentCustomerIds] failed", { restaurantId, err });
    return [];
  }
}
