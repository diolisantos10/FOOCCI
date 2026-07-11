/**
 * POST /api/pedido/[slug]/customer-address
 *
 * Public "área do cliente" endpoint: the identified customer adds a new delivery
 * address to their own profile from the ordering page. Body:
 *   { customerId, label?, street, number, complement?, neighborhood, city, state, zipCode, isDefault? }
 *
 * Security: same model as the rest of /api/pedido — the slug resolves the
 * restaurant, and AddressService verifies the customerId belongs to it (no
 * cross-tenant writes). Rate limited. Reuses the exact validation + service the
 * authenticated dashboard uses, so behavior stays identical.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { createAddressSchema } from "@/validators/address";
import { AddressService } from "@/services/customer/AddressService";

const bodySchema = createAddressSchema.extend({ customerId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-address:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Endereço inválido", details: parsed.error.flatten() }, { status: 400 });

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    const { customerId, ...address } = parsed.data;
    const result = await AddressService.create(restaurant.id, customerId, address);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });

    return NextResponse.json({ ok: true, address: result.data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]/customer-address]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
