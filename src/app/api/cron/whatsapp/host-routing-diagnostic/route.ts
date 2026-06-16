/**
 * POST /api/cron/whatsapp/host-routing-diagnostic
 *
 * READ-ONLY: for ONE phone + message, answers WHICH host would reply (Text
 * Order / Receptionist / human-blocked / ignored), WHY, and — when the
 * Receptionist is the host — previews and classifies the reply
 * (SAFE_MENU / LINK_CARDAPIO / HANDOFF / LOCATION / UNKNOWN). Phone is always
 * masked. Never sends WhatsApp/Evolution, never creates an order/Pix, never
 * changes config. Auth: Authorization: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { runHostRoutingDiagnostic } from "@/services/whatsapp/ordering/hostRoutingDiagnostic";

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
      restaurantSlug?: string; restaurantId?: string; phone?: string; message?: string;
    };
    const result = await runHostRoutingDiagnostic({
      restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
      restaurantId:   typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      phone:          typeof body.phone === "string" ? body.phone : "",
      message:        typeof body.message === "string" ? body.message : "",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, message, runtimeTouched: false }, { status: 200 });
  }
}
