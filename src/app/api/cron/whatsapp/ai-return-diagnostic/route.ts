/**
 * POST /api/cron/whatsapp/ai-return-diagnostic
 *
 * Cron-safe, READ-ONLY diagnosis of HUMAN-mode conversations: how many would be
 * eligible to return to the AI under WhatsAppAiReturnPolicy, and why the others
 * are blocked (lock / recent human / critical handoff). Changes NOTHING — no
 * aiEnabled flip, no message, no runtime mutation.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { diagnoseAiReturn } from "@/services/whatsapp/brain/WhatsAppAiReturnDiagnostic";

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
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const restaurantId = typeof body.restaurantId === "string" && body.restaurantId.trim() ? body.restaurantId.trim() : undefined;
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  try {
    const result = await diagnoseAiReturn({ restaurantId, limit });
    return NextResponse.json({ ...result, status: "PASS" }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
