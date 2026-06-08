/**
 * POST /api/admin/quality/run
 *
 * Runs the read-only Quality Control auditors and returns standardized JSON.
 * Always SafeMode (dry-run, no side effects): no DB writes, no WhatsApp, no
 * order/payment, no runtime coupling. The actual logic lives in the pure
 * `handleQualityRun` so this route is a thin auth + parse shell.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Body:
 *   { auditorId?: string }  — when present runs one auditor, otherwise all.
 *
 * On success the run + sanitized findings are persisted to the standalone
 * quality_audit_* tables (no business data). Persistence failure is non-fatal:
 * the audit result is still returned (without a runId).
 *
 * Response:
 *   { ok: true,  mode, result, runId? }    (200)
 *   { ok: false, error, code }             (400 | 401 | 403 | 404)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { handleQualityRun } from "@/services/quality/runRequest";
import { persistRun } from "@/services/quality/persistence/QualityAuditStore";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    // Empty body is valid (runs all).
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const { httpStatus, payload } = await handleQualityRun(body);

  // Persist successful runs (sanitized). Non-fatal on failure.
  if (payload.ok && payload.result) {
    try {
      const auditorId = payload.mode === "one" ? payload.result.auditorIds[0] ?? null : null;
      payload.runId = await persistRun(payload.result, { source: "MANUAL", auditorId });
    } catch (err) {
      console.error("[quality] persist failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json(payload, { status: httpStatus });
}
