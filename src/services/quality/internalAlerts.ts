/**
 * Quality Control — internal alerts (pure, derived; no external send).
 *
 * Derives operator-facing alerts from the persisted audit history by comparing
 * consecutive runs with the regression detector. It NEVER sends anything (no
 * email/WhatsApp/Evolution/provider) — alerts are visual only and are computed
 * from the history, so no migration/table is required.
 */

import { detectRegression, type RegressionRunLike } from "./regression";

export type InternalAlertType = "NEW_P0" | "STATUS_REGRESSION" | "P0_RESOLVED";

export interface InternalAlert {
  type: InternalAlertType;
  severity: "INFO" | "WARNING" | "P0";
  runId: string;
  previousRunId: string;
  title: string;
  summary: string;
  /** createdAt of the latest run in the compared pair. */
  createdAt: string;
}

/** A history run with the createdAt needed to stamp the alert. */
export interface AlertRunLike extends RegressionRunLike {
  createdAt: string;
}

/**
 * Derives internal alerts from the history (newest-first). One alert per run
 * transition that is notable: a new P0, a status regression, or a resolved P0.
 * Light/stable changes produce no alert (anti-noise). Capped to `limit`.
 */
export function deriveInternalAlerts(runs: readonly AlertRunLike[], limit = 5): InternalAlert[] {
  const out: InternalAlert[] = [];
  for (let i = 0; i < runs.length - 1 && out.length < limit; i++) {
    const latest = runs[i]!;
    const previous = runs[i + 1]!;
    const reg = detectRegression(latest, previous);

    let type: InternalAlertType | null = null;
    if (reg.title === "Novo P0") type = "NEW_P0";
    else if (reg.title === "P0 resolvido") type = "P0_RESOLVED";
    else if (reg.trend === "WORSENED") type = "STATUS_REGRESSION";

    if (!type) continue; // stable / plain improvement / insufficient → no alert

    out.push({
      type,
      severity: reg.severity,
      runId: latest.id,
      previousRunId: previous.id,
      title: reg.title,
      summary: reg.summary,
      createdAt: latest.createdAt,
    });
  }
  return out;
}

/** True when there is at least one open critical (P0) internal alert. */
export function hasCriticalAlert(alerts: readonly InternalAlert[]): boolean {
  return alerts.some((a) => a.severity === "P0");
}
