/**
 * POST /api/cron/whatsapp/text-order-diagnostic
 *
 * Cron-safe, hermetic check of the WhatsApp "anotador de pedido" flow: synthetic
 * catalog + pure state machine + Brain adapter. Proves ORDER_BY_TEXT detection,
 * item extraction, numbered ambiguity options, `0. menu` footer, no invented
 * product/price, and ZERO side effects (no real order, no WhatsApp send, no Pix,
 * runtimeTouched=false). Never reads/writes the DB.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runWhatsAppTextOrderDiagnostic } from "@/services/whatsapp/brain/WhatsAppTextOrderDiagnostic";

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
    const result = await runWhatsAppTextOrderDiagnostic();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
