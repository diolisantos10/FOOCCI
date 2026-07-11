/**
 * BrainCoherenceCritic — o LLM-judge do Brain (Cognição 8→9).
 *
 * Segunda camada de crítica, POR CIMA do verificador determinístico
 * (SnapshotCoherenceVerifier): um modelo barato, roteado pelo perfil JUDGE do
 * AIEngineRouter, julga se a resposta candidata responde à pergunta e se
 * afirma algo que a base de conhecimento não sustenta.
 *
 * Política de falha (deliberada):
 *  • judge diz REJEITAR → rejeita (fail-closed no veredito explícito);
 *  • judge indisponível/erro → aprova COM a nota do piso determinístico já
 *    passado (fail-open no erro: o judge é reforço, não ponto único de falha).
 *
 * Só roda no caminho VIVO (nunca em sombra) — custo zero até a promoção.
 */

import { selectEngineRouted } from "../engines/AIEngineRouter";
import { callStructuredJson } from "../engines/OpenAIEngineAdapter";
import type { BusinessKnowledgeSnapshot } from "../knowledge/BusinessKnowledgeContract";

export interface CriticVerdict {
  approved: boolean;
  mode: "JUDGED" | "SKIPPED";
  reason: string;
}

const JUDGE_SYSTEM_PROMPT =
  "Você é um auditor rígido de atendimento. Julgue a RESPOSTA CANDIDATA de um agente a um cliente.\n" +
  "REPROVE (approved=false) se a resposta: (1) afirmar produto, preço, promoção, horário ou forma de " +
  "pagamento que NÃO esteja na BASE DE CONHECIMENTO; (2) NEGAR que algo existe sem a base dizer isso " +
  "explicitamente; (3) não responder à pergunta do cliente. Na dúvida sobre um fato, REPROVE.\n" +
  'Responda SOMENTE JSON: {"approved": boolean, "reason": "curta, em português"}';

export async function judgeReply(input: {
  agentId: string;
  businessId: string;
  customerMessage: string;
  candidateReply: string;
  snapshot: Pick<BusinessKnowledgeSnapshot, "truthSources" | "missingContext">;
}): Promise<CriticVerdict> {
  try {
    const selection = await selectEngineRouted(input.agentId, { businessId: input.businessId, taskProfile: "JUDGE" });
    if (selection.provider === "MOCK") return { approved: true, mode: "SKIPPED", reason: "sem piloto JUDGE configurado" };

    const userContent = [
      `BASE DE CONHECIMENTO (verdade): ${JSON.stringify(input.snapshot.truthSources).slice(0, 6000)}`,
      `CONTEXTO AUSENTE (não afirmar): ${input.snapshot.missingContext.join("; ") || "nenhum"}`,
      `PERGUNTA DO CLIENTE: "${input.customerMessage}"`,
      `RESPOSTA CANDIDATA: "${input.candidateReply}"`,
    ].join("\n");

    const raw = await callStructuredJson({
      selection,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      userContent,
      temperature: 0,
      maxTokens: 200,
    });
    const parsed = JSON.parse(raw) as { approved?: boolean; reason?: string };
    if (typeof parsed.approved !== "boolean") throw new Error("veredito inválido");
    return { approved: parsed.approved, mode: "JUDGED", reason: parsed.reason ?? "" };
  } catch (err) {
    // Fail-open no ERRO (o piso determinístico já passou); fail-closed é só no
    // veredito explícito de reprovação.
    return {
      approved: true,
      mode: "SKIPPED",
      reason: `judge indisponível: ${err instanceof Error ? err.message.slice(0, 80) : "erro"}`,
    };
  }
}
