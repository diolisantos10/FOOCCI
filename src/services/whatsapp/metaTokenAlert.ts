/**
 * metaTokenAlert — leva o alerta de credencial do WhatsApp para onde alguém olha.
 *
 * Mesma lição do Instagram, escrita em `instagramAttentionAlert.ts`: um alarme que
 * toca dentro do GitHub Actions toca numa sala vazia. A varredura de credencial do
 * WhatsApp falharia vermelha todo dia sem ninguém ver — e o WhatsApp é o canal que
 * atende o restaurante AGORA.
 *
 * UMA VARIÁVEL, DOIS ALERTAS. O telefone de destino é `META_ALERT_PHONE`, com
 * fallback para `INSTAGRAM_ALERT_PHONE`. O CEO configura **um** número e os dois
 * avisos passam a sair. Somar mais uma variável a um mecanismo que já exigia três
 * seria repetir o defeito registrado na oficina de 06/08.
 *
 * Desligado por padrão, e "desligado" é dito em voz alta: quando o aviso não sai, o
 * motivo volta no resultado para o Actions ficar vermelho com a evidência. Nunca
 * lança — falha de aviso não pode derrubar a varredura.
 */

export interface MetaTokenAlertResult {
  sent:   boolean;
  reason: string | null;
}

/** Para onde o aviso vai. Ausente = recurso desligado, e isso é dito, não escondido. */
export function metaAlertPhone(): string | null {
  const v = process.env.META_ALERT_PHONE ?? process.env.INSTAGRAM_ALERT_PHONE;
  return v && v.trim().length >= 10 ? v.trim() : null;
}

/** Texto curto, em português, com o caso concreto dentro (guardrail 6). */
export function buildMetaTokenMessage(attention: string[], now = new Date()): string {
  const dia    = now.toISOString().slice(0, 10);
  const linhas = attention.slice(0, 5).map((a) => `• ${a}`);
  const resto  = attention.length > 5 ? `\n(e mais ${attention.length - 5} ponto(s))` : "";
  return (
    `Foocci — credencial do WhatsApp precisa de atenção (${dia})\n\n`
    + linhas.join("\n")
    + resto
    + `\n\nO selo "Conectado" do painel NÃO prova nada: ele lê o banco, não a Meta.`
    + ` A prova é /api/admin/meta/diag.`
  );
}

export async function alertMetaTokenAttention(attention: string[]): Promise<MetaTokenAlertResult> {
  if (attention.length === 0) return { sent: false, reason: null };

  const phone = metaAlertPhone();
  if (!phone) {
    return { sent: false, reason: "aviso por WhatsApp desligado (META_ALERT_PHONE/INSTAGRAM_ALERT_PHONE não definidos)" };
  }

  try {
    const { isBuildOsMetaChannelEnabled, sendBuildOsMetaText } = await import("@/services/buildos/BuildOsMetaChannel");
    if (!isBuildOsMetaChannelEnabled()) {
      return { sent: false, reason: "canal Master do Build OS não configurado (BUILDOS_META_PHONE_NUMBER_ID + BUILDOS_META_ACCESS_TOKEN) — aviso não enviado" };
    }
    const res = await sendBuildOsMetaText(phone.replace(/^\+/, ""), buildMetaTokenMessage(attention));
    return res.ok ? { sent: true, reason: null } : { sent: false, reason: res.error ?? "envio recusado pela Meta" };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message.slice(0, 200) : "falha ao avisar" };
  }
}
