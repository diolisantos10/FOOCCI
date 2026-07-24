/**
 * SupportWhatsAppService — o canal do Agente de TI num número DEDICADO (Meta).
 *
 * A equipe manda um problema para o número de suporte do Foocci; o agente de TI
 * (SupportIncidentReasoner) diagnostica e responde pelo MESMO número. É o cenário
 * "sábado à noite, sem equipe" — mas com o freio de mão: na Fase 0 ele DIAGNOSTICA,
 * EXPLICA e ESCALA; nunca executa nada (shadow-safe, herda `executed: false`).
 *
 * ADITIVO e GATED: só entra em ação quando SUPPORT_META_PHONE_NUMBER_ID +
 * SUPPORT_META_ACCESS_TOKEN estão configurados. Sem isso, o webhook segue igual —
 * zero risco ao fluxo dos restaurantes. As credenciais são do número de suporte
 * (não de nenhum restaurante) e nunca são logadas.
 */

import { reasonSupportIncident } from "@/services/support/SupportIncidentReasoner";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import { buildMetaTextPayload, toMetaRecipient, maskGraphResponse } from "@/services/whatsapp/providers/metaPayload";

/** Presença (não o valor) das credenciais do número de suporte. */
function supportPhoneNumberId(): string | null {
  const v = process.env.SUPPORT_META_PHONE_NUMBER_ID;
  return v && v.trim() ? v.trim() : null;
}
function supportAccessToken(): string | null {
  const v = process.env.SUPPORT_META_ACCESS_TOKEN;
  return v && v.trim() ? v.trim() : null;
}

/** O canal só liga quando o número dedicado E o token estão configurados. */
export function isSupportWhatsAppEnabled(): boolean {
  return supportPhoneNumberId() !== null && supportAccessToken() !== null;
}

/** Este phone_number_id é o do número de suporte E o canal está pronto p/ responder?
 *  Exige canal TOTALMENTE ligado (número + token): se estiver meio-configurado, não
 *  sequestramos a mensagem — melhor cair no fluxo normal do que desviar sem poder
 *  responder. */
export function isSupportPhoneNumberId(phoneNumberId: string | null | undefined): boolean {
  return isSupportWhatsAppEnabled() && phoneNumberId === supportPhoneNumberId();
}

/**
 * De quem falou → qual restaurante o agente diagnostica. No piloto, um mapa
 * telefone→restaurante (SUPPORT_PHONE_RESTAURANT_MAP em JSON) OU um restaurante
 * padrão (SUPPORT_PILOT_RESTAURANT_ID). Sem mapeamento → null (o agente pede
 * identificação em vez de adivinhar).
 */
export function resolveRestaurantForSender(fromPhone: string): string | null {
  const raw = process.env.SUPPORT_PHONE_RESTAURANT_MAP;
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const tail = fromPhone.slice(-8);
      for (const [phone, rid] of Object.entries(map)) {
        if (phone.slice(-8) === tail) return rid;
      }
    } catch { /* mapa malformado — cai no padrão */ }
  }
  const pilot = process.env.SUPPORT_PILOT_RESTAURANT_ID;
  return pilot && pilot.trim() ? pilot.trim() : null;
}

/** Envia texto pelo número de suporte (credenciais próprias, nunca logadas). */
async function sendSupportReply(toPhone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const phoneNumberId = supportPhoneNumberId();
  const token = supportAccessToken();
  if (!phoneNumberId || !token) return { ok: false, error: "suporte não configurado" };
  const recipient = toMetaRecipient(toPhone);
  if (!recipient) return { ok: false, error: "telefone inválido" };

  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/messages`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(buildMetaTextPayload(recipient, text)),
    });
    if (!res.ok) {
      const json: unknown = await res.json().catch(() => ({}));
      const err = (json as { error?: { message?: string } }).error ?? {};
      return { ok: false, error: maskGraphResponse(err.message ?? `HTTP_${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/** Monta a resposta de WhatsApp a partir do diagnóstico (curta, com runbook). */
export function formatSupportReply(d: Awaited<ReturnType<typeof reasonSupportIncident>>): string {
  const parts: string[] = [d.explanation.trim()];
  if (d.runbook.length) {
    const steps = d.runbook.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join("\n");
    parts.push(`\nPasso a passo:\n${steps}`);
  }
  if (d.escalate) {
    parts.push("\n📋 Registrei o diagnóstico. Se não resolver, a equipe assume com tudo já apurado.");
  }
  parts.push("\n🛠️ Suporte técnico Foocci");
  return parts.join("\n");
}

/**
 * Trata uma mensagem recebida no número de suporte. Shadow-safe: só diagnostica e
 * responde. Foto/mídia (visão) ainda não — responde pedindo texto por enquanto.
 */
export async function handleInboundSupport(input: {
  fromPhone: string;
  text: string | null;
  isText: boolean;
}): Promise<{ handled: boolean; replied: boolean; note?: string }> {
  if (!isSupportWhatsAppEnabled()) return { handled: false, replied: false, note: "canal desligado" };

  // Mídia/foto: visão é uma fase futura — resposta honesta em vez de silêncio.
  if (!input.isText || !input.text || !input.text.trim()) {
    await sendSupportReply(
      input.fromPhone,
      "Recebi 👍 Por enquanto eu entendo melhor por *texto* — me descreve o problema em palavras (qual tela/recurso, o que aparece, quando começou) que eu já diagnostico.\n\n🛠️ Suporte técnico Foocci",
    );
    return { handled: true, replied: true, note: "mídia — pediu texto" };
  }

  const restaurantId = resolveRestaurantForSender(input.fromPhone);
  if (!restaurantId) {
    await sendSupportReply(
      input.fromPhone,
      "Oi! Aqui é o suporte técnico do Foocci. Não consegui identificar seu restaurante por este número — me diz o nome do restaurante que eu já começo a apurar.\n\n🛠️ Suporte técnico Foocci",
    );
    return { handled: true, replied: true, note: "remetente não mapeado" };
  }

  const diagnosis = await reasonSupportIncident({ restaurantId, report: input.text.trim() });
  const reply = formatSupportReply(diagnosis);
  const sent = await sendSupportReply(input.fromPhone, reply);
  return { handled: true, replied: sent.ok, note: sent.ok ? undefined : `falha no envio: ${sent.error}` };
}
