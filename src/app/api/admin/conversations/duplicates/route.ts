/**
 * GET /api/admin/conversations/duplicates
 *
 * Diagnostic report — lists restaurants that have duplicate conversations
 * (more than one active conversation for the same customer/phone).
 *
 * Protected by ADMIN_SECRET. Read-only — no data is modified.
 *
 * Query params:
 *   restaurantId – scope to a single restaurant (optional)
 *
 * Response per duplicate group:
 *   restaurantId, customerPhone, customerId, conversationCount,
 *   conversationIds (oldest-first), latestConversationId,
 *   recommendation (which id to keep)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not set." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? undefined;

  // Find customers/phones that have more than one non-RESOLVED conversation.
  // Use a two-step approach: group by customerId, count, then join details.
  type GroupRow = { restaurantId: string; customerId: string | null; customerPhone: string | null; cnt: bigint };

  const groups = await prisma.$queryRaw<GroupRow[]>`
    SELECT
      "restaurantId",
      "customerId",
      "customerPhone",
      COUNT(*) AS cnt
    FROM conversations
    WHERE status NOT IN ('RESOLVED')
      ${restaurantId ? prisma.$queryRaw`AND "restaurantId" = ${restaurantId}` : prisma.$queryRaw``}
    GROUP BY "restaurantId", "customerId", "customerPhone"
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 200
  `;

  if (groups.length === 0) {
    return NextResponse.json({ ok: true, duplicateGroups: 0, groups: [] });
  }

  // For each group, fetch the conversation IDs
  const details = await Promise.all(
    groups.map(async (g) => {
      const where: Record<string, unknown> = { restaurantId: g.restaurantId };
      if (g.customerId) where.customerId = g.customerId;
      else if (g.customerPhone) where.customerPhone = g.customerPhone;
      where.status = { not: "RESOLVED" };

      const convs = await prisma.conversation.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, createdAt: true, lastMessageAt: true, channel: true, contextType: true },
      });

      const latest = [...convs].sort(
        (a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0)
      )[0];

      return {
        restaurantId:        g.restaurantId,
        customerId:          g.customerId,
        customerPhone:       g.customerPhone,
        conversationCount:   Number(g.cnt),
        conversations:       convs,
        latestConversationId: latest?.id ?? null,
        recommendation:      `Keep ${latest?.id ?? "?"} — most recent activity. Safe to RESOLVE others.`,
      };
    })
  );

  return NextResponse.json({
    ok:              true,
    duplicateGroups: details.length,
    groups:          details,
    note:            "This is a read-only diagnostic. To merge duplicates, resolve older conversations via the atendimento UI or a targeted DB update.",
  });
}
