/**
 * GET /api/admin/agents/waiter/simulation/[runId] — run detail with scenarios +
 * opportunities + sanitized transcripts. Auth: admin only. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getRunDetail } from "@/services/simulation/SimulationStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await getRunDetail(params.runId);
    if (!run) return NextResponse.json({ ok: false, error: "Run não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao carregar o run.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
