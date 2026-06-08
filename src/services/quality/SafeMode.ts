/**
 * Quality Control — SafeMode.
 *
 * The single guard that guarantees auditors can NEVER cause a side effect:
 *   safeMode = true · dryRun = true · allowSideEffects = false
 *
 * The configuration is a frozen singleton. Any attempt to run an auditor with a
 * context that is not in safe mode is rejected with a controlled error, so an
 * unsafe run is impeded rather than silently allowed.
 *
 * Pure module — no runtime imports.
 */

export interface SafeModeConfig {
  readonly safeMode: true;
  readonly dryRun: true;
  readonly allowSideEffects: false;
}

/** Frozen, canonical safe configuration shared by every run. */
export const SAFE_MODE: SafeModeConfig = Object.freeze({
  safeMode: true,
  dryRun: true,
  allowSideEffects: false,
});

/** Controlled error thrown when a run is attempted outside safe mode. */
export class QualitySafeModeError extends Error {
  constructor(message = "Quality Control: execution blocked — context is not in SafeMode") {
    super(message);
    this.name = "QualitySafeModeError";
  }
}

/** True only when the value is a fully safe configuration. */
export function isSafeMode(cfg: unknown): cfg is SafeModeConfig {
  if (!cfg || typeof cfg !== "object") return false;
  const c = cfg as Record<string, unknown>;
  return c.safeMode === true && c.dryRun === true && c.allowSideEffects === false;
}

/**
 * Asserts the context is in safe mode, throwing a controlled error otherwise.
 * This is what impedes an unsafe auditor execution.
 */
export function assertSafeMode(cfg: unknown): asserts cfg is SafeModeConfig {
  if (!isSafeMode(cfg)) {
    throw new QualitySafeModeError();
  }
}
