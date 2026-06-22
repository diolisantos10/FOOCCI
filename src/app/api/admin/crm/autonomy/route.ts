/**
 * Admin CRM Autonomy control panel API (cross-tenant, ADMIN_SECRET-gated).
 *
 *   GET  /api/admin/crm/autonomy
 *        → every restaurant with mode, resolved guardrails, latest plan status.
 *   PUT  /api/admin/crm/autonomy   { restaurantId, mode?, config? }
 *        → update a restaurant's autonomy mode and/or guardrails.
 *   POST /api/admin/crm/autonomy   { restaurantId, action: "generate", force? }
 *        → generate this week's plan for one restaurant now (operator trigger).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { CrmWeeklyPlanService } from "@/services/crm/weeklyPlan/CrmWeeklyPlanService";
import { CrmWeeklyPlannerService } from "@/services/crm/weeklyPlan/CrmWeeklyPlannerService";

export const dynamic = "force-dynamic";

function guard(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const restaurants = await CrmWeeklyPlanService.listAutonomyOverview();
    return NextResponse.json({ ok: true, restaurants });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao carregar.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const restaurantId = body.restaurantId as string | undefined;
    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
    }
    const mode = body.mode;
    if (mode !== undefined && mode !== "COPILOT" && mode !== "AUTOPILOT") {
      return NextResponse.json({ ok: false, error: "mode inválido." }, { status: 400 });
    }
    const result = await CrmWeeklyPlanService.setAutonomy(restaurantId, {
      mode: mode as "COPILOT" | "AUTOPILOT" | undefined,
      config: body.config as Record<string, unknown> | undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao salvar.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const restaurantId = body.restaurantId as string | undefined;
    if (!restaurantId) {
      return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
    }
    if (body.action !== "generate") {
      return NextResponse.json({ ok: false, error: "action inválida." }, { status: 400 });
    }
    const result = await CrmWeeklyPlannerService.generateForRestaurant(restaurantId, {
      force: body.force === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar plano.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
