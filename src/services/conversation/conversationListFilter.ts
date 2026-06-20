/**
 * conversationListFilter — pure where-clause builder for the Atendimento
 * conversation list (GET /api/chat/conversations).
 *
 * Extracted as a pure function so the filter logic — especially the
 * channel-independent "CRM enviado" filter — is unit-testable without a DB.
 *
 * "CRM enviado" source of truth:
 *   A conversation belongs to "CRM enviado" if EITHER
 *     (a) it is tagged with a CRM contextType (CRM_CAMPAIGN | CRM_AUTOMATION |
 *         CRM_REVIEW | CART_RECOVERY — set by the campaign/automation/review/cart
 *         recovery send paths), OR
 *     (b) its customer has at least one CRM send LOG row — a CampaignExecution
 *         (campaign/automation/birthday) or a CRMActionLog (review, post-order,
 *         reactivation, win-back, VIP, loyalty, coupon/promo, manual, …).
 *
 *   contextType alone is NOT enough: it is a single mutable field (only ever set
 *   to CAMPAIGN/AUTOMATION/REVIEW/CART_RECOVERY, and REVIEW only when previously
 *   null), so review/adaptive/manual sends that reused a conversation went
 *   invisible. The log-backed customerId match (passed in by the route) makes the
 *   filter canonical and channel-independent.
 */

import { Channel, ConversationStatus, Prisma } from "@prisma/client";

/** Conversation.contextType values that mark a CRM-origin outbound conversation. */
export const CRM_CONTEXT_TYPES = [
  "CRM_CAMPAIGN",
  "CRM_AUTOMATION",
  "CRM_REVIEW",    // review-request sends (ReviewRequestSendService)
  "CART_RECOVERY", // abandoned-cart recovery (OrderDraftRecoverySendService)
] as const;

export interface ConversationListFilters {
  status?:  string | null;
  channel?: string | null;
  search?:  string | null;
  /** Any truthy value restricts results to CRM-origin conversations. */
  crm?:     string | null;
}

export function buildConversationWhere(
  restaurantId: string,
  filters:      ConversationListFilters,
  /** Customers with ≥1 CRM send log (CampaignExecution/CRMActionLog), from the route. */
  crmRecipientCustomerIds?: string[],
): Prisma.ConversationWhereInput {
  const { status, channel, search, crm } = filters;

  // Composable sub-filters live in AND so multiple OR groups never clash.
  const and: Prisma.ConversationWhereInput[] = [];

  if (crm) {
    const crmOr: Prisma.ConversationWhereInput[] = [
      { contextType: { in: [...CRM_CONTEXT_TYPES] } },
    ];
    if (crmRecipientCustomerIds && crmRecipientCustomerIds.length > 0) {
      crmOr.push({ customerId: { in: crmRecipientCustomerIds } });
    }
    and.push({ OR: crmOr });
  }

  if (search) {
    and.push({
      OR: [
        { customerName:  { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search } },
        { customer: { OR: [
          { name:  { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ]}},
      ],
    });
  }

  const where: Prisma.ConversationWhereInput = {
    restaurantId,
    ...(status && Object.values(ConversationStatus).includes(status as ConversationStatus)
      ? { status: status as ConversationStatus }
      : {}),
    ...(channel && Object.values(Channel).includes(channel as Channel)
      ? { channel: channel as Channel }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };

  return where;
}
