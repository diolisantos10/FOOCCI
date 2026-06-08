/**
 * Quality Control — request handler (pure, v1).
 *
 * The HTTP-agnostic core behind POST /api/admin/quality/run. Keeping it pure
 * lets the API route stay a thin auth+parse shell and lets the run behavior be
 * unit-tested without Next.js plumbing. Always runs under SafeMode (read-only,
 * no side effects).
 */

import type { AuditRunResult } from "./types";
import { runAll, runOne, QualityAuditorNotFoundError } from "./QualityControlService";

export interface QualityRunRequestBody {
  /** When present, runs a single auditor; otherwise runs all. */
  auditorId?: string;
}

export interface QualityRunResponse {
  ok: boolean;
  mode: "all" | "one";
  result?: AuditRunResult;
  /** Set by the API route once the run is persisted. */
  runId?: string;
  error?: string;
  code?: "NOT_FOUND" | "BAD_REQUEST";
}

export interface QualityRunOutcome {
  httpStatus: number;
  payload: QualityRunResponse;
}

/**
 * Runs the requested audit and returns a serializable outcome.
 * - no auditorId   → runAll
 * - valid auditorId → runOne
 * - unknown auditorId → controlled 404 (never throws to the caller)
 */
export async function handleQualityRun(body: unknown): Promise<QualityRunOutcome> {
  const raw = (body ?? {}) as Record<string, unknown>;
  const auditorId = raw.auditorId;

  // run all
  if (auditorId === undefined || auditorId === null || auditorId === "") {
    const result = await runAll();
    return { httpStatus: 200, payload: { ok: true, mode: "all", result } };
  }

  if (typeof auditorId !== "string") {
    return {
      httpStatus: 400,
      payload: { ok: false, mode: "one", error: "auditorId must be a string", code: "BAD_REQUEST" },
    };
  }

  // run one (controlled error for unknown id)
  try {
    const result = await runOne(auditorId.trim());
    return { httpStatus: 200, payload: { ok: true, mode: "one", result } };
  } catch (err) {
    if (err instanceof QualityAuditorNotFoundError) {
      return {
        httpStatus: 404,
        payload: { ok: false, mode: "one", error: err.message, code: "NOT_FOUND" },
      };
    }
    throw err;
  }
}
