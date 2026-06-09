/**
 * SimulationSafeMode — the immutable safety contract for the Agent Simulation Lab.
 *
 * Every runner MUST assert this before doing anything. It guarantees the Lab can
 * test/diagnose/suggest but NEVER cause a real side effect: no order, no Pix, no
 * Mercado Pago, no WhatsApp, no Evolution, no CRM dispatch, no runtime mutation.
 */

export interface SimulationSafeMode {
  readonly simulationMode: true;
  readonly dryRun: true;
  readonly allowSideEffects: false;
  readonly allowPayments: false;
  readonly allowMessaging: false;
  readonly allowOrderCreation: false;
}

export const SIMULATION_SAFE_MODE: SimulationSafeMode = Object.freeze({
  simulationMode: true,
  dryRun: true,
  allowSideEffects: false,
  allowPayments: false,
  allowMessaging: false,
  allowOrderCreation: false,
});

export class SimulationSafetyError extends Error {
  constructor(message: string) {
    super(`Simulation SafeMode violated: ${message}`);
    this.name = "SimulationSafetyError";
  }
}

/**
 * Asserts the Lab is running fully sandboxed. Throws (blocking the run) if any
 * unsafe capability is enabled — the Lab must never proceed outside dry-run.
 */
export function assertSimulationSafeMode(mode: SimulationSafeMode = SIMULATION_SAFE_MODE): void {
  if (!mode.simulationMode) throw new SimulationSafetyError("simulationMode must be true");
  if (!mode.dryRun) throw new SimulationSafetyError("dryRun must be true");
  if (mode.allowSideEffects) throw new SimulationSafetyError("allowSideEffects must be false");
  if (mode.allowPayments) throw new SimulationSafetyError("allowPayments must be false");
  if (mode.allowMessaging) throw new SimulationSafetyError("allowMessaging must be false");
  if (mode.allowOrderCreation) throw new SimulationSafetyError("allowOrderCreation must be false");
}
