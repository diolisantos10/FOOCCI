/**
 * POST /api/admin/agents/library/sources/[id]/extract — optional AI extraction.
 *
 * Reads the source's pasted text and asks the LLM for a few applicable
 * techniques (syntheses only). Copyright/cost-safe: only a clamped slice is
 * sent. No-op with a clear error when there is no text or no OPENAI_API_KEY.
 * Does NOT touch any runtime.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
  }

  try {
    const result = await AgentLibraryService.extractTechniques(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha na extração.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
