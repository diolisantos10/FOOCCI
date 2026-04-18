import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

type Params = { params: { id: string } };

/**
 * GET /api/media/[id]
 *
 * Public route — no session required. Images are embedded in public QR menu
 * pages and cannot require auth.
 *
 * Protections applied:
 *  - Rate limiting per IP: 120 req/min (generous for legitimate browsers, but
 *    slows down automated enumeration attempts)
 *  - Active-restaurant guard: only serve media whose parent restaurant is
 *    currently active (soft-deleted / disabled restaurants stop serving images)
 *  - IDs are CUIDs — practically unguessable, so brute-force is infeasible
 */
export async function GET(req: NextRequest, { params }: Params) {
  // Rate limit: 120 requests / minute per IP
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `media:${ip}`, limit: 120, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const record = await prisma.mediaUpload.findUnique({
      where: { id: params.id },
      select: { data: true, mimeType: true, restaurantId: true },
    });

    if (!record) {
      return new NextResponse(null, { status: 404 });
    }

    // Don't serve images for disabled/deleted restaurants
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: record.restaurantId },
      select: { isActive: true },
    });

    if (!restaurant?.isActive) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(new Uint8Array(record.data), {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
