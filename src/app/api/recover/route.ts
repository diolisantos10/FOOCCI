/**
 * POST /api/recover
 *
 * Recovery flow for when a restaurant exists but has no active OWNER.
 *
 * GET  → { recoveryAllowed: bool, reason?: string }
 * POST → creates a new OWNER user on the existing restaurant
 *
 * Safety gate: blocked immediately if an active OWNER already exists.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const recoverSchema = z.object({
  ownerName: z.string().min(2).max(100),
  ownerEmail: z.string().email(),
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

export async function POST(req: Request) {
  const ctx = await getRecoveryContext().catch(() => ({
    allowed: false,
    reason: "db_error",
    restaurant: null,
  }));

  if (!ctx.allowed || !ctx.restaurant) {
    return NextResponse.json(
      { error: ctx.reason === "owner_exists" ? "An active owner account already exists." : "Recovery not available." },
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

  // Check if this email is already registered (inactive user — reactivate instead of duplicate)
  const existingUser = await prisma.user.findFirst({
    where: { email: ownerEmail, restaurantId: ctx.restaurant.id },
  });

  if (existingUser) {
    // Reactivate and promote to OWNER with new password
    const hashedPassword = await hash(ownerPassword, 12);
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name: ownerName,
        password: hashedPassword,
        role: "OWNER",
        isActive: true,
      },
    });
  } else {
    const hashedPassword = await hash(ownerPassword, 12);
    await prisma.user.create({
      data: {
        restaurantId: ctx.restaurant.id,
        name: ownerName,
        email: ownerEmail,
        password: hashedPassword,
        role: "OWNER",
        isActive: true,
      },
    });
  }

  return NextResponse.json({ ok: true, restaurantName: ctx.restaurant.name }, { status: 201 });
}
