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
import { TRUTH_LABELS, truthPriorityIndex } from "../knowledge/truthLabels";

export interface CriticVerdict {
  approved: boolean;
  mode: "JUDGED" | "SKIPPED";
  reason: string;
}

const JUDGE_SYSTEM_PROMPT =
  "Você é um auditor de atendimento. Julgue a RESPOSTA CANDIDATA de um agente a um cliente, " +
  "comparando-a com a BASE DE CONHECIMENTO (que vem rotulada por fonte: Preços, Pagamentos, " +
  "Horários, Produtos, etc.).\n" +
  "REPROVE (approved=false) SOMENTE se a resposta: (1) afirmar um produto, preço, promoção, horário " +
  "ou forma de pagamento que CONTRADIZ a base ou que NÃO aparece em NENHUMA fonte dela; (2) NEGAR " +
  "que algo existe quando a base mostra que existe; (3) claramente não responder à pergunta.\n" +
  "IMPORTANTE: se o fato afirmado ESTÁ na base — mesmo que em outra fonte/linha, ou escrito de forma " +
  "diferente — APROVE. Não reprove só por não ter certeza; reprove apenas com contradição ou ausência " +
  "clara. Um preço/horário/pagamento que casa com a base deve ser APROVADO.\n" +
  "COERÊNCIA OBRIGATÓRIA: 'approved' TEM que bater com sua 'reason'. Se a reason conclui que o fato " +
  "casa com a base / não há contradição, então approved=true. approved=false SÓ quando a reason aponta " +
  "uma contradição, invenção ou não-resposta reais.\n" +
  "NÃO reprove por diferenças TRIVIAIS que não mudam o sentido: formatação de preço (R$54 = R$54,00 = " +
  "54 reais), maiúsculas/acentos, ordem de itens, sinônimos, arredondamento equivalente. Só o SENTIDO " +
  "importa. Uma resposta HONESTA de que algo não existe (ex.: 'não temos X') quando X realmente não " +
  "aparece na base é CORRETA — aprove.\n" +
  'Responda SOMENTE JSON: {"approved": boolean, "reason": "curta, em português"}';

/**
 * Verdade rotulada e priorizada para o juiz — completa, sem cortar os fatos-chave.
 *
 * Os rótulos e a fila vêm de `knowledge/truthLabels`, a MESMA tabela que o
 * BrainReasoner usa. Eram duas cópias até 06/08/2026, e a cópia daqui não
 * acompanhou o PR #111: `loja`/`entrega`/`local` caíam no fim da fila e o corte
 * de 15.000 caracteres apagava justo o estado da loja — para o juiz, e só para
 * ele. Uma tabela, dois leitores.
 */
export function formatTruthForJudge(truth: Record<string, unknown>, maxChars = 15000): string {
  const keys = Object.keys(truth).sort((a, b) => truthPriorityIndex(a) - truthPriorityIndex(b));
  const parts: string[] = [];
  let used = 0;
  for (const key of keys) {
    const value = truth[key];
    if (value === undefined || value === null) continue;
    let line = `- ${TRUTH_LABELS[key] ?? key}: ${JSON.stringify(value)}`;
    if (used + line.length > maxChars) {
      line = line.slice(0, Math.max(0, maxChars - used)) + "…(cortado)";
      parts.push(line);
      break;
    }
    parts.push(line);
    used += line.length;
  }
  return parts.join("\n");
}

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
      `BASE DE CONHECIMENTO (verdade — uma linha por fonte):\n${formatTruthForJudge(input.snapshot.truthSources)}`,
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
