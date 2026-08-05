/**
 * InboundAgentDispatch — quem responde a mensagem que acabou de entrar.
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 * Até 04/08/2026 esta decisão morava DENTRO do processador do webhook da
 * Evolution (`WebhookProcessorService.handleInboundMessage`), e o webhook da Meta
 * não a tinha: ele gravava a mensagem e chamava o Cérebro, e só. Estava
 * registrado em `docs/decisoes.md` que os dois webhooks **não eram simétricos**.
 *
 * Com a Evolution eliminada do Foocci por ordem do CEO, o webhook da Evolution é
 * apagado — e apagar sem paridade seria derrubar recurso em produção. Este módulo
 * é a paridade: a mesma sequência, os mesmos serviços, na mesma ordem.
 *
 * ── O que ele carrega (o que se perderia sem ele) ────────────────────────────
 *
 * | Item | O que custa não ter |
 * |---|---|
 * | comandos do Build OS | `/build` viraria mensagem de cliente e chegaria na IA |
 * | pedido por texto | o piloto controlado simplesmente não roteia; ninguém pede |
 * | `agentMode` | AI_ORDERING_EXPERIMENTAL e MENU_ONLY deixariam de valer |
 * | recepcionista p/ mídia | áudio e foto ficariam sem resposta (o Cérebro só trata texto) |
 * | rastro `[WA-TextOrdering]` | a pergunta nº 1 do suporte volta a não ter resposta |
 *
 * ⚠️ As guardas de entrada (opt-out, atribuição de CRM, resgate de carrinho,
 * política de IA) **não estão aqui** — elas rodam ANTES, em `InboundGuardsService`.
 * Este módulo pressupõe que já foram aplicadas e que a IA está liberada.
 *
 * ⚠️ **Nunca lança.** Erro aqui vira log e o turno segue: um dispatcher que
 * derruba o webhook faz a Meta desativar a inscrição e o restaurante perde TODAS
 * as mensagens (guardrail 5).
 */

import { prisma } from "@/lib/prisma";
import { isInternalCommandText } from "@/services/buildos/BuildCommandRouter";
import { resolveBuildOsChannel } from "@/services/buildos/BuildOSConfigService";
import { maskPhone } from "@/lib/wa-text-ordering-flag";
import { getMessageAwareRoutingDecision } from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";

export interface InboundDispatchInput {
  restaurantId:   string;
  conversationId: string;
  customerId:     string | null;
  /** Telefone do cliente, já normalizado pelo webhook (wa_id). */
  phone:          string;
  messageText:    string | null;
  isTextMessage:  boolean;
  /** `phone_number_id` da Meta onde a mensagem chegou — a identidade do canal. */
  channelId:      string | null;
}

export type InboundHandler =
  | "BUILD_OS"
  | "TEXT_ORDERING"
  | "AI_ORDERING"
  | "BRAIN"
  | "RECEPTIONIST"
  | "NENHUM";

export interface InboundDispatchResult {
  handler: InboundHandler;
  /** Por que este e não outro. Sempre preenchido — o log carrega a evidência. */
  reason:  string;
}

/** O Cérebro é a porta padrão para TEXTO; `WHATSAPP_BRAIN_ENABLED=false` desliga. */
function isBrainEnabled(): boolean {
  return process.env.WHATSAPP_BRAIN_ENABLED !== "false";
}

/**
 * Comando interno do Build OS (`/build`, `/cmd`, `/prompt`).
 *
 * INVARIANTE DURA, preservada do caminho antigo: qualquer prefixo interno é
 * interceptado ANTES do fluxo de cliente **mesmo que o handler exploda**. Num
 * número de restaurante o comando é SUPRIMIDO, nunca executado — quem aplica esse
 * portão é o próprio `handleBuildCommand`.
 */
export async function interceptBuildOsCommand(input: {
  restaurantId: string | null;
  phone:        string;
  senderName?:  string;
  content:      string;
  channelId:    string | null;
  fromMe?:      boolean;
}): Promise<{ intercepted: boolean; reason: string }> {
  try {
    const channel     = await resolveBuildOsChannel(input.channelId);
    const isCommand   = isInternalCommandText(input.content);
    // Fora do canal Master, só um prefixo de comando justifica interceptar.
    if (!channel.isBuildOsChannel && !isCommand) return { intercepted: false, reason: "não é comando" };

    const { handleBuildCommand } = await import("@/services/buildos/handleBuildCommand");
    const result = await handleBuildCommand({
      restaurantId:     input.restaurantId,
      phone:            input.phone,
      senderName:       input.senderName,
      content:          input.content,
      fromMe:           input.fromMe ?? false,
      channelId:        input.channelId ?? undefined,
      isBuildOsChannel: channel.isBuildOsChannel,
      masterConfigured: channel.masterConfigured,
    });
    if (result.isBuildCommand) {
      return { intercepted: true, reason: channel.isBuildOsChannel ? "comando do Build OS" : "comando suprimido fora do Master" };
    }
    return { intercepted: false, reason: "não era comando do Build OS" };
  } catch (err) {
    // O prefixo NUNCA pode vazar para a IA por causa de uma exceção — é a
    // invariante de supressão dura do caminho antigo, preservada aqui.
    const isCommand = (() => { try { return isInternalCommandText(input.content); } catch { return false; } })();
    console.error("[InboundAgentDispatch] Build OS falhou (suprimido mesmo assim):", err);
    return { intercepted: isCommand, reason: "erro no Build OS — prefixo suprimido" };
  }
}

/**
 * Escolhe e aciona o agente. Chamar SOMENTE depois das guardas de entrada.
 */
export async function dispatchInboundAgent(input: InboundDispatchInput): Promise<InboundDispatchResult> {
  try {
    const text = (input.messageText ?? "").trim();

    // ── 1 · Pedido por texto ────────────────────────────────────────────────
    // Contrato de roteamento (idêntico ao caminho antigo): o agente/host é o
    // padrão; o Pedido por Texto é FERRAMENTA e só entra quando o cliente está
    // de fato pedindo — `routingEligible && (sessão ativa || intenção de pedido)`.
    // Saudação, cardápio, horário e conversa geral ficam com o host.
    let textOrderingHandled = false;
    let runtimeCalled       = false;
    let runtimeHandled      = false;
    let replyProduced       = false;
    let replySent           = false;
    let handoffApplied      = false;
    let runtimeMode: string | null    = null;
    let fallbackReason: string | null = null;

    const routingDecision = input.isTextMessage && text
      ? await getMessageAwareRoutingDecision({
          restaurantId:   input.restaurantId,
          phone:          input.phone,
          messageText:    text,
          conversationId: input.conversationId,
        }).catch((err) => {
          // Falha de roteamento não pode calar o cliente: cai no host.
          console.error("[InboundAgentDispatch] decisão de roteamento falhou — host assume:", err);
          return null;
        })
      : null;

    if (routingDecision?.wouldRouteToTextOrdering) {
      runtimeCalled = true;
      try {
        const { handleInboundForOrdering } = await import(
          "@/services/whatsapp/ordering/WhatsAppTextOrderingRuntimeService"
        );
        // AGUARDA de propósito: só sabemos se o motor realmente atendeu depois que
        // ele volta. Bloquear o host num fire-and-forget engole a mensagem do
        // cliente quando o motor declina, erra ou não manda nada.
        const decision = await handleInboundForOrdering({
          restaurantId:   input.restaurantId,
          phone:          input.phone,
          conversationId: input.conversationId,
          customerId:     input.customerId ?? undefined,
          messageText:    text,
        });
        runtimeHandled = decision.handled;
        replyProduced  = Boolean(decision.result?.suggestedReply);
        replySent      = decision.replySent;
        handoffApplied = decision.handoffApplied;
        runtimeMode    = decision.mode;
        // "Atendeu de verdade" = mandou/salvou resposta OU aplicou handoff de
        // propósito. `handled=true` seco (DRY_RUN, guarda que declinou, falha de
        // envio antes de salvar) NÃO pode bloquear o host.
        textOrderingHandled = decision.handled && (decision.replySent || decision.handoffApplied);
        if (!textOrderingHandled) {
          fallbackReason =
            decision.blockedReason
            ?? (!decision.handled
                  ? "motor devolveu handled=false"
                  : !decision.replyWouldSend
                    ? `modo=${decision.mode} não permite resposta (DRY_RUN_ONLY observa em silêncio)`
                    : !replyProduced
                      ? "motor não produziu resposta neste turno"
                      : "resposta não enviada (config da Meta ausente ou envio falhou)");
          console.warn("[WA-TextOrdering] motor não atendeu de fato — caindo para o host", {
            restaurantId:   input.restaurantId,
            phoneMasked:    maskPhone(input.phone),
            handled:        decision.handled,
            replyWouldSend: decision.replyWouldSend,
            replyProduced,
            replySent:      decision.replySent,
            handoffApplied: decision.handoffApplied,
            mode:           decision.mode,
            blockedReason:  decision.blockedReason,
            fallbackReason,
          });
        }
      } catch (err) {
        fallbackReason = `erro no motor: ${err instanceof Error ? err.message : String(err)}`;
        console.error("[InboundAgentDispatch] motor de pedido por texto falhou — host assume:", err);
        textOrderingHandled = false;
      }
    }

    // ── 2 · Host: agentMode decide quem responde ────────────────────────────
    let handler: InboundHandler = "TEXT_ORDERING";
    let reason = "pedido por texto atendeu o turno";

    if (!textOrderingHandled) {
      const agentCfg = await prisma.whatsAppAgentConfig.findUnique({
        where:  { restaurantId: input.restaurantId },
        select: { agentMode: true },
      }).catch(() => null);
      const agentMode = agentCfg?.agentMode ?? "RECEPTIONIST_ONLY";

      if (agentMode === "AI_ORDERING_EXPERIMENTAL") {
        handler = "AI_ORDERING";
        reason  = "agentMode=AI_ORDERING_EXPERIMENTAL";
        void import("@/services/ai/AIOrderService")
          .then(({ AIOrderService }) =>
            AIOrderService.processTurn(input.conversationId).catch((err) =>
              console.error("[InboundAgentDispatch] turno do AI ordering falhou:", err)))
          .catch((err) => console.error("[InboundAgentDispatch] AIOrderService não carregou:", err));
      } else if (agentMode !== "MENU_ONLY" && isBrainEnabled() && input.isTextMessage && text) {
        // Cérebro: porta padrão do TEXTO. Mídia/áudio cai no recepcionista.
        handler = "BRAIN";
        reason  = "texto com Cérebro ligado";
        void import("@/services/whatsapp/brain/WhatsAppBrainRuntimeService")
          .then(({ WhatsAppBrainRuntimeService }) =>
            WhatsAppBrainRuntimeService.respond(input.conversationId).catch((err) =>
              console.error("[InboundAgentDispatch] Cérebro falhou:", err)))
          .catch((err) => console.error("[InboundAgentDispatch] Cérebro não carregou:", err));
      } else {
        handler = "RECEPTIONIST";
        reason  = agentMode === "MENU_ONLY" ? "agentMode=MENU_ONLY"
                : !input.isTextMessage      ? "mensagem sem texto (mídia/áudio)"
                : "Cérebro desligado";
        void import("@/services/ai/WhatsAppReceptionistService")
          .then(({ WhatsAppReceptionistService }) =>
            WhatsAppReceptionistService.respond(input.conversationId).catch((err) =>
              console.error("[InboundAgentDispatch] recepcionista falhou:", err)))
          .catch((err) => console.error("[InboundAgentDispatch] recepcionista não carregou:", err));
      }
    }

    // ── 3 · Rastro vivo ─────────────────────────────────────────────────────
    // Só quando o Pedido por Texto está em jogo (linha de config no banco OU flag
    // de ambiente): teste ao vivo depurável sem barulho para quem nunca ligou.
    if (
      routingDecision &&
      (routingDecision.config.dbConfigPresent || process.env.WHATSAPP_TEXT_ORDERING_ENABLED !== undefined)
    ) {
      const cfg = routingDecision.config;
      console.log("[WA-TextOrdering] routing decision", {
        restaurantId:          input.restaurantId,
        phoneMasked:           maskPhone(input.phone),
        source:                cfg.source,
        dbConfigPresent:       cfg.dbConfigPresent,
        globalKillSwitch:      cfg.globalKillSwitch,
        mode:                  cfg.mode,
        scope:                 cfg.scope,
        paused:                cfg.paused,
        enabled:               cfg.masterEnabled,
        restaurantAllowlisted: cfg.restaurantAllowlisted,
        enabledForRestaurant:  cfg.enabledForRestaurant,
        phoneAllowlisted:      cfg.phoneAllowlisted,
        messageLen:            text.length,
        detectedIntent:        routingDecision.detectedIntent,
        messageHasOrderIntent: routingDecision.messageHasOrderIntent,
        hasActiveSession:      routingDecision.hasActiveSession,
        replyCapable:          routingDecision.replyCapable,
        shouldUseTextOrdering: routingDecision.wouldRouteToTextOrdering,
        declineReason:         routingDecision.declineReason,
        runtimeCalled,
        runtimeHandled,
        runtimeMode,
        replyProduced,
        replySent,
        handoffApplied,
        textOrderingHandled,
        fallbackToOldAgent:    !textOrderingHandled,
        fallbackReason,
        effectiveFinalHandler: routingDecision.effectiveFinalHandler,
        finalHandler:          handler,
      });
    }

    return { handler, reason };
  } catch (err) {
    // Guardrail 5: a proteção não pode ser mais destrutiva que o problema.
    console.error("[InboundAgentDispatch] falha inesperada — nenhum agente acionado:", err);
    return { handler: "NENHUM", reason: "erro no despacho" };
  }
}
