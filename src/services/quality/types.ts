/**
 * Quality Control — shared types (v0, read-only core).
 *
 * The Quality Control "department" organizes per-area auditors that inspect the
 * Foocci/Fute system and return standardized findings. v0 is the engine only:
 * no UI, no API, no cron, no DB, no persistence. Auditors are READ-ONLY and run
 * exclusively under SafeMode (dry-run, no side effects).
 *
 * Pure module: imports nothing from runtime, payment, WhatsApp, CRM, order
 * creation or prisma. Kept in a non-bracketed path so vitest can resolve it.
 */

import type { SafeModeConfig } from "./SafeMode";

/** Per-finding outcome. */
export type FindingStatus = "PASS" | "WARNING" | "FAIL";

/** Per-finding severity. INFO = informational (e.g. "runner not connected yet"). */
export type FindingSeverity = "P0" | "P1" | "P2" | "INFO";

/** Connection state of an auditor's real runner. */
export type AuditorConnection = "ACTIVE" | "PARTIAL" | "PLANNED";

/** Coarse grouping used by the (future) dashboard filters. */
export type AuditorGroup =
  | "IA"
  | "CRM"
  | "Analytics"
  | "WhatsApp"
  | "Produto"
  | "Operação"
  | "Integrações"
  | "Segurança";

/** A link to an existing admin lab/test-center route (or a planned one). */
export interface LinkedLab {
  label: string;
  /** Existing admin route. Empty string when the lab does not exist yet. */
  href: string;
  exists: boolean;
}

/**
 * Standardized finding returned by every auditor. Matches the agreed contract
 * exactly so it can be persisted unchanged in a later phase.
 */
export interface AuditFinding {
  runId: string;
  auditorId: string;
  status: FindingStatus;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence: string[];
  affectedArea: string;
  recommendation: string;
  createdAt: Date;
}

/** Execution context handed to every auditor. SafeMode is mandatory. */
export interface AuditContext {
  /** Correlates findings of a single run. Generated when omitted. */
  runId: string;
  /** Injectable clock for deterministic findings/tests. */
  now: Date;
  /** Always the frozen safe configuration (dry-run, no side effects). */
  safeMode: SafeModeConfig;
}

/** Optional partial context accepted by the service entry points. */
export interface AuditContextInput {
  runId?: string;
  now?: Date;
}

/** An area auditor. v0 auditors are read-only and daily-safe by construction. */
export interface Auditor {
  id: string;
  name: string;
  area: string;
  group: AuditorGroup;
  mission: string;
  readOnly: true;
  canRunDaily: true;
  /** Connection state of the underlying real runner. */
  connection: AuditorConnection;
  linkedLabs: LinkedLab[];
  run(ctx: AuditContext): Promise<AuditFinding[]>;
}

/** Aggregated result of running one or many auditors. */
export interface AuditRunResult {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  auditorIds: string[];
  findings: AuditFinding[];
  countsBySeverity: Record<FindingSeverity, number>;
  countsByStatus: Record<FindingStatus, number>;
  /** PASS (no FAIL/P0) · WARNING (any P1/P2/WARNING) · FAIL (any P0/FAIL). */
  globalStatus: FindingStatus;
}
