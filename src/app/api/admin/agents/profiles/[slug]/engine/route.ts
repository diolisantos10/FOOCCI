/**
 * GET /api/admin/agents/profiles/[slug]/engine — IA-piloto atual do agente.
 *
 * Lê o roteamento governado (brain_engine_routing, escrito só pelo
 * ChangeRequestApplier) para agentId=slug / taskProfile=REASON / escopo global;
 * quando não há linha, cai nas preferências estáticas de código
 * (AGENT_ENGINE_PREFERENCES → default OPENAI). Expõe também quais providers têm
 * chave configurada (apenas nomes — nunca valores). Admin-only, read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  AGENT_ENGINE_PREFERENCES,
  configuredProviders,
} from "@/services/brain/engines/AIEngineRouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const slug = params.slug;
  const taskProfile = "REASON";

  // Roteamento governado (DB) — linha global (businessId null) do agente.
  let dbRow: { provider: string; model: string | null } | null = null;
  try {
    dbRow = await prisma.brainEngineRouting.findFirst({
      where: { businessId: null, agentId: slug, taskProfile, enabled: true },
      select: { provider: true, model: true },
    });
  } catch {
    dbRow = null; // DB indisponível → fallback estático, nunca quebra a ficha.
  }

  const staticProvider = AGENT_ENGINE_PREFERENCES[slug] ?? "OPENAI";
  const routing = dbRow
    ? { provider: dbRow.provider, model: dbRow.model, source: "db" as const, taskProfile }
    : { provider: staticProvider, model: null, source: "code" as const, taskProfile };

  return NextResponse.json({
    ok: true,
    agentId: slug,
    routing,
    configuredProviders: configuredProviders(), // nomes apenas, sem valores
  });
}
