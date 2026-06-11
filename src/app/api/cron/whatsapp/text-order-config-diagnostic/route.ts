/**
 * POST /api/cron/whatsapp/text-order-config-diagnostic
 *
 * READ-ONLY readiness check for the controlled WhatsApp text-order test.
 * Reports the resolved per-restaurant config (enabled/mode/paused/allowlist
 * count), official payment options (PaymentSettings), available sample
 * products, optional saved-address availability for a test phone (boolean
 * only — no PII), risk level, canRunReplyOnly / canRunFullTest and the
 * rollback steps. NEVER changes config, NEVER adds to the allowlist,
 * NEVER switches mode, NEVER sends anything.
 *
 * Body (JSON, optional): { restaurantSlug?: string, restaurantId?: string, phone?: string }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { runConfigDiagnostic } from "@/services/whatsapp/ordering/configDiagnostic";

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
    const result = await runConfigDiagnostic({
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
