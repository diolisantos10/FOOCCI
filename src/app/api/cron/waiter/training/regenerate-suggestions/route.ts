/**
 * POST /api/cron/waiter/training/regenerate-suggestions
 *
 * Re-runs OLD pending training proposals (PENDING_REVIEW / BACKLOG) through the new
 * Agent Reasoning Layer, fixing stale/wrong classifications (e.g. "Aceita Alelo
 * Refeição?" → INDECISIVE) before they are approved. APPROVED / REJECTED are NEVER
 * touched. Reasons over already-sanitized excerpts (no raw PII). DEFAULTS TO
 * DRY-RUN; a real run requires dryRun=false.
 *
 * Never sends WhatsApp, never creates an order/Pix, never touches the runtime.
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only, never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { regenerateSuggestions } from "@/services/waiterTraining/WaiterTrainingSuggestionRegenerationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/waiter/training/regenerate-suggestions] CRON_SECRET env var is not configured");
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

  const dryRun = body.dryRun !== false; // default DRY-RUN
  const status = Array.isArray(body.status) ? (body.status as string[]) : undefined;
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  const useLLM = body.useLLM === true;

  try {
    const result = await regenerateSuggestions({ dryRun, status, limit, useLLM });
    return NextResponse.json({ ...result, status: "PASS" }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, status: "FAIL", message, runtimeTouched: false }, { status: 200 });
  }
}
