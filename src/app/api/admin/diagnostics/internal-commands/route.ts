/**
 * GET /api/admin/diagnostics/internal-commands
 *
 * Counts and samples historical messages that contain internal Build OS command
 * prefixes (/build, /cmd, /prompt) and were stored as normal customer messages
 * before the security fix. Read-only. No mutations.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   restaurantId — optional; if omitted, scans all restaurants
 *   limit        — max sample rows (default 20, max 100)
 *
 * Response:
 *   total, byRestaurant[], samples[]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

const INTERNAL_PREFIXES = ["/build", "/cmd", "/prompt"];

function buildPrefixFilter() {
  return INTERNAL_PREFIXES.map((p) => ({ content: { startsWith: p } }));
}

export async function GET(req: NextRequest) {
  const authError = checkAdminRequest(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const restaurantId = searchParams.get("restaurantId") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const where = {
    ...(restaurantId ? { conversation: { restaurantId } } : {}),
    senderType: { in: ["CUSTOMER", "HUMAN", "HUMAN_EXTERNAL"] },
    OR: buildPrefixFilter(),
  };

  const [total, samples] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        id: true,
        sentAt: true,
        senderType: true,
        direction: true,
        content: true,
        conversation: {
          select: {
            id: true,
            restaurantId: true,
            channel: true,
          },
        },
      },
    }),
  ]);

  // Group by restaurant
  const byRestaurant: Record<string, number> = {};
  for (const s of samples) {
    const rid = s.conversation.restaurantId;
    byRestaurant[rid] = (byRestaurant[rid] ?? 0) + 1;
  }

  return NextResponse.json({
    total,
    scanned: restaurantId ? "single_restaurant" : "all_restaurants",
    byRestaurant: Object.entries(byRestaurant).map(([id, count]) => ({ restaurantId: id, count })),
    samples: samples.map((s) => ({
      id: s.id,
      sentAt: s.sentAt,
      senderType: s.senderType,
      direction: s.direction,
      // Mask most of the content — show only the first token (command prefix)
      contentPrefix: s.content?.split(/\s/)[0] ?? "",
      conversationId: s.conversation.id,
      restaurantId: s.conversation.restaurantId,
      channel: s.conversation.channel,
    })),
    verdict: total === 0 ? "CLEAN" : "LEAKED_RECORDS_FOUND",
    remediationNote:
      total === 0
        ? "No historical internal command messages found."
        : `${total} message(s) found. These are hidden in the Atendimento UI (rendered as 'Comando interno ocultado'). No deletion is performed — records are preserved for audit.`,
  });
}
