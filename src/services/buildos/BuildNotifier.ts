/**
 * BuildNotifier — envia a confirmação do Build OS por WhatsApp.
 *
 * Canal ÚNICO desde 04/08/2026: a Meta homologada. Antes daqui saía um envio pelo
 * provedor anterior, usando a instância do restaurante ou a instância Admin; esse
 * provedor foi eliminado do Foocci por ordem do CEO.
 *
 * Dois caminhos, pela mesma razão de sempre:
 *   • `restaurantId` nulo → número Master do Build OS (credencial própria, não
 *     pertence a restaurante nenhum) via `BuildOsMetaChannel`.
 *   • `restaurantId` presente → o número daquele restaurante, pela porta única de
 *     saída (`WhatsAppMessagingService`).
 *
 * Continua NÃO tocando as tabelas de CRM (nem Customer, nem Conversation, nem
 * Message): o operador do Build OS não é cliente de restaurante e as respostas
 * dele não entram na Central de Conversas.
 *
 * Best-effort: nunca lança — falha vira `false` e é registrada como
 * BuildCommandEvent, porque derrubar o webhook é pior que perder uma confirmação.
 */

import { isBuildOsMetaChannelEnabled, sendBuildOsMetaText } from "./BuildOsMetaChannel";

/**
 * Envia texto simples para `phone`. `phone` chega normalizado em E.164 ("+5511…")
 * e a Meta aceita sem o "+".
 */
export async function sendBuildConfirmation(
  restaurantId: string | null,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    const to = phone.replace(/^\+/, "");

    if (!restaurantId) {
      // Canal Master (admin). Sem credencial não há como responder — e "sem
      // config" nunca vira sucesso silencioso (guardrail 1).
      if (!isBuildOsMetaChannelEnabled()) {
        console.warn("[BuildNotifier] canal Master do Build OS não configurado — confirmação não enviada");
        return false;
      }
      const res = await sendBuildOsMetaText(to, text);
      if (!res.ok) console.warn(`[BuildNotifier] envio pelo canal Master falhou: ${res.error}`);
      return res.ok;
    }

    // Import tardio: mantém o BuildNotifier leve e evita ciclo com o caminho de
    // envio do WhatsApp, que já importa serviços de conversa.
    const { WhatsAppMessagingService } = await import("@/services/whatsapp/WhatsAppMessagingService");
    const res = await WhatsAppMessagingService.sendText({ restaurantId, to, text });
    if (!res.ok) {
      console.warn(
        `[BuildNotifier] envio pelo número do restaurante ${restaurantId} recusado: ${res.status} ${res.blockReason ?? res.errorCode ?? ""}`,
      );
    }
    return res.ok;
  } catch (err) {
    console.warn("[BuildNotifier] envio falhou:", err instanceof Error ? err.message : String(err));
    return false;
  }
}
