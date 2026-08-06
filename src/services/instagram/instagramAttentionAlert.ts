/**
 * instagramAttentionAlert — leva o alerta do Instagram para onde alguém olha.
 *
 * O problema que isto resolve NÃO é falta de alarme. A varredura diária já falhava
 * com o motivo anexado, e falhou em 03, 04, 05 e 06 de agosto — quatro manhãs seguidas,
 * dentro do GitHub Actions, onde ninguém entra. Quem percebeu que o Instagram estava
 * mudo há treze dias foi o CEO, não a máquina. Um alarme que toca numa sala vazia é
 * um alarme que não existe.
 *
 * ── Por que E-MAIL é a primeira via, e não o WhatsApp ──
 *
 * O desenho anterior mandava o aviso pelo canal Master do Build OS. Ele nunca saiu, e
 * o motivo não foi esquecimento: aquele caminho exige `INSTAGRAM_ALERT_PHONE` **mais**
 * `BUILDOS_META_PHONE_NUMBER_ID` **mais** `BUILDOS_META_ACCESS_TOKEN` — três variáveis,
 * e as duas últimas exigem um número REGISTRADO dentro do aplicativo da Meta. Ou seja:
 * o canal de aviso do Instagram dependia de um ato de risco no aplicativo único que
 * serve WhatsApp e Instagram ao mesmo tempo. Alerta não pode custar isso.
 *
 * O e-mail usa o mesmo provedor que o chamado de suporte já usa (`RESEND_API_KEY`),
 * não encosta na Meta, não tem App Review, não corre risco de bloqueio de número — e,
 * porque cai em `SUPPORT_NOTIFY_EMAIL` / `LEADS_NOTIFY_EMAIL` (que já existem e já
 * chegam no time), **pode funcionar sem nenhuma variável nova**. Aviso que depende de
 * configuração nova é aviso que fica desligado; foi essa a lição de agosto.
 *
 * O WhatsApp continua aqui como SEGUNDA via, e continua desligado por padrão. Ele liga
 * no dia em que o CEO decidir registrar o número Master — decisão dele, não minha.
 *
 * 🔒 Nenhum segredo entra na mensagem. Os textos de `attention[]` vêm de
 * `instagramTokenRefresh` e da evidência já limpa por `instagramConnectionEvidence`.
 *
 * Best-effort e honesto nos dois sentidos: nunca derruba a varredura, e quando nada
 * sai o motivo volta no resultado, para o Actions continuar vermelho com a evidência.
 */

/** Remetente. Mesmo padrão do suporte: o domínio compartilhado do Resend dispensa DNS. */
const FROM =
  process.env.SUPPORT_FROM_EMAIL || process.env.LEADS_FROM_EMAIL || "Foocci <onboarding@resend.dev>";

export interface AttentionAlertResult {
  /** true quando o aviso saiu por ALGUM canal. */
  sent: boolean;
  /** Por que não saiu — inclusive "desligado", que não é erro. */
  reason: string | null;
  /** Por qual canal saiu (ou tentou sair). Para o Actions imprimir sem adivinhar. */
  channel: "email" | "whatsapp" | null;
  /** O que cada via respondeu. O alerta carrega a própria evidência (guardrail 6). */
  detail: { email: string | null; whatsapp: string | null };
}

/**
 * Para onde o e-mail vai. Dedicada primeiro; senão, as caixas do time que já existem.
 * Cair no que já está configurado é deliberado: é o que faz o aviso funcionar HOJE.
 */
export function instagramAlertEmail(): { to: string | null; via: string } {
  const dedicada = process.env.INSTAGRAM_ALERT_EMAIL?.trim();
  if (dedicada) return { to: dedicada, via: "INSTAGRAM_ALERT_EMAIL" };
  const suporte = process.env.SUPPORT_NOTIFY_EMAIL?.trim();
  if (suporte) return { to: suporte, via: "SUPPORT_NOTIFY_EMAIL (fallback)" };
  const leads = process.env.LEADS_NOTIFY_EMAIL?.trim();
  if (leads) return { to: leads, via: "LEADS_NOTIFY_EMAIL (fallback)" };
  return { to: null, via: "nenhuma" };
}

/** Para onde o aviso por WhatsApp vai. Ausente = segunda via desligada, sem erro. */
export function instagramAlertPhone(): string | null {
  const v = process.env.INSTAGRAM_ALERT_PHONE;
  return v && v.trim().length >= 10 ? v.trim() : null;
}

/** Monta o texto do aviso. Curto, em português, e com o caso concreto (guardrail 6). */
export function buildAttentionMessage(attention: string[], now = new Date()): string {
  const dia = now.toISOString().slice(0, 10);
  const linhas = attention.slice(0, 5).map((a) => `• ${a}`);
  const resto = attention.length > 5 ? `\n(e mais ${attention.length - 5} ponto(s))` : "";
  return (
    `Foocci — Instagram precisa de atenção (${dia})\n\n`
    + linhas.join("\n")
    + resto
    + `\n\nAbra Integrações → Instagram e olhe o card Diagnóstico. `
    + `O selo "Conectado" não prova nada: só o Diagnóstico prova.`
  );
}

/** Envia por e-mail. Devolve `null` em sucesso, ou o motivo real da falha. */
async function enviarEmail(attention: string[], now: Date): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "RESEND_API_KEY ausente";
  const { to, via } = instagramAlertEmail();
  if (!to) return "nenhum destinatário (INSTAGRAM_ALERT_EMAIL / SUPPORT_NOTIFY_EMAIL / LEADS_NOTIFY_EMAIL ausentes)";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `[Instagram] Canal precisa de atenção — ${now.toISOString().slice(0, 10)}`,
        text: `${buildAttentionMessage(attention, now)}\n\n(aviso enviado via ${via})`,
      }),
      // Um provedor lento não pode segurar a varredura diária aberta.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Resend ${res.status}: ${body.slice(0, 200)}`;
    }
    return null;
  } catch (e) {
    return `falha ao chamar o Resend: ${e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido"}`;
  }
}

/** Envia pelo WhatsApp Master. Devolve `null` em sucesso, ou o motivo real da falha. */
async function enviarWhatsApp(attention: string[], now: Date): Promise<string | null> {
  const phone = instagramAlertPhone();
  if (!phone) return "INSTAGRAM_ALERT_PHONE não definido";
  try {
    // Import tardio: mantém o serviço de Instagram leve e evita puxar o Build OS
    // para dentro de todo caminho que só quer renovar um token.
    const { isBuildOsMetaChannelEnabled, sendBuildOsMetaText } = await import("@/services/buildos/BuildOsMetaChannel");
    if (!isBuildOsMetaChannelEnabled()) return "canal Master do Build OS não configurado";
    const res = await sendBuildOsMetaText(phone.replace(/^\+/, ""), buildAttentionMessage(attention, now));
    return res.ok ? null : (res.error ?? "envio recusado pela Meta");
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 200) : "falha ao avisar";
  }
}

/**
 * Envia o aviso pelas vias disponíveis. `attention` é a lista que a varredura já produz.
 * Nunca lança: uma falha de aviso não pode derrubar a renovação de token.
 *
 * As duas vias são tentadas: o e-mail é a primeira e resolve hoje; o WhatsApp, quando
 * ligado, chega mais rápido no bolso. Basta uma dar certo para `sent` ser true — mas o
 * motivo da que falhou continua visível em `detail`, porque saber que metade do aviso
 * está quebrada é justamente o que ninguém soube durante treze dias.
 */
export async function alertInstagramAttention(
  attention: string[],
  now: Date = new Date(),
): Promise<AttentionAlertResult> {
  if (attention.length === 0) {
    return { sent: false, reason: null, channel: null, detail: { email: null, whatsapp: null } };
  }

  const email = await enviarEmail(attention, now);
  const whatsapp = await enviarWhatsApp(attention, now);

  if (email === null) return { sent: true, reason: null, channel: "email", detail: { email, whatsapp } };
  if (whatsapp === null) return { sent: true, reason: null, channel: "whatsapp", detail: { email, whatsapp } };

  return {
    sent: false,
    // Guardrail 6: não "não deu"; QUAL via falhou e por quê, nas duas.
    reason: `e-mail: ${email} · WhatsApp: ${whatsapp}`,
    channel: null,
    detail: { email, whatsapp },
  };
}
