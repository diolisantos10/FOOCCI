/**
 * POST /api/cron/whatsapp/text-order-routing-diagnostic
 *
 * READ-ONLY routing check for ONE phone: would a real message from it enter the
 * Text Order engine (and in which mode) or fall back to the receptionist, and
 * why — including allowlist membership, active session, and conversation-level
 * AI blocks (HUMAN/aiLocked). Phone is always masked in the response. Never
 * sends WhatsApp/Evolution, never creates an order/Pix, never changes config.
 *
 * Body: { restaurantSlug?|restaurantId?, phone? } — phone omitted = self-test of
 * the first allowlisted number (validates the real test phone without exposing it).
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { runRoutingDiagnostic } from "@/services/whatsapp/ordering/routingDiagnostic";

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
    const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string; phone?: string };
    const result = await runRoutingDiagnostic({
      restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
      restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, message, runtimeTouched: false }, { status: 200 });
  }
}
