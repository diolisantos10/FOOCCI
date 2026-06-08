/**
 * POST /api/cron/quality/run
 *
 * Daily automated Quality Control audit (read-only). Runs every auditor in
 * SafeMode (dry-run, no side effects) and persists the result as source="CRON"
 * so the /admin/quality dashboard shows a fresh audit every morning.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  (same secret as the other crons).
 * Only POST is accepted — there is no GET handler.
 *
 * Response:
 *   { ok, runId, globalStatus, counts: { bySeverity, byStatus }, durationMs, findingsCount }
 *
 * Never sends WhatsApp, creates an order, generates Pix, calls Mercado Pago or
 * touches runtime — it only runs the deterministic auditors against synthetic
 * fixtures and writes to the standalone quality_audit_* tables.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAll } from "@/services/quality/QualityControlService";
import { persistRun } from "@/services/quality/persistence/QualityAuditStore";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/quality/run] CRON_SECRET env var is not configured — audit will not run");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Run every auditor in SafeMode (enforced inside the engine).
  const result = await runAll();

  // Persist as a CRON run. A persistence failure is reported clearly (500).
  let runId: string;
  try {
    runId = await persistRun(result, { source: "CRON", triggeredBy: "cron" });
  } catch (err) {
    console.error("[cron/quality/run] persist failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Audit ran but persistence failed", globalStatus: result.globalStatus },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    runId,
    globalStatus: result.globalStatus,
    counts: { bySeverity: result.countsBySeverity, byStatus: result.countsByStatus },
    durationMs: Math.max(0, result.finishedAt.getTime() - result.startedAt.getTime()),
    findingsCount: result.findings.length,
  });
}
