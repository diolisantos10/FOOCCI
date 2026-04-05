/**
 * POST /api/recover
 *
 * Recovery flow for when a restaurant exists but has no active OWNER.
 *
 * GET  → { recoveryAllowed: bool, reason?: string }
 * POST → creates a new OWNER user on the existing restaurant
 *
 * Safety gates:
 *   - Blocked immediately if an active OWNER already exists.
 *   - The owner-existence check and user creation are wrapped in a single
 *     Prisma transaction to prevent race conditions where two simultaneous
 *     requests both pass the guard and both create owners.
 *   - Rate-limited (5 attempts / 5 min per IP).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const recoverSchema = z.object({
  ownerName:     z.string().min(2).max(100),
  ownerEmail:    z.string().email(),
  ownerPassword: z.string().min(8).max(72),
});

async function getRecoveryContext() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (!restaurant) {
    return { allowed: false, reason: "no_restaurant", restaurant: null };
  }

  const activeOwner = await prisma.user.findFirst({
    where: { restaurantId: restaurant.id, role: "OWNER", isActive: true },
    select: { id: true },
  });

  if (activeOwner) {
    return { allowed: false, reason: "owner_exists", restaurant };
  }

  return { allowed: true, reason: null, restaurant };
}

export async function GET() {
  try {
    const ctx = await getRecoveryContext();
    return NextResponse.json({
      recoveryAllowed: ctx.allowed,
      reason: ctx.reason,
      restaurantName: ctx.restaurant?.name ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the database. Check DATABASE_URL." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts / 5 minutes per IP
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `recover:${ip}`, limit: 5, windowMs: 5 * 60_000 });
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Lightweight pre-check so we can surface the correct error message without
  // entering a transaction on every blocked call.
  const preCheck = await getRecoveryContext().catch(() => ({
    allowed: false,
    reason: "db_error",
    restaurant: null,
  }));

  if (!preCheck.allowed || !preCheck.restaurant) {
    return NextResponse.json(
      {
        error:
          preCheck.reason === "owner_exists"
            ? "An active owner account already exists."
            : "Recovery not available.",
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = recoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error." },
      { status: 422 }
    );
  }

  const { ownerName, ownerEmail, ownerPassword } = parsed.data;
  const restaurantId = preCheck.restaurant.id;

  // Hash before the transaction — bcrypt is slow and we don't want to hold
  // a DB connection open while it runs.
  const hashedPassword = await hash(ownerPassword, 12);

  try {
    // Atomically re-check "no active owner" and create the owner.
    // This eliminates the race condition where two concurrent requests both
    // pass the pre-check above and both try to create an owner account.
    const outcome = await prisma.$transaction(async (tx) => {
      const activeOwner = await tx.user.findFirst({
        where: { restaurantId, role: "OWNER", isActive: true },
        select: { id: true },
      });
      if (activeOwner) return { blocked: true, restaurantName: null };

      const existingUser = await tx.user.findFirst({
        where: { email: ownerEmail, restaurantId },
        select: { id: true },
      });

      if (existingUser) {
        // Reactivate and promote to OWNER with new password
        await tx.user.update({
          where: { id: existingUser.id },
          data: { name: ownerName, password: hashedPassword, role: "OWNER", isActive: true },
        });
      } else {
        await tx.user.create({
          data: {
            restaurantId,
            name: ownerName,
            email: ownerEmail,
            password: hashedPassword,
            role: "OWNER",
            isActive: true,
          },
        });
      }

      return { blocked: false, restaurantName: preCheck.restaurant!.name };
    });

    if (outcome.blocked) {
      return NextResponse.json(
        { error: "An active owner account already exists." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { ok: true, restaurantName: outcome.restaurantName },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/recover]", err);
    return NextResponse.json(
      { error: "Recovery failed. Check server logs." },
      { status: 500 }
    );
  }
}
