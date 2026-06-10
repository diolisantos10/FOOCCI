/**
 * POST /api/cron/waiter/training/intake-real-conversations
 *
 * Cron-safe "Coleta automática de casos reais": reads recent REAL conversations
 * READ-ONLY, sanitizes PII BEFORE persisting (raw transcript never stored),
 * classifies the situation and creates training cases as PENDING_REVIEW in the
 * Waiter Training Center. Idempotent by conversation id — safe to re-run.
 *
 * Never mutates a conversation, never sends WhatsApp, never creates an order,
 * never generates Pix, never touches the real runtime.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { intakeRealConversations } from "@/services/simulation/examples/realConversationIntake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/waiter/training/intake-real-conversations] CRON_SECRET env var is not configured");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, status: "FAIL", message: auth.error, runtimeTouched: false }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body → defaults */ }

  const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 200) : undefined;
  const days = typeof body.days === "number" ? Math.min(Math.max(body.days, 1), 30) : undefined;
  const restaurantId = typeof body.restaurantId === "string" && body.restaurantId.trim() ? body.restaurantId.trim() : undefined;

  try {
    const result = await intakeRealConversations({ limit, days, restaurantId });
    return NextResponse.json({ ...result, ok: true, status: "PASS" }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
