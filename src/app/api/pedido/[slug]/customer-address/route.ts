/**
 * POST /api/pedido/[slug]/customer-address
 *
 * Public "área do cliente" endpoint: the identified customer adds a new delivery
 * address to their own profile from the ordering page. Body:
 *   { customerId, label?, street, number, complement?, neighborhood, city, state, zipCode, isDefault? }
 *
 * Security (CR C1): writing to a customer's address book requires a PROOF of phone
 * possession (signed waToken, via lib/pedido-identity). The target customer is
 * resolved from the proven phone — a client-supplied customerId is accepted in the
 * body for backward-compat but IGNORED (never used to pick whose addresses to touch),
 * closing the old hole where anyone with a customerId could add/edit/delete a
 * stranger's addresses. Rate limited. Reuses the dashboard's AddressService.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { createAddressSchema } from "@/validators/address";
import { AddressService } from "@/services/customer/AddressService";
import { resolvePedidoIdentity } from "@/lib/pedido-identity";

// customerId is tolerated in the body (the client still sends it) but ignored — the
// authoritative customer comes from the proof token, never from the request body.
const bodySchema = createAddressSchema.extend({ customerId: z.string().optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-address:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!restaurant) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // Gate: no write without a proven phone.
    const identity = await resolvePedidoIdentity(req, restaurant.id);
    if (!identity) return NextResponse.json({ error: "Verificação do telefone necessária" }, { status: 401 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Endereço inválido", details: parsed.error.flatten() }, { status: 400 });

    const { customerId: _ignored, ...address } = parsed.data;
    const result = await AddressService.create(restaurant.id, identity.customerId, address);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });

    return NextResponse.json({ ok: true, address: result.data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]/customer-address]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
