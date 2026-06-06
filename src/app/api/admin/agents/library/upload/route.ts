/**
 * POST /api/admin/agents/library/upload — Upload First flow (source-first).
 *
 * Thin wrapper: handles auth + multipart parsing, then delegates the resilient
 * pipeline (validate → create source FIRST → parse → AI) to runUploadFlow, which
 * always returns JSON with a `stage` and survives parsing/AI failures.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Node runtime (pdf-parse). Does NOT touch any agent runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runUploadFlow } from "@/services/agentLibrary/uploadFlow";
import { buildUploadResponse, buildOuterCatchResponse } from "@/services/agentLibrary/agentLibraryHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ADMIN_SECRET) {
      return NextResponse.json(
        buildUploadResponse({ ok: false, stage: "auth", message: "Endpoint desabilitado (ADMIN_SECRET ausente no servidor)." }),
        { status: 403 },
      );
    }
    if (!checkAdminRequest(req)) {
      return NextResponse.json(
        buildUploadResponse({ ok: false, stage: "auth", message: "Sessão admin expirada. Faça login novamente." }),
        { status: 401 },
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        buildUploadResponse({ ok: false, stage: "formData", message: "Envio inválido (esperado multipart/form-data)." }),
        { status: 400 },
      );
    }

    const { status, body } = await runUploadFlow(form);
    return NextResponse.json(body, { status });
  } catch (err) {
    // Defense in depth — runUploadFlow already guards; this never references a local object.
    console.error("[library/upload] route unhandled", err instanceof Error ? err.name : "Error");
    const { status, body } = buildOuterCatchResponse("init", undefined);
    return NextResponse.json(body, { status });
  }
}
