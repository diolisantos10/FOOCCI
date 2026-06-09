/**
 * POST /api/admin/agents/waiter/runtime/techniques/[id]
 * Body: { action: "activate" | "enable" | "disable" | "priority" | "reject" | "archive", ... }
 *
 * Curates a single technique toward (or away from) runtime use. Activation and
 * enabling are deliberately two steps — extraction never auto-enables anything.
 *
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../_guard";
import {
  activateTechnique,
  setRuntimeEnabled,
  setPriority,
  rejectTechnique,
  archiveTechnique,
} from "@/services/waiterRuntime/TechniqueCurationService";

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
    let technique;
    switch (action) {
      case "activate":
        technique = await activateTechnique(id, typeof body.approvedBy === "string" ? body.approvedBy : null);
        break;
      case "enable":
        technique = await setRuntimeEnabled(id, true);
        break;
      case "disable":
        technique = await setRuntimeEnabled(id, false);
        break;
      case "priority":
        technique = await setPriority(id, typeof body.priority === "number" ? body.priority : 0);
        break;
      case "reject":
        technique = await rejectTechnique(id, typeof body.reason === "string" ? body.reason : null);
        break;
      case "archive":
        technique = await archiveTechnique(id);
        break;
      default:
        return NextResponse.json({ ok: false, error: `Ação inválida: "${action}".` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, technique });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao curar técnica.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
