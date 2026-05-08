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

    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id:            true,
          channel:       true,
          status:        true,
          aiEnabled:     true,
          customerName:  true,
          customerPhone: true,
          lastMessageAt: true,
          unreadCount:   true,
          createdAt:     true,
          customer: { select: { id: true, name: true, phone: true, tier: true } },
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { content: true, senderType: true, direction: true, sentAt: true },
          },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    return ok({
      data:       rows,
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
