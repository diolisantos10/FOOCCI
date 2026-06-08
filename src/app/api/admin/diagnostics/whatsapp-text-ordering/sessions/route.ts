/**
 * GET /api/admin/diagnostics/whatsapp-text-ordering/sessions
 *
 * Lists active (or recent) WhatsApp Text Ordering sessions for a restaurant.
 * Admin-only. Read-only — no mutations.
 *
 * Query:
 *   restaurantSlug  string  required
 *   phone           string  optional — filter to one phone
 *   status          string  optional — filter by status (default: active only)
 *   limit           number  optional — max rows (default 20, max 100)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { maskPhone } from "@/lib/wa-text-ordering-flag";

const ACTIVE_STATUSES = ["ACTIVE", "AWAITING_CUSTOMER", "READY_TO_CONFIRM", "AWAITING_PAYMENT"];

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const slugOrId     = sp.get("restaurantSlug") ?? sp.get("restaurantId");
  const rawPhone     = sp.get("phone") ?? undefined;
  const statusFilter = sp.get("status") ?? "active";
  const limit        = Math.min(Math.max(parseInt(sp.get("limit") ?? "20", 10), 1), 100);

  if (!slugOrId) {
    return NextResponse.json({ error: "restaurantSlug é obrigatório." }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where:  { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: `Restaurante não encontrado: "${slugOrId}"` }, { status: 404 });
  }

  const statusWhere = statusFilter === "active"
    ? { in: ACTIVE_STATUSES }
    : statusFilter === "all"
      ? undefined
      : { equals: statusFilter };

  const rows = await prisma.whatsAppOrderingSession.findMany({
    where: {
      restaurantId: restaurant.id,
      ...(rawPhone ? { phone: rawPhone } : {}),
      ...(statusWhere ? { status: statusWhere } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: {
      id:             true,
      phone:          true,
      status:         true,
      stage:          true,
      mode:           true,
      deliveryType:   true,
      paymentMethod:  true,
      paymentStatus:  true,
      orderId:        true,
      expiresAt:      true,
      lastMessageAt:  true,
      createdAt:      true,
      selectedItems:  true,
    },
  });

  const sessions = rows.map(r => ({
    id:            r.id,
    phoneMasked:   maskPhone(r.phone),
    status:        r.status,
    stage:         r.stage,
    mode:          r.mode,
    deliveryType:  r.deliveryType,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    orderId:       r.orderId,
    itemCount:     Array.isArray(r.selectedItems) ? (r.selectedItems as unknown[]).length : 0,
    expiresAt:     r.expiresAt?.toISOString() ?? null,
    lastMessageAt: r.lastMessageAt.toISOString(),
    createdAt:     r.createdAt.toISOString(),
  }));

  return NextResponse.json({
    restaurant,
    filter:   { status: statusFilter, phone: rawPhone ? maskPhone(rawPhone) : null, limit },
    count:    sessions.length,
    sessions,
  });
}

/** POST: expire stale sessions for this restaurant immediately. */
export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const slugOrId = (body as Record<string, string>).restaurantSlug
    ?? (body as Record<string, string>).restaurantId;

  const { WhatsAppOrderingSessionService } = await import(
    "@/services/whatsapp/ordering/WhatsAppOrderingSessionService"
  );

  const count = await WhatsAppOrderingSessionService.expireOldSessions(
    slugOrId ? (await prisma.restaurant.findFirst({
      where:  { OR: [{ slug: slugOrId }, { id: slugOrId }] },
      select: { id: true },
    }))?.id : undefined,
  );

  return NextResponse.json({ ok: true, expired: count });
}
