/**
 * POST /api/cron/whatsapp/text-order-readiness
 *
 * READ-ONLY production-readiness checklist for the WhatsApp text-order agent:
 * composes the live CONFIG diagnostic with the hermetic FLOW diagnostic into
 * replyOnlyReady / fullTestReady / restaurantWideReady + blockers / warnings /
 * requiredNextActions. Never writes, sends, creates an order or generates a Pix.
 *
 * Body (JSON, optional): { restaurantSlug?: string, restaurantId?: string, phone?: string }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runReadinessDiagnostic } from "@/services/whatsapp/ordering/readinessDiagnostic";

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
      phone?: string;
    };
    const result = await runReadinessDiagnostic({
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
