/**
 * /api/admin/agenda — o CEO gerencia os horários de chamada de demonstração.
 *
 * GET    → todos os horários futuros (livres e agendados) + últimos passados agendados
 * POST   → cria horários em lote: { slots: [{ startsAt: ISO, durationMin? }] }
 * DELETE → remove um horário LIVRE (?id=...). Horário agendado não se apaga por
 *          aqui: apagar a reserva de alguém é destruir o compromisso — se a
 *          reunião cair, o CEO fala com a pessoa; o registro fica.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    const now = new Date();
    const [upcoming, pastBooked] = await Promise.all([
      prisma.meetingSlot.findMany({
        where: { startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 200,
      }),
      prisma.meetingSlot.findMany({
        where: { startsAt: { lt: now }, bookedAt: { not: null } },
        orderBy: { startsAt: "desc" },
        take: 30,
      }),
    ]);
    return ok({ upcoming, pastBooked });
  } catch (e) {
    console.error("[admin/agenda] GET", e);
    return serverError("Falha ao carregar a agenda.");
  }
}

const createSchema = z.object({
  slots: z
    .array(
      z.object({
        startsAt:    z.string().datetime({ offset: true, message: "Data/hora inválida." }),
        durationMin: z.number().int().min(10).max(120).optional(),
      }),
    )
    .min(1, "Informe ao menos um horário.")
    .max(50, "No máximo 50 horários por vez."),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");

  const now = Date.now();
  const wanted = parsed.data.slots
    .map((s) => ({ startsAt: new Date(s.startsAt), durationMin: s.durationMin ?? 20 }))
    .filter((s) => s.startsAt.getTime() > now);
  if (wanted.length === 0) return badRequest("Todos os horários informados já passaram.");

  try {
    // Não duplica horário no mesmo instante (re-envio do formulário é comum).
    const existing = await prisma.meetingSlot.findMany({
      where:  { startsAt: { in: wanted.map((w) => w.startsAt) } },
      select: { startsAt: true },
    });
    const taken = new Set(existing.map((e) => e.startsAt.getTime()));
    const fresh = wanted.filter((w) => !taken.has(w.startsAt.getTime()));

    if (fresh.length > 0) {
      await prisma.meetingSlot.createMany({ data: fresh });
    }
    return ok({ created: fresh.length, skippedDuplicates: wanted.length - fresh.length });
  } catch (e) {
    console.error("[admin/agenda] POST", e);
    return serverError("Falha ao criar os horários.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Informe o id do horário.");
  try {
    const removed = await prisma.meetingSlot.deleteMany({ where: { id, bookedAt: null } });
    if (removed.count === 0) {
      const exists = await prisma.meetingSlot.findUnique({ where: { id }, select: { bookedAt: true } });
      if (!exists) return notFound("Horário não encontrado.");
      return badRequest("Esse horário já foi agendado por alguém — não dá para apagar por aqui.");
    }
    return ok({ deleted: true });
  } catch (e) {
    console.error("[admin/agenda] DELETE", e);
    return serverError("Falha ao remover o horário.");
  }
}
