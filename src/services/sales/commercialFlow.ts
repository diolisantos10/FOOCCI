export const COMMERCIAL_ACTORS = [
  "CRM_ABORDAGEM",
  "SDR_TA",
  "CONSULTOR_COMERCIAL",
] as const;

export type CommercialActor = (typeof COMMERCIAL_ACTORS)[number];

/**
 * Closer e Gerente continuam existindo como alçada de exceção/governança,
 * mas não são etapas obrigatórias da jornada percebida pelo lead.
 */
export const EXCEPTION_ROLES = ["CLOSER", "GERENTE_COMERCIAL"] as const;
export type ExceptionRole = (typeof EXCEPTION_ROLES)[number];

export const COMMERCIAL_STAGES = [
  "COLD_LIST",
  "OUTREACH_SENT",
  "WAITING_REPLY",
  "WRONG_DECISION_MAKER",
  "NURTURE",
  "OPT_OUT",
  "SDR_DISCOVERY",
  "QUALIFIED",
  "CONSULTING",
  "PROPOSAL",
  "NEGOTIATION_EXCEPTION",
  "WON",
  "LOST",
] as const;

export type CommercialStage = (typeof COMMERCIAL_STAGES)[number];

export type LeadSignal =
  | "NO_REPLY"
  | "NOT_INTERESTED"
  | "WRONG_DECISION_MAKER"
  | "REFERRED_DECISION_MAKER"
  | "INTERESTED"
  | "ASKS_HUMAN"
  | "ASKS_PROPOSAL"
  | "ASKS_PRICE"
  | "PAIN_CONFIRMED"
  | "QUALIFICATION_THRESHOLD"
  | "NOT_READY"
  | "STANDARD_ACCEPTANCE"
  | "SPECIAL_DISCOUNT"
  | "SPECIAL_PAYMENT_TERMS"
  | "SPECIAL_CONTRACT"
  | "ROADMAP_COMMITMENT"
  | "WON"
  | "LOST";

export interface CommercialTransition {
  from: CommercialStage;
  signal: LeadSignal;
  to: CommercialStage;
  owner: CommercialActor | ExceptionRole;
  reason: string;
}

export const COMMERCIAL_TRANSITIONS: readonly CommercialTransition[] = [
  { from: "WAITING_REPLY", signal: "NO_REPLY", to: "NURTURE", owner: "CRM_ABORDAGEM", reason: "Cadência, reativação e follow-up ficam no CRM." },
  { from: "WAITING_REPLY", signal: "NOT_INTERESTED", to: "OPT_OUT", owner: "CRM_ABORDAGEM", reason: "Respeita recusa e bloqueia nova abordagem indevida." },
  { from: "WAITING_REPLY", signal: "WRONG_DECISION_MAKER", to: "WRONG_DECISION_MAKER", owner: "SDR_TA", reason: "Registra que o contato não decide e busca a indicação correta." },
  { from: "WRONG_DECISION_MAKER", signal: "REFERRED_DECISION_MAKER", to: "COLD_LIST", owner: "CRM_ABORDAGEM", reason: "Cria/atualiza o decisor indicado e devolve à abordagem, preservando a origem da indicação." },
  { from: "WAITING_REPLY", signal: "INTERESTED", to: "SDR_DISCOVERY", owner: "SDR_TA", reason: "Qualquer resposta com interesse transfere a conversa para o TA." },
  { from: "SDR_DISCOVERY", signal: "NOT_READY", to: "NURTURE", owner: "CRM_ABORDAGEM", reason: "Sem timing, volta ao CRM com data e próximo passo." },
  { from: "SDR_DISCOVERY", signal: "PAIN_CONFIRMED", to: "QUALIFIED", owner: "SDR_TA", reason: "Dor, contexto e interesse bastam para não desperdiçar o tempo do lead com interrogatório." },
  { from: "SDR_DISCOVERY", signal: "QUALIFICATION_THRESHOLD", to: "QUALIFIED", owner: "SDR_TA", reason: "Score vigente atingido." },
  { from: "SDR_DISCOVERY", signal: "ASKS_HUMAN", to: "CONSULTING", owner: "CONSULTOR_COMERCIAL", reason: "Pedido explícito de humano encerra a qualificação automática." },
  { from: "SDR_DISCOVERY", signal: "ASKS_PROPOSAL", to: "CONSULTING", owner: "CONSULTOR_COMERCIAL", reason: "Intenção comercial explícita exige vendedor." },
  { from: "SDR_DISCOVERY", signal: "ASKS_PRICE", to: "CONSULTING", owner: "CONSULTOR_COMERCIAL", reason: "Preço em contexto comercial é tratado pelo consultor, sem novo handoff obrigatório." },
  { from: "QUALIFIED", signal: "PAIN_CONFIRMED", to: "CONSULTING", owner: "CONSULTOR_COMERCIAL", reason: "Handoff SDR → Consultor." },
  { from: "CONSULTING", signal: "ASKS_PROPOSAL", to: "PROPOSAL", owner: "CONSULTOR_COMERCIAL", reason: "O consultor pode demonstrar, recomendar plano, propor e fechar dentro da política." },
  { from: "PROPOSAL", signal: "STANDARD_ACCEPTANCE", to: "WON", owner: "CONSULTOR_COMERCIAL", reason: "Fechamento padrão não cria um quarto interlocutor." },
  { from: "PROPOSAL", signal: "SPECIAL_DISCOUNT", to: "NEGOTIATION_EXCEPTION", owner: "CLOSER", reason: "Closer só entra por exceção de negociação/alçada." },
  { from: "PROPOSAL", signal: "SPECIAL_PAYMENT_TERMS", to: "NEGOTIATION_EXCEPTION", owner: "CLOSER", reason: "Condição fora do padrão exige alçada." },
  { from: "PROPOSAL", signal: "SPECIAL_CONTRACT", to: "NEGOTIATION_EXCEPTION", owner: "GERENTE_COMERCIAL", reason: "Exceção contratual não é decisão autônoma do consultor." },
  { from: "PROPOSAL", signal: "ROADMAP_COMMITMENT", to: "NEGOTIATION_EXCEPTION", owner: "GERENTE_COMERCIAL", reason: "Nunca prometer roadmap para fechar venda." },
  { from: "NEGOTIATION_EXCEPTION", signal: "WON", to: "WON", owner: "CONSULTOR_COMERCIAL", reason: "A alçada resolve a exceção; o consultor preserva a continuidade com o lead." },
  { from: "CONSULTING", signal: "LOST", to: "LOST", owner: "CONSULTOR_COMERCIAL", reason: "Perda exige motivo padronizado." },
] as const;

export const SALES_ROOM_KPIS = {
  crm: ["outreach_sent", "reply_rate", "opt_out_rate", "complaints_per_1000_touches", "nurture_reactivation_rate"],
  sdr: ["first_response_seconds", "discovery_coverage", "qualification_rate", "handoff_rate_by_reason", "wrong_decision_maker_recovery_rate"],
  consultant: ["demos_scheduled", "show_rate", "demo_to_proposal_rate", "proposal_to_win_rate", "sales_cycle_days", "loss_reason"],
  management: ["queue_sla", "conversion_by_source", "conversion_by_actor", "stale_leads", "leads_without_next_action", "qa_score"],
} as const;

export const PUBLIC_JOURNEY = ["CRM_ABORDAGEM", "SDR_TA", "CONSULTOR_COMERCIAL"] as const;

export function requiresExceptionRole(signal: LeadSignal): boolean {
  return ["SPECIAL_DISCOUNT", "SPECIAL_PAYMENT_TERMS", "SPECIAL_CONTRACT", "ROADMAP_COMMITMENT"].includes(signal);
}

export function findCommercialTransition(from: CommercialStage, signal: LeadSignal): CommercialTransition | undefined {
  return COMMERCIAL_TRANSITIONS.find((transition) => transition.from === from && transition.signal === signal);
}
