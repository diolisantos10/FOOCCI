/**
 * GET /api/billing/slug-check?slug=... — o endereço da loja está livre?
 *
 * Só existe para o cliente descobrir a colisão ENQUANTO digita, e não depois de
 * pagar. Não é a trava: a trava é a checagem no POST de checkout e o UNIQUE do
 * banco. Aqui é conveniência — e por isso responde apenas "livre / ocupado",
 * nunca o nome de quem ocupou.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { validateSlugShape } from "@/lib/billing/checkout-slug";

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `slug-check:${ip}`, limit: 60, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim().toLowerCase();
  const shape = validateSlugShape(slug);
  if (!shape.ok) return NextResponse.json({ ok: true, available: false, reason: shape.error });

  const taken = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  return NextResponse.json({
    ok: true,
    available: !taken,
    reason: taken ? "Esse endereço já está em uso." : null,
  });
}
