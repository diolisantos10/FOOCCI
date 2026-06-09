/**
 * GET /api/admin/agents/waiter/runtime/techniques
 *   ?agentSlug=waiter&onlyRuntimeEnabled=true&status=ACTIVE
 * Lists Library techniques with curation/runtime fields for the cockpit.
 *
 * Auth: admin only. Read-only. Does not touch any runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
import { listTechniques } from "@/services/waiterRuntime/TechniqueCurationService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const agentSlug = url.searchParams.get("agentSlug") ?? "waiter";
  const onlyRuntimeEnabled = url.searchParams.get("onlyRuntimeEnabled") === "true";
  const statusParam = url.searchParams.get("status") ?? undefined;
  const VALID = ["EXTRACTED", "IN_REVIEW", "ACTIVE", "ARCHIVED", "REJECTED"] as const;
  const status = VALID.includes(statusParam as (typeof VALID)[number]) ? (statusParam as (typeof VALID)[number]) : undefined;

  try {
    const techniques = await listTechniques({ agentSlug, onlyRuntimeEnabled, status });
    return NextResponse.json({ ok: true, techniques });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao listar técnicas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
