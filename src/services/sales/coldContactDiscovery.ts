export const COLD_CONTACT_OBJECTIVE = "FIND_CORRECT_DECISION_MAKER" as const;

export const COLD_GREETING_TEMPLATES = [
  { name: "foocci_contato_inicial_01", language: "pt_BR", category: "MARKETING" as const, body: "Olá! Tudo bem? Este contato é do {{1}}?", restaurantNameParam: true },
  { name: "foocci_contato_inicial_02", language: "pt_BR", category: "MARKETING" as const, body: "Olá! Tudo bem? Falo com o {{1}}?", restaurantNameParam: true },
  { name: "foocci_contato_inicial_03", language: "pt_BR", category: "MARKETING" as const, body: "Olá! Tudo bem?", restaurantNameParam: false },
] as const;

export type ColdReplyKind =
  | "HUMAN_UNKNOWN_ROLE"
  | "DECISION_MAKER"
  | "NOT_DECISION_MAKER"
  | "REFERRED_DECISION_MAKER"
  | "AUTOMATION"
  | "OPT_OUT"
  | "NO_REPLY";

export interface ColdDiscoveryAction {
  owner: "CRM_ABORDAGEM" | "SDR_TA";
  action: "ASK_ROLE" | "START_DISCOVERY" | "ASK_CORRECT_CONTACT" | "REGISTER_REFERRAL" | "REQUEST_HUMAN" | "STOP" | "NURTURE";
  salesPitchAllowed: boolean;
}

/**
 * Regra para lista fria: antes de vender, descobrir quem é o interlocutor correto.
 * Leads já qualificados NÃO passam por esta máquina.
 */
export function routeColdReply(kind: ColdReplyKind, alreadyQualified = false): ColdDiscoveryAction {
  if (alreadyQualified) return { owner: "SDR_TA", action: "START_DISCOVERY", salesPitchAllowed: true };
  switch (kind) {
    case "DECISION_MAKER": return { owner: "SDR_TA", action: "START_DISCOVERY", salesPitchAllowed: true };
    case "HUMAN_UNKNOWN_ROLE": return { owner: "SDR_TA", action: "ASK_ROLE", salesPitchAllowed: false };
    case "NOT_DECISION_MAKER": return { owner: "SDR_TA", action: "ASK_CORRECT_CONTACT", salesPitchAllowed: false };
    case "REFERRED_DECISION_MAKER": return { owner: "CRM_ABORDAGEM", action: "REGISTER_REFERRAL", salesPitchAllowed: false };
    case "AUTOMATION": return { owner: "SDR_TA", action: "REQUEST_HUMAN", salesPitchAllowed: false };
    case "OPT_OUT": return { owner: "CRM_ABORDAGEM", action: "STOP", salesPitchAllowed: false };
    case "NO_REPLY": return { owner: "CRM_ABORDAGEM", action: "NURTURE", salesPitchAllowed: false };
  }
}

export const COLD_DISCOVERY_COPY = {
  humanUnknownRole: "Oi! Tudo bem? Gostaria de falar com a pessoa responsável pela área comercial do restaurante. É com você?",
  wrongPerson: "Obrigado! Você consegue me passar o contato da pessoa responsável pela área comercial?",
  requestHuman: "Gostaria de falar com uma pessoa do atendimento, por favor.",
} as const;
