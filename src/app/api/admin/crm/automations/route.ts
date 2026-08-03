/**
 * Automações de CRM pelo olhar do admin (a casa do Agente de CRM).
 *
 * GET   ?restaurantId=..                          → lista as automações do restaurante
 * PATCH { restaurantId, trigger, isEnabled }      → liga/desliga uma automação
 *
 * Rota FINA: chama o MESMO CRMService da rota tenant (/api/crm/automations).
 * Existe porque a rota tenant mora atrás do middleware de NextAuth e o cookie
 * de admin não chega lá — sem esta porta, a casa do agente não teria como
 * mostrar nem operar os disparos automáticos.
 */

import { NextRequest, NextResponse } from "next/server";
import type { AutomationTrigger } from "@prisma/client";
import { checkAdminRequest } from "@/lib/admin-auth";
import { CRMService } from "@/services/crm/CRMService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TRIGGERS: AutomationTrigger[] = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"];

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });

  const result = await CRMService.getAutomations(restaurantId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, data: result.data });
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    restaurantId?: string; trigger?: string; isEnabled?: boolean;
  };
  if (!body.restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  if (!body.trigger || !VALID_TRIGGERS.includes(body.trigger as AutomationTrigger)) {
    return NextResponse.json({ ok: false, error: "trigger inválido." }, { status: 400 });
  }
  if (typeof body.isEnabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "isEnabled (boolean) é obrigatório." }, { status: 400 });
  }

  const result = await CRMService.upsertAutomation(body.restaurantId, body.trigger as AutomationTrigger, {
    isEnabled: body.isEnabled,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, data: result.data });
}
