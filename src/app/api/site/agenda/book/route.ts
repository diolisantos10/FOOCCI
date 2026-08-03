/**
 * POST /api/site/agenda/book — reserva um horário da agenda comercial.
 *
 * PUBLIC (whitelisted no middleware) e rate-limited por IP. A reserva é
 * transacional no serviço: horário disputado → um vence, o outro recebe 409
 * com mensagem honesta para escolher outro.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { MeetingSlotService } from "@/services/site/MeetingSlotService";

export const dynamic = "force-dynamic";

const bookSchema = z.object({
  slotId:      z.string().min(1, "Escolha um horário."),
  nome:        z.string().trim().min(2, "Informe seu nome.").max(120),
  whatsapp:    z.string().trim().min(10, "Informe um WhatsApp válido.").max(30),
  restaurante: z.string().trim().max(160).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `site-agenda-book:${ip}`, limit: 5, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  const raw = await req.json().catch(() => null);
  const parsed = bookSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  try {
    const result = await MeetingSlotService.book(parsed.data);
    if (!result.ok) {
      const msg = result.reason === "taken"
        ? "Esse horário acabou de ser reservado. Escolha outro, por favor."
        : "Horário não encontrado. Atualize a página e tente de novo.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ ok: true, startsAt: result.startsAt, durationMin: result.durationMin });
  } catch (e) {
    console.error("[site-agenda-book] falha ao reservar:", e);
    return NextResponse.json(
      { error: "Não conseguimos registrar agora. Tente de novo em instantes." },
      { status: 500 },
    );
  }
}
