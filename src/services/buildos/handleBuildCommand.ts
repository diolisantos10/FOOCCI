/**
 * handleBuildCommand — Build OS branch entry point from the WhatsApp webhook.
 *
 * Called as the FIRST step of inbound message handling, BEFORE any restaurant
 * customer/conversation/message records are created. Contract:
 *
 *   • Returns { isBuildCommand: false } for anything that is not a Build OS
 *     command → the caller continues normal customer processing unchanged.
 *   • Returns { isBuildCommand: true } when the message was intercepted (whether
 *     authorized or not) → the caller MUST stop normal processing.
 *
 * Security:
 *   • Feature gated by BUILDOS_ENABLED (default OFF).
 *   • Only allow-listed phones create records / receive replies. Unauthorized
 *     senders are intercepted silently — no record, no sensitive reply — so a
 *     customer can never accidentally trigger Build OS, and a stranger probing
 *     "/build" learns nothing.
 *
 * Priority 1.1: intake + confirmation only. No Claude, no GitHub, no LLM.
 */

import { detectBuildCommand, normalizeSenderPhone } from "./BuildCommandRouter";
import {
  resolveBuildOsEnabled,
  authorizeSender,
  touchSenderLastUsed,
} from "./BuildOSConfigService";
import {
  createBuildCommandFromWhatsApp,
  logBuildCommandEvent,
  setBuildCommandStatus,
  shortId,
  BUILD_EVENT,
} from "./BuildCommandService";
import { sendBuildConfirmation } from "./BuildNotifier";
import {
  createPromptDraftForCommand,
  buildPromptPreview,
} from "./BuildPromptDraftService";
import { handleBuildReply } from "./BuildReplyHandler";
import { recordWebhookTrace } from "./BuildWebhookTrace";

export interface BuildCommandHandlingInput {
  restaurantId: string; // Evolution instance owner — used only to send the reply
  phone: string;        // normalized E.164 sender
  senderName?: string;
  content: string;      // raw inbound text
  /** True when Evolution flagged the message as sent by the connected number. */
  fromMe?: boolean;
  /** Evolution instance the event arrived on (for tracing + channel gating). */
  instanceName?: string;
  /**
   * True when this instance is the configured Build OS Master channel (or an
   * explicit legacy fallback). When false, internal commands are SUPPRESSED but
   * never executed — restaurant instances must not act as the Build OS channel.
   * Defaults to true ONLY for callers that don't pass it (back-compat: internal
   * simulators/tests), so the webhook MUST always pass an explicit value.
   */
  isBuildOsChannel?: boolean;
  /** Whether a Build OS Master channel is configured at all (for the trace reason). */
  masterConfigured?: boolean;
}

export interface BuildCommandHandlingResult {
  /** True if this message was a Build OS command and was intercepted. */
  isBuildCommand: boolean;
}

const NOT_BUILD: BuildCommandHandlingResult = { isBuildCommand: false };

export async function handleBuildCommand(
  input: BuildCommandHandlingInput,
): Promise<BuildCommandHandlingResult> {
  // Structured diagnostic line (no secrets, no full prompt). Emitted once per
  // candidate message so the WhatsApp path is traceable in logs without console.
  const diag: Record<string, unknown> = {
    received: true,
    prefixDetected: null as string | null,
    normalizedPhone: maskPhone(input.phone),
    instanceName: input.instanceName ?? null,
    fromMe: input.fromMe ?? null,
    configEnabled: null as boolean | null,
    configSource: null as string | null,
    authorized: null as boolean | null,
    commandCreated: false,
    promptDrafted: false,
    responseSent: false,
    shortCircuited: false,
    failureReason: null as string | null,
  };

  // Detect FIRST so we can log even when the feature gate is off (the previous
  // blind spot: a /build silently fell through when disabled).
  const detected = detectBuildCommand(input.content);
  diag.prefixDetected = detected?.prefix ?? null;

  // 0a. CHANNEL gate — Build OS commands are only processed on the configured
  //     Build OS Master/Admin instance (or an explicit legacy fallback). On a
  //     restaurant instance an internal command is SUPPRESSED (never echoed to the
  //     customer/AI) but NEVER executed and NEVER attributed to a /build operator.
  //     `isBuildOsChannel` defaults to true only for internal callers that omit it
  //     (simulators/tests); the webhook always passes an explicit value.
  const isBuildOsChannel = input.isBuildOsChannel ?? true;
  if (!isBuildOsChannel) {
    if (detected) {
      diag.shortCircuited = true;
      diag.failureReason = input.masterConfigured
        ? "wrong_instance_for_buildos"
        : "buildos_master_not_configured";
      // Do NOT persist rawPhone here — on a restaurant instance the sender may be a
      // customer; this is not an authorizable Build OS operator.
      logDiag(diag, null);
      return { isBuildCommand: true }; // suppress: a command prefix must never reach the AI
    }
    return NOT_BUILD; // normal restaurant flow is untouched
  }

  // 0b. Enable gate — DB-first (admin config), env bootstrap fallback, hard kill.
  //    Honors BUILDOS_HARD_DISABLED → BuildOSConfig.isEnabled → BUILDOS_ENABLED.
  const enabled = await resolveBuildOsEnabled();
  diag.configEnabled = enabled.enabled;
  diag.configSource = enabled.source;
  if (!enabled.enabled) {
    if (detected) {
      // Build OS is disabled, but this message is a /build command. Suppress it:
      // return isBuildCommand:true so WebhookProcessorService stops processing
      // BEFORE the message is persisted to DB or passed to the AI / Evolution.
      // "Disabled" means "don't execute commands," NOT "treat /build as a normal
      // customer message." The customer must never receive an AI echo of an
      // internal command prefix.
      diag.shortCircuited = true;
      diag.failureReason = `config_disabled:${enabled.source}`;
      logDiag(diag, input.phone);
      return { isBuildCommand: true };
    }
    return NOT_BUILD;
  }

  if (detected) {
    // ── New command path (/build, /cmd, /prompt) ──
    // fromMe guard: when this command came from the connected number itself, the
    // operator phone is the instance owner. If the webhook payload didn't carry
    // it, we CANNOT authorize anyone (we must never fall back to the recipient).
    // Trace it with a distinct reason so the diagnostic explains the empty button.
    if (input.fromMe && !normalizeSenderPhone(input.phone)) {
      diag.shortCircuited = true;
      diag.failureReason = "fromme_operator_unresolved";
      logDiag(diag, input.phone);
      return { isBuildCommand: true };
    }
    // The message LOOKS like a command, so we intercept it regardless of
    // authorization (a customer can't reach this — prefixes are intentional).
    const auth = await authorizeSender(input.phone);
    diag.authorized = auth.authorized;
    if (!auth.authorized) {
      diag.shortCircuited = true;
      diag.failureReason = "unauthorized_sender";
      logDiag(diag, input.phone);
      return { isBuildCommand: true };
    }
    if (auth.senderId) touchSenderLastUsed(auth.senderId).catch(() => {});
    const outcome = await handleNewCommand(input, detected.prefix, detected.commandText);
    diag.commandCreated = outcome.commandCreated;
    diag.promptDrafted = outcome.promptDrafted;
    diag.responseSent = outcome.responseSent;
    diag.shortCircuited = true;
    if (!outcome.responseSent) diag.failureReason = outcome.failureReason ?? "response_send_failed";
    logDiag(diag, input.phone);
    return { isBuildCommand: true };
  }

  // ── Confirmation-reply path (ENVIAR/APROVAR/CANCELAR/AJUSTAR/STATUS) ──
  // Only an AUTHORIZED sender's reply is considered. Non-authorized senders are
  // never intercepted here (their normal customer flow is untouched).
  const replyAuth = await authorizeSender(input.phone);
  if (replyAuth.authorized) {
    try {
      const result = await handleBuildReply(input.phone, input.content);
      if (result.handled) {
        if (replyAuth.senderId) touchSenderLastUsed(replyAuth.senderId).catch(() => {});
        if (result.reply) {
          await sendBuildConfirmation(input.restaurantId, input.phone, result.reply).catch(() => {});
        }
        diag.authorized = true;
        diag.shortCircuited = true;
        diag.responseSent = !!result.reply;
        logDiag(diag, input.phone);
        return { isBuildCommand: true };
      }
    } catch (err) {
      console.error("[BuildOS] Reply handling error (ignored):", err);
      // fall through — treat as a normal message
    }

    // Authorized sender, but the text was neither a /build command nor a known
    // reply. Trace it (without intercepting) so the cause is never invisible:
    // e.g. the operator typed "/build …" but extraction/normalization missed it.
    diag.authorized = true;
    diag.shortCircuited = false;
    diag.failureReason = "authorized_sender_no_command_detected";
    logDiag(diag, input.phone);
  }

  return NOT_BUILD;
}

/**
 * Emit a compact, secret-free diagnostic line AND persist a trace row.
 *
 * `rawPhone` (full E.164) is persisted SERVER-SIDE on the trace so an admin can
 * later authorize an unauthorized /build sender by traceId — it is NEVER part of
 * the logged `diag` line (which only carries the masked phone).
 */
function logDiag(diag: Record<string, unknown>, rawPhone?: string | null): void {
  try {
    console.log(`[BUILD_OS_WHATSAPP] ${JSON.stringify(diag)}`);
  } catch {
    /* logging must never throw */
  }
  // Persist a DB trace so the admin can confirm the REAL webhook reached here,
  // without console/Railway access. Best-effort, fire-and-forget.
  recordWebhookTrace({
    maskedPhone: diag.normalizedPhone as string | null,
    rawPhone: rawPhone ?? null,
    instanceName: diag.instanceName as string | null,
    prefixDetected: diag.prefixDetected as string | null,
    configEnabled: diag.configEnabled as boolean | null,
    configSource: diag.configSource as string | null,
    authorized: diag.authorized as boolean | null,
    fromMe: diag.fromMe as boolean | null,
    commandCreated: !!diag.commandCreated,
    promptDrafted: !!diag.promptDrafted,
    responseSent: !!diag.responseSent,
    shortCircuited: !!diag.shortCircuited,
    failureReason: diag.failureReason as string | null,
  }).catch(() => {});
}

interface NewCommandOutcome {
  commandCreated: boolean;
  promptDrafted: boolean;
  responseSent: boolean;
  failureReason: string | null;
}

/** Intake a new command: persist, classify (in service), draft prompt, ask to confirm. */
async function handleNewCommand(
  input: BuildCommandHandlingInput,
  prefix: "/build" | "/cmd" | "/prompt",
  commandText: string,
): Promise<NewCommandOutcome> {
  const created = await createBuildCommandFromWhatsApp({
    senderPhone: input.phone,
    senderName: input.senderName ?? null,
    rawMessage: input.content,
    prefix,
    commandText,
  });

  if (!created) {
    const sent = await sendBuildConfirmation(
      input.restaurantId,
      input.phone,
      "⚠️ Não consegui registrar seu comando agora. Tente novamente em instantes.",
    ).catch(() => false);
    return { commandCreated: false, promptDrafted: false, responseSent: !!sent, failureReason: "command_create_failed" };
  }

  // Generate the deterministic (TEMPLATE) prompt draft — NO LLM, NO relay.
  const version = await createPromptDraftForCommand(created.id);

  if (!version) {
    // Persisted but draft failed — still keep it; ask the operator to retry STATUS.
    await setBuildCommandStatus(created.id, "RECEIVED");
    const sent = await sendBuildConfirmation(
      input.restaurantId,
      input.phone,
      `✅ Comando #${shortId(created.id)} registrado, mas não consegui gerar o rascunho do prompt agora. Envie STATUS para tentar de novo.`,
    ).catch(() => false);
    return { commandCreated: true, promptDrafted: false, responseSent: !!sent, failureReason: "prompt_draft_failed" };
  }

  await setBuildCommandStatus(created.id, "DRAFTED");
  await logBuildCommandEvent(
    created.id,
    BUILD_EVENT.PROMPT_DRAFTED,
    `Rascunho de prompt gerado (versão ${version.versionNumber}, TEMPLATE).`,
    { versionNumber: version.versionNumber },
  );

  // Compact preview for WhatsApp (full prompt only in admin).
  const replyText =
    `📝 Comando #${shortId(created.id)} registrado e rascunho gerado.\n` +
    (created.projectId ? "" : "⚠️ Projeto não resolvido.\n") +
    `\n${buildPromptPreview(version.promptText)}\n\n` +
    "Responda ENVIAR para aprovar, CANCELAR para cancelar, AJUSTAR: [correção] para revisar, ou STATUS para consultar.";

  const sent = await sendBuildConfirmation(input.restaurantId, input.phone, replyText);
  await setBuildCommandStatus(created.id, "AWAITING_CONFIRMATION");
  await logBuildCommandEvent(
    created.id,
    BUILD_EVENT.AWAITING_CONFIRMATION,
    sent ? "Rascunho enviado ao operador; aguardando confirmação." : "Aguardando confirmação (falha ao enviar preview).",
  );
  return { commandCreated: true, promptDrafted: true, responseSent: !!sent, failureReason: sent ? null : "response_send_failed" };
}

/** Mask a phone for safe logging (keeps country + last 4). */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}
