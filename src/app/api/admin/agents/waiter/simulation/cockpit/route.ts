/**
 * GET /api/admin/agents/waiter/simulation/cockpit
 * One consolidated payload for the Simulador tab: automation status, last
 * cron/manual run, next-run estimate, pending opportunities queue, latest
 * simulated transcripts, real-example stats, and the safety summary.
 *
 * Auth: admin only. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getSimulationCockpit } from "@/services/simulation/cockpitModel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cockpit = await getSimulationCockpit("waiter");
    return NextResponse.json({ ok: true, cockpit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao carregar o cockpit.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
