/**
 * GET  /api/admin/agents/waiter/runtime/versions/[id]  → version + frozen techniques
 * POST /api/admin/agents/waiter/runtime/versions/[id]
 *   Body: { action: "assign" | "testing" | "activate" | "rollback", ... }
 *     - assign:   { techniqueIds: string[] }   (DRAFT/TESTING only)
 *     - testing:  {}                            (DRAFT → TESTING)
 *     - activate: { activatedBy? }              (Quality-gated; blocked if P0 > 0)
 *     - rollback: { rolledBackBy?, rollbackToVersionId? }  (fast, gate-free)
 *
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../_guard";
import {
  getVersion,
  assignTechniques,
  markTesting,
  activateVersion,
  rollbackVersion,
} from "@/services/waiterRuntime/WaiterRuntimeVersionService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  try {
    const version = await getVersion(params.id);
    if (!version) return NextResponse.json({ ok: false, error: "Versão não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao carregar versão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const id = params.id;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  try {
    switch (action) {
      case "assign": {
        const ids = Array.isArray(body.techniqueIds) ? body.techniqueIds.filter((x): x is string => typeof x === "string") : [];
        const version = await assignTechniques(id, ids);
        return NextResponse.json({ ok: true, version });
      }
      case "testing": {
        const version = await markTesting(id);
        return NextResponse.json({ ok: true, version });
      }
      case "activate": {
        const result = await activateVersion(id, { activatedBy: typeof body.activatedBy === "string" ? body.activatedBy : null });
        // Quality gate failure → 422 (request understood, but blocked by policy).
        return NextResponse.json(result, { status: result.ok ? 200 : 422 });
      }
      case "rollback": {
        const result = await rollbackVersion(id, {
          rolledBackBy: typeof body.rolledBackBy === "string" ? body.rolledBackBy : null,
          rollbackToVersionId: typeof body.rollbackToVersionId === "string" ? body.rollbackToVersionId : null,
        });
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ ok: false, error: `Ação inválida: "${action}".` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha na ação da versão.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
