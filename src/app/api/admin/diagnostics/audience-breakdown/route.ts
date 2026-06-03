/**
 * GET /api/admin/diagnostics/audience-breakdown
 *
 * Read-only diagnostic for CRM audience segmentation.
 * Returns total customer counts by segment and tier, plus detailed
 * exclusion breakdowns so owners can understand why eligible counts
 * differ from total segment counts.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   restaurantId — required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getSegmentConfig } from "@/lib/crm-segments";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  try {
    const segCfg = await getSegmentConfig(restaurantId);
    const now    = new Date();

    const hotCutoff  = new Date(now.getTime() - segCfg.hotMaxDays  * 86_400_000);
    const warmCutoff = new Date(now.getTime() - segCfg.warmMaxDays * 86_400_000);
    const lostCutoff = new Date(now.getTime() - segCfg.lostMinDays * 86_400_000);

    // Segment counts using stored Customer.segment field
    const [
      storedSegmentCounts,
      storedTierCounts,
      totalNonGuest,
      exclusionCounts,
    ] = await Promise.all([
      // Counts by stored segment value
      prisma.customer.groupBy({
        by:    ["segment"],
        where: { restaurantId, isGuest: false },
        _count: { _all: true },
      }),

      // Counts by stored tier
      prisma.customer.groupBy({
        by:    ["tier"],
        where: { restaurantId, isGuest: false },
        _count: { _all: true },
      }),

      // Total non-guest customers
      prisma.customer.count({ where: { restaurantId, isGuest: false } }),

      // Exclusion breakdown (for WhatsApp campaigns)
      Promise.all([
        prisma.customer.count({ where: { restaurantId, isGuest: false, phone: null } }),
        prisma.customer.count({ where: { restaurantId, isGuest: false, hasOptedOut: true } }),
        prisma.customer.count({
          where: {
            restaurantId,
            isGuest:        false,
            hasOptedOut:    false,
            phone:          { not: null },
            crmContactable: false,
          },
        }),
        prisma.customer.count({ where: { restaurantId, isGuest: false, isActive: false } }),
        prisma.customer.count({ where: { restaurantId, isGuest: false, crmContactable: true, phone: { not: null }, isActive: true, hasOptedOut: false } }),
      ]),
    ]);

    const [noPhone, optedOut, notContactable, inactive, eligible] = exclusionCounts;

    // Compute live segment counts from effective dates (same logic as CrmAudienceService)
    const liveSegmentCountsRaw = await prisma.$queryRaw<Array<{ bucket: string; cnt: bigint }>>`
      SELECT
        CASE
          WHEN COALESCE("lastOrderAt", "importedLastOrderAt") >= ${hotCutoff}  THEN 'QUENTE'
          WHEN COALESCE("lastOrderAt", "importedLastOrderAt") >= ${warmCutoff} THEN 'MORNO'
          WHEN COALESCE("lastOrderAt", "importedLastOrderAt") >= ${lostCutoff} THEN 'FRIO'
          WHEN COALESCE("lastOrderAt", "importedLastOrderAt") IS NOT NULL       THEN 'PERDIDO'
          ELSE 'SEM_PEDIDOS'
        END AS bucket,
        COUNT(*)::bigint AS cnt
      FROM customers
      WHERE "restaurantId" = ${restaurantId}
        AND "isGuest" = false
      GROUP BY 1
    `;

    const liveSegments: Record<string, number> = {};
    for (const row of liveSegmentCountsRaw) {
      liveSegments[row.bucket] = Number(row.cnt);
    }

    const storedSegments: Record<string, number> = {};
    for (const row of storedSegmentCounts) {
      storedSegments[row.segment ?? "SEM_PEDIDOS"] = row._count._all;
    }

    const storedTiers: Record<string, number> = {};
    for (const row of storedTierCounts) {
      storedTiers[row.tier ?? "BRONZE"] = row._count._all;
    }

    const segmentDrift: Record<string, { stored: number; live: number; diff: number }> = {};
    const allSegments = new Set([...Object.keys(storedSegments), ...Object.keys(liveSegments)]);
    for (const seg of allSegments) {
      const stored = storedSegments[seg] ?? 0;
      const live   = liveSegments[seg]   ?? 0;
      if (stored !== live) {
        segmentDrift[seg] = { stored, live, diff: live - stored };
      }
    }

    return NextResponse.json({
      restaurantId,
      segmentConfig: segCfg,
      totalCustomers: totalNonGuest,

      storedSegments: {
        QUENTE:      storedSegments["QUENTE"]      ?? 0,
        MORNO:       storedSegments["MORNO"]       ?? 0,
        FRIO:        storedSegments["FRIO"]        ?? 0,
        PERDIDO:     storedSegments["PERDIDO"]     ?? 0,
        SEM_PEDIDOS: storedSegments["SEM_PEDIDOS"] ?? 0,
      },

      liveSegments: {
        QUENTE:      liveSegments["QUENTE"]      ?? 0,
        MORNO:       liveSegments["MORNO"]       ?? 0,
        FRIO:        liveSegments["FRIO"]        ?? 0,
        PERDIDO:     liveSegments["PERDIDO"]     ?? 0,
        SEM_PEDIDOS: liveSegments["SEM_PEDIDOS"] ?? 0,
      },

      segmentDrift: Object.keys(segmentDrift).length > 0 ? segmentDrift : null,
      note: Object.keys(segmentDrift).length > 0
        ? "Segment drift detected — run rebuildRestaurantCustomerMetrics() to resync stored values."
        : "Stored segments match live calculation.",

      storedTiers: {
        BRONZE:   storedTiers["BRONZE"]   ?? 0,
        PRATA:    storedTiers["PRATA"]    ?? 0,
        OURO:     storedTiers["OURO"]     ?? 0,
        DIAMANTE: storedTiers["DIAMANTE"] ?? 0,
      },

      whatsappEligibility: {
        total:          totalNonGuest,
        noPhone,
        optedOut,
        notContactable,
        inactive,
        eligible,
        excludedTotal:  totalNonGuest - eligible,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Diagnostic failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
