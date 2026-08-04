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
      isDemo: true,
      plan: true,
      createdAt: true,
      users: {
        where: { role: "OWNER" },
        select: { id: true, name: true, email: true, isActive: true },
        take: 1,
      },
      // Lightweight onboarding signal fields
      storeProfile: { select: { cep: true, mainPhone: true } },
      deliveryConfig: { select: { enabled: true, pickupEnabled: true } },
      _count: { select: { menuCategories: true } },
      onboardingStatus: { select: { finalTestCompletedAt: true } },
    },
  });

  const data = restaurants.map((r) => {
    // Compute a simple onboarding readiness label for the admin list
    const hasPhone   = !!(r.storeProfile?.mainPhone || r.phone);
    const hasAddress = !!r.storeProfile?.cep;
    const hasMenu    = r._count.menuCategories > 0;
    const testDone   = !!r.onboardingStatus?.finalTestCompletedAt;
    const deliveryOk = !!(r.deliveryConfig?.enabled || r.deliveryConfig?.pickupEnabled);

    let setup: "PENDENTE" | "EM_CONFIGURACAO" | "PRONTO_PARA_TESTE" | "PRONTO_PARA_PILOTO";
    if (testDone) {
      setup = "PRONTO_PARA_PILOTO";
    } else if (hasPhone && hasAddress && hasMenu && deliveryOk) {
      setup = "PRONTO_PARA_TESTE";
    } else if (hasPhone || hasAddress || hasMenu) {
      setup = "EM_CONFIGURACAO";
    } else {
      setup = "PENDENTE";
    }

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      email: r.email,
      phone: r.phone,
      isActive: r.isActive,
      // Vitrine de demonstração (ex.: Foocci Bakery). Vai na resposta para que a
      // lista do admin nunca apresente um restaurante fictício como cliente.
      isDemo: r.isDemo,
      plan: r.plan,
      createdAt: r.createdAt,
      owner: r.users[0] ?? null,
      setup,
    };
  });

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
