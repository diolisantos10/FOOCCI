/**
 * POST /api/cron/whatsapp/brain-diagnostic
 *
 * Cron-safe, hermetic check of the WhatsApp Brain Adapter: runs the 6 canonical
 * synthetic cases (Alelo / order / hours / attendant / delivery / complaint) and
 * proves noSend / noEvolution / noOrder / noPix / runtimeTouched=false. Reads
 * nothing, sends nothing, never touches the runtime.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runWhatsAppBrainDiagnostic } from "@/services/whatsapp/brain/WhatsAppBrainDiagnostic";

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
    const result = runWhatsAppBrainDiagnostic();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
