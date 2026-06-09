/**
 * POST /api/cron/agent-library/process
 *
 * Background driver for deep chunked extraction: processes up to N pending
 * chunks (one LLM call each) and consolidates any jobs that finished. Designed
 * to be called repeatedly (cron or manual) so long materials advance over many
 * short invocations — no single request blocks for minutes.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. POST only. Never sends WhatsApp /
 * creates orders / Pix / touches the Waiter runtime.
 *
 * Body (optional): { max?: number } — chunk budget per call (default 5, cap 20).
 * Response: { ok, processed, consolidatedJobs, techniquesCreated, remainingPending }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DeepExtractionService } from "@/services/agentLibrary/deepExtraction/DeepExtractionService";
import { realChunkExtractor } from "@/services/agentLibrary/deepExtraction/realChunkExtractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let max = 5;
  try {
    const text = await req.text();
    const body = text ? (JSON.parse(text) as { max?: unknown }) : {};
    if (typeof body.max === "number") max = Math.min(20, Math.max(1, Math.floor(body.max)));
  } catch {
    /* default budget */
  }

  let processed = 0;
  for (let i = 0; i < max; i++) {
    const r = await DeepExtractionService.processNextPendingChunk(realChunkExtractor);
    if (!r.processed) break;
    processed += 1;
  }

  // Consolidate any jobs that finished processing.
  const ready = await prisma.agentLibraryExtractionJob.findMany({ where: { stage: "CONSOLIDATING" }, select: { id: true } });
  let techniquesCreated = 0;
  for (const j of ready) {
    const c = await DeepExtractionService.consolidateJob(j.id);
    techniquesCreated += c.techniquesCreated;
  }

  const remainingPending = await prisma.agentLibrarySourceChunk.count({ where: { status: "PENDING" } });

  return NextResponse.json({
    ok: true,
    processed,
    consolidatedJobs: ready.length,
    techniquesCreated,
    remainingPending,
  });
}
