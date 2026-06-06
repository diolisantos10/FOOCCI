/**
 * POST /api/admin/agents/library/sources — create a new Library source.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Additive, read-only vs. runtime: stores curated formation only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";
import { validateSourceInput } from "@/services/agentLibrary/agentLibraryHelpers";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateSourceInput(body);
  if (!parsed.ok || !parsed.value) {
    return NextResponse.json({ ok: false, error: parsed.errors.join(" ") }, { status: 400 });
  }

  try {
    const source = await AgentLibraryService.createSource(parsed.value);
    return NextResponse.json({ ok: true, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao criar a fonte.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
