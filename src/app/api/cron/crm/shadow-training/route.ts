/**
 * POST /api/cron/crm/shadow-training — a esteira de treino do agente de CRM.
 *
 * Roda de madrugada e produz a evidência que a escada do CRM nunca conseguiu
 * acumular: casos montados a partir de comportamento REAL de clientes, com
 * destinatário SINTÉTICO, compostos pelo agente, julgados por portão e gravados
 * com `sampleOrigin: "TRAINING"` — separados da contagem de produção.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. NUNCA envia mensagem, nunca toca
 * runtime. Teto por CRON_CRM_TRAINING_CASES (padrão 24 casos por restaurante) e
 * CRON_CRM_TRAINING_RESTAURANTS (padrão 3).
 */

import { NextRequest, NextResponse } from "next/server";
import { runCrmShadowTraining } from "@/services/crm/training/CrmShadowTrainingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  if (!checkCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const result = await runCrmShadowTraining({
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    dryRun: body.dryRun === true,
    casesPerRestaurant: Number(process.env.CRON_CRM_TRAINING_CASES ?? 24) || 24,
    maxRestaurants: Number(process.env.CRON_CRM_TRAINING_RESTAURANTS ?? 3) || 3,
  });

  return NextResponse.json({ ok: true, result });
}
