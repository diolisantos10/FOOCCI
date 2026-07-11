/**
 * POST /api/admin/agents/profiles/seed — popula/atualiza a tabela agentProfile
 * com o registry definido em código (seedDefaultAgentProfiles).
 *
 * Idempotente: upsert por slug — pode rodar quantas vezes quiser (produção
 * inclusive). Escreve DADOS apenas; não liga runtime, não altera config de
 * restaurante. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { seedDefaultAgentProfiles } from "@/services/agents/AgentProfileService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await seedDefaultAgentProfiles();
    return NextResponse.json({ ok: true, ...result, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
