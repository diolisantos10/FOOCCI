/**
 * POST /api/cron/brain/shadow-replay — motor CONTÍNUO do boletim de sombra.
 *
 * Roda de madrugada, lê as conversas reais do DIA ANTERIOR e as transforma em
 * evidência de sombra (o Brain "responde" cada pergunta como responderia hoje;
 * o crítico avalia; grava em brain_shadow_logs). Mantém o boletim sempre fresco
 * e, quando o free-form estiver ao vivo, vira detecção de regressão contínua.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}. Nunca envia mensagem, nunca toca
 * runtime. Teto diário por CRON_SHADOW_REPLAY_MAX (default 3000).
 */

import { NextRequest, NextResponse } from "next/server";
import { replayShadowFromHistory } from "@/services/brain/runtime/ShadowReplayService";

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

  // Janela: ontem 00:00 → hoje 00:00 (UTC).
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const maxSamples = Number(process.env.CRON_SHADOW_REPLAY_MAX ?? 3000);

  const result = await replayShadowFromHistory({ since, until: todayStart, maxSamples });
  return NextResponse.json({ ok: true, window: { since, until: todayStart }, result });
}
