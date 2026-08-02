/**
 * Lead capture for the public marketing site.
 *
 * THE ORDER MATTERS AND IS THE WHOLE POINT: persist first, notify second. A lead
 * that reached the database is never lost, whatever happens to the e-mail. The
 * notification is an alert, not the vault — the panel list at
 * /admin/leads is the vault.
 *
 * E-mail goes out over Resend's HTTP API via `fetch`, deliberately WITHOUT adding
 * an SDK: the payload is three fields and a dependency here would have to be
 * installed, kept in `dependencies` (see the corredor note about
 * NODE_ENV=production), and audited — for one POST.
 *
 * Degrades honestly when unconfigured: `RESEND_API_KEY` or `LEADS_NOTIFY_EMAIL`
 * missing means the lead is still stored and `notifyError` records exactly why no
 * alert went out. Guardrail 6 — the alert carries its own evidence.
 */

import { prisma } from "@/lib/prisma";
import type { CreateSiteLeadInput } from "@/validators/site-lead";

/** Sender identity. Resend's shared onboarding domain works with zero DNS setup. */
const FROM = process.env.LEADS_FROM_EMAIL || "Foocci <onboarding@resend.dev>";

export interface CreatedLead {
  id: string;
  notified: boolean;
  notifyError: string | null;
}

export const SiteLeadService = {
  /**
   * Store the lead, then try to notify. Never throws for a notification failure —
   * the visitor already gave us their data and must see a success screen.
   */
  async capture(input: CreateSiteLeadInput): Promise<CreatedLead> {
    const lead = await prisma.siteLead.create({
      data: {
        nome:        input.nome,
        whatsapp:    input.whatsapp,
        restaurante: input.restaurante || null,
        cidade:      input.cidade || null,
        tipo:        input.tipo || null,
        desafio:     input.desafio || null,
        origem:      input.origem || null,
      },
      select: { id: true },
    });

    const error = await notify(input);

    await prisma.siteLead.update({
      where: { id: lead.id },
      data: error ? { notifyError: error } : { notifiedAt: new Date(), notifyError: null },
    });

    return { id: lead.id, notified: error === null, notifyError: error };
  },
};

/** Returns null on success, or a short human-readable reason on failure. */
async function notify(lead: CreateSiteLeadInput): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_EMAIL;

  if (!apiKey) return "RESEND_API_KEY ausente — lead salvo, aviso não enviado";
  if (!to) return "LEADS_NOTIFY_EMAIL ausente — lead salvo, aviso não enviado";

  const linhas = [
    `Nome: ${lead.nome}`,
    `WhatsApp: ${lead.whatsapp}`,
    lead.restaurante ? `Restaurante: ${lead.restaurante}` : null,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,
    lead.tipo ? `Tipo: ${lead.tipo}` : null,
    lead.desafio ? `Principal desafio: ${lead.desafio}` : null,
    lead.origem ? `Veio de: ${lead.origem}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `🍽️ Novo pedido de demonstração — ${lead.nome}`,
        text: `${linhas.join("\n")}\n\nResponda pelo WhatsApp: ${lead.whatsapp}`,
      }),
      // A slow provider must not hold the visitor's request open.
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Resend ${res.status}: ${body.slice(0, 200)}`;
    }
    return null;
  } catch (e) {
    return `falha ao chamar o Resend: ${e instanceof Error ? e.message : String(e)}`;
  }
}
