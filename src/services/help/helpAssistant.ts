/**
 * helpAssistant — a ÚNICA porta de entrada do agente de suporte do lojista.
 *
 * FUSÃO DOS DOIS CÉREBROS (04/08/2026). Antes existiam dois:
 *   • a aba "Ajuda" chamava a OpenAI DIRETO daqui — fora do Brain, sem perfil
 *     declarado, sem snapshot de verdade, sem quality gate, sem coerência;
 *   • a aba "Ajuda técnica" (SupportIncidentReasoner) já passava pelo portão.
 * Dois cérebros = duas verdades e duas governanças. Agora existe UM: tudo passa
 * por reasonAsAgent({agentId:"suporte-tecnico"}) — o portão único da Regra de
 * Ouro (docs/brain-golden-rule.md, Lei 1). Este arquivo saiu da lista congelada
 * de architecture.test.ts: a lista só diminui.
 *
 * O QUE O AGENTE PASSA A SABER (verdade injetada como truthSource, não como prompt):
 *   1. MANUAL — os guias do lojista recuperados para ESTA pergunta (embeddings
 *      com fallback keyword, ver manualRetrieval);
 *   2. MAPA DE FALHAS — quando o relato casa com um modo de falha conhecido
 *      (ex.: impressora), o runbook curado entra junto;
 *   3. SINAIS DO SISTEMA — probe read-only, só quando há suspeita de incidente
 *      (dúvida de "como faço" não paga o custo de sondar o sistema);
 *   4. O NEGÓCIO — o snapshot do restaurante, que o Brain já carrega sozinho.
 *
 * PORTÃO DE SAÍDA: resposta com preço inventado NÃO chega ao lojista. O
 * verificador determinístico do Brain (SnapshotCoherenceVerifier) reprova, e nós
 * trocamos a fala por uma honesta que oferece o chamado. Portão que não registrou
 * resultado reprova — por isso o veredito viaja no HelpAnswer.
 *
 * Este módulo NÃO age: `runtimeTouched` continua false em todo caminho. Ele
 * responde, ensina, diagnostica e — quando não resolve — pede escalada.
 */

import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import { matchFailureModes, type FailureMode } from "@/services/support/SupportKnowledgeMap";
import { probeSystem } from "@/services/support/SupportSystemProbe";
import {
  retrieveRelevantChapters,
  type RetrievedChapter,
} from "./manualRetrieval";

export interface HelpHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface HelpAnswer {
  answer: string;
  sources: Array<{ slug: string; title: string }>;
  /** Havia trecho de manual (ou runbook) sustentando a resposta. */
  grounded: boolean;
  /** Proveniência: a IA-piloto raciocinou, ou caiu no piso determinístico. */
  reasoningMode: "LLM" | "FALLBACK";
  /** Veredito do portão de coerência do Brain — nunca fica sem registro. */
  coherence: "PASS" | "FAIL" | "NEEDS_REVIEW";
  /** O agente não resolve sozinho: a UI deve oferecer abrir chamado. */
  shouldEscalate: boolean;
  escalationReason?: string;
  /** Subsistema suspeito quando o relato casou com o mapa de falhas. */
  suspectedSubsystem: string | null;
}

const FALLBACK =
  "Não consegui acessar o assistente agora. Tente de novo em instantes — ou toque em “Falar com a FOOD” para abrir um chamado com a nossa equipe.";

/** Fala honesta quando o portão barra a resposta da IA. */
const BLOCKED =
  "Prefiro não arriscar uma resposta aqui: o que eu ia te dizer não bate com os dados cadastrados do seu restaurante. Toque em “Falar com a FOOD” que eu abro um chamado e a equipe te responde com a informação certa.";

/** Limite de turnos de histórico enviados ao Brain (janela curta, sem PII crua). */
const HISTORY_WINDOW = 6;

function manualTruth(chapters: RetrievedChapter[]): Array<Record<string, string>> {
  return chapters.map((c) => ({ guia: c.title, trecho: c.content }));
}

function failureTruth(mode: FailureMode): Record<string, unknown> {
  return {
    sintoma: mode.symptom,
    subsistema: mode.subsystem,
    causaProvavel: mode.likelyCause,
    severidade: mode.severity,
    runbook: [...mode.runbook],
  };
}

/**
 * Responde UMA pergunta do lojista pelo portão do Brain.
 * Nunca lança: qualquer falha vira resposta honesta com escalada sugerida.
 */
export async function answerHelpQuestion(params: {
  question: string;
  restaurantId: string;
  history?: HelpHistoryMessage[];
  restaurantName?: string;
}): Promise<HelpAnswer> {
  const { question, restaurantId, history = [] } = params;

  // 1. MANUAL — a verdade que ensina.
  let chapters: RetrievedChapter[] = [];
  try {
    chapters = await retrieveRelevantChapters(question, 4);
  } catch (err) {
    console.error("[helpAssistant] retrieval error:", err);
  }
  const sources = chapters.map((c) => ({ slug: c.slug, title: c.title }));

  // 2. MAPA DE FALHAS — determinístico e curado; a IA nunca inventa um modo.
  const suspected = matchFailureModes(question)[0] ?? null;

  // 3. SINAIS DO SISTEMA — só quando há suspeita de incidente. Uma dúvida de
  // "como cadastro um produto" não sonda o sistema (custo e ruído por nada).
  let systemSignals: Record<string, unknown> | undefined;
  if (suspected) {
    try {
      const snap = await probeSystem();
      systemSignals = {
        lidoEm: snap.takenAt,
        banco: snap.db.ok ? "respondendo" : `INACESSÍVEL (${snap.db.detail})`,
        leituraGeral: snap.summary,
        nota:
          "Item [opcional] ausente é informativo, NÃO é incidente e não explica um relato sobre outro assunto.",
      };
    } catch (err) {
      console.error("[helpAssistant] probe error:", err);
    }
  }

  const extraTruthSources: Record<string, unknown> = {};
  if (chapters.length) extraTruthSources.manual = manualTruth(chapters);
  if (suspected) extraTruthSources.modoDeFalhaSuspeito = failureTruth(suspected);
  if (systemSignals) extraTruthSources.systemSignals = systemSignals;

  const contextHints = [
    "Canal: painel do lojista (aba Ajuda). Você fala com o DONO do restaurante, nunca com o cliente final.",
    "Se a pergunta for 'como faço X', ENSINE: passo a passo numerado, com os nomes reais de tela e botão que estiverem no MANUAL.",
    "Se for um problema técnico e houver modo de falha suspeito, guie pelos primeiros passos do runbook em linguagem simples.",
    "Nunca cite 'segundo o manual' nem número de trecho — responda com naturalidade.",
    chapters.length
      ? `Trechos de manual disponíveis: ${chapters.length}.`
      : "Nenhum trecho de manual casou com a pergunta — se você não souber pela base, diga com honestidade e ofereça abrir um chamado (shouldEscalate=true). Não invente tela nem botão.",
    suspected
      ? `Modo de falha suspeito (do mapa curado): ${suspected.subsystem} — ${suspected.symptom}.`
      : "Nenhum modo de falha conhecido casou com o relato.",
    params.restaurantName ? `Restaurante: ${params.restaurantName}.` : "",
  ].filter(Boolean);

  const sanitizedHistory = history.slice(-HISTORY_WINDOW).map((m) => ({
    role: m.role === "assistant" ? ("AGENT" as const) : ("CUSTOMER" as const),
    content: m.content,
  }));

  const grounded = chapters.length > 0 || suspected !== null;

  try {
    const outcome = await reasonAsAgent({
      businessId: restaurantId,
      businessType: "RESTAURANT",
      agentId: "suporte-tecnico",
      agentRole: "SUPPORT",
      sourceType: "REAL_CONVERSATION",
      sanitizedInput: question,
      sanitizedHistory,
      contextHints,
      extraTruthSources,
    });

    const verdict = outcome.result.coherenceCheck?.verdict ?? "NEEDS_REVIEW";
    const invented = outcome.result.coherenceCheck?.doesNotInventFacts === false;
    const text = (outcome.result.idealResponse ?? "").trim();

    // Portão de saída: fato inventado nunca chega ao lojista.
    if (invented) {
      return {
        answer: BLOCKED,
        sources,
        grounded,
        reasoningMode: outcome.reasoningMode,
        coherence: verdict,
        shouldEscalate: true,
        escalationReason:
          outcome.result.coherenceCheck?.reason ?? "resposta reprovada no portão de coerência",
        suspectedSubsystem: suspected?.subsystem ?? null,
      };
    }

    // Sem IA-piloto (ou erro no motor) a fala da IA não existe — não fingimos.
    if (outcome.reasoningMode !== "LLM" || !text) {
      return {
        answer: FALLBACK,
        sources,
        grounded,
        reasoningMode: outcome.reasoningMode,
        coherence: verdict,
        shouldEscalate: true,
        escalationReason: outcome.result.escalationReason ?? "assistente indisponível",
        suspectedSubsystem: suspected?.subsystem ?? null,
      };
    }

    return {
      answer: text,
      sources,
      grounded,
      reasoningMode: "LLM",
      coherence: verdict,
      shouldEscalate: outcome.result.shouldEscalate === true,
      escalationReason: outcome.result.escalationReason,
      suspectedSubsystem: suspected?.subsystem ?? null,
    };
  } catch (err) {
    console.error("[helpAssistant] Brain error:", err);
    return {
      answer: FALLBACK,
      sources,
      grounded,
      reasoningMode: "FALLBACK",
      coherence: "NEEDS_REVIEW",
      shouldEscalate: true,
      escalationReason: err instanceof Error ? err.message.slice(0, 120) : "erro no portão do Brain",
      suspectedSubsystem: suspected?.subsystem ?? null,
    };
  }
}
