/**
 * SupportTicketService — o "último caso" do agente de suporte.
 *
 * O PROBLEMA QUE ISTO RESOLVE: até 04/08/2026 escalar um atendimento só mudava
 * `mode: HUMAN` no HelpThread e postava uma mensagem simpática. NINGUÉM era
 * avisado. O time só descobria olhando o inbox — ou seja, o lojista ficava
 * esperando uma resposta que dependia de alguém abrir uma tela por acaso.
 *
 * A ORDEM É O PONTO INTEIRO — persiste primeiro, notifica depois. É a mesma
 * lição já escrita em SiteLeadService: o chamado que chegou ao banco nunca se
 * perde, aconteça o que acontecer com o e-mail. O e-mail é ALERTA, não é cofre;
 * o cofre é a tabela `support_tickets` (e o inbox do admin).
 *
 * O e-mail sai pela API HTTP do Resend via `fetch`, de propósito SEM SDK — o
 * payload tem quatro campos e uma dependência aqui precisaria ser instalada,
 * mantida em `dependencies` e auditada, para um POST.
 *
 * GUARDRAIL 6 — o alerta carrega a própria evidência: quem é o restaurante, o
 * que foi perguntado, o que o agente tentou e por que escalou. Um e-mail que
 * dissesse só "abriram um chamado" seria ruído que ninguém investiga.
 *
 * Degrada com honestidade: sem `RESEND_API_KEY` ou sem destinatário o chamado
 * continua salvo e `notifyError` guarda exatamente por que nenhum aviso saiu.
 */

import { prisma } from "@/lib/prisma";

/** Remetente. O domínio compartilhado do Resend funciona sem configurar DNS. */
const FROM =
  process.env.SUPPORT_FROM_EMAIL || process.env.LEADS_FROM_EMAIL || "Foocci <onboarding@resend.dev>";

/**
 * Destino do aviso. `SUPPORT_NOTIFY_EMAIL` é a variável desta frente; enquanto
 * ela não estiver setada no Railway caímos em `LEADS_NOTIFY_EMAIL`, que já
 * existe e já chega no time — chamado nenhum fica sem aviso por causa de deploy.
 */
function notifyTarget(): { to: string | null; via: string } {
  const dedicated = process.env.SUPPORT_NOTIFY_EMAIL?.trim();
  if (dedicated) return { to: dedicated, via: "SUPPORT_NOTIFY_EMAIL" };
  const fallback = process.env.LEADS_NOTIFY_EMAIL?.trim();
  if (fallback) return { to: fallback, via: "LEADS_NOTIFY_EMAIL (fallback)" };
  return { to: null, via: "nenhuma" };
}

export interface OpenTicketInput {
  restaurantId: string;
  restaurantName?: string | null;
  userId?: string | null;
  threadId?: string | null;
  /** Assunto curto — normalmente a última pergunta do lojista. */
  subject: string;
  /** Por que escalou: motivo do agente, ou "pedido explícito do lojista". */
  reason: string;
  /** O que o agente já tentou/respondeu, do mais antigo ao mais novo. */
  transcript?: Array<{ role: string; content: string }>;
  /** Sinal técnico extra (ex.: subsistema suspeito), quando houver. */
  diagnosticNote?: string | null;
}

export interface OpenedTicket {
  id: string;
  number: number;
  /** Código legível mostrado ao lojista: "CHM-0042". */
  code: string;
  notified: boolean;
  notifyError: string | null;
}

/** Código legível do chamado a partir do número sequencial. */
export function formatTicketCode(n: number): string {
  return `CHM-${String(n).padStart(4, "0")}`;
}

/** Quantos turnos da conversa entram na evidência (o suficiente para entender). */
const TRANSCRIPT_TURNS = 12;
const TRANSCRIPT_CHARS = 600;

function buildEvidence(input: OpenTicketInput): string {
  const turns = (input.transcript ?? []).slice(-TRANSCRIPT_TURNS).map((t) => {
    const who =
      t.role === "USER" || t.role === "user"
        ? "Lojista"
        : t.role === "ASSISTANT" || t.role === "assistant"
          ? "Agente"
          : t.role === "SUPPORT"
            ? "Equipe"
            : "Sistema";
    return `${who}: ${t.content.slice(0, TRANSCRIPT_CHARS)}`;
  });

  return [
    `Restaurante: ${input.restaurantName ?? input.restaurantId} (id ${input.restaurantId})`,
    input.userId ? `Usuário: ${input.userId}` : null,
    `Assunto: ${input.subject}`,
    `Motivo da escalada: ${input.reason}`,
    input.diagnosticNote ? `Sinal técnico: ${input.diagnosticNote}` : null,
    "",
    turns.length ? "O que já foi conversado com o agente:" : "Sem conversa anterior registrada.",
    ...turns,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export const SupportTicketService = {
  /**
   * Abre o chamado e tenta avisar o time. NUNCA lança por falha de notificação —
   * o lojista já pediu ajuda e precisa ver uma tela de sucesso com o número.
   */
  async open(input: OpenTicketInput): Promise<OpenedTicket> {
    const evidence = buildEvidence(input);

    const ticket = await prisma.supportTicket.create({
      data: {
        restaurantId: input.restaurantId,
        userId: input.userId ?? null,
        threadId: input.threadId ?? null,
        subject: input.subject.slice(0, 200),
        reason: input.reason,
        evidence,
      },
      select: { id: true, number: true },
    });

    const code = formatTicketCode(ticket.number);
    const error = await notify({ code, evidence, input });

    await prisma.supportTicket
      .update({
        where: { id: ticket.id },
        data: error ? { notifyError: error } : { notifiedAt: new Date(), notifyError: null },
      })
      .catch(() => undefined); // o chamado já existe: a trilha do aviso é best-effort

    return { id: ticket.id, number: ticket.number, code, notified: error === null, notifyError: error };
  },
};

/** Retorna null em sucesso, ou um motivo curto e legível em falha. */
async function notify(args: {
  code: string;
  evidence: string;
  input: OpenTicketInput;
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const { to, via } = notifyTarget();

  if (!apiKey) return "RESEND_API_KEY ausente — chamado salvo, aviso não enviado";
  if (!to) return "SUPPORT_NOTIFY_EMAIL (nem LEADS_NOTIFY_EMAIL) definido — chamado salvo, aviso não enviado";

  const who = args.input.restaurantName ?? args.input.restaurantId;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `[${args.code}] Suporte Foocci — ${who}`,
        text: [
          `Chamado ${args.code} aberto pelo agente de suporte.`,
          "",
          args.evidence,
          "",
          `Responda pelo painel: Admin → Suporte (thread ${args.input.threadId ?? "n/d"}).`,
          `(aviso enviado via ${via})`,
        ].join("\n"),
      }),
      // Um provedor lento não pode segurar a requisição do lojista aberta.
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
