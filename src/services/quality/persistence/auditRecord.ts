/**
 * Quality Control — persistence mapping (pure).
 *
 * Maps a pure AuditRunResult into the DB row shape and SANITIZES every finding
 * so no sensitive data is ever stored: phone numbers, emails, tokens/secrets and
 * raw WhatsApp payloads are redacted from evidence/summary. Pure module (no
 * prisma) so the mapping + sanitization are unit-tested.
 */

import type { AuditFinding, AuditRunResult } from "../types";

export type AuditSource = "MANUAL" | "CRON" | "SYSTEM";

export interface PersistRunOptions {
  source: AuditSource;
  triggeredBy?: string | null;
  auditorId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Row payload for a single finding (sanitized). */
export interface FindingRecord {
  auditorId: string;
  status: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string[];
  affectedArea: string;
  recommendation: string;
}

/** Row payload for a run plus its nested findings. */
export interface RunRecord {
  source: AuditSource;
  globalStatus: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  triggeredBy: string | null;
  auditorId: string | null;
  countsBySeverity: AuditRunResult["countsBySeverity"];
  countsByStatus: AuditRunResult["countsByStatus"];
  metadata: Record<string, unknown> | null;
  findings: FindingRecord[];
}

// ── sanitization ──────────────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// phone-like: 8+ consecutive digits, optionally with +, spaces, dashes, parens
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
// token/secret-like: long alphanumeric runs (>=24) or key=secret style
const TOKEN_RE = /\b[A-Za-z0-9_-]{24,}\b/g;
const SECRET_KV_RE = /\b(secret|token|api[_-]?key|password|authorization|bearer)\b\s*[:=]\s*\S+/gi;

/** Redacts sensitive substrings from a single technical string. */
export function sanitizeText(input: string): string {
  return input
    .replace(SECRET_KV_RE, (m) => m.split(/[:=]/)[0] + "=[REDACTED]")
    .replace(EMAIL_RE, "[email]")
    // tokens/long secrets before phones, so a digit-heavy token isn't partially
    // redacted as a phone number.
    .replace(TOKEN_RE, "[token]")
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 8 ? "[phone]" : m))
    .trim();
}

/** Sanitizes an evidence array, dropping empties. */
export function sanitizeEvidence(evidence: readonly string[]): string[] {
  return evidence.map(sanitizeText).filter((s) => s.length > 0);
}

/** Maps + sanitizes a single finding. */
export function sanitizeFinding(f: AuditFinding): FindingRecord {
  return {
    auditorId: f.auditorId,
    status: f.status,
    severity: f.severity,
    title: sanitizeText(f.title),
    summary: sanitizeText(f.summary),
    evidence: sanitizeEvidence(f.evidence),
    affectedArea: f.affectedArea,
    recommendation: sanitizeText(f.recommendation),
  };
}

/** Builds the full (sanitized) run record from a pure audit result. */
export function buildRunRecord(result: AuditRunResult, opts: PersistRunOptions): RunRecord {
  return {
    source: opts.source,
    globalStatus: result.globalStatus,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: Math.max(0, result.finishedAt.getTime() - result.startedAt.getTime()),
    triggeredBy: opts.triggeredBy ? sanitizeText(opts.triggeredBy) : null,
    auditorId: opts.auditorId ?? null,
    countsBySeverity: result.countsBySeverity,
    countsByStatus: result.countsByStatus,
    metadata: opts.metadata ?? null,
    findings: result.findings.map(sanitizeFinding),
  };
}
