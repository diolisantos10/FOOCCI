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
import { generateLeadCode } from "@/lib/site/leadCode";
import type { CreateSiteLeadInput } from "@/validators/site-lead";

/** Sender identity. Resend's shared onboarding domain works with zero DNS setup. */
const FROM = process.env.LEADS_FROM_EMAIL || "Foocci <onboarding@resend.dev>";

/** Tentativas de código antes de desistir DO CÓDIGO (nunca do lead). */
const CODE_ATTEMPTS = 4;

export interface CreatedLead {
  id: string;
  /** Código curto que vai na mensagem do WhatsApp; `null` se não deu para gerar. */
  codigo: string | null;
  notified: boolean;
  notifyError: string | null;
}

export const SiteLeadService = {
  /**
   * Store the lead, then try to notify. Never throws for a notification failure —
   * the visitor already gave us their data and must see a success screen.
   *
   * A ORDEM CONTINUA SENDO O PONTO, e agora ela vale para três coisas: gravar,
   * depois avisar, e só então o visitante ser levado ao WhatsApp. Quem leva ao
   * WhatsApp é a tela, e ela só faz isso com o `codigo` que este método devolve —
   * ou seja, só depois da gravação ter acontecido de verdade.
   */
  async capture(input: CreateSiteLeadInput): Promise<CreatedLead> {
    const lead = await createWithCode(input);

    const error = await notify({ ...input, codigo: lead.codigo });

    await prisma.siteLead.update({
      where: { id: lead.id },
      data: error ? { notifyError: error } : { notifiedAt: new Date(), notifyError: null },
    });

    return { id: lead.id, codigo: lead.codigo, notified: error === null, notifyError: error };
  },
};

/**
 * Grava o lead com um código único — e, se o código for o problema, grava sem ele.
 *
 * O UNIQUE do banco é a trava contra colisão (checar antes com um SELECT não
 * resolve corrida entre dois visitantes no mesmo milissegundo). Se as tentativas
 * se esgotarem, a última gravação vai com `codigo: null`: o atendimento perde o
 * contexto automático, o que é ruim; perder o lead seria pior, e é o único
 * resultado que este código não aceita.
 */
async function createWithCode(
  input: CreateSiteLeadInput,
): Promise<{ id: string; codigo: string | null }> {
  const base = {
    nome:        input.nome,
    whatsapp:    input.whatsapp,
    restaurante: input.restaurante || null,
    cidade:      input.cidade || null,
    tipo:        input.tipo || null,
    desafio:     input.desafio || null,
    origem:      input.origem || null,
  };

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const codigo = generateLeadCode();
    try {
      const row = await prisma.siteLead.create({ data: { ...base, codigo }, select: { id: true } });
      return { id: row.id, codigo };
    } catch (e) {
      // Só colisão de código é motivo para tentar de novo. Banco fora do ar sobe na
      // hora: insistir 4 vezes num banco caído só atrasa o erro que o visitante
      // precisa ver — e arrisca gravar duplicata se a falha for depois do commit.
      if (!isCodigoCollision(e)) throw e;
      // Guardrail 6: se um dia isto virar recorrente, o log tem o caso concreto.
      console.warn("[site-lead] código já existia, gerando outro", { attempt, codigo });
    }
  }

  console.error("[site-lead] 4 colisões seguidas de código — lead salvo SEM código", {
    restaurante: base.restaurante,
  });
  const row = await prisma.siteLead.create({ data: { ...base, codigo: null }, select: { id: true } });
  return { id: row.id, codigo: null };
}

/** Erro do Prisma de violação de UNIQUE apontando para a coluna `codigo`. */
function isCodigoCollision(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } } | null;
  if (err?.code !== "P2002") return false;
  const target = err.meta?.target;
  const alvo = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return alvo.includes("codigo");
}

/** Returns null on success, or a short human-readable reason on failure. */
async function notify(lead: CreateSiteLeadInput & { codigo: string | null }): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_EMAIL;

  if (!apiKey) return "RESEND_API_KEY ausente — lead salvo, aviso não enviado";
  if (!to) return "LEADS_NOTIFY_EMAIL ausente — lead salvo, aviso não enviado";

  const linhas = [
    // O código vem primeiro de propósito: é por ele que quem atende reconhece a
    // mensagem que vai chegar no WhatsApp e liga uma coisa na outra.
    lead.codigo ? `Código: #${lead.codigo}` : "Código: — (não gerado)",
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
