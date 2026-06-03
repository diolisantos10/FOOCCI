/**
 * BuildReplyHandler — WhatsApp confirmation-loop replies (Priority 1.4).
 *
 * Handles ENVIAR / APROVAR / CANCELAR / AJUSTAR: [instr] / STATUS from an
 * authorized operator, applied to THAT sender's latest awaiting command.
 *
 * Hard limits for this phase:
 *   • APPROVED_FOR_RELAY marks intent only — it does NOT send anything to Claude
 *     or GitHub. There is no relay in 1.4.
 *   • A phone can only act on its OWN pending command (sender match enforced via
 *     findLatestAwaitingCommandForSender, which filters by senderPhone).
 *   • Authorization is the caller's responsibility (the webhook branch only
 *     reaches here for allow-listed senders); we re-check defensively anyway.
 */

import { authorizeSender } from "./BuildOSConfigService";
import {
  BUILD_EVENT,
  logBuildCommandEvent,
  setBuildCommandStatus,
  findLatestAwaitingCommandForSender,
  getBuildCommandStatusSnapshot,
  shortId,
} from "./BuildCommandService";
import {
  revisePromptDraft,
  getLatestPromptVersion,
  buildPromptPreview,
} from "./BuildPromptDraftService";

export type BuildReplyAction = "ENVIAR" | "APROVAR" | "CANCELAR" | "AJUSTAR" | "STATUS";

export interface ParsedReply {
  action: BuildReplyAction;
  /** For AJUSTAR: the revision instruction after the colon. */
  instruction?: string;
}

/**
 * Parse a reply message into a confirmation action, or null if it is not one.
 * Recognizes (case-insensitive, accent-tolerant): ENVIAR, APROVAR, CANCELAR,
 * STATUS, and "AJUSTAR: <instruction>".
 */
export function parseBuildReply(messageText: string): ParsedReply | null {
  if (!messageText) return null;
  const trimmed = messageText.trim();
  const norm = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  if (norm.startsWith("ajustar")) {
    // Accept "ajustar: ...", "ajustar - ...", or "ajustar ..."
    const after = trimmed.replace(/^ajustar\s*[:\-]?\s*/i, "");
    const instruction = after.trim();
    return { action: "AJUSTAR", instruction };
  }
  if (norm === "enviar") return { action: "ENVIAR" };
  if (norm === "aprovar") return { action: "APROVAR" };
  if (norm === "cancelar") return { action: "CANCELAR" };
  if (norm === "status") return { action: "STATUS" };

  return null;
}

export interface ReplyHandlingResult {
  /** True when the message was a recognized Build OS reply and was handled. */
  handled: boolean;
  /** Reply text to send back to the operator (caller sends it). */
  reply?: string;
}

const NOT_HANDLED: ReplyHandlingResult = { handled: false };

/**
 * Handle a confirmation reply from `senderPhone`. Returns handled=false when the
 * text is not a known reply OR there is no pending command for this sender (so
 * the caller can fall through — but in practice the webhook only calls this for
 * authorized senders, and a non-reply falls through to command detection first).
 */
export async function handleBuildReply(
  senderPhone: string,
  messageText: string,
): Promise<ReplyHandlingResult> {
  const parsed = parseBuildReply(messageText);
  if (!parsed) return NOT_HANDLED;

  // Defensive re-check (caller already gated on authorization) — DB-first.
  const auth = await authorizeSender(senderPhone);
  if (!auth.authorized) return { handled: true };

  // Only ever act on THIS sender's own latest awaiting command.
  const pending = await findLatestAwaitingCommandForSender(senderPhone);
  if (!pending) {
    return {
      handled: true,
      reply: "Nenhum comando aguardando confirmação no momento. Envie /build … para criar um novo.",
    };
  }

  const commandId = pending.id;
  const sid = shortId(commandId);

  switch (parsed.action) {
    case "ENVIAR":
    case "APROVAR": {
      await setBuildCommandStatus(commandId, "APPROVED_FOR_RELAY");
      await logBuildCommandEvent(commandId, BUILD_EVENT.PROMPT_APPROVED, "Prompt aprovado pelo operador.");
      return {
        handled: true,
        reply:
          `✅ Prompt aprovado (#${sid}).\n` +
          "Relay para Claude/GitHub ainda não está ativo nesta fase.",
      };
    }

    case "CANCELAR": {
      await setBuildCommandStatus(commandId, "CANCELLED");
      await logBuildCommandEvent(commandId, BUILD_EVENT.COMMAND_CANCELLED, "Comando cancelado pelo operador.");
      return { handled: true, reply: `🚫 Comando #${sid} cancelado.` };
    }

    case "STATUS": {
      const snap = await getBuildCommandStatusSnapshot(commandId);
      const latest = await getLatestPromptVersion(commandId);
      if (!snap) return { handled: true, reply: `Comando #${sid}: status indisponível.` };
      return {
        handled: true,
        reply:
          `📋 Comando #${snap.shortId}\n` +
          `Status: ${snap.status}\n` +
          `Projeto: ${snap.projectName ?? "não resolvido"}\n` +
          `Risco: ${snap.riskLevel} · Intenção: ${snap.executionIntent}\n` +
          `Prompt: versão ${latest?.versionNumber ?? "—"}`,
      };
    }

    case "AJUSTAR": {
      const instruction = (parsed.instruction ?? "").trim();
      if (!instruction) {
        return {
          handled: true,
          reply: 'Para revisar, envie no formato: "AJUSTAR: sua instrução de correção".',
        };
      }
      await logBuildCommandEvent(
        commandId,
        BUILD_EVENT.PROMPT_REVISION_REQUESTED,
        "Revisão solicitada pelo operador.",
        { instruction },
      );
      await setBuildCommandStatus(commandId, "REVISION_REQUESTED");

      const version = await revisePromptDraft(commandId, instruction);
      if (!version) {
        return { handled: true, reply: `⚠️ Não consegui gerar a revisão do #${sid}. Tente novamente.` };
      }
      await logBuildCommandEvent(
        commandId,
        BUILD_EVENT.PROMPT_DRAFTED,
        `Rascunho revisado gerado (versão ${version.versionNumber}).`,
        { versionNumber: version.versionNumber },
      );
      await setBuildCommandStatus(commandId, "AWAITING_CONFIRMATION");

      return {
        handled: true,
        reply:
          `✍️ Rascunho revisado (#${sid}, versão ${version.versionNumber}).\n\n` +
          `${buildPromptPreview(version.promptText)}\n\n` +
          "Responda ENVIAR para aprovar, AJUSTAR: [correção] para revisar de novo, ou CANCELAR.",
      };
    }

    default:
      return NOT_HANDLED;
  }
}
