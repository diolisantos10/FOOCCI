/**
 * PATCH  /api/pedido/[slug]/customer-address/[addressId] — edit an address or set
 *        it as the default. Body: { customerId, ...partial address fields, isDefault? }
 * DELETE /api/pedido/[slug]/customer-address/[addressId] — remove an address.
 *        Body: { customerId }
 *
 * Public "área do cliente" writes. Security (CR C1): editing / deleting / re-defaulting
 * an address requires a PROOF of phone possession (signed waToken, via
 * lib/pedido-identity). The owning customer is resolved from the proven phone; a
 * client-supplied customerId is ignored. AddressService still checks the address
 * belongs to that customer. Rate limited. Reuses the dashboard's AddressService.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { updateAddressSchema } from "@/validators/address";
import { AddressService } from "@/services/customer/AddressService";
import { resolvePedidoIdentity } from "@/lib/pedido-identity";

// customerId tolerated in the body for backward-compat but ignored — see route notes.
// DELETE needs no body now (the customer comes from the proof token), so no schema.
const patchSchema  = updateAddressSchema.extend({ customerId: z.string().optional() });

async function restaurantIdFor(slug: string): Promise<string | null> {
  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  return r?.id ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; addressId: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-address:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug, addressId } = await params;

    const restaurantId = await restaurantIdFor(slug);
    if (!restaurantId) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // Gate: no write without a proven phone.
    const identity = await resolvePedidoIdentity(req, restaurantId);
    if (!identity) return NextResponse.json({ error: "Verificação do telefone necessária" }, { status: 401 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

    const { customerId: _ignored, ...fields } = parsed.data;
    const result = await AddressService.update(restaurantId, identity.customerId, addressId, fields);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 404 });

    return NextResponse.json({ ok: true, address: result.data });
  } catch (err) {
    console.error("[PATCH /api/pedido/[slug]/customer-address/[addressId]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; addressId: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-address:${ip}`, limit: 20, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug, addressId } = await params;

    const restaurantId = await restaurantIdFor(slug);
    if (!restaurantId) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    // Gate: no delete without a proven phone.
    const identity = await resolvePedidoIdentity(req, restaurantId);
    if (!identity) return NextResponse.json({ error: "Verificação do telefone necessária" }, { status: 401 });

    const result = await AddressService.remove(restaurantId, identity.customerId, addressId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/pedido/[slug]/customer-address/[addressId]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
