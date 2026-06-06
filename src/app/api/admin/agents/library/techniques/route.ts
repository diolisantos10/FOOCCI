/**
 * POST /api/admin/agents/library/techniques — add a technique to a source
 * (manual entry). Body: { sourceId, techniqueName, purpose?, principle?,
 * application?, usageRule?, qualityTest?, goodExample?, badExample?, category? }.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Additive, read-only vs. runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";
import { validateTechniqueInput } from "@/services/agentLibrary/agentLibraryHelpers";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { sourceId?: unknown } & Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "sourceId é obrigatório." }, { status: 400 });
  }

  const parsed = validateTechniqueInput(body);
  if (!parsed.ok || !parsed.value) {
    return NextResponse.json({ ok: false, error: parsed.errors.join(" ") }, { status: 400 });
  }

  try {
    const technique = await AgentLibraryService.createTechnique(sourceId, parsed.value);
    return NextResponse.json({ ok: true, technique });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao criar a técnica.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
