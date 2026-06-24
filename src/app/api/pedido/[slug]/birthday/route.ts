/**
 * GET  /api/pedido/[slug]/birthday?customerId=...  → { needsBirthday: boolean }
 * POST /api/pedido/[slug]/birthday  { customerId, day, month, year? } → { ok: true }
 *
 * Public, phone-first ordering flow companion: lets an ALREADY-IDENTIFIED customer
 * (recognised by phone) who has no birthday on file add it, so the CRM can send a
 * birthday "mimo". The CRM birthday automation matches on month+day only, so the year
 * is optional (stored at a neutral year, noon UTC, so getMonth()/getDate() are stable).
 *
 * Safety: scoped to the restaurant from the slug; never overwrites an existing
 * birthDate (a customer can set it once, can't change anyone's); skips guests.
 * No auth (same model as the other public /pedido endpoints); rate-limited.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

async function resolveRestaurantId(slug: string): Promise<string | null> {
  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  return r?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-bday-get:${ip}`, limit: 40, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;
    const customerId = req.nextUrl.searchParams.get("customerId")?.trim();
    if (!customerId) return NextResponse.json({ needsBirthday: false });

    const restaurantId = await resolveRestaurantId(slug);
    if (!restaurantId) return NextResponse.json({ needsBirthday: false });

    const customer = await prisma.customer.findFirst({
      where:  { id: customerId, restaurantId, isActive: true, isGuest: false },
      select: { birthDate: true },
    });
    // Only ask identified, non-guest customers who don't have a birthday yet.
    return NextResponse.json({ needsBirthday: !!customer && customer.birthDate === null });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]/birthday]", err);
    return NextResponse.json({ needsBirthday: false });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-bday-set:${ip}`, limit: 10, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId ?? "").trim();
    const day   = Number(body.day);
    const month = Number(body.month);
    const year  = body.year != null ? Number(body.year) : 2000;

    if (!customerId) return NextResponse.json({ error: "Cliente não informado." }, { status: 400 });
    if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > 31 || month < 1 || month > 12) {
      return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    }
    const safeYear = Number.isInteger(year) && year >= 1900 && year <= 2025 ? year : 2000;
    // Noon UTC keeps getMonth()/getDate() stable across server timezones.
    const birthDate = new Date(Date.UTC(safeYear, month - 1, day, 12, 0, 0));
    // Reject impossible dates (e.g. 31/02 rolled over to March).
    if (birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCDate() !== day) {
      return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    }

    const restaurantId = await resolveRestaurantId(slug);
    if (!restaurantId) return NextResponse.json({ error: "Restaurante não encontrado." }, { status: 404 });

    // Only set when currently empty — never overwrite an existing birthday.
    const result = await prisma.customer.updateMany({
      where: { id: customerId, restaurantId, isActive: true, isGuest: false, birthDate: null },
      data:  { birthDate },
    });

    return NextResponse.json({ ok: result.count > 0 });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]/birthday]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
