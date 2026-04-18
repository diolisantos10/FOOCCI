/**
 * First-time setup API.
 *
 * GET  /api/setup  – returns { setupRequired: true } if no restaurant exists yet,
 *                   or { setupRequired: false } if already initialised.
 *
 * POST /api/setup  – creates the first restaurant + owner account.
 *                   Blocked with 403 if any restaurant already exists.
 *
 * Security:
 *   - POST is rate-limited (3 attempts / hour per IP)
 *   - The restaurant count check and creation happen inside a single Prisma
 *     transaction so no race condition can produce two tenants.
 *   - bcrypt is computed BEFORE entering the transaction to keep the DB
 *     connection hold time short.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { hash } from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const setupSchema = z.object({
  restaurantName: z.string().min(2).max(100),
  ownerName:      z.string().min(2).max(100),
  ownerEmail:     z.string().email(),
  ownerPassword:  z.string().min(8).max(72),
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET() {
  try {
    const count = await prisma.restaurant.count();
    return NextResponse.json({ setupRequired: count === 0 });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the database. Check DATABASE_URL." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 3 attempts / hour per IP
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `setup:${ip}`, limit: 3, windowMs: 60 * 60_000 });
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error." },
      { status: 422 }
    );
  }

  const { restaurantName, ownerName, ownerEmail, ownerPassword } = parsed.data;

  // Hash password before entering the transaction (bcrypt is slow by design;
  // we don't want to hold a DB connection open while it runs).
  const hashedPassword = await hash(ownerPassword, 12);

  const baseSlug = toSlug(restaurantName) || "restaurante";

  try {
    // Atomically check "no restaurant yet" and create the first one.
    // Using a transaction prevents a race condition where two simultaneous
    // POST requests both see count=0 and try to create a tenant.
    const result = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction
      const count = await tx.restaurant.count();
      if (count > 0) return null; // already set up

      // Ensure slug uniqueness (unlikely collision but handle it)
      const slugTaken = await tx.restaurant.findUnique({
        where: { slug: baseSlug },
        select: { id: true },
      });
      const slug = slugTaken ? `${baseSlug}-${Date.now()}` : baseSlug;

      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          slug,
          timezone: "America/Sao_Paulo",
        },
      });

      const owner = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          name: ownerName,
          email: ownerEmail,
          password: hashedPassword,
          role: "OWNER",
        },
      });

      return { restaurant, owner };
    });

    if (!result) {
      return NextResponse.json(
        { error: "Setup already completed." },
        { status: 403 }
      );
    }

    const { password: _pwd, ...ownerWithoutPassword } = result.owner;

    return NextResponse.json(
      {
        ok: true,
        restaurantSlug: result.restaurant.slug,
        ownerEmail: ownerWithoutPassword.email,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/setup]", err);
    return NextResponse.json(
      { error: "Setup failed. Check server logs." },
      { status: 500 }
    );
  }
}
