/**
 * POST /api/admin/brain/shadow-replay — backfill do boletim de sombra a partir
 * das conversas reais já armazenadas.
 *
 * Body: { sinceDays?: number (default 60), maxSamples?: number (default 500),
 *         dryRun?: boolean }
 *
 * Fluxo recomendado: rode PRIMEIRO com dryRun:true para ver quantas conversas
 * são elegíveis e a estimativa de tokens/custo; depois rode sem dryRun com o
 * maxSamples que couber no seu orçamento. Nunca envia mensagem, nunca toca
 * runtime — só grava evidência.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { replayShadowFromHistory } from "@/services/brain/runtime/ShadowReplayService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { sinceDays?: number; maxSamples?: number; dryRun?: boolean };
    const sinceDays = Number.isFinite(body.sinceDays) ? Math.max(1, Math.min(Number(body.sinceDays), 365)) : 60;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const result = await replayShadowFromHistory({
      since,
      maxSamples: body.maxSamples,
      dryRun: body.dryRun === true,
    });
    return NextResponse.json({ ok: true, sinceDays, result });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
