/**
 * GET  /api/admin/agents/library/sources?agentSlug=waiter
 *        → { ok, stats, sources } for the embedded per-agent Library panel.
 * POST /api/admin/agents/library/sources — create a new Library source (JSON).
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Additive, read-only vs. runtime: stores curated formation only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";
import { validateSourceInput, isValidLibraryAgent, isMissingTableError } from "@/services/agentLibrary/agentLibraryHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const agentSlug = req.nextUrl.searchParams.get("agentSlug")?.trim() ?? "";
  if (!isValidLibraryAgent(agentSlug)) {
    return NextResponse.json({ ok: false, error: "Agente inválido." }, { status: 400 });
  }

  try {
    const [stats, list] = await Promise.all([
      AgentLibraryService.getStats(agentSlug),
      AgentLibraryService.listSources(agentSlug),
    ]);
    const sources = list.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      sourceType: r.sourceType,
      category: r.category,
      status: r.status,
      extractionStatus: r.extractionStatus,
      techniqueCount: r._count.techniques,
      createdAt: r.createdAt.toISOString(),
    }));
    return NextResponse.json({ ok: true, stats, sources });
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json(
        { ok: false, dbError: true, error: "Migration da Agent Library ainda não aplicada. Rode prisma migrate deploy." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Falha ao carregar a Library." }, { status: 500 });
  }
}

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
