/**
 * POST /api/admin/reset-owner
 *
 * Emergency recovery: deletes ALL user accounts for the restaurant,
 * leaving all other data (menu, orders, conversations) intact.
 *
 * Only intended for broken initialization states where no valid owner
 * credentials exist. After this call, /recover becomes available again.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
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
