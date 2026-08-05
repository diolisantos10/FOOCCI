/**
 * WhatsAppMessagingService — a porta ÚNICA de saída de WhatsApp do Foocci.
 *
 * HISTÓRIA, para ninguém reintroduzir o que saiu: até 04/08/2026 este serviço
 * escolhia entre dois provedores (`selectProvider` / `resolveProviderId` /
 * `getProviderSettings`), tinha um FALLBACK opcional para o outro provedor em
 * caso de falha e expunha `providers: { evolution, meta }`. A Evolution era uma
 * muleta do começo, usada enquanto a homologação da Meta não saía. A homologação
 * saiu, o CEO confirmou que NENHUM restaurante depende mais dela, e ela foi
 * eliminada do sistema.
 *
 * A regra agora é absoluta: **toda mensagem sai pelo aplicativo homologado.**
 * Não existe caminho alternativo — nem em erro de envio, nem em falha de banco.
 * Um segundo caminho, não homologado, é exatamente o risco de banimento que a
 * homologação eliminou. Se a Meta não puder enviar, o certo é FALHAR e AVISAR,
 * nunca sair por outro lugar.
 *
 * A única recusa deliberada que continua é a **janela de 24h da Meta**: fora
 * dela, mensagem livre é bloqueada com `META_TEMPLATE_REQUIRED` (status
 * `BLOCKED`) — e o caminho oficial passa a ser `sendTemplate`, com modelo
 * aprovado. Bloqueio é decisão de política, não falha de entrega; por isso ele
 * é reportado, não contornado.
 *
 * ⚠️ A flag `META_WHATSAPP_ENABLED` NÃO é consultada aqui de propósito. Com um
 * provedor só, deixá-la governar o envio significaria "flag desligada = sistema
 * mudo, sem log e sem erro" — perigo maior que o que ela evitava. Ela segue
 * valendo como portão de ONBOARDING/UI nas rotas de `integracoes/whatsapp/meta/*`
 * (conectar, templates, teste), onde desligar só impede configurar algo novo.
 */

import { prisma } from "@/lib/prisma";
import type { WhatsAppProviderId, SendResult, SendTextInput, SendTemplateInput, ConnectionStatus } from "./providers/types";
import { MetaWhatsAppCloudProvider } from "./providers/MetaWhatsAppCloudProvider";
import { decideMetaSend } from "./metaSendPolicy";
import { toMetaRecipient } from "./providers/metaPayload";
import { normalizePhoneBR } from "@/lib/crm/normalizePhone";

/** O provedor. Singular, e sem irmão — ver o cabeçalho antes de acrescentar outro. */
const meta = new MetaWhatsAppCloudProvider();

/** Most recent INBOUND WhatsApp message time for this phone (for the 24h window). */
async function getLastInboundAt(restaurantId: string, rawPhone: string): Promise<Date | null> {
  const phone = normalizePhoneBR(rawPhone);
  if (!phone) return null;
  const tail = phone.slice(-8); // match on the last 8 digits to tolerate DDI/9th-digit variance
  const msg = await prisma.message.findFirst({
    where: {
      direction: "INBOUND",
      conversation: {
        restaurantId,
        channel: "WHATSAPP",
        OR: [
          { customerPhone: { contains: tail } },
          { customer: { phone: { contains: tail } } },
        ],
      },
    },
    orderBy: { sentAt: "desc" },
    select:  { sentAt: true },
  });
  return msg?.sentAt ?? null;
}

export interface ConversationReplyInput {
  restaurantId:   string;
  conversationId: string;
  toPhone:        string;
  text:           string;
  senderType?:    string;                       // default "AI"
  metadata?:      Record<string, unknown>;
}

export const WhatsAppMessagingService = {
  /**
   * Texto livre. Aplica a janela de 24h da Meta e entrega ao provedor único.
   * Em bloqueio ou falha, devolve o resultado — **nunca** tenta outro caminho.
   */
  async sendText(input: SendTextInput): Promise<SendResult> {
    // Banco fora do ar = NÃO sabemos se estamos dentro da janela de 24h. Guardrail 1:
    // ausência de informação não é informação — não se deduz "pode mandar" do silêncio
    // do banco. Falha declarada e retryable, com o caso concreto no log (guardrail 6).
    let lastInboundAt: Date | null;
    try {
      lastInboundAt = await getLastInboundAt(input.restaurantId, input.to);
    } catch (err) {
      console.error("[WhatsAppMessagingService.sendText] janela de 24h não pôde ser verificada", { restaurantId: input.restaurantId, err });
      return {
        ok: false, provider: "META_CLOUD_API", status: "FAILED", providerMessageId: null,
        error: "Não foi possível verificar a janela de 24h da Meta; envio não realizado.",
        errorCode: "WINDOW_LOOKUP_FAILED", retryable: true,
      };
    }
    const decision = decideMetaSend({
      phoneValid:  toMetaRecipient(input.to) !== null,
      lastInboundAt,
      hasTemplate: false,
    });
    if (!decision.allowed) {
      return {
        ok: false, provider: "META_CLOUD_API", status: "BLOCKED", providerMessageId: null,
        blockReason: decision.reason, error: decision.message,
      };
    }
    return meta.sendText(input);
  },

  /**
   * Envio por modelo aprovado — o caminho OFICIAL para falar fora da janela de
   * 24h. Não há janela a checar aqui: é justamente para isso que o template
   * existe. Se o modelo não estiver aprovado, a própria Meta recusa e o erro
   * volta no `SendResult`.
   */
  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    return meta.sendTemplate(input);
  },

  /**
   * Resposta de conversa: envia o texto e persiste a mensagem OUTBOUND
   * (+ atualiza `lastMessageAt`). A persistência é best-effort e roda DEPOIS do
   * envio — falha de banco aqui não muda por onde a mensagem saiu (guardrail 5).
   */
  async sendConversationReply(input: ConversationReplyInput): Promise<SendResult> {
    const result = await this.sendText({ restaurantId: input.restaurantId, to: input.toPhone, text: input.text });
    const now = new Date();
    try {
      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId:    input.conversationId,
            direction:         "OUTBOUND",
            senderType:        input.senderType ?? "AI",
            content:           input.text,
            type:              "TEXT",
            sentAt:            now,
            externalMessageId: result.providerMessageId, // keep legacy field populated
            externalStatus:    result.ok ? "sent" : "failed",
            provider:          result.provider,
            providerMessageId: result.providerMessageId,
            providerStatus:    result.ok ? "sent" : (result.status === "BLOCKED" ? "blocked" : "failed"),
            providerError:     result.ok ? null : (result.blockReason ?? result.error ?? null),
            ...(result.ok ? {} : { errorMessage: result.blockReason ?? result.error ?? null }),
            ...(input.metadata ? { metadata: input.metadata as object } : {}),
          },
        }),
        prisma.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: now } }),
      ]);
    } catch (err) {
      console.error("[WhatsAppMessagingService.sendConversationReply] persist failed", err);
    }
    return result;
  },

  /**
   * Estado da conexão do restaurante. O segundo parâmetro sobrevive só para não
   * quebrar chamadas existentes: com um provedor só, ele não escolhe nada.
   */
  async getConnectionStatus(restaurantId: string, _providerId?: WhatsAppProviderId): Promise<ConnectionStatus> {
    return meta.getConnectionStatus(restaurantId);
  },
};
