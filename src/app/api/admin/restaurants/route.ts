/**
 * GET  /api/admin/restaurants — list all restaurants with owner info
 * POST /api/admin/restaurants — create restaurant + owner + defaults
 *
 * Protected by x-admin-secret header (must match ADMIN_SECRET env var).
 * Endpoint is fully disabled if ADMIN_SECRET is not configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRestaurantSchema } from "@/validators/restaurant";
import { RestaurantService } from "@/services/restaurant/RestaurantService";
import { checkAdminRequest } from "@/lib/admin-auth";

function checkAdminSecret(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "This endpoint is disabled. Set ADMIN_SECRET to enable it." },
      { status: 403 }
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authError = checkAdminSecret(req);
  if (authError) return authError;

  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      isActive: true,
      plan: true,
      createdAt: true,
      users: {
        where: { role: "OWNER" },
        select: { id: true, name: true, email: true, isActive: true },
        take: 1,
      },
    },
  });

  const data = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    email: r.email,
    phone: r.phone,
    isActive: r.isActive,
    plan: r.plan,
    createdAt: r.createdAt,
    owner: r.users[0] ?? null,
  }));

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const authError = checkAdminSecret(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createRestaurantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const result = await RestaurantService.register(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(
    {
      restaurant: result.data.restaurant,
      owner: result.data.owner,
    },
    { status: 201 }
  );
}
