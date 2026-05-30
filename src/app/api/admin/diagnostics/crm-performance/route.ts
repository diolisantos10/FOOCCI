/**
 * GET /api/admin/diagnostics/crm-performance
 *
 * Read-only consolidated performance metrics for CRM campaigns and coupons.
 * Surfaces ONLY what existing data supports — no invented attribution.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   restaurantId — filter to one restaurant (optional)
 *   limit        — max rows per section (default: 50, max: 200)
 *
 * Attribution model (honest limitations, see `attributionNotes` in response):
 *   - Campaign orders/revenue are TIME-WINDOW attributed (CRMAttributionService,
 *     7-day window), persisted on Campaign.totalConverted / totalRevenue.
 *   - There is NO coupon↔campaign link in the data model, so per-campaign
 *     coupon-use / discount cannot be computed. Reported as unsupported.
 *   - There is NO click/link-open tracking for CRM WhatsApp sends.
 *   - Coupon (Promotion) metrics ARE computable from Order rows carrying the
 *     promotionId / couponCode (valid statuses only), same logic as
 *     /api/promotions/[id]/metrics.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

const VALID_ORDER_STATUSES: OrderStatus[] = [
  "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
];
const VALID_PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PAY_ON_DELIVERY", "PAY_ON_PICKUP"];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const restaurantId = sp.get("restaurantId") ?? undefined;
  const limit        = Math.min(Number(sp.get("limit") ?? "50"), 200);

  try {
    // ── Campaigns ────────────────────────────────────────────────────────────
    const campaignRows = await prisma.campaign.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        status: { not: "CANCELLED" as never },
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id:             true,
        restaurantId:   true,
        name:           true,
        status:         true,
        channel:        true,
        targetSegment:  true,
        totalAudience:  true,
        totalSent:      true,
        totalFailed:    true,
        totalRead:      true,
        totalResponded: true,
        totalConverted: true,
        totalRevenue:   true,
        sentAt:         true,
        createdAt:      true,
      },
    });

    // Last per-recipient execution timestamp per campaign (covers recurring sends
    // where Campaign.sentAt only reflects the first dispatch).
    const lastExecByCampaign = new Map<string, string>();
    if (campaignRows.length > 0) {
      const grouped = await prisma.campaignExecution.groupBy({
        by:    ["campaignId"],
        where: { campaignId: { in: campaignRows.map((c) => c.id) }, sentAt: { not: null } },
        _max:  { sentAt: true },
      });
      for (const g of grouped) {
        if (g._max.sentAt) lastExecByCampaign.set(g.campaignId, g._max.sentAt.toISOString());
      }
    }

    const campaigns = campaignRows.map((c) => {
      const sent      = c.totalSent;
      const revenue   = Number(c.totalRevenue);
      const converted = c.totalConverted;
      return {
        id:            c.id,
        restaurantId:  c.restaurantId,
        name:          c.name,
        status:        c.status,
        channel:       c.channel,
        targetSegment: c.targetSegment,
        audienceSize:  c.totalAudience,
        sent,
        failed:        c.totalFailed,
        read:          c.totalRead,
        responded:     c.totalResponded,
        ordersGenerated: converted,          // time-window attributed
        revenueGenerated: round2(revenue),   // time-window attributed
        conversionRate:   sent > 0 ? round2((converted / sent) * 100) : 0, // %
        revenuePerContacted: sent > 0 ? round2(revenue / sent) : 0,
        lastExecutionAt: lastExecByCampaign.get(c.id) ?? c.sentAt?.toISOString() ?? null,
        // Honest unsupported metrics (no data model support):
        couponUses:    null as number | null, // no coupon↔campaign link
        discountGiven: null as number | null, // no order↔campaign FK
        responsesTracked: false,              // totalResponded exists but is not link-tracked
      };
    });

    // ── Coupons (Promotions carrying a coupon code) ────────────────────────────
    const promoRows = await prisma.promotion.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        couponCode: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id:            true,
        restaurantId:  true,
        name:          true,
        status:        true,
        couponCode:    true,
        channel:       true,
        discountValue: true,
        maxUses:       true,
        usedCount:     true,
        createdAt:     true,
      },
    });

    const coupons = await Promise.all(
      promoRows.map(async (p) => {
        const code = p.couponCode!;
        const couponConditions = [
          { AND: [{ promotionId: null }, { couponCode: { equals: code, mode: "insensitive" as const } }] },
        ];
        const orders = await prisma.order.findMany({
          where: {
            restaurantId: p.restaurantId,
            status: { in: VALID_ORDER_STATUSES },
            AND: [
              { OR: [{ promotionId: p.id }, ...couponConditions] },
              { OR: [{ payment: null }, { payment: { status: { in: VALID_PAYMENT_STATUSES } } }] },
            ],
          },
          select: { discount: true, total: true, customerId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1000,
        });

        const uses          = orders.length;
        const grossRevenue  = orders.reduce((s, o) => s + Number(o.total), 0);
        const discountTotal = orders.reduce((s, o) => s + Number(o.discount), 0);
        return {
          promotionId:    p.id,
          restaurantId:   p.restaurantId,
          name:           p.name,
          code,
          status:         p.status,
          channel:        p.channel,
          uses,                                    // counted from valid orders
          usedCountField: p.usedCount,             // raw counter (may differ from `uses`)
          maxUses:        p.maxUses,
          grossRevenue:   round2(grossRevenue),
          discountTotal:  round2(discountTotal),
          netRevenue:     round2(grossRevenue - discountTotal),
          uniqueCustomers: new Set(orders.map((o) => o.customerId)).size,
          lastUsedAt:     uses > 0 ? orders[0]!.createdAt.toISOString() : null,
          linkedCampaign: null as string | null,   // not supported — no coupon↔campaign link
        };
      })
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      scope:       restaurantId ? { restaurantId } : { restaurantId: "ALL" },
      campaigns: {
        count: campaigns.length,
        rows:  campaigns,
      },
      coupons: {
        count: coupons.length,
        rows:  coupons,
      },
      attributionNotes: [
        "Campaign ordersGenerated/revenueGenerated are time-window attributed (CRMAttributionService, 7-day window) — not coupon-redemption based.",
        "couponUses / discountGiven per CAMPAIGN are NOT supported: the data model has no coupon↔campaign link.",
        "No click/link-open tracking exists for CRM WhatsApp sends; 'responsesTracked' is false.",
        "Coupon (Promotion) uses/revenue/discount ARE computed from valid Order rows carrying promotionId or couponCode.",
        "coupon.linkedCampaign is null because Promotion has no campaignId field.",
      ],
    });
  } catch (err: unknown) {
    console.error("[diag/crm-performance] error:", err);
    return NextResponse.json(
      { error: "Internal error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
