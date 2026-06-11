/**
 * POST /api/cron/instagram/channel-diagnostic
 *
 * Hermetic check of the Instagram Direct foundation: parser, signature gate,
 * mode gates, dry-run send, and (when restaurantId/slug is given) a synthetic
 * inbound round-trip that is CLEANED UP. Proves noRealInstagramSend=true and
 * runtimeTouched=false. Never sends a real Direct, never creates order/Pix.
 *
 * Body (JSON, optional): { restaurantSlug?: string, restaurantId?: string }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runInstagramChannelDiagnostic } from "@/services/instagram/InstagramChannelDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, status: "FAIL", message: auth.error, runtimeTouched: false }, { status: auth.status });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string };
    let restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : undefined;
    if (!restaurantId && typeof body.restaurantSlug === "string") {
      const r = await prisma.restaurant.findFirst({ where: { slug: body.restaurantSlug }, select: { id: true } }).catch(() => null);
      restaurantId = r?.id;
    }
    const result = await runInstagramChannelDiagnostic(restaurantId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
