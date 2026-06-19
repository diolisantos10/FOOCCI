/**
 * POST /api/cron/whatsapp/live-learning-review
 *
 * Daily (and on-demand) routine that reads recent REAL WhatsApp conversations,
 * classifies each outcome, extracts learning cards, deduplicates them, and queues
 * DISTINCT learnings for HUMAN approval. NEVER sends WhatsApp, NEVER creates an
 * order/Pix, NEVER changes the live agent. PII is masked. `dryRun=true` analyzes
 * but persists nothing. Auth: Bearer {CRON_SECRET}. POST only.
 *
 * Body: { restaurantSlug?, restaurantId?, windowHours?=24, dryRun?=false }
 */

import { NextRequest, NextResponse } from "next/server";
import { runLiveLearningReview } from "@/services/whatsapp/learning/liveLearningReview";

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
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      restaurantSlug?: string; restaurantId?: string; windowHours?: number; dryRun?: boolean;
    };
    const result = await runLiveLearningReview({
      restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
      restaurantId:   typeof body.restaurantId === "string" ? body.restaurantId : undefined,
      windowHours:    typeof body.windowHours === "number" ? body.windowHours : undefined,
      dryRun:         body.dryRun === true,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, message }, { status: 200 });
  }
}
