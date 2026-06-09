/**
 * POST /api/admin/diagnostics/agent-library/deep-extraction-test
 *
 * End-to-end proof of DEEP chunked extraction: creates a synthetic dense source,
 * runs the real chunk → consolidate pipeline, asserts techniquesCreated > 0 with
 * useful fields, and deletes the temp source. Never touches any agent runtime.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie. Never public.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runDeepExtractionDiagnostic } from "@/services/agentLibrary/deepExtraction/deepExtractionDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, status: "FAIL", message: "Endpoint desabilitado (ADMIN_SECRET ausente).", runtimeTouched: false },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, status: "FAIL", message: "Unauthorized.", runtimeTouched: false }, { status: 401 });
  }

  const result = await runDeepExtractionDiagnostic();
  return NextResponse.json(result, { status: 200 });
}
