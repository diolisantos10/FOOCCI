/**
 * POST /api/cron/whatsapp/text-order-secure-scope
 *
 * SAFETY-ONLY corrective endpoint. Clamps a restaurant's WhatsApp text-order
 * config toward safety: scope=PHONE_ALLOWLIST, mode<=ALLOWLIST_REPLY_ONLY,
 * preserving the allowlist (optionally appending one team phone). It can NEVER
 * open RESTAURANT_WIDE, enable FULL_TEST, send a WhatsApp message, create an
 * order, or generate a Pix. Returns before/after + a fresh config diagnostic.
 *
 * Body (JSON): { restaurantSlug?: string, restaurantId?: string, addPhone?: string }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { secureScope } from "@/services/whatsapp/ordering/configRemediation";

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
    return NextResponse.json({ ok: false, message: auth.error, runtimeTouched: false }, { status: auth.status });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      restaurantSlug?: string;
      restaurantId?: string;
      addPhone?: string;
    };
    const result = await secureScope({
      restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
      restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      addPhone: typeof body.addPhone === "string" ? body.addPhone : undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, message, runtimeTouched: false }, { status: 200 });
  }
}
