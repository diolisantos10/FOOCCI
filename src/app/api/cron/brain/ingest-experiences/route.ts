/**
 * POST /api/cron/brain/ingest-experiences — alimenta o Cofre de Experiências.
 *
 * Roda de madrugada, lê as conversas reais do DIA ANTERIOR (todos os agentes) e
 * grava a versão sanitizada no cofre (restaurant_experiences). Idempotente.
 * Auth: Authorization: Bearer {CRON_SECRET}. Nunca envia, nunca toca runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { ingestExperiences } from "@/services/brain/experience/ExperienceVaultService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Janela: ontem 00:00 → hoje 00:00 (UTC).
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const maxRecords = Number(process.env.CRON_EXPERIENCE_MAX ?? 5000);

  const result = await ingestExperiences({ since, until: todayStart, maxRecords });
  return NextResponse.json({ ok: true, window: { since, until: todayStart }, result });
}
