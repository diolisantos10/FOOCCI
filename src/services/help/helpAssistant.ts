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
 * O AGENTE PASSA A PROPOR AÇÃO (04/08/2026, passo 3) — sem virar executor:
 *   • o Brain recebe uma ALLOWLIST de ações e devolve, no máximo, uma CHAVE
 *     (BrainReasoningResult.proposedActionKey). Sem tool-calling, sem comando;
 *   • quem age é o SupportActionExecutor, FORA do Brain, e hoje em SOMBRA:
 *     nada roda, a proposta vira botão que leva o lojista à tela onde ELE
 *     confirma. `runtimeTouched` continua false em todo caminho.
 *
 * SEGUNDO PORTÃO DE SAÍDA: o agente mentindo sobre SI MESMO. O verificador de
 * fato pega preço inventado; ele é cego para "pronto, já subi seu cardápio".
 * Agora o veredito de capacidade viaja no coherenceCheck e, se ele não vier
 * PASS explícito, a fala NÃO chega ao lojista — portão que não registrou
 * resultado reprova.
 */

import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import { matchFailureModes, type FailureMode } from "@/services/support/SupportKnowledgeMap";
import { probeSystem } from "@/services/support/SupportSystemProbe";
import { listProposableActions } from "@/services/support/actions/SupportActionCatalog";
import {
  proposeSupportAction,
  type SupportActionProposal,
} from "@/services/support/actions/SupportActionExecutor";
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
  /**
   * Ação que o agente PROPÔS neste turno (ex.: subir o cardápio), com o botão
   * que leva o lojista à tela onde ELE confirma. null = nenhuma. Nunca é uma
   * ação já executada: em sombra, `executed` é sempre false.
   */
  proposedAction: SupportActionProposal | null;
}

const FALLBACK =
  "Não consegui acessar o assistente agora. Tente de novo em instantes — ou toque em “Falar com a FOOD” para abrir um chamado com a nossa equipe.";

/** Fala honesta quando o portão barra a resposta da IA (mentira sobre o MUNDO). */
const BLOCKED =
  "Prefiro não arriscar uma resposta aqui: o que eu ia te dizer não bate com os dados cadastrados do seu restaurante. Toque em “Falar com a FOOD” que eu abro um chamado e a equipe te responde com a informação certa.";

/**
 * Fala honesta quando o portão barra a mentira sobre SI MESMO. Diferente da de
 * cima de propósito: aqui o erro não foi um dado errado, foi eu me atribuir uma
 * coisa que não fiz — e o lojista precisa saber exatamente disso, senão vai
 * embora achando que o cardápio está no ar.
 */
const OVERPROMISED =
  "Corrigindo antes de te enganar: eu ia dizer que já tinha feito isso, e não fiz — eu não altero nada sozinho. O que eu consigo é te levar até a tela certa e preparar a prévia; quem confirma é sempre você. Se preferir, toque em “Falar com a FOOD” que a equipe faz junto com você.";

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
  /** Thread da Ajuda — amarra a evidência da proposta à conversa real. */
  conversationId?: string;
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
    "Você NÃO executou nada neste turno. Se o lojista pedir para você FAZER algo, ofereça no futuro e proponha a ação pela chave — nunca diga que já fez.",
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
      // A allowlist fechada: a IA escolhe uma CHAVE daqui, ou nenhuma.
      proposableActions: listProposableActions(),
      // NADA foi executado antes de raciocinar — e dizer isso explicitamente é o
      // que dá dente ao verificador de capacidade.
      executedThisTurn: [],
    });

    const verdict = outcome.result.coherenceCheck?.verdict ?? "NEEDS_REVIEW";
    const invented = outcome.result.coherenceCheck?.doesNotInventFacts === false;
    // Portão que não registrou resultado REPROVA: exigimos o true explícito.
    const overpromised = outcome.result.coherenceCheck?.doesNotClaimUnexecutedAction !== true;
    const text = (outcome.result.idealResponse ?? "").trim();

    // Portão de saída 1 — mentira sobre o MUNDO: fato inventado nunca chega ao lojista.
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
        proposedAction: null,
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
        proposedAction: null,
      };
    }

    // Portão de saída 2 — mentira sobre SI MESMO: "já subi seu cardápio" sem ter
    // subido não chega ao lojista. É a trava que o verificador de fato não faz.
    if (overpromised) {
      return {
        answer: OVERPROMISED,
        sources,
        grounded,
        reasoningMode: outcome.reasoningMode,
        coherence: verdict === "PASS" ? "NEEDS_REVIEW" : verdict,
        shouldEscalate: true,
        escalationReason:
          outcome.result.coherenceCheck?.reason ?? "afirmou execução sem execução registrada",
        suspectedSubsystem: suspected?.subsystem ?? null,
        proposedAction: null,
      };
    }

    // A ação: o Brain só devolveu a CHAVE. Quem decide o que fazer com ela é o
    // executor, fora do Brain — e hoje, em sombra, ele só propõe.
    const proposedAction = await proposeSupportAction({
      actionKey: outcome.result.proposedActionKey,
      restaurantId,
      conversationId: params.conversationId ?? "help",
      evidence: { coherence: verdict, confidence: outcome.result.confidence ?? 0 },
    }).catch(() => null);

    return {
      answer: text,
      sources,
      grounded,
      reasoningMode: "LLM",
      coherence: verdict,
      shouldEscalate: outcome.result.shouldEscalate === true,
      escalationReason: outcome.result.escalationReason,
      suspectedSubsystem: suspected?.subsystem ?? null,
      proposedAction,
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
      proposedAction: null,
    };
  }
}
