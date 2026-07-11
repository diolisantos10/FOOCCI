/**
 * PATCH  /api/pedido/[slug]/customer-address/[addressId] — edit an address or set
 *        it as the default. Body: { customerId, ...partial address fields, isDefault? }
 * DELETE /api/pedido/[slug]/customer-address/[addressId] — remove an address.
 *        Body: { customerId }
 *
 * Public "área do cliente" writes. Same security model as the other /api/pedido
 * endpoints: slug → restaurant, and AddressService checks the customer AND the
 * address belong to it. Rate limited. Reuses the dashboard's AddressService.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { updateAddressSchema } from "@/validators/address";
import { AddressService } from "@/services/customer/AddressService";

const patchSchema  = updateAddressSchema.extend({ customerId: z.string().min(1) });
const deleteSchema = z.object({ customerId: z.string().min(1) });

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
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

    const restaurantId = await restaurantIdFor(slug);
    if (!restaurantId) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    const { customerId, ...fields } = parsed.data;
    const result = await AddressService.update(restaurantId, customerId, addressId, fields);
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
    const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "customerId obrigatório" }, { status: 400 });

    const restaurantId = await restaurantIdFor(slug);
    if (!restaurantId) return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });

    const result = await AddressService.remove(restaurantId, parsed.data.customerId, addressId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/pedido/[slug]/customer-address/[addressId]]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
