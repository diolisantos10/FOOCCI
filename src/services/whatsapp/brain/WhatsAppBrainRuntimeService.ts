/**
 * WhatsAppBrainRuntimeService — the Brain as the WhatsApp front door.
 *
 * Cutover (ON by default; set WHATSAPP_BRAIN_ENABLED=false to disable). When ON, this REPLACES
 * the old rule-based Receptionist as the intelligent default host: every TEXT
 * message that is not active order-building is answered by the Brain
 * (reasonAsAgent with the WhatsApp scope) — understanding the real intent, using
 * the restaurant knowledge as truth, and NEVER matching words against a menu.
 *
 * What it does NOT touch: order intent and active ordering sessions are routed to
 * the ordering engine BEFORE this runs (the routing contract). This is the smart
 * receptionist, not the order builder.
 *
 * Mirrors WhatsAppReceptionistService.respond(conversationId) so the webhook swap
 * is a one-line, flag-gated change. The Brain itself is read-only
 * (runtimeTouched:false); the only side effects here are sending the reply and,
 * when the Brain asks, a human handoff.
 */

import { ConversationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markConversationNeedsHuman } from "@/lib/handoff";
import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import type { SanitizedTurn } from "@/services/brain/core/BrainTypes";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";
import { isWhatsAppBrainShadowMode } from "./WhatsAppBrainReasoningAdapter";
import { resolveFreeFormAccess } from "@/services/brain/runtime/BrainFreeFormConfigService";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";
import { encaminharParaOCardapio, prometeuPedido } from "./promessaDePedido";

/** The Brain front door is ON for everyone by default; set WHATSAPP_BRAIN_ENABLED=false to disable. */
export function isWhatsAppBrainEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHATSAPP_BRAIN_ENABLED !== "false";
}

/**
 * Free-form agora é CONFIG GOVERNADA por restaurante (BrainFreeFormConfig),
 * não mais um const hardcoded. Escada: SHADOW_ONLY (default = comportamento
 * atual: recepcionista responde, Brain observa) → ALLOWLIST → RESTAURANT_WIDE.
 * Promoção exige gates (golden set com o caso rodízio p0=0 + completude da
 * verdade) via freeFormGovernance; rollback de 30s volta a SHADOW_ONLY.
 * No caminho vivo, o crítico claim-vs-snapshot + piso de confiança seguram
 * cada mensagem individualmente.
 */

export interface BrainReplyOutcome {
  status: "REPLIED" | "HANDOFF" | "SKIPPED";
  reason?: string;
}

// ── Conversation window: the Brain reasons over recent turns, not one sentence ──
const WINDOW_TURNS = 8;
const WINDOW_TURN_CHARS = 300;

// Memória durável do cliente (comportamental, sem PII) — best-effort.
async function loadCustomerMemory(restaurantId: string, customerId?: string | null): Promise<string> {
  if (!customerId) return "";
  try {
    const { buildCustomerMemory } = await import("@/services/brain/memory/CustomerMemoryService");
    return (await buildCustomerMemory(restaurantId, customerId)).summary;
  } catch {
    return "";
  }
}

async function buildSanitizedWindow(conversationId: string): Promise<SanitizedTurn[]> {
  const msgs = await prisma.message.findMany({
    where: { conversationId, type: "TEXT" },
    orderBy: { sentAt: "desc" },
    take: WINDOW_TURNS,
    select: { direction: true, content: true },
  });
  return msgs.reverse().map((m) => ({
    role: m.direction === "INBOUND" ? ("CUSTOMER" as const) : ("AGENT" as const),
    content: sanitizeText(m.content).slice(0, WINDOW_TURN_CHARS),
  }));
}

// ── Shadow mode: o Brain raciocina em paralelo SÓ para log/evidência — nunca
// responde o cliente. É o acúmulo de provas da escada de reativação do free-form
// (grep "[BrainShadow]" nos logs do Railway).
async function runShadowReasoning(
  conversationId: string,
  restaurantId: string,
  inboundText: string,
  customerId?: string | null,
): Promise<void> {
  if (!isWhatsAppBrainShadowMode() || !process.env.OPENAI_API_KEY) return;
  const sanitizedHistory = await buildSanitizedWindow(conversationId).catch(() => [] as SanitizedTurn[]);
  const customerMemory = await loadCustomerMemory(restaurantId, customerId);
  const outcome = await reasonAsAgent({
    businessId: restaurantId,
    businessType: "RESTAURANT",
    agentId: "whatsapp",
    agentRole: "WhatsApp",
    sourceType: "REAL_CONVERSATION",
    sanitizedInput: sanitizeText(inboundText),
    sanitizedHistory,
    ...(customerMemory ? { customerMemory } : {}),
  });
  console.log(
    "[BrainShadow]",
    JSON.stringify({
      conversationId,
      intent: outcome.result.primaryIntent,
      mode: outcome.reasoningMode,
      engine: `${outcome.engine.provider}:${outcome.engine.model}`,
      confidence: outcome.result.confidence,
      coherence: outcome.result.coherenceCheck.verdict,
      wouldEscalate: outcome.result.shouldEscalate,
      wouldReply: outcome.result.idealResponse.slice(0, 160),
    }),
  );
  // Evidência persistida (best-effort): alimenta os gates da escada de promoção.
  const { recordShadowOutcome } = await import("@/services/brain/runtime/BrainShadowEvidenceService");
  await recordShadowOutcome({
    restaurantId,
    conversationId,
    // Sombra ao vivo: o cliente REAL escreveu e foi atendido neste turno.
    sampleOrigin: "PRODUCTION",
    intent: outcome.result.primaryIntent,
    reasoningMode: outcome.reasoningMode,
    engine: `${outcome.engine.provider}:${outcome.engine.model}`,
    confidence: outcome.result.confidence,
    coherence: outcome.result.coherenceCheck.verdict,
    wouldEscalate: outcome.result.shouldEscalate,
    wouldReply: outcome.result.idealResponse,
  });
}

/**
 * AMOSTRA DO TOPO — o turno que o agente atendeu NO DEGRAU ALTO.
 *
 * Gravada em TODO desfecho do caminho ao vivo, e nao so quando o agente
 * responde. Se so os turnos respondidos contassem, a taxa seria 100% por
 * construcao — o critico so deixa passar o que ja e PASS — e a regua do topo
 * viraria enfeite aceso. O que se mede aqui e: das vezes em que ele esteve no
 * topo, quantas resolveu por si, e quantas precisaram de trava ou do
 * recepcionista deterministico.
 *
 * `coherence` e o veredito do TURNO INTEIRO, nao o do checador de coerencia:
 * PASS so quando a resposta do agente chegou ao cliente sem nenhuma trava ter
 * disparado.
 *
 * Best-effort e fire-and-forget: medir nunca atrasa nem quebra o atendimento.
 */
function registrarAmostraDoTopo(input: {
  restaurantId: string;
  conversationId: string;
  outcome: { result: { primaryIntent: string; confidence: number; shouldEscalate: boolean; idealResponse?: string }; reasoningMode: string; engine: { provider: string; model: string } };
  passou: boolean;
  motivo: string;
}): void {
  void (async () => {
    try {
      const { recordShadowOutcome } = await import("@/services/brain/runtime/BrainShadowEvidenceService");
      await recordShadowOutcome({
        restaurantId: input.restaurantId,
        conversationId: input.conversationId,
        agentId: "whatsapp",
        // Vida real dos dois lados: o cliente escreveu e foi atendido no topo.
        sampleOrigin: "PRODUCTION",
        stage: "LIVE",
        intent: input.outcome.result.primaryIntent,
        reasoningMode: input.outcome.reasoningMode,
        engine: `${input.outcome.engine.provider}:${input.outcome.engine.model}`,
        confidence: input.outcome.result.confidence,
        coherence: input.passou ? "PASS" : "FAIL",
        wouldEscalate: input.outcome.result.shouldEscalate,
        wouldReply: input.passou ? (input.outcome.result.idealResponse ?? "") : `[${input.motivo}]`,
      });
    } catch (err) {
      console.error("[BrainTopo] amostra do topo falhou:", err instanceof Error ? err.message : err);
    }
  })();
}

export const WhatsAppBrainRuntimeService = {
  /** Mirror of the Receptionist entry point — never throws into the webhook. */
  async respond(conversationId: string): Promise<BrainReplyOutcome> {
    try {
      return await run(conversationId);
    } catch (err) {
      console.error("[WhatsAppBrain] respond failed:", err);
      return { status: "SKIPPED", reason: "error" };
    }
  },
};

async function run(conversationId: string): Promise<BrainReplyOutcome> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      restaurantId: true,
      status: true,
      aiEnabled: true,
      customerPhone: true,
      customerName: true,
      customer: { select: { id: true, phone: true, name: true } },
    },
  });

  if (
    !conversation ||
    !conversation.aiEnabled ||
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.HUMANO_ASSUMIU ||
    conversation.status === ConversationStatus.RESOLVED
  ) {
    const motivo = !conversation
      ? "conversa não encontrada"
      : !conversation.aiEnabled
        ? "aiEnabled=false"
        : `status=${conversation.status}`;
    console.warn("[BrainDecision]", JSON.stringify({
      gate:           "conversation-not-eligible",
      reason:         `conversation not AI-eligible (${motivo})`,
      conversationId,
      restaurantId:   conversation?.restaurantId ?? null,
    }));
    return { status: "SKIPPED", reason: `conversation not AI-eligible (${motivo})` };
  }

  const resolvedPhone = (conversation.customer?.phone ?? conversation.customerPhone ?? "").trim();
  if (!resolvedPhone) {
    console.warn("[BrainDecision]", JSON.stringify({
      gate:           "no-phone",
      reason:         "no customer phone",
      conversationId,
      restaurantId:   conversation.restaurantId,
    }));
    return { status: "SKIPPED", reason: "no customer phone" };
  }

  const lastMessage = await prisma.message.findFirst({
    where: { conversationId, direction: "INBOUND" },
    orderBy: { sentAt: "desc" },
    select: { content: true, type: true, sentAt: true },
  });
  if (!lastMessage || lastMessage.type !== "TEXT" || !lastMessage.content.trim()) {
    console.warn("[BrainDecision]", JSON.stringify({
      gate:           "no-usable-text",
      reason:         "no usable inbound text",
      conversationId,
      restaurantId:   conversation.restaurantId,
      messageType:    lastMessage?.type ?? "NENHUMA",
    }));
    return { status: "SKIPPED", reason: "no usable inbound text" };
  }

  // Idempotency: skip if the AI already replied after this inbound message.
  const alreadyReplied = await prisma.message.findFirst({
    where: { conversationId, direction: "OUTBOUND", senderType: "AI", sentAt: { gte: lastMessage.sentAt } },
    select: { id: true },
  });
  if (alreadyReplied) {
    console.warn("[BrainDecision]", JSON.stringify({
      gate:           "already-replied",
      reason:         "already replied",
      conversationId,
      restaurantId:   conversation.restaurantId,
    }));
    return { status: "SKIPPED", reason: "already replied" };
  }

  // ── Menu is the fixed anchor — the Brain must respect it ───────────────────
  // Greetings, "menu"/"cardápio", the "0"/"voltar" shortcut and numbered
  // selections are deterministic menu interactions, handled by the Receptionist
  // (configured numbered menu, option flows, "0" back-to-menu) — NEVER answered
  // free-form by the Brain. The Brain only reasons about genuine off-menu
  // questions, and still keeps the "0" escape hatch on its reply (below).
  const recep = await import("@/services/ai/WhatsAppReceptionistService");
  const inboundText = lastMessage.content.trim();
  const menuIntent = recep.detectIntent(inboundText);
  const isMenuInteraction =
    menuIntent === "GREETING" ||
    menuIntent === "MENU_REQUEST" ||
    recep.BACK_TO_MENU_RE.test(inboundText) ||
    /^\d+$/.test(inboundText);
  if (isMenuInteraction) {
    console.warn("[BrainDecision]", JSON.stringify({ gate: "menu-anchor", intent: menuIntent, text: inboundText.slice(0, 60) }));
    await recep.WhatsAppReceptionistService.respond(conversationId);
    return { status: "REPLIED", reason: "menu-anchor" };
  }

  // ── MENU OBRIGATÓRIO NA PRIMEIRA ABORDAGEM ─────────────────────────────────
  // O menu é a experiência de entrada, sempre. Fora de uma sessão ativa (nenhuma
  // resposta do bot nos últimos 30 min — o mesmo limiar de sessão do
  // recepcionista), a PRIMEIRA mensagem SEMPRE abre o menu, mesmo que seja uma
  // pergunta direta. A inteligência livre do Brain só entra DEPOIS, dentro de uma
  // sessão já aberta pelo menu — quando o cliente sai do script por conta própria.
  const SESSION_WINDOW_MS = 30 * 60 * 1000;
  const activeSession = await prisma.message
    .findFirst({
      where: {
        conversationId,
        direction: "OUTBOUND",
        senderType: "AI",
        sentAt: { gte: new Date(Date.now() - SESSION_WINDOW_MS) },
      },
      select: { id: true },
    })
    .catch(() => null);
  if (!activeSession) {
    console.warn("[BrainDecision]", JSON.stringify({ gate: "first-contact-menu", text: inboundText.slice(0, 60) }));
    await recep.WhatsAppReceptionistService.respond(conversationId);
    return { status: "REPLIED", reason: "first-contact → menu obrigatório" };
  }

  // ── Free-form desligado: pergunta fora do menu NÃO vai pro LLM ──────────────
  // O recepcionista trata de forma determinística (intents conhecidos por
  // template; qualquer pergunta aberta → handoff para humano). Sem resposta
  // livre inventada pelo Brain.
  // ── Escada governada: só responde AO VIVO se a config do restaurante permitir
  // este telefone (SHADOW_ONLY/pausado/fora da allowlist → recepcionista).
  const freeForm = await resolveFreeFormAccess(conversation.restaurantId, resolvedPhone);
  if (!freeForm.allowed) {
    // Sombra (fire-and-forget): nunca atrasa nem toca a resposta determinística.
    void runShadowReasoning(conversationId, conversation.restaurantId, inboundText, conversation.customer?.id).catch(
      (err) => console.error("[BrainShadow] failed:", err),
    );
    await recep.WhatsAppReceptionistService.respond(conversationId);
    return { status: "REPLIED", reason: `free-form disabled (${freeForm.reason}) → receptionist` };
  }

  const { restaurantId } = conversation;

  // Reason via the Brain (WhatsApp scope). Truth (menu/prices/payments/hours) is
  // loaded inside the Brain from the knowledge snapshot; the sanitized window
  // gives it the recent conversation instead of a single sentence.
  const outcome = await reasonAsAgent({
    businessId: restaurantId,
    businessType: "RESTAURANT",
    agentId: "whatsapp",
    agentRole: "WhatsApp",
    sourceType: "REAL_CONVERSATION",
    sanitizedInput: sanitizeText(lastMessage.content.trim()),
    sanitizedHistory: await buildSanitizedWindow(conversationId).catch(() => [] as SanitizedTurn[]),
    ...(await loadCustomerMemory(restaurantId, conversation.customer?.id).then((m) => (m ? { customerMemory: m } : {}))),
  });

  // ── Portão da resposta vazia ────────────────────────────────────────────────
  // Até 28/08/2026 este portão CALAVA: devolvia SKIPPED sem log e sem rede,
  // enquanto os dois irmãos dele (crítico, adiante, e juiz) já caíam no
  // recepcionista. Isso era assimetria, não decisão — um LLM que devolve string
  // vazia não é motivo para o cliente ficar sem resposta, é motivo para o
  // determinístico assumir. Mesma rede dos irmãos, mesmo formato de log.
  const replyBruto = outcome.result.idealResponse?.trim();
  if (!replyBruto) {
    console.warn("[BrainDecision]", JSON.stringify({
      gate:           "empty-reply",
      reason:         "brain produced no reply",
      conversationId,
      restaurantId,
      text:           inboundText.slice(0, 60),
      mode:           outcome.reasoningMode,
    }));
    registrarAmostraDoTopo({ restaurantId, conversationId, outcome, passou: false, motivo: "empty reply gate" });
    await recep.WhatsAppReceptionistService.respond(conversationId);
    return { status: "REPLIED", reason: "brain produced no reply → receptionist" };
  }

  // ── Portão da promessa: este agente NÃO tem carrinho ────────────────────────
  // Uma cliente real ouviu "vou adicionar tare ao seu pedido" e "posso confirmar
  // o seu pedido agora?", respondeu "sim" duas vezes, e as duas caíram no vazio —
  // não havia pedido nenhum. O agente não alucinou um FATO: ele encenou uma
  // CAPACIDADE, e por isso nenhum verificador de preço ou de cardápio pegava.
  //
  // "Não prometa pedido" já estava escrito no perfil e não segurou. Prompt é
  // aviso; isto é a trava.
  //
  // A resposta certa aqui NÃO é cair no recepcionista: é mandar a pessoa para
  // onde o pedido realmente existe. O rodapé "0. menu" (colado adiante) abre o
  // menu numerado, cuja opção de pedido leva ao cardápio.
  const promessa = prometeuPedido(replyBruto);
  const reply = promessa.prometeu ? encaminharParaOCardapio() : replyBruto;
  if (promessa.prometeu) {
    console.warn("[BrainDecision]", JSON.stringify({
      gate:      "promessa-de-pedido",
      motivos:   promessa.motivos,
      text:      inboundText.slice(0, 60),
      candidate: replyBruto.slice(0, 100),
    }));
  }

  // ── Portão do crítico, POR MENSAGEM: raciocínio de verdade (LLM), coerente
  // com a base (claim-vs-snapshot PASS) e confiante o bastante — senão o
  // recepcionista determinístico assume. É o que impede um novo caso rodízio.
  const criticOk =
    outcome.reasoningMode === "LLM" &&
    outcome.result.coherenceCheck.verdict === "PASS" &&
    outcome.result.confidence >= freeForm.minConfidence;
  if (!criticOk) {
    console.warn("[BrainDecision]", JSON.stringify({
      gate: "critic",
      text: inboundText.slice(0, 60),
      mode: outcome.reasoningMode,
      coherence: outcome.result.coherenceCheck.verdict,
      confidence: Number(outcome.result.confidence.toFixed(2)),
      minConfidence: freeForm.minConfidence,
      snapshotSources: Object.keys(outcome.snapshot?.truthSources ?? {}),
      candidate: (outcome.result.idealResponse ?? "").slice(0, 80),
    }));
    registrarAmostraDoTopo({ restaurantId, conversationId, outcome, passou: false, motivo: "critic gate" });
    await recep.WhatsAppReceptionistService.respond(conversationId);
    return {
      status: "REPLIED",
      reason: `critic gate (${outcome.reasoningMode}/${outcome.result.coherenceCheck.verdict}/conf ${outcome.result.confidence.toFixed(2)}) → receptionist`,
    };
  }

  // ── Segundo crítico (LLM-judge, perfil JUDGE): reprovação explícita → recepcionista.
  // Indisponibilidade do judge NÃO bloqueia (o piso determinístico já passou).
  const { judgeReply } = await import("@/services/brain/reasoning/BrainCoherenceCritic");
  const verdict = await judgeReply({
    agentId: "whatsapp",
    businessId: restaurantId,
    customerMessage: sanitizeText(lastMessage.content.trim()),
    candidateReply: reply,
    snapshot: outcome.snapshot ?? { truthSources: {}, missingContext: [] },
  });
  if (!verdict.approved) {
    console.warn("[BrainDecision]", JSON.stringify({ gate: "judge", text: inboundText.slice(0, 60), reason: verdict.reason, candidate: reply.slice(0, 80) }));
    registrarAmostraDoTopo({ restaurantId, conversationId, outcome, passou: false, motivo: "judge gate" });
    await recep.WhatsAppReceptionistService.respond(conversationId);
    return { status: "REPLIED", reason: `judge gate (${verdict.reason}) → receptionist` };
  }

  // Keep the menu within reach on every free-form answer (skip on handoff).
  const anchoredReply =
    outcome.result.shouldEscalate || reply.includes("0. menu")
      ? reply
      : reply + recep.BACK_TO_MENU_FOOTER;

  const metadata = {
    source: "WHATSAPP_BRAIN",
    brainIntent: outcome.result.primaryIntent,
    brainMode: outcome.reasoningMode,
    brainEngine: `${outcome.engine.provider}:${outcome.engine.model}`,
  };

  // Canal único (04/08): a resposta sai pela Meta. Antes havia um ramo Evolution
  // aqui, escolhido por provedor do restaurante — ele saiu junto com a Evolution.
  // Falha da Meta vira SKIPPED com o motivo real: sem rede alternativa, calar sem
  // registrar seria o cliente esperando resposta que nunca vem.
  const sent = await WhatsAppMessagingService.sendConversationReply({
    restaurantId, conversationId, toPhone: resolvedPhone, text: anchoredReply, senderType: "AI", metadata,
  });
  // Falha de REDE nao vira amostra: mede a Meta, nao o agente. Contar isso como
  // erro de qualidade derrubaria o degrau por problema de operadora.
  if (!sent.ok) {
    const motivo = sent.blockReason ?? sent.error ?? "meta send failed";
    console.warn("[BrainDecision]", JSON.stringify({
      gate:           "meta-send-failed",
      reason:         motivo,
      conversationId,
      restaurantId,
      blockReason:    sent.blockReason ?? null,
      status:         sent.status ?? null,
    }));
    return { status: "SKIPPED", reason: motivo };
  }

  // Chegou ao cliente. PASS so se nenhuma trava precisou entrar no meio — a
  // promessa de pedido substituiu a resposta do agente, entao ela conta como
  // falha do topo mesmo tendo havido resposta.
  registrarAmostraDoTopo({
    restaurantId,
    conversationId,
    outcome,
    passou: !promessa.prometeu,
    motivo: "promessa de pedido (resposta substituida)",
  });

  // Escalate AFTER the reply is sent, so the customer still gets the Brain's
  // message and the next turn goes to a human.
  if (outcome.result.shouldEscalate) {
    await markConversationNeedsHuman(conversationId, "AI_ESCALATION").catch((err) =>
      console.error("[WhatsAppBrain] handoff failed:", err),
    );
    return { status: "HANDOFF", reason: outcome.result.escalationReason };
  }

  console.warn("[BrainDecision]", JSON.stringify({ gate: "replied", text: inboundText.slice(0, 60), intent: outcome.result.primaryIntent, confidence: Number(outcome.result.confidence.toFixed(2)) }));
  return { status: "REPLIED", reason: outcome.result.primaryIntent };
}
