/**
 * POST /api/cron/whatsapp/master-simulator
 *
 * Scheduled hermetic validation of the full WhatsApp feature set. Runs the
 * WhatsApp Master Simulator: MENU rendering, RECEPTIONIST guard rules, text
 * ordering flow, Pix safety, delivery, handoff, and known-regression cases.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 * Zero side effects: no WhatsApp send, no real order, no real Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { runMasterSimulator } from "@/services/whatsapp/master/WhatsAppMasterSimulatorService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(
  req: NextRequest,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`)
    return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, status: "FAIL", message: auth.error, runtimeTouched: false },
      { status: auth.status },
    );
  }
  try {
    const report = await runMasterSimulator();
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido";
    return NextResponse.json(
      { ok: false, status: "FAIL", message, runtimeTouched: false },
      { status: 200 },
    );
  }
}
