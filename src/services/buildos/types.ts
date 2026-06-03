/**
 * Build OS — shared types (Priority 1.1).
 *
 * Project-agnostic Prompt Relay / Command Router. Foocci is the first project,
 * but nothing here is restaurant-specific. Priority 1.1 is intake + persistence
 * + audit ONLY: no Claude relay, no GitHub, no LLM prompt generation, no exec.
 */

/** Command prefixes that mark a WhatsApp message as a Build OS command. */
export const BUILD_COMMAND_PREFIXES = ["/build", "/cmd", "/prompt"] as const;
export type BuildCommandPrefix = (typeof BUILD_COMMAND_PREFIXES)[number];

/** Result of detecting a Build OS command in a raw message. */
export interface DetectedBuildCommand {
  prefix: BuildCommandPrefix;
  /** The raw message with the prefix removed and trimmed. */
  commandText: string;
}

/** Input to create a BuildCommand from a WhatsApp message. */
export interface CreateBuildCommandFromWhatsAppInput {
  senderPhone: string;          // normalized E.164, e.g. "+5511999990000"
  senderName?: string | null;
  rawMessage: string;
  prefix: BuildCommandPrefix;
  commandText: string;
}

/** Admin-facing read view of a BuildCommand (read-only list/detail). */
export interface AdminBuildCommandView {
  id: string;
  shortId: string;
  senderPhone: string;
  senderName: string | null;
  commandPrefix: string;
  commandText: string;
  rawMessage: string;
  status: string;
  riskLevel: string;
  taskType: string;
  executionIntent: string;
  targetArea: string | null;
  requiresHumanConfirmation: boolean;
  classificationSummary: string | null;
  sourceChannel: string;
  projectSlug: string | null;
  projectName: string | null;
  createdAt: string;
  eventCount: number;
}
