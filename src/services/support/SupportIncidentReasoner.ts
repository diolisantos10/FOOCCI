/**
 * SupportIncidentReasoner — o "cérebro" do Agente de Suporte Técnico.
 *
 * Recebe o RELATO do usuário (texto) e devolve um DIAGNÓSTICO, pelo MESMO portão
 * governado dos outros agentes — reasonAsAgent({agentId:"suporte-tecnico"}) —
 * ancorado em:
 *   • sinais READ-ONLY do sistema agora (SupportSystemProbe),
 *   • o mapa do sistema + modos de falha conhecidos (SupportKnowledgeMap),
 *   • a escada de ação (SupportRemediationLadder) que decide se pode executar.
 *
 * DISCIPLINA (shadow-safe):
 *  • A CLASSIFICAÇÃO (subsistema/ação candidata) é DETERMINÍSTICA e sai do mapa
 *    curado — a IA nunca inventa uma ação: ela só escolhe entre keys pré-declaradas.
 *  • A IA compõe a EXPLICAÇÃO humana (idealResponse) ancorada nos sinais.
 *  • A EXECUÇÃO nunca acontece aqui — `executed: false` é invariante. Na Fase 0 a
 *    escada está em SOMBRA e todo caso escala com o diagnóstico pronto.
 */

import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import { probeSystem, buildProbeContext } from "@/services/support/SupportSystemProbe";
import {
  buildKnowledgeMapContext,
  matchFailureModes,
  type FailureMode,
} from "@/services/support/SupportKnowledgeMap";
import { planRemediation, findAction, currentMode } from "@/services/support/SupportRemediationLadder";

export interface SupportReasonInput {
  restaurantId: string;
  /** O relato do usuário, em linguagem natural. */
  report: string;
  now?: Date;
}

export type IncidentClassification = "INCIDENT" | "NO_INCIDENT_DETECTED" | "NEEDS_MORE_INFO";

export interface SupportDiagnosis {
  ok: boolean;
  classification: IncidentClassification;
  suspectedSubsystem: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  /** Explicação humana ao usuário (da IA; ou determinística se a IA indisponível). */
  explanation: string;
  /** Ação de remediação candidata (do catálogo), ou null. */
  proposedActionKey: string | null;
  proposedActionLabel: string | null;
  /** Pode executar agora? Fase 0 (sombra): sempre false. */
  canExecuteNow: boolean;
  /** Escalar para humano? */
  escalate: boolean;
  /** Motivo do plano de ação (por que executa / por que escala). */
  planReason: string;
  /** Runbook do modo de falha suspeito (passo-a-passo). */
  runbook: string[];
  reasoningMode?: string;
  coherence?: string;
  confidence?: number;
  /** Invariante: este serviço NUNCA executa nada. */
  executed: false;
  note?: string;
}

/** Explicação determinística de segurança quando a IA está indisponível. */
function deterministicExplanation(top: FailureMode | null, probeSummary: string): string {
  if (!top) {
    return `Chequei os sinais que consigo ver: ${probeSummary} Não consegui identificar um incidente conhecido a partir do relato. Pode me dar mais detalhes (qual tela, a que horas começou, o que aparece)?`;
  }
  return `Pelo relato, isto parece "${top.symptom}" — causa provável: ${top.likelyCause}. ${probeSummary} Próximo passo sugerido: ${top.runbook[0] ?? "investigar os sinais do subsistema"}.`;
}

/**
 * Diagnostica o incidente a partir do relato. Shadow-safe: só decide e explica.
 */
export async function reasonSupportIncident(input: SupportReasonInput): Promise<SupportDiagnosis> {
  const report = input.report.trim();
  if (!report) {
    return {
      ok: false, classification: "NEEDS_MORE_INFO", suspectedSubsystem: null, severity: null,
      explanation: "Me conta o que está acontecendo — qual tela ou recurso, e o que você está vendo.",
      proposedActionKey: null, proposedActionLabel: null, canExecuteNow: false, escalate: false,
      planReason: "relato vazio", runbook: [], executed: false,
    };
  }

  // 1) Sinais + classificação determinística (o agente nunca inventa a ação).
  const snap = await probeSystem(input.now);
  const modes = matchFailureModes(report);
  const top = modes[0] ?? null;

  const classification: IncidentClassification =
    top || !snap.healthy ? "INCIDENT" : "NO_INCIDENT_DETECTED";

  const action = findAction(top?.remediationAction);
  const plan = planRemediation(top?.remediationAction, currentMode());

  // 2) Explicação humana via o portão do Brain (ancorada nos sinais + mapa).
  const systemContext = [
    buildProbeContext(snap),
    "",
    buildKnowledgeMapContext(),
    "",
    top
      ? `HIPÓTESE MAIS PROVÁVEL (determinística, do mapa): [${top.subsystem}] ${top.symptom} — ${top.likelyCause}. Severidade ${top.severity}. Ação candidata: ${top.remediationAction ?? "nenhuma (escalar)"}.`
      : "Nenhum modo de falha conhecido casou com o relato — não afirme causa sem sinal.",
  ].join("\n");

  const sanitizedInput = [
    `RELATO DO USUÁRIO: "${report}"`,
    "Explique ao lojista, em português claro e calmo, o que provavelmente está acontecendo e o próximo passo.",
    "Use SOMENTE os sinais e o mapa fornecidos. Se os sinais não sustentam uma causa, diga que precisa de mais informação e escale — não adivinhe.",
    "Nunca exponha segredo/token. Nunca prometa que resolveu sem confirmação.",
  ].join(" ");

  const contextHints = [
    `classificação: ${classification}`,
    `subsistema suspeito: ${top?.subsystem ?? "indefinido"}`,
    `severidade: ${top?.severity ?? "n/d"}`,
    `ação candidata: ${top?.remediationAction ?? "nenhuma"}`,
    `escada: ${currentMode()}`,
  ];

  let reasoningMode: string | undefined;
  let coherence: string | undefined;
  let confidence: number | undefined;
  let explanation = deterministicExplanation(top, snap.summary);

  try {
    const outcome = await reasonAsAgent({
      businessId: input.restaurantId,
      businessType: "RESTAURANT",
      agentId: "suporte-tecnico",
      agentRole: "SUPPORT",
      sourceType: "SYSTEM_EVENT",
      sanitizedInput,
      customerMemory: systemContext,
      contextHints,
    });
    reasoningMode = outcome.reasoningMode;
    coherence = outcome.result.coherenceCheck?.verdict;
    confidence = Number((outcome.result.confidence ?? 0).toFixed(2));
    const aiText = (outcome.result.idealResponse ?? "").trim();
    // Só usa a fala da IA quando ela raciocinou de verdade (não fallback).
    if (outcome.reasoningMode === "LLM" && aiText.length > 0) explanation = aiText;
  } catch (err) {
    return {
      ok: true,
      classification,
      suspectedSubsystem: top?.subsystem ?? null,
      severity: top?.severity ?? null,
      explanation, // cai na explicação determinística — nunca fica mudo
      proposedActionKey: action?.key ?? null,
      proposedActionLabel: action?.label ?? null,
      canExecuteNow: plan.canExecuteNow,
      escalate: plan.escalate,
      planReason: plan.reason,
      runbook: top ? [...top.runbook] : [],
      executed: false,
      note: err instanceof Error ? `IA indisponível: ${err.message.slice(0, 120)}` : "IA indisponível",
    };
  }

  return {
    ok: true,
    classification,
    suspectedSubsystem: top?.subsystem ?? null,
    severity: top?.severity ?? null,
    explanation,
    proposedActionKey: action?.key ?? null,
    proposedActionLabel: action?.label ?? null,
    canExecuteNow: plan.canExecuteNow,
    escalate: plan.escalate,
    planReason: plan.reason,
    runbook: top ? [...top.runbook] : [],
    reasoningMode,
    coherence,
    confidence,
    executed: false,
  };
}
