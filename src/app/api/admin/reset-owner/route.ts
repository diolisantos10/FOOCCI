/**
 * POST /api/admin/reset-owner
 *
 * Emergency recovery: deletes ALL user accounts for the restaurant,
 * leaving all other data (menu, orders, conversations) intact.
 *
 * Only intended for broken initialization states where no valid owner
 * credentials exist. After this call, /recover becomes available again.
 *
 * SECURITY: Requires the x-admin-secret header to match ADMIN_SECRET env var.
 * Without ADMIN_SECRET configured this endpoint is completely disabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Require ADMIN_SECRET — endpoint is disabled if the env var is not set.
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "This endpoint is disabled. Set ADMIN_SECRET to enable it." },
      { status: 403 }
    );
  }

  const providedSecret = req.headers.get("x-admin-secret") ?? "";
  if (providedSecret !== adminSecret) {
    auditLog({
      action: "auth.login_failure",
      meta: { route: "POST /api/admin/reset-owner", reason: "invalid_secret" },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: "No restaurant found. Run /setup first." },
        { status: 404 }
      );
    }

    const { count } = await prisma.user.deleteMany({
      where: { restaurantId: restaurant.id },
    });

    auditLog({
      action: "user.delete",
      restaurantId: restaurant.id,
      meta: { route: "reset-owner", deletedCount: count },
    });

    return NextResponse.json({
      ok: true,
      restaurantName: restaurant.name,
      deletedUsers: count,
    });
  } catch (err) {
    console.error("[reset-owner]", err);
    return NextResponse.json(
      { error: "Database error. Check Railway logs." },
      { status: 503 }
    );
  }
}
