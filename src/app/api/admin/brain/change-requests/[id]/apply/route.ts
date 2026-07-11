/**
 * POST /api/admin/brain/change-requests/[id]/apply — aplica um change request
 * APPROVED via ChangeRequestApplier (config-only, quality gate obrigatório no
 * apply quando exigido). O corpo precisa de { appliedBy } — um HUMANO
 * identificado; vazio é recusado aqui e agent/system/bot/ai no applier.
 *
 * Nunca toca o runtime: só escreve config governada (engine routing /
 * free-form) e registra a trilha via markApplied. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { applyChangeRequest } from "@/services/brain/director/ChangeRequestApplier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as { appliedBy?: string };
    const appliedBy = typeof body.appliedBy === "string" ? body.appliedBy.trim() : "";
    if (!appliedBy) {
      return NextResponse.json({ ok: false, error: "appliedBy é obrigatório — informe o nome de quem aplica." }, { status: 400 });
    }
    const result = await applyChangeRequest({ id: params.id, appliedBy });
    return NextResponse.json({ ok: result.success, result, error: result.error, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
