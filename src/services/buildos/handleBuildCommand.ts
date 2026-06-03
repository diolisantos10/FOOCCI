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

import { detectBuildCommand } from "./BuildCommandRouter";
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

export interface BuildCommandHandlingInput {
  restaurantId: string; // Evolution instance owner — used only to send the reply
  phone: string;        // normalized E.164 sender
  senderName?: string;
  content: string;      // raw inbound text
}

export interface BuildCommandHandlingResult {
  /** True if this message was a Build OS command and was intercepted. */
  isBuildCommand: boolean;
}

const NOT_BUILD: BuildCommandHandlingResult = { isBuildCommand: false };

export async function handleBuildCommand(
  input: BuildCommandHandlingInput,
): Promise<BuildCommandHandlingResult> {
  // 0. Enable gate — DB-first (admin config), env bootstrap fallback, hard kill.
  //    Honors BUILDOS_HARD_DISABLED → BuildOSConfig.isEnabled → BUILDOS_ENABLED.
  const enabled = await resolveBuildOsEnabled();
  if (!enabled.enabled) return NOT_BUILD;

  const detected = detectBuildCommand(input.content);

  if (detected) {
    // ── New command path (/build, /cmd, /prompt) ──
    // The message LOOKS like a command, so we intercept it regardless of
    // authorization (a customer can't reach this — prefixes are intentional).
    const auth = await authorizeSender(input.phone);
    if (!auth.authorized) {
      console.warn("[BuildOS] Unauthorized command attempt ignored.", {
        phone: maskPhone(input.phone),
        prefix: detected.prefix,
      });
      return { isBuildCommand: true };
    }
    if (auth.senderId) touchSenderLastUsed(auth.senderId).catch(() => {});
    await handleNewCommand(input, detected.prefix, detected.commandText);
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
        return { isBuildCommand: true };
      }
    } catch (err) {
      console.error("[BuildOS] Reply handling error (ignored):", err);
      // fall through — treat as a normal message
    }
  }

  return NOT_BUILD;
}

/** Intake a new command: persist, classify (in service), draft prompt, ask to confirm. */
async function handleNewCommand(
  input: BuildCommandHandlingInput,
  prefix: "/build" | "/cmd" | "/prompt",
  commandText: string,
): Promise<void> {
  const created = await createBuildCommandFromWhatsApp({
    senderPhone: input.phone,
    senderName: input.senderName ?? null,
    rawMessage: input.content,
    prefix,
    commandText,
  });

  if (!created) {
    await sendBuildConfirmation(
      input.restaurantId,
      input.phone,
      "⚠️ Não consegui registrar seu comando agora. Tente novamente em instantes.",
    ).catch(() => {});
    return;
  }

  // Generate the deterministic (TEMPLATE) prompt draft — NO LLM, NO relay.
  const version = await createPromptDraftForCommand(created.id);

  if (!version) {
    // Persisted but draft failed — still keep it; ask the operator to retry STATUS.
    await setBuildCommandStatus(created.id, "RECEIVED");
    await sendBuildConfirmation(
      input.restaurantId,
      input.phone,
      `✅ Comando #${shortId(created.id)} registrado, mas não consegui gerar o rascunho do prompt agora. Envie STATUS para tentar de novo.`,
    ).catch(() => {});
    return;
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
}

/** Mask a phone for safe logging (keeps country + last 4). */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}
