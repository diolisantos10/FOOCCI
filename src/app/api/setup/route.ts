/**
 * First-time setup API.
 *
 * GET  /api/setup  – returns { setupRequired: true } if no restaurant exists yet,
 *                   or { setupRequired: false } if already initialised.
 *
 * POST /api/setup  – creates the first restaurant + owner account.
 *                   Blocked with 403 if any restaurant already exists.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RestaurantService } from "@/services/restaurant/RestaurantService";
import { z } from "zod";

const setupSchema = z.object({
  restaurantName: z.string().min(2).max(100),
  ownerName: z.string().min(2).max(100),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).max(72),
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

async function isSetupRequired(): Promise<boolean> {
  const count = await prisma.restaurant.count();
  return count === 0;
}

export async function GET() {
  try {
    const setupRequired = await isSetupRequired();
    return NextResponse.json({ setupRequired });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the database. Check DATABASE_URL." },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  // Guard: block if already initialised
  const setupRequired = await isSetupRequired().catch(() => false);
  if (!setupRequired) {
    return NextResponse.json(
      { error: "Setup already completed." },
      { status: 403 }
    );
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

  const baseSlug = toSlug(restaurantName) || "restaurante";

  // Ensure slug uniqueness (unlikely but safe)
  let slug = baseSlug;
  const existing = await prisma.restaurant.findUnique({ where: { slug } });
  if (existing) {
    slug = `${baseSlug}-${Date.now()}`;
  }

  const result = await RestaurantService.register({
    name: restaurantName,
    slug,
    ownerName,
    ownerEmail,
    ownerPassword,
    timezone: "America/Sao_Paulo",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      restaurantSlug: result.data.restaurant.slug,
      ownerEmail: result.data.owner.email,
    },
    { status: 201 }
  );
}
