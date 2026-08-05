/**
 * instagramAttentionAlert — leva o alerta do Instagram para onde alguém olha.
 *
 * O problema que isto resolve NÃO é falta de alarme. A varredura diária já falhava
 * com o motivo anexado, e falhou em 03, 04 e 05 de agosto — três manhãs seguidas,
 * dentro do GitHub Actions, onde ninguém entra. Quem percebeu que o Instagram estava
 * mudo há treze dias foi o CEO, não a máquina. Um alarme que toca numa sala vazia é
 * um alarme que não existe.
 *
 * Então o alerta sai do Actions e vai para o WhatsApp, pelo canal MASTER do Build OS —
 * credencial própria, que não pertence a restaurante nenhum. Nunca pelo número do
 * restaurante: o número comercial não carrega aviso interno, e aumentar tráfego
 * automático nele é risco de bloqueio que ninguém autorizou.
 *
 * Desligado por padrão. Só liga com `INSTAGRAM_ALERT_PHONE` definido E o canal Master
 * configurado — meio-configurado é desligado, o padrão desta casa.
 *
 * Best-effort e honesto nos dois sentidos: nunca derruba a varredura, e quando o envio
 * falha o motivo volta no resultado, para o Actions continuar vermelho com a evidência.
 * Fora da janela de 24h a Meta recusa texto livre; por isso o Actions segue sendo a
 * segunda via, e não a única.
 */

export interface AttentionAlertResult {
  /** true quando a mensagem foi realmente entregue à Meta. */
  sent: boolean;
  /** Por que não foi — inclusive "desligado", que não é erro. */
  reason: string | null;
}

/** Para onde o aviso vai. Ausente = recurso desligado, sem erro. */
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

/**
 * Envia o aviso, se estiver ligado. `attention` é a lista que a varredura já produz.
 * Nunca lança: uma falha de aviso não pode derrubar a renovação de token.
 */
export async function alertInstagramAttention(attention: string[]): Promise<AttentionAlertResult> {
  if (attention.length === 0) return { sent: false, reason: null };

  const phone = instagramAlertPhone();
  if (!phone) return { sent: false, reason: "aviso por WhatsApp desligado (INSTAGRAM_ALERT_PHONE não definido)" };

  try {
    // Import tardio: mantém o serviço de Instagram leve e evita puxar o Build OS
    // para dentro de todo caminho que só quer renovar um token.
    const { isBuildOsMetaChannelEnabled, sendBuildOsMetaText } = await import("@/services/buildos/BuildOsMetaChannel");
    if (!isBuildOsMetaChannelEnabled()) {
      return { sent: false, reason: "canal Master do Build OS não configurado — aviso não enviado" };
    }
    const res = await sendBuildOsMetaText(phone.replace(/^\+/, ""), buildAttentionMessage(attention));
    return res.ok
      ? { sent: true, reason: null }
      : { sent: false, reason: res.error ?? "envio recusado pela Meta" };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message.slice(0, 200) : "falha ao avisar" };
  }
}
