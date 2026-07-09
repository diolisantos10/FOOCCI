/**
 * GET /api/chat/conversations
 *
 * Paginated list of all conversations for the current restaurant.
 * Supports filtering by status, channel, and search.
 *
 * Query params:
 *   status   – AI_ATENDENDO | HUMANO_ASSUMIU | OPEN | BOT | HUMAN | RESOLVED
 *   channel  – WEB_AGENT | QR_AGENT | WHATSAPP | etc.
 *   search   – partial match on customerName or customerPhone
 *   page     – 1-based page number (default 1)
 *   limit    – items per page (default 30, max 100)
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ConversationStatus, Prisma } from "@prisma/client";
import { buildConversationWhere, CRM_CONTEXT_TYPES } from "@/services/conversation/conversationListFilter";
import { getCrmSentCustomerIds } from "@/services/conversation/crmSentRecipients";

const CRM_CONTEXT_SET = new Set<string>(CRM_CONTEXT_TYPES);

// ── Dedup rank: lower = higher priority when multiple conversations share a customer ──
//
// Rules (from product spec):
//   0 – has at least one INBOUND (customer) message → real engagement
//   1 – has non-null lastMessageAt → some staff/AI activity
//   2 – active status but no messages yet
//   3 – other (unknown origin)
//   4 – CRM outbound-only (no customer reply) → always loses dedup
//
// Within the same rank, rows are sorted newest-first (lastMessageAt DESC NULLS LAST,
// createdAt DESC) so that first-seen-wins deduplication picks the most recent one.

type ConvRow = Awaited<ReturnType<typeof fetchRows>>[0];

function dedupRank(r: ConvRow): number {
  if (r._count.messages > 0) return 0;  // has customer reply
  if (r.lastMessageAt !== null) return 1;  // staff/AI activity
  const isCrm =
    r.contextType === "CRM_CAMPAIGN" || r.contextType === "CRM_AUTOMATION";
  const isActive =
    r.status === ConversationStatus.OPEN ||
    r.status === ConversationStatus.HUMAN ||
    (r.status as string) === "HUMANO_ASSUMIU" ||
    r.status === ConversationStatus.BOT ||
    (r.status as string) === "AI_ATENDENDO";
  if (isCrm) return 4;  // CRM outbound-only → lowest priority
  if (isActive) return 2;
  return 3;
}

async function fetchRows(
  where: Prisma.ConversationWhereInput,
  fetchLimit: number,
) {
  return prisma.conversation.findMany({
    where,
    // PRIMARY FIX: NULLS LAST prevents conversations with lastMessageAt=null
    // (CRM outbound-only, new empty conversations) from floating above real
    // active conversations in the inbox. PostgreSQL's default DESC is NULLS FIRST,
    // which was the root cause of wrong ordering.
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: fetchLimit,
    select: {
      id:                true,
      channel:           true,
      status:            true,
      aiEnabled:         true,
      conversationType:  true,
      aiLocked:          true,
      customerName:      true,
      customerPhone:     true,
      lastMessageAt:     true,
      unreadCount:       true,
      createdAt:         true,
      contextType:       true,
      relatedCampaignId: true,
      customer: { select: { id: true, name: true, phone: true, tier: true } },
      // SYSTEM messages (handoff events) excluded from preview.
      // take: 5 so isConvMultichannel can detect CUSTOMER_CARDAPIO messages
      // even when the most recent message is from WhatsApp.
      messages: {
        where:   { senderType: { not: "SYSTEM" } },
        orderBy: { sentAt: "desc" },
        take: 5,
        select: { content: true, senderType: true, direction: true, sentAt: true, type: true },
      },
      // Count of INBOUND (customer) messages — used to compute hasCustomerReplied
      // and to drive deduplication priority without loading all messages.
      _count: {
        select: { messages: { where: { direction: "INBOUND" } } },
      },
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const sp      = req.nextUrl.searchParams;
    const status  = sp.get("status")  ?? undefined;
    const channel = sp.get("channel") ?? undefined;
    const search  = sp.get("search")  ?? undefined;
    // crm=1 restricts to "CRM enviado": conversations tagged with a CRM contextType
    // OR whose customer has any CRM send log (CampaignExecution / CRMActionLog).
    // Channel-independent so it works without also selecting WhatsApp.
    const crm     = sp.get("crm")     ?? undefined;
    // staff=1 restricts to non-customer (Staff/Fornecedor/…) conversations —
    // permanently AI-locked — so the "Staff" tab finds them even when older than
    // the default loaded window.
    const staff   = sp.get("staff")   ?? undefined;
    const page    = Math.max(1, parseInt(sp.get("page")  ?? "1", 10));
    const limit   = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30", 10)));
    const skip    = (page - 1) * limit;

    // Canonical "has CRM sent" recipients — only needed when the CRM filter is active.
    const crmRecipientCustomerIds = crm ? await getCrmSentCustomerIds(ctx.restaurantId) : undefined;

    const where = buildConversationWhere(ctx.restaurantId, { status, channel, search, crm, staff }, crmRecipientCustomerIds);

    // Fetch more rows than requested so deduplication leaves enough results.
    const fetchLimit = Math.min(limit * 4, 400);

    const rows = await fetchRows(where, fetchLimit);

    // Secondary sort for deduplication priority.
    // The DB already returned rows NULLS LAST (newest real activity first), so
    // this in-memory sort only reorders ties: prefer rows with customer replies,
    // then non-null lastMessageAt, then active status, and demote CRM-only last.
    // Within each rank, maintain newest-first ordering from the DB.
    rows.sort((a, b) => {
      const ra = dedupRank(a);
      const rb = dedupRank(b);
      if (ra !== rb) return ra - rb;
      // Tiebreak: newest lastMessageAt first; nulls last.
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : -Infinity;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : -Infinity;
      if (ta !== tb) return tb - ta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Deduplicate: one conversation per canonical customer.
    // Because rows are ranked above, the first occurrence for each key is always
    // the most meaningful conversation (real activity > CRM outbound-only).
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      const key = r.customer?.id ?? r.customerPhone ?? r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Map to response shape: compute hasCustomerReplied + crmSent, strip _count.
    // crmSent drives the generic "CRM enviado" badge. On the CRM tab every row
    // matched the filter, so it is true; elsewhere it reflects a CRM contextType.
    const paged = deduped.slice(skip, skip + limit).map(({ _count, ...rest }) => ({
      ...rest,
      hasCustomerReplied: _count.messages > 0,
      crmSent: Boolean(crm) || (rest.contextType != null && CRM_CONTEXT_SET.has(rest.contextType)),
    }));

    const total = deduped.length;

    // P2 TODO: evaluate WhatsApp-like priority sorting — surface OPEN+unread
    // conversations above chronological order, similar to handlerPriority() in
    // AtendimentoClient. Requires product sign-off before changing operator UX.

    return ok({
      data:       paged,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[GET /api/chat/conversations]", err);
    return serverError();
  }
}
