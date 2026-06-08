/**
 * POST /api/admin/diagnostics/agent-library/auto-extraction-test
 *
 * Automated operational proof that the Waiter Agent Library extracts techniques
 * AUTOMATICALLY on upload (no manual button). Creates a temporary synthetic
 * source, runs the REAL extraction pipeline, validates, and deletes the temp
 * source — leaving nothing behind. Never touches any agent runtime.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie. Never public.
 * Node runtime (the upload flow uses pdf-parse / OpenAI). Only POST.
 *
 * Response: AutoExtractionResult ({ ok, status: PASS|FAIL, techniquesCreated,
 * sourceCleanedUp, runtimeTouched, message, ... }).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runAutoExtractionDiagnostic } from "@/services/agentLibrary/autoExtractionDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, status: "FAIL", message: "Endpoint desabilitado (ADMIN_SECRET ausente no servidor).", runtimeTouched: false },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json(
      { ok: false, status: "FAIL", message: "Unauthorized.", runtimeTouched: false },
      { status: 401 },
    );
  }

  const result = await runAutoExtractionDiagnostic();
  // PASS → 200; controlled FAIL → 200 with status:"FAIL" (the run itself is the result).
  return NextResponse.json(result, { status: 200 });
}
