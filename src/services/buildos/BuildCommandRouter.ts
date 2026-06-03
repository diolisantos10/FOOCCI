/**
 * BuildCommandRouter — pure detection + authorization helpers (Priority 1.1).
 *
 * NO database access, NO side effects. These are the cheap, synchronous checks
 * used by the WhatsApp webhook to decide — as early and as safely as possible —
 * whether an inbound message is a Build OS command from an authorized operator.
 *
 * Authorization model (project-agnostic, NOT restaurant identity):
 *   • Allow-list of E.164 phone numbers from env BUILD_OS_AUTHORIZED_PHONES
 *     (comma-separated). This is the MVP fallback; a DB allow-list
 *     (BuildAuthorizedSender) can augment it later without changing callers.
 *   • Build OS itself is gated by BUILDOS_ENABLED (default OFF) so the whole
 *     feature is inert until explicitly turned on.
 */

import {
  BUILD_COMMAND_PREFIXES,
  type BuildCommandPrefix,
  type DetectedBuildCommand,
} from "./types";

/** Master kill-switch. Default OFF — Build OS is fully inert unless "true". */
export function isBuildOsEnabled(): boolean {
  return (process.env.BUILDOS_ENABLED ?? "").toLowerCase() === "true";
}

/**
 * Detect whether a raw message is a Build OS command.
 * Matches only when the prefix is the first token (start of message), so normal
 * customer text that merely contains "/build" somewhere is never captured.
 * Returns null when not a command.
 */
export function detectBuildCommand(messageText: string): DetectedBuildCommand | null {
  if (!messageText) return null;
  const trimmed = messageText.trimStart();
  const lower = trimmed.toLowerCase();

  for (const prefix of BUILD_COMMAND_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    // The char right after the prefix must be absent or a NON-word character
    // (space, ":", "-", etc.). This accepts "/build", "/build foo", "/build: foo"
    // while rejecting "/builder" (prefix followed by a word character).
    const next = lower.charAt(prefix.length);
    if (next === "" || /[^a-z0-9]/.test(next)) {
      const commandText = normalizeBuildCommandText(trimmed.slice(prefix.length));
      return { prefix: prefix as BuildCommandPrefix, commandText };
    }
  }
  return null;
}

/** Trim and collapse leading punctuation/space after the prefix. */
export function normalizeBuildCommandText(text: string): string {
  return text.replace(/^[\s:>-]+/, "").trim();
}

/**
 * Parse the env allow-list into a normalized set of E.164 phones.
 * Tolerates spaces and missing "+" (a leading digit-only entry is prefixed).
 */
function getEnvAllowedPhones(): Set<string> {
  const raw = process.env.BUILD_OS_AUTHORIZED_PHONES ?? "";
  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const p = normalizeSenderPhone(part);
    if (p) set.add(p);
  }
  return set;
}

/** Count of distinct authorized operator phones (for the admin status view). */
export function getAuthorizedSenderCount(): number {
  return getEnvAllowedPhones().size;
}

/**
 * Normalize a phone to the same E.164 shape the webhook parser produces
 * ("+5511999990000"). Returns "" when there are no digits.
 */
export function normalizeSenderPhone(phone: string): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

/**
 * Build the set of equivalent E.164 forms for a Brazilian mobile, covering the
 * "nono dígito" ambiguity: WhatsApp sometimes delivers the JID without the extra
 * `9` after the DDD. Given either form, returns BOTH ("+55DD9XXXXXXXX" and
 * "+55DDXXXXXXXX"). For non-BR or non-mobile numbers, returns just the input.
 *
 * Examples:
 *   "+5511999990000" → {"+5511999990000", "+551199990000"}
 *   "+551199990000"  → {"+551199990000",  "+5511999990000"}
 */
export function phoneVariants(normalized: string): Set<string> {
  const out = new Set<string>();
  if (!normalized) return out;
  out.add(normalized);

  const m = normalized.match(/^\+55(\d{2})(\d+)$/);
  if (!m || !m[1] || !m[2]) return out; // not a +55 number — no variant logic

  const ddd = m[1];
  const rest = m[2];

  if (rest.length === 9 && rest.startsWith("9")) {
    // has the 9 → also add the without-9 form
    out.add(`+55${ddd}${rest.slice(1)}`);
  } else if (rest.length === 8) {
    // missing the 9 → also add the with-9 form
    out.add(`+55${ddd}9${rest}`);
  }
  return out;
}

/**
 * Synchronous authorization check against the env allow-list (MVP fallback).
 * A DB-backed check can be layered on later via BuildCommandService without
 * changing the webhook call site.
 */
export function isAuthorizedBuildSender(phone: string): boolean {
  const normalized = normalizeSenderPhone(phone);
  if (!normalized) return false;
  return getEnvAllowedPhones().has(normalized);
}
