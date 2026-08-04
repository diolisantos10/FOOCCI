/**
 * CRM execution classification — the single source of truth that separates a real
 * SEND FAILURE from an expected SAFETY BLOCK, and assigns a retry policy.
 *
 * A campaign execution is stored as a status + failedReason (human) + errorMessage
 * (machine ContactBlockReason / provider code). This module maps any execution —
 * new (status BLOCKED/FAILED + machine code) OR legacy (status FAILED + human text)
 * — into a clear category + coarse kind + retry policy, so the UI never shows a
 * weekly-cap block as a "failure", an invalid phone as a provider failure, or a
 * transient 5xx as permanent.
 *
 * Pure module: no DB, no side effects.
 */

export type ExecutionCategory =
  | "SENT"
  | "FAILED_PROVIDER"        // generic / 5xx provider error — retry later
  | "FAILED_TIMEOUT"         // network timeout / connection dropped — retry later
  | "FAILED_UNKNOWN"         // unrecognized failure — retry later with caution
  | "EVOLUTION_BAD_REQUEST"  // HTTP 400 — fix payload/phone first
  | "EVOLUTION_INSTANCE_DISCONNECTED"
  | "EVOLUTION_AUTH_ERROR"   // HTTP 401/403
  | "EVOLUTION_RATE_LIMITED" // HTTP 429
  | "EMPTY_MESSAGE"
  | "BLOCKED_SAFETY"
  | "BLOCKED_COOLDOWN"
  | "BLOCKED_WEEKLY_LIMIT"
  | "BLOCKED_DAILY_GLOBAL_CAP"
  | "BLOCKED_CAMPAIGN_DAILY_LIMIT"
  | "BLOCKED_OPT_OUT"
  | "BLOCKED_INVALID_PHONE"
  | "SKIPPED_NO_PHONE"
  | "SKIPPED_NOT_CONTACTABLE"
  | "SKIPPED_NOT_ELIGIBLE";

/** Coarse kind used by the UI to pick a badge colour/word. */
export type ExecutionKind = "SENT" | "BLOCKED" | "FAILED" | "SKIPPED";

/**
 * Retry policy for a recipient.
 *  - PERMANENT          : data is wrong/impossible — never auto-retry (e.g. invalid phone).
 *  - RETRYABLE_LATER    : transient — safe to retry in a later cron cycle (5xx, timeout, rate, safety cap).
 *  - RETRYABLE_AFTER_FIX: needs an operator action first (fix payload, reconnect instance, fix template).
 *  - NEVER_RETRY        : must not be contacted again (opt-out) or nothing to retry (sent).
 */
export type Retryability = "PERMANENT" | "RETRYABLE_LATER" | "RETRYABLE_AFTER_FIX" | "NEVER_RETRY";

/** Owner-friendly PT-BR label for each retry policy. */
export const RETRYABILITY_LABEL: Record<Retryability, string> = {
  RETRYABLE_LATER:     "Pode reenviar depois",
  RETRYABLE_AFTER_FIX: "Precisa corrigir",
  PERMANENT:           "Não reenviar",
  NEVER_RETRY:         "Não reenviar",
};

export interface ExecutionInput {
  status: string;
  failedReason?: string | null;
  errorMessage?: string | null;
}

export interface ExecutionClassification {
  category: ExecutionCategory;
  kind: ExecutionKind;
  /** Short PT-BR badge word. */
  badge: string;
  /**
   * Legacy boolean: whether an automatic retry is worthwhile at all.
   * Kept for back-compat; prefer `retryability` for the precise policy.
   */
  retryable: boolean;
  /** Precise retry policy — drives the "Reprocessar falhas recuperáveis" action. */
  retryability: Retryability;
  /** Owner-friendly retry label ("Pode reenviar depois" / "Precisa corrigir" / ...). */
  retryabilityLabel: string;
}

interface CategoryMeta {
  kind: ExecutionKind;
  badge: string;
  retryable: boolean;
  retryability: Retryability;
}

const CATEGORY_META: Record<ExecutionCategory, CategoryMeta> = {
  SENT:                            { kind: "SENT",    badge: "Enviado",                       retryable: false, retryability: "NEVER_RETRY" },
  FAILED_PROVIDER:                 { kind: "FAILED",  badge: "Erro temporário do WhatsApp",   retryable: true,  retryability: "RETRYABLE_LATER" },
  FAILED_TIMEOUT:                  { kind: "FAILED",  badge: "Tempo esgotado / conexão",      retryable: true,  retryability: "RETRYABLE_LATER" },
  FAILED_UNKNOWN:                  { kind: "FAILED",  badge: "Erro desconhecido",             retryable: true,  retryability: "RETRYABLE_LATER" },
  EVOLUTION_BAD_REQUEST:           { kind: "FAILED",  badge: "Bad request (400)",             retryable: false, retryability: "RETRYABLE_AFTER_FIX" },
  EVOLUTION_INSTANCE_DISCONNECTED: { kind: "FAILED",  badge: "Instância desconectada",        retryable: true,  retryability: "RETRYABLE_LATER" },
  EVOLUTION_AUTH_ERROR:            { kind: "FAILED",  badge: "Erro de autenticação",          retryable: false, retryability: "RETRYABLE_AFTER_FIX" },
  EVOLUTION_RATE_LIMITED:          { kind: "BLOCKED", badge: "Rate limit",                    retryable: true,  retryability: "RETRYABLE_LATER" },
  EMPTY_MESSAGE:                   { kind: "FAILED",  badge: "Mensagem vazia",                retryable: false, retryability: "RETRYABLE_AFTER_FIX" },
  // Invalid / missing phone / not-contactable are RECIPIENT DATA problems, not
  // provider failures. Skipped BEFORE any channel call, so they never inflate
  // the failure count. They are fixable in the customer's cadastro → "Precisa
  // corrigir" (RETRYABLE_AFTER_FIX), never auto-retried.
  BLOCKED_INVALID_PHONE:           { kind: "SKIPPED", badge: "Telefone inválido",             retryable: false, retryability: "RETRYABLE_AFTER_FIX" },
  SKIPPED_NO_PHONE:                { kind: "SKIPPED", badge: "Sem telefone",                  retryable: false, retryability: "RETRYABLE_AFTER_FIX" },
  SKIPPED_NOT_CONTACTABLE:         { kind: "SKIPPED", badge: "Sem WhatsApp elegível",         retryable: false, retryability: "RETRYABLE_AFTER_FIX" },
  BLOCKED_SAFETY:                  { kind: "BLOCKED", badge: "Bloqueado",                     retryable: false, retryability: "RETRYABLE_LATER" },
  BLOCKED_COOLDOWN:                { kind: "BLOCKED", badge: "Bloqueado (cooldown)",          retryable: false, retryability: "RETRYABLE_LATER" },
  BLOCKED_WEEKLY_LIMIT:            { kind: "BLOCKED", badge: "Bloqueado (limite semanal)",    retryable: false, retryability: "RETRYABLE_LATER" },
  BLOCKED_DAILY_GLOBAL_CAP:        { kind: "BLOCKED", badge: "Bloqueado (cap global)",        retryable: false, retryability: "RETRYABLE_LATER" },
  BLOCKED_CAMPAIGN_DAILY_LIMIT:    { kind: "BLOCKED", badge: "Bloqueado (limite da campanha)", retryable: false, retryability: "RETRYABLE_LATER" },
  BLOCKED_OPT_OUT:                 { kind: "BLOCKED", badge: "Opt-out",                       retryable: false, retryability: "NEVER_RETRY" },
  SKIPPED_NOT_ELIGIBLE:            { kind: "SKIPPED", badge: "Ignorado",                      retryable: false, retryability: "PERMANENT" },
};

/** Maps a machine ContactBlockReason or provider error code to a category. */
function fromMachineReason(reason: string): ExecutionCategory | null {
  switch (reason) {
    case "CUSTOMER_WEEKLY_CAP_REACHED": return "BLOCKED_WEEKLY_LIMIT";
    case "CUSTOMER_COOLDOWN_ACTIVE":
    case "RECENT_CRM_MESSAGE_24H": return "BLOCKED_COOLDOWN";
    case "DAILY_GLOBAL_CAP_REACHED": return "BLOCKED_DAILY_GLOBAL_CAP";
    case "CUSTOMER_OPTED_OUT": return "BLOCKED_OPT_OUT";
    case "MISSING_PHONE": return "SKIPPED_NO_PHONE";
    case "INVALID_PHONE_FORMAT": return "BLOCKED_INVALID_PHONE";
    case "CUSTOMER_NOT_CONTACTABLE": return "SKIPPED_NOT_CONTACTABLE";
    case "EMPTY_MESSAGE_AFTER_RENDER": return "EMPTY_MESSAGE";
    // ── Canal oficial (Meta) ───────────────────────────────────────────────
    // Os nomes de categoria continuam com o prefixo EVOLUTION_ por um motivo
    // concreto: o painel do lojista (CRMClient) conta por essas chaves. Renomear
    // aqui zeraria os contadores da tela sem ninguém perceber. O que mudou é o
    // que ENTRA em cada uma.
    case "META_TEMPLATE_REQUIRED": return "BLOCKED_SAFETY";       // política, não falha
    case "META_NOT_CONNECTED":     return "EVOLUTION_INSTANCE_DISCONNECTED";
    case "META_190":               return "EVOLUTION_AUTH_ERROR"; // token expirado/inválido
    case "INVALID_PHONE":          return "BLOCKED_INVALID_PHONE";
    case "WINDOW_LOOKUP_FAILED":                                   // banco fora → tentar depois
    case "NETWORK":                return "FAILED_TIMEOUT";
    case "HTTP_429":               return "EVOLUTION_RATE_LIMITED";
    case "EVOLUTION_HTTP_400": return "EVOLUTION_BAD_REQUEST";
    case "EVOLUTION_HTTP_401":
    case "EVOLUTION_HTTP_403": return "EVOLUTION_AUTH_ERROR";
    case "EVOLUTION_HTTP_429": return "EVOLUTION_RATE_LIMITED";
    case "EVOLUTION_HTTP_408":
    case "EVOLUTION_HTTP_504":
    case "EVOLUTION_HTTP_522":
    case "EVOLUTION_HTTP_524": return "FAILED_TIMEOUT";
    case "NO_WHATSAPP_CONFIG":
    // Linhas históricas: até 04/08/2026 o canal ausente era gravado como
    // NO_EVOLUTION_CONFIG. O código saiu de circulação, mas os registros antigos
    // continuam no banco e precisam continuar sendo lidos — apagar o case aqui
    // transformaria bloqueio explicado em "erro desconhecido" retroativo.
    case "NO_EVOLUTION_CONFIG":
    case "QUIET_HOURS":
    case "WEEKEND_BLOCKED":
    case "OUTSIDE_SENDING_WINDOW":
    case "DUPLICATE_CAMPAIGN_RECIPIENT":
    case "RESTAURANT_CLOSED":
    case "UNKNOWN_ERROR": return "BLOCKED_SAFETY";
    default:
      // 5xx (and any other EVOLUTION_HTTP_*) → generic provider failure (retry later).
      if (reason.startsWith("EVOLUTION_HTTP_")) return "FAILED_PROVIDER";
      // Códigos de erro da Meta que não estão mapeados um a um. Vão para falha de
      // provedor (retentar depois) DE PROPÓSITO: mapear um código desconhecido para
      // "número morto" mandaria cliente para a exclusão automática com base em
      // palpite. Quando um código específico merecer tratamento próprio, ele entra
      // acima, nomeado.
      if (reason.startsWith("META_") || /^HTTP_5\d\d$/.test(reason)) return "FAILED_PROVIDER";
      return null;
  }
}

/**
 * Detects Evolution/Baileys SESSION/socket runtime errors. This Evolution build
 * wraps a dropped/unhealthy WhatsApp-Web session in an HTTP 400 "Bad Request",
 * e.g. `"Error: Connection Closed"` or `"TypeError: Cannot read properties of
 * undefined (reading 'id')"`. Those are transient instance problems (retry after
 * reconnect), NOT a payload/validation 400.
 */
function isInstanceSessionError(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("connection closed") ||
    t.includes("connection terminated") ||
    t.includes("connection lost") ||
    t.includes("lost connection") ||
    t.includes("cannot read properties of undefined") ||
    t.includes("reading 'id'") ||
    t.includes("reading \"id\"") ||
    t.includes("socket") ||
    t.includes("websocket") ||
    t.includes("baileys") ||
    t.includes("stream errored") ||
    t.includes("session closed") ||
    t.includes("not connected") ||
    t.includes("no session")
  );
}

/** Best-effort mapping of a free-text reason (legacy FAILED rows / provider errors). */
function fromText(text: string): ExecutionCategory {
  const t = text.toLowerCase();
  // Session/socket runtime errors (often wrapped in a 400) → instance disconnected.
  if (isInstanceSessionError(t)) return "EVOLUTION_INSTANCE_DISCONNECTED";
  // Safety blocks recorded as FAILED in legacy data.
  if (t.includes("limite semanal") || t.includes("weekly")) return "BLOCKED_WEEKLY_LIMIT";
  if (t.includes("opt-out") || t.includes("opt out") || t.includes("optou")) return "BLOCKED_OPT_OUT";
  if (t.includes("cooldown") || t.includes("recente") || t.includes("24h") || t.includes("intervalo")) return "BLOCKED_COOLDOWN";
  if (t.includes("cap global") || t.includes("global")) return "BLOCKED_DAILY_GLOBAL_CAP";
  if (t.includes("limite diário") || t.includes("limite diario") || t.includes("daily limit")) return "BLOCKED_CAMPAIGN_DAILY_LIMIT";
  if (t.includes("quiet") || t.includes("silenc") || t.includes("janela") || t.includes("weekend") || t.includes("fim de semana") || t.includes("duplicad")) return "BLOCKED_SAFETY";
  // Instance/connectivity failures.
  if (t.includes("disconnected") || t.includes("desconectado") || t.includes("instance not found") || t.includes("instância não encontrada")) return "EVOLUTION_INSTANCE_DISCONNECTED";
  // Auth failures.
  if (t.includes("401") || t.includes("403") || t.includes("unauthorized") || t.includes("forbidden") || t.includes("não autorizado")) return "EVOLUTION_AUTH_ERROR";
  // Rate limit.
  if (t.includes("rate limit") || t.includes("too many") || t.includes("429")) return "EVOLUTION_RATE_LIMITED";
  // Recipient-data skips (no phone / not contactable) recorded as FAILED in legacy data.
  if (t.includes("sem telefone") || t.includes("no phone") || t.includes("missing phone") || t.includes("telefone ausente")) return "SKIPPED_NO_PHONE";
  if (t.includes("não contactável") || t.includes("nao contactavel") || t.includes("not contactable") || t.includes("não elegível") || t.includes("nao elegivel")) return "SKIPPED_NOT_CONTACTABLE";
  // Empty/unrendered message.
  if (t.includes("vazia") || t.includes("empty message") || t.includes("mensagem vazia")) return "EMPTY_MESSAGE";
  // Provider failures — distinguish an invalid-number error from a generic 4xx/5xx.
  const looksLikePhoneError =
    t.includes("invalid number") || t.includes("número inválido") || t.includes("numero invalido") ||
    t.includes("not a valid") || t.includes("jid") || t.includes("não existe no whatsapp") || t.includes("exists\":false");
  if (looksLikePhoneError) return "BLOCKED_INVALID_PHONE";
  // Timeout / dropped connection — its own retryable category.
  if (t.includes("timeout") || t.includes("timed out") || t.includes("etimedout") ||
      t.includes("econnreset") || t.includes("econnrefused") || t.includes("socket hang up") ||
      t.includes("aborted") || t.includes("network")) return "FAILED_TIMEOUT";
  // 400 bad request patterns.
  if (t.includes("400") || t.includes("bad request")) return "EVOLUTION_BAD_REQUEST";
  // Recognizable provider error → generic provider failure (retry later).
  if (t.includes("http") || t.includes("evolution") || t.includes("econn") || t.includes("5xx") ||
      t.includes("500") || t.includes("502") || t.includes("503")) return "FAILED_PROVIDER";
  // Nothing matched — unknown failure.
  return "FAILED_UNKNOWN";
}

/** Classifies one execution row. Never throws. */
export function classifyExecution(input: ExecutionInput): ExecutionClassification {
  const status = (input.status ?? "").toUpperCase();
  if (status === "SENT" || status === "DELIVERED" || status === "READ") {
    return materialize("SENT");
  }
  if (status === "SKIPPED") {
    // Preserve the specific skip reason (no phone / invalid phone / not contactable)
    // when it was recorded; fall back to the generic not-eligible bucket.
    const m = (input.errorMessage ?? "").trim();
    const cat = m ? fromMachineReason(m) : null;
    return materialize(cat && CATEGORY_META[cat].kind === "SKIPPED" ? cat : "SKIPPED_NOT_ELIGIBLE");
  }

  // Prefer the machine reason (new rows store it on errorMessage).
  const machine = (input.errorMessage ?? "").trim();
  let category = machine ? fromMachineReason(machine) : null;

  // A machine EVOLUTION_HTTP_400 is only a TRUE bad-request when the provider body
  // is a validation error. Evolution wraps a dropped Baileys session in a 400
  // ("Connection Closed", "Cannot read properties of undefined (reading 'id')") —
  // reclassify those as a transient instance problem (retry after reconnect).
  if (category === "EVOLUTION_BAD_REQUEST" && isInstanceSessionError(`${input.errorMessage ?? ""} ${input.failedReason ?? ""}`)) {
    category = "EVOLUTION_INSTANCE_DISCONNECTED";
  }

  // BLOCKED status without a recognized machine code → generic safety block.
  if (!category && status === "BLOCKED") category = "BLOCKED_SAFETY";

  // FAILED/PENDING (legacy) → classify from the human text.
  if (!category) {
    const text = `${input.errorMessage ?? ""} ${input.failedReason ?? ""}`.trim();
    category = text ? fromText(text) : "FAILED_UNKNOWN";
  }

  return materialize(category);
}

/**
 * O robô pode tentar de novo sozinho?
 *
 * SÓ `RETRYABLE_LATER`. É a única política em que o mundo pode ter mudado
 * sozinho — a instância reconectou, o 5xx passou, o timeout foi um soluço de
 * rede. Nas outras, tentar de novo é repetir o mesmo erro:
 *
 *  • RETRYABLE_AFTER_FIX → alguém precisa consertar (número errado no cadastro,
 *    credencial vencida, template vazio). Uma hora a mais não conserta nada.
 *  • PERMANENT / NEVER_RETRY → não é para contatar de novo, ponto.
 *
 * Isto existe porque o runner tratava toda falha igual: esperava a janela de
 * 24h e reenviava para o mesmo número inválido, para sempre. Cada rodada
 * gerava uma falha nova, idêntica, e o relatório do lojista enchia de erro que
 * nenhuma tentativa jamais resolveria.
 */
export function podeRetentarSozinho(input: ExecutionInput): boolean {
  return classifyExecution(input).retryability === "RETRYABLE_LATER";
}

/**
 * O cliente sai da fila desta campanha PARA SEMPRE?
 *
 * Falha e bloqueio pedem respostas diferentes, e misturar as duas foi o erro:
 *
 *  • FALHA — sai de vez, a não ser que seja `RETRYABLE_LATER`. Número inválido,
 *    credencial vencida e template quebrado não se consertam esperando.
 *
 *  • BLOQUEIO — quase todo bloqueio é temporário de propósito: cooldown, cap
 *    semanal e janela de envio existem justamente para deixar passar depois.
 *    Esses TÊM que voltar. Só o opt-out não volta — não é limite, é a vontade
 *    do cliente, e ela não expira em 24 horas.
 */
export function saiDaFilaParaSempre(input: ExecutionInput): boolean {
  const { retryability } = classifyExecution(input);
  if (input.status === "FAILED") return retryability !== "RETRYABLE_LATER";
  return retryability === "NEVER_RETRY" || retryability === "PERMANENT";
}

function materialize(category: ExecutionCategory): ExecutionClassification {
  const meta = CATEGORY_META[category];
  return {
    category,
    kind: meta.kind,
    badge: meta.badge,
    retryable: meta.retryable,
    retryability: meta.retryability,
    retryabilityLabel: RETRYABILITY_LABEL[meta.retryability],
  };
}

export interface ExecutionSummary {
  total: number;
  sent: number;
  blockedSafety: number;
  failedProvider: number;
  /** Recipients skipped before any provider call (invalid/missing phone, not eligible). */
  skipped: number;
  /**
   * Provider failures that are safe to reprocess in a later cycle
   * (FAILED kind + RETRYABLE_LATER: generic 5xx, timeout, unknown). This is the
   * exact pool the "Reprocessar falhas recuperáveis" action targets.
   */
  recoverableLater: number;
  /** Count per fine-grained category. */
  byCategory: Record<ExecutionCategory, number>;
  /** Count per retry policy. */
  byRetryability: Record<Retryability, number>;
  /** Human-friendly reason groups for the UI ("Limite semanal: X", ...). */
  reasonGroups: Array<{
    category: ExecutionCategory;
    badge: string;
    count: number;
    kind: ExecutionKind;
    retryability: Retryability;
    retryabilityLabel: string;
  }>;
}

const EMPTY_BY_CATEGORY = (): Record<ExecutionCategory, number> => ({
  SENT: 0,
  FAILED_PROVIDER: 0,
  FAILED_TIMEOUT: 0,
  FAILED_UNKNOWN: 0,
  EVOLUTION_BAD_REQUEST: 0,
  EVOLUTION_INSTANCE_DISCONNECTED: 0,
  EVOLUTION_AUTH_ERROR: 0,
  EVOLUTION_RATE_LIMITED: 0,
  EMPTY_MESSAGE: 0,
  BLOCKED_SAFETY: 0,
  BLOCKED_COOLDOWN: 0,
  BLOCKED_WEEKLY_LIMIT: 0,
  BLOCKED_DAILY_GLOBAL_CAP: 0,
  BLOCKED_CAMPAIGN_DAILY_LIMIT: 0,
  BLOCKED_OPT_OUT: 0,
  BLOCKED_INVALID_PHONE: 0,
  SKIPPED_NO_PHONE: 0,
  SKIPPED_NOT_CONTACTABLE: 0,
  SKIPPED_NOT_ELIGIBLE: 0,
});

const EMPTY_BY_RETRYABILITY = (): Record<Retryability, number> => ({
  PERMANENT: 0,
  RETRYABLE_LATER: 0,
  RETRYABLE_AFTER_FIX: 0,
  NEVER_RETRY: 0,
});

function buildSummary(byCategory: Record<ExecutionCategory, number>, total: number): ExecutionSummary {
  let sent = 0, blockedSafety = 0, failedProvider = 0, skipped = 0, recoverableLater = 0;
  const byRetryability = EMPTY_BY_RETRYABILITY();

  for (const cat of Object.keys(byCategory) as ExecutionCategory[]) {
    const n = byCategory[cat];
    if (n === 0) continue;
    const meta = CATEGORY_META[cat];
    byRetryability[meta.retryability] += n;
    if (meta.kind === "SENT") sent += n;
    else if (meta.kind === "BLOCKED") blockedSafety += n;
    else if (meta.kind === "FAILED") failedProvider += n; // real provider/data failures only
    else if (meta.kind === "SKIPPED") skipped += n;        // invalid phone / not eligible — never a "failure"
    // Reprocessable pool: provider failures that are transient (not 400/auth/disconnected).
    if (meta.kind === "FAILED" && meta.retryability === "RETRYABLE_LATER") recoverableLater += n;
  }

  const reasonGroups = (Object.keys(byCategory) as ExecutionCategory[])
    .filter((c) => byCategory[c] > 0 && c !== "SENT")
    .map((c) => ({
      category: c,
      badge: CATEGORY_META[c].badge,
      count: byCategory[c],
      kind: CATEGORY_META[c].kind,
      retryability: CATEGORY_META[c].retryability,
      retryabilityLabel: RETRYABILITY_LABEL[CATEGORY_META[c].retryability],
    }))
    .sort((a, b) => b.count - a.count);

  return { total, sent, blockedSafety, failedProvider, skipped, recoverableLater, byCategory, byRetryability, reasonGroups };
}

/** Aggregates a list of executions into the split the Performance UI needs. */
export function summarizeExecutions(rows: ExecutionInput[]): ExecutionSummary {
  const byCategory = EMPTY_BY_CATEGORY();
  for (const r of rows) byCategory[classifyExecution(r).category] += 1;
  return buildSummary(byCategory, rows.length);
}

/**
 * Eligibility funnel for the campaign detail UI. Separates customers who were
 * never WhatsApp-eligible (no phone / invalid phone / not contactable / opt-out)
 * from real provider failures (Evolution was called and errored). This is what
 * stops the owner from reading "sem telefone" as "WhatsApp falhou".
 *
 *  audienceTotal     — segment size stored on the campaign.
 *  whatsAppEligible  — audience minus the ineligible skips below.
 *  sent              — provider accepted the message.
 *  skipped           — ineligible: noPhone + invalidPhone + notContactable + optOut.
 *  blockedSafety     — eligible but held by a safety rule (cap/cooldown/quiet) — retry next cycle.
 *  providerFailures  — Evolution was called and returned an error.
 *  recoverableFailures / permanentFailures — split of providerFailures by retry policy.
 */
export interface CampaignEligibilityMetrics {
  audienceTotal: number;
  whatsAppEligible: number;
  sent: number;
  skipped: number;
  blockedSafety: number;
  providerFailures: number;
  recoverableFailures: number;
  permanentFailures: number;
  skippedBreakdown: { noPhone: number; invalidPhone: number; optOut: number; notContactable: number; otherNotEligible: number };
  failureBreakdown: { http400: number; http500: number; timeout: number; rateLimit: number; disconnected: number; auth: number; emptyMessage: number; unknown: number };
}

export function buildEligibilityMetrics(summary: ExecutionSummary, audienceTotal: number): CampaignEligibilityMetrics {
  const c = summary.byCategory;
  const noPhone        = c.SKIPPED_NO_PHONE;
  const invalidPhone   = c.BLOCKED_INVALID_PHONE;
  const notContactable = c.SKIPPED_NOT_CONTACTABLE;
  const optOut         = c.BLOCKED_OPT_OUT;
  const otherNotEligible = c.SKIPPED_NOT_ELIGIBLE;

  // Ineligible = never attemptable on WhatsApp (data/consent), NOT a provider failure.
  const ineligibleSkipped = noPhone + invalidPhone + notContactable + optOut + otherNotEligible;

  // Rate-limit is a transient hold (kind BLOCKED) but it IS a provider signal; keep it
  // in blockedSafety for the headline split, and surface it under failureBreakdown too.
  const providerFailures = summary.failedProvider; // kind FAILED only
  const recoverableFailures = summary.recoverableLater;
  const permanentFailures = providerFailures - recoverableFailures;

  const whatsAppEligible = Math.max(0, audienceTotal - ineligibleSkipped);

  return {
    audienceTotal,
    whatsAppEligible,
    sent: summary.sent,
    skipped: ineligibleSkipped,
    blockedSafety: summary.blockedSafety,
    providerFailures,
    recoverableFailures,
    permanentFailures,
    skippedBreakdown: { noPhone, invalidPhone, optOut, notContactable, otherNotEligible },
    failureBreakdown: {
      http400:     c.EVOLUTION_BAD_REQUEST,
      http500:     c.FAILED_PROVIDER,
      timeout:     c.FAILED_TIMEOUT,
      rateLimit:   c.EVOLUTION_RATE_LIMITED,
      disconnected:c.EVOLUTION_INSTANCE_DISCONNECTED,
      auth:        c.EVOLUTION_AUTH_ERROR,
      emptyMessage:c.EMPTY_MESSAGE,
      unknown:     c.FAILED_UNKNOWN,
    },
  };
}

/** Aggregates pre-grouped { reason → count } maps (from a DB groupBy). */
export function summarizeFromReasonCounts(
  groups: Array<{ status: string; failedReason?: string | null; errorMessage?: string | null; count: number }>,
): ExecutionSummary {
  const byCategory = EMPTY_BY_CATEGORY();
  let total = 0;
  for (const g of groups) {
    byCategory[classifyExecution(g).category] += g.count;
    total += g.count;
  }
  return buildSummary(byCategory, total);
}
