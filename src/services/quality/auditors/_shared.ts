/**
 * Quality Control — shared auditor helpers (pure).
 *
 * Small builders so every auditor emits findings in the exact standardized
 * shape. No runtime/side-effect imports.
 */

import type { AuditContext, AuditFinding, FindingSeverity, FindingStatus } from "../types";

interface FindingInput {
  status: FindingStatus;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence: string[];
  affectedArea: string;
  recommendation: string;
}

/** Builds a standardized finding stamped with the run id and clock. */
export function makeFinding(
  ctx: AuditContext,
  auditorId: string,
  input: FindingInput,
): AuditFinding {
  return {
    runId: ctx.runId,
    auditorId,
    status: input.status,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    evidence: [...input.evidence],
    affectedArea: input.affectedArea,
    recommendation: input.recommendation,
    createdAt: ctx.now,
  };
}

/**
 * Standard "runner not connected yet" finding (v0). Honest: nothing was
 * verified, so it is a WARNING/INFO, never a fake PASS. It points the operator
 * to the existing lab and states the runner will be wired in v1.
 */
export function notConnectedFinding(
  ctx: AuditContext,
  auditorId: string,
  opts: { affectedArea: string; lab?: string },
): AuditFinding {
  const labHint = opts.lab ? ` Use o lab existente: ${opts.lab}.` : "";
  return makeFinding(ctx, auditorId, {
    status: "WARNING",
    severity: "INFO",
    title: "Runner real ainda não conectado (v0)",
    summary:
      "Auditor registrado em modo read-only. Nesta versão o motor não executa o " +
      "runner real para evitar qualquer acoplamento com o runtime." +
      labHint,
    evidence: [
      "safeMode=true · dryRun=true · allowSideEffects=false",
      "Nenhuma verificação real executada nesta versão.",
    ],
    affectedArea: opts.affectedArea,
    recommendation: "Conectar o runner determinístico existente na v1 (sem efeito colateral).",
  });
}
