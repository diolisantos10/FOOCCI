/**
 * A rota da CASA do Agente de CRM (/admin/agentes/crm).
 *
 * GET  /api/admin/crm/agent/pilot?restaurantId=…
 *   → config do piloto (degrau, pausado, telefones, desde quando) + últimas
 *     decisões (sombra + envio real). O relatório A/B/gates continua vindo do
 *     endpoint irmão /pilot-status — esta rota não o duplica.
 *
 * POST /api/admin/crm/agent/pilot — transições governadas da escada:
 *   { action: "promote-allowlist", restaurantId, phones[], confirm, abTestPercent? }
 *   { action: "promote-wide", restaurantId, confirm, acknowledgeRealCustomers }
 *   { action: "rollback", restaurantId, confirm }
 *
 * Rota FINA de propósito: toda a lógica de governança (confirm exato, gates,
 * escada que não pula degrau) mora em crmAgentGovernance — aqui só se despacha.
 * Config-only: nenhuma mensagem é enviada por esta rota (runtimeTouched: false).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getCrmPilotConfig } from "@/services/crm/CrmAgentPilotService";
import { lerDecisoesRecentes } from "@/services/crm/CrmPilotObservability";
import {
  promoteCrmAgentToAllowlist,
  promoteCrmAgentToWide,
  rollbackCrmAgent,
} from "@/services/crm/crmAgentGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId");
    if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

    const [config, decisoes, row] = await Promise.all([
      getCrmPilotConfig(restaurantId),
      lerDecisoesRecentes(restaurantId),
      // Só para o "desde quando": timestamp da última escrita de config.
      prisma.crmAgentPilotConfig
        .findUnique({ where: { restaurantId }, select: { updatedAt: true, createdAt: true } })
        .catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      config,
      // null = nunca houve config escrita → SHADOW_ONLY desde sempre (default seguro).
      configDesde: row?.updatedAt ?? null,
      decisoes,
      runtimeTouched: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      restaurantId?: string;
      phones?: string[];
      confirm?: string;
      acknowledgeRealCustomers?: boolean;
      abTestPercent?: number;
    };
    if (!body.restaurantId || !body.action) {
      return NextResponse.json({ ok: false, error: "action e restaurantId são obrigatórios." }, { status: 400 });
    }

    if (body.action === "promote-allowlist") {
      const result = await promoteCrmAgentToAllowlist({
        restaurantId: body.restaurantId,
        phones: Array.isArray(body.phones) ? body.phones : [],
        confirm: body.confirm ?? "",
        ...(typeof body.abTestPercent === "number" ? { abTestPercent: body.abTestPercent } : {}),
      });
      return NextResponse.json({ ok: result.success, result });
    }
    if (body.action === "promote-wide") {
      const result = await promoteCrmAgentToWide({
        restaurantId: body.restaurantId,
        confirm: body.confirm ?? "",
        acknowledgeRealCustomers: body.acknowledgeRealCustomers,
      });
      return NextResponse.json({ ok: result.success, result });
    }
    if (body.action === "rollback") {
      const result = await rollbackCrmAgent({ restaurantId: body.restaurantId, confirm: body.confirm ?? "" });
      return NextResponse.json({ ok: result.success, result });
    }
    return NextResponse.json({ ok: false, error: `action desconhecida: ${body.action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
