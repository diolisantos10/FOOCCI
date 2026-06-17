/**
 * POST /api/cron/whatsapp/text-order-rollback
 *
 * CI-executable EMERGENCY rollback (owner-authorized): same `rollbackTextOrder`
 * service the admin route uses — paused=true + DRY_RUN_ONLY + PHONE_ALLOWLIST.
 * Keeps allowlist/config/history; the receptionist keeps answering. Config-only.
 *
 * Body: { restaurantSlug?|restaurantId?, confirm: "ROLLBACK_WHATSAPP_TEXT_ORDER" }
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only.
 */

import { NextRequest, NextResponse } from "next/server";
import { rollbackTextOrder } from "@/services/whatsapp/ordering/productionGovernance";

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
    return NextResponse.json({ success: false, error: auth.error, runtimeTouched: false }, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string; confirm?: string };
  const result = await rollbackTextOrder({
    restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    confirm: typeof body.confirm === "string" ? body.confirm : "",
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
