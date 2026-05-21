/**
 * POST /api/settings/store/pause   — enable emergency pause
 * DELETE /api/settings/store/pause — clear pause (resume)
 *
 * OWNER and MANAGER only. STAFF cannot access.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";

const pauseBodySchema = z.object({
  reason:     z.string().max(200).optional(),
  pauseUntil: z.string().datetime().optional().nullable(), // ISO8601 or null for indefinite
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (ctx.role === "STAFF") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw    = await req.json().catch(() => null);
  const parsed = pauseBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { reason, pauseUntil } = parsed.data;

  await prisma.restaurant.update({
    where: { id: ctx.restaurantId },
    data:  {
      isOrderingPaused:     true,
      orderingPausedReason: reason ?? null,
      orderingPausedAt:     new Date(),
      orderingPausedUntil:  pauseUntil ? new Date(pauseUntil) : null,
      orderingPausedBy:     ctx.userId,
    },
  });

  return NextResponse.json({ ok: true, paused: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (ctx.role === "STAFF") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.restaurant.update({
    where: { id: ctx.restaurantId },
    data:  {
      isOrderingPaused:     false,
      orderingPausedReason: null,
      orderingPausedAt:     null,
      orderingPausedUntil:  null,
      orderingPausedBy:     null,
    },
  });

  return NextResponse.json({ ok: true, paused: false });
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: ctx.restaurantId },
    select: {
      isOrderingPaused:     true,
      orderingPausedReason: true,
      orderingPausedAt:     true,
      orderingPausedUntil:  true,
    },
  });

  if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

  // Auto-resume: if pausedUntil has passed, treat as not paused (UI will sync on next load)
  const now = new Date();
  const effectivelyPaused =
    restaurant.isOrderingPaused &&
    (restaurant.orderingPausedUntil === null || restaurant.orderingPausedUntil > now);

  return NextResponse.json({
    paused:      effectivelyPaused,
    reason:      restaurant.orderingPausedReason ?? null,
    pausedAt:    restaurant.orderingPausedAt?.toISOString() ?? null,
    pausedUntil: restaurant.orderingPausedUntil?.toISOString() ?? null,
  });
}
