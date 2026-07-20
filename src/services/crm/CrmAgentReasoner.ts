/**
 * CrmAgentReasoner — o "cérebro" do CRM Agent (Dia 1).
 *
 * Hoje o CRM envia a mensagem escolhida por SORTEIO (pickPhrase) de um pool de
 * frases fixas. Este serviço dá consciência a isso: gera UMA mensagem de CRM
 * pelo MESMO portão governado dos outros agentes — reasonAsAgent({agentId:"crm"}) —
 * ancorada na verdade do restaurante (cardápio/preços/cupons via o adapter de
 * conhecimento) E na inteligência REAL do cliente (segmento, RFM, favoritos,
 * próxima-melhor-ação, status de segurança), com o crítico de coerência do Brain
 * por cima (nunca inventa preço/produto/cupom).
 *
 * DISCIPLINA (shadow-safe):
 *  • NUNCA envia, NUNCA toca no runtime de entrega — só DECIDE e devolve a mensagem.
 *  • A camada de segurança (ContactSafetyService/caps/opt-out) é de quem envia,
 *    não deste serviço — o cérebro só decide conteúdo DENTRO do envelope seguro.
 *  • Ancorado no cliente: usa buildCustomerIntelligenceContext (sem PII, sem inventar).
 */

import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import { getFreeFormConfig } from "@/services/brain/runtime/BrainFreeFormConfigService";
import {
  CustomerIntelligenceSnapshotService,
  buildCustomerIntelligenceContext,
} from "@/services/crm/CustomerIntelligenceSnapshotService";

export interface CrmReasonInput {
  restaurantId: string;
  customerId: string;
  /** Objetivo da mensagem. Se omitido, usa o suggestedMessageGoal da NBA do cliente. */
  objective?: string;
  /** Cupom que a campanha concede (código real). O agente só cita se existir de verdade. */
  couponCode?: string;
  now?: Date;
}

export interface CrmReasonResult {
  ok: boolean;
  /** A mensagem que o agente comporia (candidata). null quando não deu pra decidir. */
  message: string | null;
  /** true só quando passaria no piso do Brain (modo LLM + coerência PASS + confiança ≥ mínimo). */
  passedCritic: boolean;
  reasoningMode?: string;
  coherence?: string;
  confidence?: number;
  minConfidence?: number;
  objective?: string;
  nbaAction?: string;
  snapshotSources?: string[];
  /** Motivo quando ok=false (cliente inexistente, sem raciocínio, etc.). */
  note?: string;
  /** Invariante: este serviço nunca envia nada. */
  sent: false;
}

/**
 * Compõe UMA mensagem de CRM para um cliente, via o portão do Brain.
 * Shadow-safe: só decide. Quem envia é o runner, e só se passedCritic + segurança.
 */
export async function reasonCrmMessage(input: CrmReasonInput): Promise<CrmReasonResult> {
  const { restaurantId, customerId } = input;

  const snapshot = await CustomerIntelligenceSnapshotService.getSnapshot(restaurantId, customerId, {
    now: input.now,
  }).catch(() => null);

  if (!snapshot) {
    return { ok: false, message: null, passedCritic: false, note: "cliente não encontrado neste restaurante", sent: false };
  }

  const objective = (input.objective ?? snapshot.nextBestAction.suggestedMessageGoal ?? "reengajar o cliente").trim();
  const customerMemory = buildCustomerIntelligenceContext(snapshot);

  // Instrução ao agente: compor um OUTBOUND proativo (não é resposta a uma pergunta).
  const couponLine = input.couponCode
    ? `A campanha concede o cupom real "${input.couponCode}" — você PODE citá-lo. Nunca invente outro desconto/cupom.`
    : `Esta campanha NÃO concede cupom — NÃO prometa desconto algum.`;
  const sanitizedInput = [
    "Componha UMA mensagem curta de CRM (WhatsApp) para este cliente — proativa, no tom da marca, não invasiva.",
    `Objetivo: ${objective}.`,
    couponLine,
    "Use SOMENTE fatos reais do cliente e do restaurante (cardápio/preços/horário da base). Não invente nada.",
  ].join(" ");

  const contextHints = [
    `objetivo: ${objective}`,
    `NBA: ${snapshot.nextBestAction.actionType}`,
    `cupom: ${input.couponCode ?? "nenhum"}`,
    `segmento: ${snapshot.segment}`,
  ];

  const cfg = await getFreeFormConfig(restaurantId).catch(() => ({ minConfidence: 0.6 } as { minConfidence?: number }));
  const minConfidence = cfg.minConfidence ?? 0.6;

  let outcome;
  try {
    outcome = await reasonAsAgent({
      businessId: restaurantId,
      businessType: "RESTAURANT",
      agentId: "crm",
      agentRole: "CRM",
      sourceType: "SYSTEM_EVENT",
      sanitizedInput,
      customerMemory,
      contextHints,
    });
  } catch (err) {
    return {
      ok: false,
      message: null,
      passedCritic: false,
      objective,
      nbaAction: snapshot.nextBestAction.actionType,
      note: err instanceof Error ? err.message.slice(0, 160) : "erro no motor de IA",
      sent: false,
    };
  }

  const message = (outcome.result.idealResponse ?? "").trim();
  const passedCritic =
    outcome.reasoningMode === "LLM" &&
    outcome.result.coherenceCheck.verdict === "PASS" &&
    outcome.result.confidence >= minConfidence &&
    message.length > 0;

  return {
    ok: true,
    message: message || null,
    passedCritic,
    reasoningMode: outcome.reasoningMode,
    coherence: outcome.result.coherenceCheck.verdict,
    confidence: Number(outcome.result.confidence.toFixed(2)),
    minConfidence,
    objective,
    nbaAction: snapshot.nextBestAction.actionType,
    snapshotSources: Object.keys(outcome.snapshot?.truthSources ?? {}),
    sent: false,
  };
}
