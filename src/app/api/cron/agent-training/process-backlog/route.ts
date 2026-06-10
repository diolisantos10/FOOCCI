/**
 * POST /api/cron/agent-training/process-backlog
 *
 * Continuously processes accumulated WARN/FAIL scenarios that are missing
 * evaluations or improvement proposals. Intended to run every 30 minutes.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * SAFETY:
 *   Creates only evaluations + PENDING_APPROVAL proposals.
 *   Never mutates production. No WhatsApp, no orders, no Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { backfillProposals } from "@/services/agent-training/AgentTrainingImprovementService";

export const maxDuration = 120;

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await backfillProposals({
      agentType:       "WHATSAPP_ORDERING",
      sinceHours:      168, // 7-day window
      maxEvaluations:  15,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/agent-training/process-backlog]", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
