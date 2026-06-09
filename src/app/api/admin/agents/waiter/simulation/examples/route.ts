/**
 * GET /api/admin/agents/waiter/simulation/examples?status=PENDING_REVIEW&limit=50
 * Lists sanitized real-conversation examples + stats. Auth: admin only.
 * Never returns raw transcripts (they are stored already-sanitized).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { listExamples, exampleStats, type ExampleReviewStatus } from "@/services/simulation/examples/SimulationExampleStore";

export const dynamic = "force-dynamic";

const VALID = ["PENDING_REVIEW", "APPROVED", "REJECTED", "BACKLOGGED"];

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam && VALID.includes(statusParam) ? (statusParam as ExampleReviewStatus) : undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50") || 50;

  try {
    const [examples, stats] = await Promise.all([listExamples({ status, limit }), exampleStats()]);
    return NextResponse.json({ ok: true, examples, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao listar exemplos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
