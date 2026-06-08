/**
 * QualityControlService — read-only orchestrator (v0).
 *
 * Holds the in-code auditor registry and runs auditors under SafeMode, returning
 * standardized, aggregated results. No UI, no API, no cron, no DB, no
 * persistence, no runtime coupling. Every run is dry-run and side-effect free.
 *
 * Pure module — imports only the auditors and the SafeMode/types of this folder.
 */

import type {
  Auditor,
  AuditContext,
  AuditContextInput,
  AuditFinding,
  AuditRunResult,
  FindingSeverity,
  FindingStatus,
} from "./types";
import { SAFE_MODE, assertSafeMode } from "./SafeMode";
import { WaiterAuditor } from "./auditors/WaiterAuditor";
import { CrmAuditor } from "./auditors/CrmAuditor";
import { AnalyticsAuditor } from "./auditors/AnalyticsAuditor";
import { WhatsAppAuditor } from "./auditors/WhatsAppAuditor";

/** Controlled error for an unknown auditor id. */
export class QualityAuditorNotFoundError extends Error {
  constructor(id: string) {
    super(`Quality Control: auditor not found — "${id}"`);
    this.name = "QualityAuditorNotFoundError";
  }
}

/** In-code registry (v0). Order is stable and intentional. */
const REGISTRY: readonly Auditor[] = [
  WaiterAuditor,
  CrmAuditor,
  AnalyticsAuditor,
  WhatsAppAuditor,
];

export function getAuditors(): Auditor[] {
  return [...REGISTRY];
}

export function getAuditor(id: string): Auditor | undefined {
  return REGISTRY.find((a) => a.id === id);
}

// ── pure aggregation helpers ──────────────────────────────────────────────────

export function countBySeverity(findings: readonly AuditFinding[]): Record<FindingSeverity, number> {
  const out: Record<FindingSeverity, number> = { P0: 0, P1: 0, P2: 0, INFO: 0 };
  for (const f of findings) out[f.severity] += 1;
  return out;
}

export function countByStatus(findings: readonly AuditFinding[]): Record<FindingStatus, number> {
  const out: Record<FindingStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0 };
  for (const f of findings) out[f.status] += 1;
  return out;
}

/**
 * Global status:
 *  - FAIL    if any finding is P0 or FAIL
 *  - WARNING if any finding is P1/P2 or WARNING
 *  - PASS    otherwise
 */
export function computeGlobalStatus(findings: readonly AuditFinding[]): FindingStatus {
  let warning = false;
  for (const f of findings) {
    if (f.severity === "P0" || f.status === "FAIL") return "FAIL";
    if (f.severity === "P1" || f.severity === "P2" || f.status === "WARNING") warning = true;
  }
  return warning ? "WARNING" : "PASS";
}

// ── context ──────────────────────────────────────────────────────────────────

function buildContext(input?: AuditContextInput): AuditContext {
  const now = input?.now ?? new Date();
  return {
    runId: input?.runId ?? newRunId(now),
    now,
    safeMode: SAFE_MODE,
  };
}

function newRunId(now: Date): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `qc_${now.getTime().toString(36)}_${rand}`;
}

function aggregate(ctx: AuditContext, auditorIds: string[], findings: AuditFinding[], startedAt: Date): AuditRunResult {
  return {
    runId: ctx.runId,
    startedAt,
    finishedAt: new Date(),
    auditorIds,
    findings,
    countsBySeverity: countBySeverity(findings),
    countsByStatus: countByStatus(findings),
    globalStatus: computeGlobalStatus(findings),
  };
}

// ── runners ──────────────────────────────────────────────────────────────────

/** Runs a single auditor by id. Throws a controlled error if it does not exist. */
export async function runOne(id: string, input?: AuditContextInput): Promise<AuditRunResult> {
  const auditor = getAuditor(id);
  if (!auditor) throw new QualityAuditorNotFoundError(id);

  const ctx = buildContext(input);
  assertSafeMode(ctx.safeMode); // impede execução fora do modo seguro
  const startedAt = new Date();
  const findings = await auditor.run(ctx);
  return aggregate(ctx, [auditor.id], findings, startedAt);
}

/** Runs every registered auditor and aggregates the findings. */
export async function runAll(input?: AuditContextInput): Promise<AuditRunResult> {
  const ctx = buildContext(input);
  assertSafeMode(ctx.safeMode); // impede execução fora do modo seguro
  const startedAt = new Date();

  const findings: AuditFinding[] = [];
  for (const auditor of REGISTRY) {
    const part = await auditor.run(ctx);
    findings.push(...part);
  }
  return aggregate(ctx, REGISTRY.map((a) => a.id), findings, startedAt);
}
