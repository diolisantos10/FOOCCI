/**
 * GET /api/crm/revenue-summary
 *
 * Period-scoped campaign revenue aggregate.
 * Accepts ?from=ISO&to=ISO. Without params returns all-time totals.
 * Read-only. No LLM. No send.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  const dateFilter = from && to
    ? {
        OR: [
          { sentAt:    { gte: new Date(from), lte: new Date(to) } },
          { createdAt: { gte: new Date(from), lte: new Date(to) } },
        ],
      }
    : {};

  const agg = await prisma.campaign.aggregate({
    where: { restaurantId, ...dateFilter },
    _sum: {
      totalSent:      true,
      totalResponded: true,
      totalConverted: true,
      totalRevenue:   true,
    },
    _count: { _all: true },
  });

  return NextResponse.json({
    data: {
      totalRevenue:   Number(agg._sum.totalRevenue   ?? 0),
      totalSent:      Number(agg._sum.totalSent      ?? 0),
      totalResponded: Number(agg._sum.totalResponded ?? 0),
      totalConverted: Number(agg._sum.totalConverted ?? 0),
      campaignCount:  agg._count._all,
    },
  });
}
