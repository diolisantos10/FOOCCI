/**
 * POST /api/auth/lookup
 *
 * Given an email, returns the restaurant slug associated with that account.
 * Used by the login form so the user only needs to enter email + password.
 *
 * Returns the slug only — no sensitive data exposed.
 * Route is already public via the /api/auth/* whitelist in middleware.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;

  if (!email) {
    return NextResponse.json({ error: "Email required." }, { status: 400 });
  }

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
