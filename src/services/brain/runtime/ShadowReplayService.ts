/**
 * ShadowReplayService — treina o boletim do Brain com as conversas REAIS que já
 * temos, sem esperar tráfego novo.
 *
 * O shadow ao vivo raciocina em paralelo sobre CADA mensagem nova. Aqui fazemos
 * o mesmo PARA TRÁS: lemos as perguntas reais de cliente já armazenadas (todos os
 * canais), passamos cada uma pelo Brain com a base de conhecimento de HOJE, o
 * crítico avalia, e gravamos em brain_shadow_logs. Resultado: o boletim de
 * evidência (usado pelos gates da escada) nasce cheio em vez de vazio.
 *
 * Disciplina:
 *  • Só perguntas FORA do menu (saudação/"cardápio"/número são interação de menu,
 *    não raciocínio) — o mesmo filtro do shadow ao vivo.
 *  • Sanitiza tudo (zero PII) pelo mesmo caminho.
 *  • Idempotente: pula conversa cujo último inbound já foi replayado (marcador
 *    em brain_shadow_logs por conversationId+data).
 *  • dryRun: NÃO chama a IA — só conta elegíveis e estima custo/tokens.
 *  • maxSamples: teto rígido (controle de gasto). Nunca envia nada ao cliente,
 *    nunca toca runtime (runtimeTouched:false, por construção do reasonAsAgent).
 */

import { prisma } from "@/lib/prisma";
import { reasonAsAgent } from "../reasoning/BrainReasoner";
import { recordShadowOutcome } from "./BrainShadowEvidenceService";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";

const WINDOW_TURNS = 8;
const WINDOW_TURN_CHARS = 300;
// Custo aproximado por replay (1 chamada gpt-4o-mini, prompt+saída pequenos).
const EST_TOKENS_PER_REPLAY = 1200;
const EST_USD_PER_1K_TOKENS = 0.0004; // ordem de grandeza p/ estimativa, não cobrança

export interface ShadowReplayOptions {
  /** Início da janela (inclusive). Default: 60 dias atrás. */
  since?: Date;
  /** Fim da janela (exclusive). Default: agora. */
  until?: Date;
  /** Teto de conversas processadas (controle de gasto). Default: 500. */
  maxSamples?: number;
  /** Quando true, NÃO chama a IA — só conta e estima. */
  dryRun?: boolean;
}

export interface ShadowReplayResult {
  eligibleConversations: number;
  processed: number;
  skippedMenu: number;
  skippedAlreadyReplayed: number;
  errors: number;
  dryRun: boolean;
  estTokens: number;
  estUsd: number;
  runtimeTouched: false;
}

function estimate(n: number): { estTokens: number; estUsd: number } {
  const estTokens = n * EST_TOKENS_PER_REPLAY;
  return { estTokens, estUsd: Number(((estTokens / 1000) * EST_USD_PER_1K_TOKENS).toFixed(2)) };
}

async function isMenuInteraction(text: string): Promise<boolean> {
  const recep = await import("@/services/ai/WhatsAppReceptionistService");
  const t = text.trim();
  const intent = recep.detectIntent(t);
  return intent === "GREETING" || intent === "MENU_REQUEST" || recep.BACK_TO_MENU_RE.test(t) || /^\d+$/.test(t);
}

async function buildWindow(conversationId: string, upToSentAt: Date) {
  const msgs = await prisma.message.findMany({
    where: { conversationId, type: "TEXT", sentAt: { lte: upToSentAt } },
    orderBy: { sentAt: "desc" },
    take: WINDOW_TURNS,
    select: { direction: true, content: true },
  });
  return msgs.reverse().map((m) => ({
    role: m.direction === "INBOUND" ? ("CUSTOMER" as const) : ("AGENT" as const),
    content: sanitizeText(m.content).slice(0, WINDOW_TURN_CHARS),
  }));
}

/**
 * Replaya as conversas reais da janela pelo Brain, gravando evidência de sombra.
 * Best-effort por conversa: um erro isolado não derruba o lote.
 */
export async function replayShadowFromHistory(opts: ShadowReplayOptions = {}): Promise<ShadowReplayResult> {
  const until = opts.until ?? new Date();
  const since = opts.since ?? new Date(until.getTime() - 60 * 24 * 60 * 60 * 1000);
  const maxSamples = Math.max(1, Math.min(opts.maxSamples ?? 500, 20000));
  const dryRun = opts.dryRun === true;

  // Conversas com pelo menos uma mensagem de cliente (INBOUND TEXT) na janela.
  //
  // O pool de candidatos é DESACOPLADO de maxSamples de propósito: maxSamples é
  // teto de GASTO por chamada (quantas replayar), não de VARREDURA. Se o take
  // seguisse maxSamples, lotes pequenos só enxergariam sempre as MESMAS primeiras
  // conversas e a idempotência travaria o resto do corpus para trás. Ordenando de
  // forma determinística e varrendo um pool amplo, cada chamada processa o
  // PRÓXIMO lote ainda-não-replayado e o backfill avança até esgotar.
  const CANDIDATE_POOL = 20000;
  const convs = await prisma.conversation.findMany({
    where: { messages: { some: { direction: "INBOUND", type: "TEXT", sentAt: { gte: since, lt: until } } } },
    select: { id: true, restaurantId: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(CANDIDATE_POOL, Math.max(maxSamples * 2, 2000)),
  });

  const result: ShadowReplayResult = {
    eligibleConversations: convs.length,
    processed: 0,
    skippedMenu: 0,
    skippedAlreadyReplayed: 0,
    errors: 0,
    dryRun,
    estTokens: 0,
    estUsd: 0,
    runtimeTouched: false,
  };

  for (const conv of convs) {
    if (result.processed >= maxSamples) break;

    // A pergunta representativa: o último inbound de texto da janela.
    const lastInbound = await prisma.message
      .findFirst({
        where: { conversationId: conv.id, direction: "INBOUND", type: "TEXT", sentAt: { gte: since, lt: until } },
        orderBy: { sentAt: "desc" },
        select: { content: true, sentAt: true },
      })
      .catch(() => null);
    if (!lastInbound?.content?.trim()) continue;

    if (await isMenuInteraction(lastInbound.content)) {
      result.skippedMenu += 1;
      continue;
    }

    // Idempotência: já existe evidência dessa conversa nessa janela?
    const already = await prisma.brainShadowLog
      .findFirst({ where: { conversationId: conv.id, createdAt: { gte: since } }, select: { id: true } })
      .catch(() => null);
    if (already) {
      result.skippedAlreadyReplayed += 1;
      continue;
    }

    if (dryRun) {
      result.processed += 1; // conta como "seria processada"
      continue;
    }

    try {
      const sanitizedHistory = await buildWindow(conv.id, lastInbound.sentAt).catch(() => []);
      const outcome = await reasonAsAgent({
        businessId: conv.restaurantId,
        businessType: "RESTAURANT",
        agentId: "whatsapp",
        agentRole: "WhatsApp",
        sourceType: "REAL_CONVERSATION",
        sanitizedInput: sanitizeText(lastInbound.content.trim()),
        sanitizedHistory,
      });
      await recordShadowOutcome({
        restaurantId: conv.restaurantId,
        conversationId: conv.id,
        intent: outcome.result.primaryIntent,
        reasoningMode: outcome.reasoningMode,
        engine: `${outcome.engine.provider}:${outcome.engine.model}`,
        confidence: outcome.result.confidence,
        coherence: outcome.result.coherenceCheck.verdict,
        wouldEscalate: outcome.result.shouldEscalate,
        wouldReply: outcome.result.idealResponse,
      });
      result.processed += 1;
    } catch {
      result.errors += 1;
    }
  }

  const est = estimate(result.processed);
  result.estTokens = est.estTokens;
  result.estUsd = est.estUsd;
  return result;
}
