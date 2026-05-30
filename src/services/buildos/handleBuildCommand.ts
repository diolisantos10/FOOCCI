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

import {
  detectBuildCommand,
  isAuthorizedBuildSender,
  isBuildOsEnabled,
} from "./BuildCommandRouter";
import {
  createBuildCommandFromWhatsApp,
  logBuildCommandEvent,
  shortId,
  BUILD_EVENT,
} from "./BuildCommandService";
import { sendBuildConfirmation } from "./BuildNotifier";

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
  // 0. Feature flag — entirely inert unless explicitly enabled.
  if (!isBuildOsEnabled()) return NOT_BUILD;

  // 1. Detection — only messages that START with a known prefix qualify.
  const detected = detectBuildCommand(input.content);
  if (!detected) return NOT_BUILD;

  // From here the message LOOKS like a command, so we intercept it regardless of
  // authorization (a customer can't reach this — prefixes are intentional).

  // 2. Authorization — only allow-listed operators proceed.
  if (!isAuthorizedBuildSender(input.phone)) {
    // Intercept silently: no record, no sensitive details. Just stop normal flow
    // so the "command-looking" text never reaches the receptionist AI either.
    console.warn("[BuildOS] Unauthorized command attempt ignored.", {
      phone: maskPhone(input.phone),
      prefix: detected.prefix,
    });
    return { isBuildCommand: true };
  }

  // 3. Persist the command + initial event.
  const created = await createBuildCommandFromWhatsApp({
    senderPhone: input.phone,
    senderName: input.senderName ?? null,
    rawMessage: input.content,
    prefix: detected.prefix,
    commandText: detected.commandText,
  });

  if (!created) {
    // Persistence failed — still intercept (don't fall through to customer flow).
    await sendBuildConfirmation(
      input.restaurantId,
      input.phone,
      "⚠️ Não consegui registrar seu comando agora. Tente novamente em instantes.",
    ).catch(() => {});
    return { isBuildCommand: true };
  }

  // 4. Send confirmation reply (best-effort) and log the outcome.
  const confirmationText =
    `✅ Comando Build OS registrado (#${shortId(created.id)}).\n` +
    `Status: recebido. Esta é a fase de captação — ainda não há execução automática.`;

  const sent = await sendBuildConfirmation(input.restaurantId, input.phone, confirmationText);
  await logBuildCommandEvent(
    created.id,
    sent ? BUILD_EVENT.CONFIRMATION_SENT : BUILD_EVENT.CONFIRMATION_FAILED,
    sent ? "Confirmação enviada ao operador." : "Falha ao enviar confirmação via WhatsApp.",
  );

  return { isBuildCommand: true };
}

/** Mask a phone for safe logging (keeps country + last 4). */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}
