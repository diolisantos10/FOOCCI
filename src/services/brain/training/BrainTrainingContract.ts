/**
 * BrainTrainingContract — how learning flows through the Brain.
 *
 * Every source (real cases, simulation, library, evidence) produces PROPOSALS;
 * a HUMAN approves; approved learnings form a reusable pool; nothing reaches the
 * live runtime except via a test version + Quality Gate + manual activation.
 * The Waiter's WaiterTrainingSuggestion flow is the v1 reference implementation.
 */

export type BrainLearningSource = "REAL_CONVERSATION" | "SIMULATION" | "LIBRARY" | "RESULT_EVIDENCE";
export type BrainLearningStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "BACKLOG";

export interface ApprovedLearning {
  id: string;
  agentId: string;
  title: string;
  trainingRule: string;
  actionType: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  sourceType: BrainLearningSource;
}

/**
 * O runtime raciocina com identidades do Brain ("whatsapp"), mas o aprendizado
 * ao vivo é gravado com slugs históricos ("whatsapp-receptionist" no
 * liveLearningReview). Sem este mapa, o pool carregado em produção fica SEMPRE
 * vazio — foi exatamente o bug que manteve a "escola" desligada do atendimento.
 */
const AGENT_SLUG_ALIASES: Record<string, string[]> = {
  whatsapp: ["whatsapp", "whatsapp-receptionist"],
};

/** The approved-learning pool, expressed in the Brain contract. */
export async function listApprovedLearningsForBrain(agentId = "waiter", limit = 100): Promise<ApprovedLearning[]> {
  const { listApprovedLearnings } = await import("@/services/waiterTraining/WaiterTrainingSuggestionStore");
  const slugs = AGENT_SLUG_ALIASES[agentId] ?? [agentId];
  const rowsBySlug = await Promise.all(slugs.map((slug) => listApprovedLearnings(slug, limit)));
  const rows = rowsBySlug.flat().slice(0, limit);
  return rows.map((r) => ({
    id: r.id,
    agentId,
    title: r.title,
    trainingRule: r.trainingRule,
    actionType: r.suggestedActionType,
    riskLevel: (r.riskLevel as ApprovedLearning["riskLevel"]) ?? "LOW",
    sourceType: (r.sourceType as BrainLearningSource) ?? "REAL_CONVERSATION",
  }));
}
