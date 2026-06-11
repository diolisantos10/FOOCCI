/**
 * POST /api/cron/whatsapp/text-order-full-test-readiness
 *
 * Hermetic FULL_TEST readiness: proves order/Pix only after final confirmation,
 * REPLY_ONLY never creates, FULL_TEST stays allowlist-bound, `0. menu` + handoff
 * intact and rollback documented — with noRealOrder/noRealPix/noEvolution=true
 * and runtimeTouched=false. Auth: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { runFullTestReadiness } from "@/services/whatsapp/ordering/fullTestReadiness";

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
    const result = await runFullTestReadiness();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
