/**
 * Agenda comercial — horários do CEO para chamadas curtas de demonstração.
 *
 * Mesmo contrato do SiteLeadService: GRAVAR PRIMEIRO, AVISAR DEPOIS. Uma reserva
 * que chegou ao banco nunca se perde por falha de e-mail; a notificação é aviso,
 * não cofre — o cofre é o painel /admin/agenda.
 *
 * A reserva é um `updateMany` condicional (id + bookedAt null + futuro): dois
 * visitantes disputando o mesmo horário → exatamente um vence, por construção.
 */

import { prisma } from "@/lib/prisma";

const FROM = process.env.LEADS_FROM_EMAIL || "Foocci <onboarding@resend.dev>";

/** Antecedência mínima para agendar: evita reserva para "daqui a 3 minutos". */
const MIN_LEAD_MS = 60 * 60 * 1000; // 1h

export interface PublicSlot {
  id:          string;
  startsAt:    string; // ISO
  durationMin: number;
}

export interface BookSlotInput {
  slotId:       string;
  nome:         string;
  whatsapp:     string;
  restaurante?: string | null;
}

export type BookSlotResult =
  | { ok: true; startsAt: string; durationMin: number }
  | { ok: false; reason: "taken" | "not_found" };

export const MeetingSlotService = {
  /** Horários futuros ainda livres, do mais próximo ao mais distante. */
  async listAvailable(limit = 60): Promise<PublicSlot[]> {
    const slots = await prisma.meetingSlot.findMany({
      where:   { bookedAt: null, startsAt: { gt: new Date(Date.now() + MIN_LEAD_MS) } },
      orderBy: { startsAt: "asc" },
      take:    limit,
      select:  { id: true, startsAt: true, durationMin: true },
    });
    return slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), durationMin: s.durationMin }));
  },

  /** Reserva atômica. `taken` cobre tanto "já levou" quanto "já passou". */
  async book(input: BookSlotInput): Promise<BookSlotResult> {
    const exists = await prisma.meetingSlot.findUnique({
      where:  { id: input.slotId },
      select: { id: true },
    });
    if (!exists) return { ok: false, reason: "not_found" };

    const claimed = await prisma.meetingSlot.updateMany({
      where: { id: input.slotId, bookedAt: null, startsAt: { gt: new Date() } },
      data: {
        bookedAt:    new Date(),
        nome:        input.nome,
        whatsapp:    input.whatsapp,
        restaurante: input.restaurante || null,
      },
    });
    if (claimed.count !== 1) return { ok: false, reason: "taken" };

    const slot = await prisma.meetingSlot.findUniqueOrThrow({
      where:  { id: input.slotId },
      select: { startsAt: true, durationMin: true },
    });

    const error = await notify(input, slot.startsAt);
    await prisma.meetingSlot.update({
      where: { id: input.slotId },
      data:  error ? { notifyError: error } : { notifiedAt: new Date(), notifyError: null },
    });

    return { ok: true, startsAt: slot.startsAt.toISOString(), durationMin: slot.durationMin };
  },
};

/** Formata em horário de Brasília — o e-mail é lido pelo CEO, não por máquina. */
function formatBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

/** Devolve null no sucesso, ou o motivo curto da falha (guardrail 6). */
async function notify(input: BookSlotInput, startsAt: Date): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_EMAIL;
  if (!apiKey) return "RESEND_API_KEY ausente — reserva salva, aviso não enviado";
  if (!to) return "LEADS_NOTIFY_EMAIL ausente — reserva salva, aviso não enviado";

  const linhas = [
    `Quando: ${formatBR(startsAt)} (horário de Brasília)`,
    `Nome: ${input.nome}`,
    `WhatsApp: ${input.whatsapp}`,
    input.restaurante ? `Restaurante: ${input.restaurante}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    FROM,
        to:      [to],
        subject: `📅 Reunião agendada no site — ${input.nome}`,
        text:    `Alguém agendou uma chamada de demonstração pelo site.\n\n${linhas.join("\n")}\n\nDetalhes no painel: /admin/agenda`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Resend ${res.status}: ${body.slice(0, 200)}`;
    }
    return null;
  } catch (e) {
    return `Falha de rede ao notificar: ${e instanceof Error ? e.message : String(e)}`;
  }
}
