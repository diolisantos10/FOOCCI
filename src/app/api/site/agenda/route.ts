/**
 * GET /api/site/agenda — horários livres para a chamada de demonstração.
 *
 * PUBLIC (whitelisted no middleware): quem agenda ainda não tem conta.
 * Devolve só o necessário para a escolha: id, início (ISO) e duração.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { MeetingSlotService } from "@/services/site/MeetingSlotService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `site-agenda:${ip}`, limit: 30, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  try {
    const slots = await MeetingSlotService.listAvailable();
    return NextResponse.json({ slots });
  } catch (e) {
    console.error("[site-agenda] falha ao listar horários:", e);
    return NextResponse.json({ error: "Não conseguimos carregar a agenda agora." }, { status: 500 });
  }
}
