/**
 * POST /api/admin/training/backfill-proposals
 *
 * Processes accumulated WARN/FAIL scenarios that never got evaluations or
 * proposals (e.g., runs executed before the auto-pipeline was deployed).
 *
 * Behavior:
 *   1. Find recent WARN/FAIL scenarios (default: last 7 days)
 *   2. Evaluate the ones missing evaluations (capped at 15/call)
 *   3. Group still-failing scenarios by category
 *   4. Create one grouped proposal per uncovered category
 *   5. Return full summary with skip reasons
 *
 * Auth: admin session
 * Safety: creates only evaluations + PENDING_APPROVAL proposals.
 * Never mutates production. No WhatsApp, no orders, no Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { backfillProposals } from "@/services/agent-training/AgentTrainingImprovementService";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sinceHours = Math.min(Math.max(parseInt(body.sinceHours ?? "168", 10) || 168, 1), 720);

  try {
    const summary = await backfillProposals({
      agentType:  "WHATSAPP_ORDERING",
      sinceHours,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/training/backfill-proposals]", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
