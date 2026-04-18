/**
 * POST /api/auth/lookup
 *
 * Given an email, returns the restaurant slug associated with that account.
 * Used by the login form so the user only needs to enter email + password.
 *
 * Returns the slug only — no sensitive data exposed.
 * Route is already public via the /api/auth/* whitelist in middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  // Rate limit: 10 lookups / minute per IP to slow credential enumeration
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `lookup:${ip}`, limit: 10, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: "Email required." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: {
      restaurant: { select: { slug: true, isActive: true } },
    },
  });

  if (!user || !user.restaurant.isActive) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({ slug: user.restaurant.slug });
}
