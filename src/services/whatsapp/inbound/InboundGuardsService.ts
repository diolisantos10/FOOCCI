/**
 * Guardas de entrada do WhatsApp — as proteções que rodam ANTES de qualquer
 * agente responder, independente do provedor.
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 * O CEO decidiu em 02/08 que a Foocci fica só na Meta e a Evolution sai. Ao medir
 * a migração, o webhook da Meta se revelou uma casca: ele grava a mensagem e chama
 * o Cérebro, e **pula todas as proteções** que o webhook da Evolution aplica.
 *
 * O comentário no código da Meta dizia *"feed the same agent pipeline Evolution
 * uses"*. Não alimentava. Isso não é detalhe de implementação — é a diferença
 * entre respeitar e ignorar um "PARAR" do cliente.
 *
 * ── O que estas guardas cobrem, e o que custa não ter ────────────────────────
 *
 * | Guarda | O que custa não ter |
 * |---|---|
 * | opt-out de entrada | cliente pede PARAR e continua recebendo → denúncia, bloqueio do número |
 * | atribuição de CRM | campanha vira venda e ninguém sabe que foi ela |
 * | resgate de carrinho | cliente que respondeu fica preso com a IA em vez de gente |
 * | política de IA | trava de Staff/Fornecedor (P0-A) ignorada — a IA responde para quem não é cliente |
 *
 * ── Desenho ──────────────────────────────────────────────────────────────────
 * ADITIVO por construção: este módulo é novo e **não altera uma linha do caminho
 * da Evolution**, que está em produção atendendo todos os restaurantes. Ele
 * reimplementa a mesma sequência chamando exatamente os mesmos serviços, para o
 * comportamento ser o mesmo sem precisar refatorar código vivo na véspera de uma
 * migração.
 *
 * Quando a Evolution sair, o processador dela morre e este módulo fica como o
 * único caminho — que é o objetivo.
 *
 * ⚠️ **Nunca lança.** Uma guarda que derruba o webhook é pior que a ausência dela:
 * a Meta desativa a inscrição depois de falhas repetidas, e aí o restaurante perde
 * TODAS as mensagens. É o guardrail 5 — proteção que dispara não pode ser mais
 * destrutiva que o problema que ela evita.
 */

import { prisma } from "@/lib/prisma";
import { ContactSafetyService } from "@/services/crm/ContactSafetyService";
import { markCrmReplyIfApplicable } from "@/services/agents/AgentRoutingService";
import { markConversationNeedsHuman } from "@/lib/handoff";
import { shouldAiRespond } from "@/services/conversation/ConversationAiPolicyService";

export interface InboundGuardsInput {
  conversationId: string;
  restaurantId:   string;
  /** null quando a conversa ainda não tem cliente de CRM associado. */
  customerId:     string | null;
  /** Texto da mensagem. null para mídia. */
  messageText:    string | null;
  /** true apenas para mensagem de texto — opt-out não se detecta em áudio ou imagem. */
  isTextMessage:  boolean;
}

export interface InboundGuardsResult {
  /** false = nenhum agente pode responder este turno. */
  aiMayRespond: boolean;
  /** Por que não pode. Sempre preenchido quando `aiMayRespond` é false. */
  reason: string | null;
  /** O cliente pediu para sair NESTE turno. */
  optedOutThisTurn: boolean;
  /** A conversa nasceu de resgate de carrinho e foi passada para humano. */
  cartRecoveryHandoff: boolean;
}

/** Quando nem a conversa existe, a resposta segura é "não responda". */
const DENY: InboundGuardsResult = {
  aiMayRespond: false,
  reason: "CONVERSA_NAO_ENCONTRADA",
  optedOutThisTurn: false,
  cartRecoveryHandoff: false,
};

export const InboundGuardsService = {
  /**
   * Roda as guardas e devolve se algum agente pode responder.
   *
   * A ordem importa e é a mesma do caminho da Evolution: atribuição e opt-out
   * primeiro (efeitos que valem mesmo quando a IA não vai responder), decisão
   * depois.
   */
  async apply(input: InboundGuardsInput): Promise<InboundGuardsResult> {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: {
          aiEnabled:        true,
          aiLocked:         true,
          conversationType: true,
          status:           true,
          contextType:      true,
        },
      });
      if (!conv) return DENY;

      // 1 · Atribuição de CRM — o cliente respondeu a uma campanha.
      //     Vale mesmo se a IA não for responder: é medição de receita, não de
      //     conversa. Fire-and-forget: nunca segura o caminho quente.
      void markCrmReplyIfApplicable(input.conversationId).catch(() => {});

      // 2 · Opt-out (LGPD) — "PARAR", "SAIR", "STOP"…
      //     Só em texto. AGUARDA de propósito: se o cliente pediu para sair, a
      //     decisão de responder depende disto. Fire-and-forget aqui criaria uma
      //     corrida em que a IA responde a quem acabou de pedir silêncio.
      let optedOutThisTurn = false;
      if (input.isTextMessage && input.customerId) {
        optedOutThisTurn = await ContactSafetyService.applyInboundOptOut(
          input.restaurantId,
          input.customerId,
          input.messageText,
        ).catch(() => false);
      } else if (input.isTextMessage && !input.customerId) {
        // Texto sem cliente vinculado: não dá para marcar quem pediu para sair.
        // Isso já foi um furo silencioso de LGPD — o webhook agora cura a
        // conversa antes de chegar aqui, então este ramo é a última rede. Ele
        // GRITA em vez de passar batido: alerta que não carrega o caso concreto
        // é ruído que ninguém investiga (guardrail 6).
        console.error("[InboundGuards] mensagem de texto sem customerId — opt-out NÃO pôde ser aplicado neste turno", {
          conversationId: input.conversationId,
          restaurantId:   input.restaurantId,
        });
      }

      // 3 · Resgate de carrinho — quem responde a essa mensagem quer gente, não IA.
      const cartRecoveryHandoff = conv.contextType === "CART_RECOVERY";
      if (cartRecoveryHandoff) {
        void markConversationNeedsHuman(input.conversationId, "CART_RECOVERY").catch((err) =>
          console.error("[InboundGuards] handoff de resgate de carrinho falhou:", err),
        );
      }

      // 4 · Política central de IA — inclui a trava permanente de Staff/Fornecedor
      //     (P0-A). Esta é a que o webhook da Meta não tinha: sem ela, a IA
      //     responde numa conversa marcada como não-cliente.
      const decision = shouldAiRespond(conv);

      const aiMayRespond = decision.allowed && !cartRecoveryHandoff && !optedOutThisTurn;

      return {
        aiMayRespond,
        reason: aiMayRespond
          ? null
          : optedOutThisTurn    ? "OPT_OUT_NESTE_TURNO"
          : cartRecoveryHandoff ? "RESGATE_DE_CARRINHO"
          : decision.reason,
        optedOutThisTurn,
        cartRecoveryHandoff,
      };
    } catch (err) {
      // Falha inesperada NÃO pode derrubar o webhook nem liberar a IA por omissão.
      // Guardrail 1: ausência de informação não é informação — sem conseguir
      // decidir, a resposta é não responder.
      console.error("[InboundGuards] falha ao aplicar guardas — negando por segurança:", err);
      return { ...DENY, reason: "ERRO_NAS_GUARDAS" };
    }
  },
};
