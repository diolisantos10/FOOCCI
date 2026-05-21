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
import { Channel, ConversationStatus, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const sp     = req.nextUrl.searchParams;
    const status  = sp.get("status")  ?? undefined;
    const channel = sp.get("channel") ?? undefined;
    const search  = sp.get("search")  ?? undefined;
    const page    = Math.max(1, parseInt(sp.get("page")  ?? "1", 10));
    const limit   = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30", 10)));
    const skip    = (page - 1) * limit;

    // Build Prisma where clause
    const where: Prisma.ConversationWhereInput = {
      restaurantId: ctx.restaurantId,
      ...(status  && Object.values(ConversationStatus).includes(status as ConversationStatus)
        ? { status: status as ConversationStatus }
        : {}),
      ...(channel && Object.values(Channel).includes(channel as Channel)
        ? { channel: channel as Channel }
        : {}),
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

    // Fetch more rows than requested so deduplication leaves enough results.
    // Conversations are grouped by canonical customer identity (customerId or
    // customerPhone) and only the most recent active conversation per customer
    // is returned. This prevents the same customer appearing multiple times in
    // the atendimento list when duplicate conversation rows exist in the DB.
    const fetchLimit = Math.min(limit * 4, 400);

    const rows = await prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: fetchLimit,
      select: {
        id:               true,
        channel:          true,
        status:           true,
        aiEnabled:        true,
        customerName:     true,
        customerPhone:    true,
        lastMessageAt:    true,
        unreadCount:      true,
        createdAt:        true,
        contextType:      true,
        relatedCampaignId:true,
        customer: { select: { id: true, name: true, phone: true, tier: true } },
        // Exclude SYSTEM messages (e.g. [handoff:AI_ESCALATION]) from preview.
        messages: {
          where:   { senderType: { not: "SYSTEM" } },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { content: true, senderType: true, direction: true, sentAt: true, type: true },
        },
      },
    });

    // Deduplicate: one row per canonical customer (customerId takes priority,
    // then customerPhone). Rows are already sorted most-recent-first so the
    // first occurrence of each key wins.
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      const key = r.customer?.id ?? r.customerPhone ?? r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const paged = deduped.slice(skip, skip + limit);
    const total = deduped.length;

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
