/**
 * GET   /api/admin/agents/profiles/[slug] — Ficha Técnica (admin view, DB-aware)
 * PATCH /api/admin/agents/profiles/[slug] — edita a Ficha Técnica (upsert em agentProfile)
 *
 * Admin-only (mesmo guard das rotas do Brain). O PATCH aceita apenas os campos
 * editáveis da ficha (agentProfilePatchSchema) — safetyRules, promptInstructions
 * e governança/lifecycle ficam fora. Nunca toca runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  getAdminAgentProfile,
  updateAgentProfile,
} from "@/services/agents/AgentProfileService";
import { agentProfilePatchSchema } from "@/validators/agent-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const profile = await getAdminAgentProfile(params.slug);
    if (!profile) {
      return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { updatedBy, ...rest } = body;

    const parsed = agentProfilePatchSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: `Payload inválido: ${parsed.error.issues[0]?.message ?? "campos incorretos"}` },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para salvar." }, { status: 400 });
    }

    const profile = await updateAgentProfile(
      params.slug,
      parsed.data,
      typeof updatedBy === "string" ? updatedBy : undefined,
    );
    if (!profile) {
      return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, profile, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
