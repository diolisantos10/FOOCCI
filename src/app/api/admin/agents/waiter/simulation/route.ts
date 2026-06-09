/**
 * GET /api/admin/agents/waiter/simulation?limit=20 — last simulation runs.
 * Auth: admin only. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { listRuns } from "@/services/simulation/SimulationStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "20") || 20;
  try {
    const runs = await listRuns("waiter", limit);
    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao listar simulações.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
