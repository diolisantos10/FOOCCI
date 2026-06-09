/**
 * Canonical CRM reason codes — the single vocabulary used by the runner, the
 * ledger, the preflight diagnosis and the UI. A "block" is a SAFETY decision, not
 * a failure (see crmExecutionClassification).
 */

export const CRM_REASON_CODES = [
  "SENT",
  "BLOCKED_COOLDOWN",
  "BLOCKED_WEEKLY_LIMIT",
  "BLOCKED_DAILY_GLOBAL_CAP",
  "BLOCKED_WEEKLY_GLOBAL_CAP",
  "BLOCKED_CAMPAIGN_DAILY_LIMIT",
  "BLOCKED_OPT_OUT",
  "BLOCKED_INVALID_PHONE",
  "BLOCKED_ALREADY_IMPACTED_CAMPAIGN",
  "BLOCKED_ALREADY_IMPACTED_CONCEPT",
  "BLOCKED_DUPLICATE_MESSAGE",
  "BLOCKED_OUTSIDE_SEND_WINDOW",
  "BLOCKED_CAMPAIGN_PAUSED",
  "BLOCKED_AUDIENCE_EMPTY",
  "FAILED_PROVIDER",
  "FAILED_TEMPLATE",
  "SKIPPED_NOT_ELIGIBLE",
  "OVERRIDE_WEEKLY_LIMIT_USED",
] as const;

export type CrmReasonCode = (typeof CRM_REASON_CODES)[number];

/** Coarse kind for the UI badge colour. */
export type CrmReasonKind = "SENT" | "BLOCKED" | "FAILED" | "SKIPPED" | "OVERRIDE";

export const REASON_META: Record<CrmReasonCode, { kind: CrmReasonKind; label: string }> = {
  SENT:                                { kind: "SENT",     label: "Enviado" },
  BLOCKED_COOLDOWN:                    { kind: "BLOCKED",  label: "Bloqueado (cooldown)" },
  BLOCKED_WEEKLY_LIMIT:                { kind: "BLOCKED",  label: "Bloqueado (limite semanal/cliente)" },
  BLOCKED_DAILY_GLOBAL_CAP:            { kind: "BLOCKED",  label: "Bloqueado (cap diário global)" },
  BLOCKED_WEEKLY_GLOBAL_CAP:           { kind: "BLOCKED",  label: "Bloqueado (cap semanal do restaurante)" },
  BLOCKED_CAMPAIGN_DAILY_LIMIT:        { kind: "BLOCKED",  label: "Bloqueado (limite da campanha)" },
  BLOCKED_OPT_OUT:                     { kind: "BLOCKED",  label: "Opt-out" },
  BLOCKED_INVALID_PHONE:               { kind: "FAILED",   label: "Telefone inválido" },
  BLOCKED_ALREADY_IMPACTED_CAMPAIGN:   { kind: "BLOCKED",  label: "Já recebeu esta campanha" },
  BLOCKED_ALREADY_IMPACTED_CONCEPT:    { kind: "BLOCKED",  label: "Já impactado por este conceito" },
  BLOCKED_DUPLICATE_MESSAGE:           { kind: "BLOCKED",  label: "Mensagem duplicada" },
  BLOCKED_OUTSIDE_SEND_WINDOW:         { kind: "BLOCKED",  label: "Fora da janela de envio" },
  BLOCKED_CAMPAIGN_PAUSED:             { kind: "BLOCKED",  label: "Campanha pausada" },
  BLOCKED_AUDIENCE_EMPTY:              { kind: "BLOCKED",  label: "Público vazio" },
  FAILED_PROVIDER:                     { kind: "FAILED",   label: "Falhou (provedor)" },
  FAILED_TEMPLATE:                     { kind: "FAILED",   label: "Falhou (mensagem)" },
  SKIPPED_NOT_ELIGIBLE:                { kind: "SKIPPED",  label: "Ignorado (não elegível)" },
  OVERRIDE_WEEKLY_LIMIT_USED:          { kind: "OVERRIDE", label: "Envio prioritário (limite semanal ignorado)" },
};

/** Maps a machine ContactBlockReason (from ContactSafetyService) to a reason code. */
export function reasonCodeFromContactBlock(reason: string | null | undefined): CrmReasonCode {
  switch (reason) {
    case "CUSTOMER_WEEKLY_CAP_REACHED": return "BLOCKED_WEEKLY_LIMIT";
    case "CUSTOMER_COOLDOWN_ACTIVE":
    case "RECENT_CRM_MESSAGE_24H": return "BLOCKED_COOLDOWN";
    case "DAILY_GLOBAL_CAP_REACHED": return "BLOCKED_DAILY_GLOBAL_CAP";
    case "CUSTOMER_OPTED_OUT": return "BLOCKED_OPT_OUT";
    case "MISSING_PHONE":
    case "INVALID_PHONE_FORMAT": return "BLOCKED_INVALID_PHONE";
    case "DUPLICATE_CAMPAIGN_RECIPIENT": return "BLOCKED_ALREADY_IMPACTED_CAMPAIGN";
    case "QUIET_HOURS":
    case "WEEKEND_BLOCKED":
    case "OUTSIDE_SENDING_WINDOW": return "BLOCKED_OUTSIDE_SEND_WINDOW";
    default: return "SKIPPED_NOT_ELIGIBLE";
  }
}

export function isBlock(code: CrmReasonCode): boolean {
  return REASON_META[code].kind === "BLOCKED";
}
