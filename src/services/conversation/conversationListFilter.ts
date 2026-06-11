/**
 * conversationListFilter — pure where-clause builder for the Atendimento
 * conversation list (GET /api/chat/conversations).
 *
 * Extracted as a pure function so the filter logic — especially the
 * channel-independent "CRM enviado" filter — is unit-testable without a DB.
 *
 * CRM filter rationale:
 *   CRM campaign/automation sends tag their Conversation with
 *   contextType = CRM_CAMPAIGN | CRM_AUTOMATION (see CrmCampaignService,
 *   AutomationSchedulerService). The "CRM enviado" filter must therefore match
 *   on contextType, NOT on channel — a CRM send may reuse any existing
 *   conversation channel, and requiring channel=WHATSAPP made the filter
 *   return empty once the channel selector was removed from the UI.
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
): Prisma.ConversationWhereInput {
  const { status, channel, search, crm } = filters;

  const where: Prisma.ConversationWhereInput = {
    restaurantId,
    ...(status && Object.values(ConversationStatus).includes(status as ConversationStatus)
      ? { status: status as ConversationStatus }
      : {}),
    ...(channel && Object.values(Channel).includes(channel as Channel)
      ? { channel: channel as Channel }
      : {}),
    // CRM filter — channel-independent. Matches conversations tagged by a CRM
    // campaign/automation send. This is what makes "CRM enviado" work without
    // also selecting WhatsApp.
    ...(crm ? { contextType: { in: [...CRM_CONTEXT_TYPES] } } : {}),
    ...(search ? {
      OR: [
        { customerName:  { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search } },
        { customer: { OR: [
          { name:  { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ]}},
      ],
    } : {}),
  };

  return where;
}
