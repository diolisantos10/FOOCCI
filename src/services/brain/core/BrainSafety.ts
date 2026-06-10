/**
 * BrainSafety — the immutable safety contract of the Foocci Brain.
 *
 * Mirrors the SimulationSafeMode pattern: a frozen object of invariants every
 * Brain module must respect. The Brain reasons, proposes and validates — it NEVER
 * acts on the real world by itself.
 */

export const BRAIN_SAFETY = Object.freeze({
  /** The Brain never mutates the live runtime (prompt, WaiterBrainV2, versions). */
  touchesRuntime: false,
  /** The Brain never sends messages (WhatsApp/Evolution) on its own. */
  sendsMessages: false,
  /** The Brain never creates orders or payments (Pix/Mercado Pago). */
  createsOrdersOrPayments: false,
  /** The Brain only ever receives/stores SANITIZED text — no PII, no raw transcripts. */
  acceptsRawPII: false,
  /** Structural changes require a human-approved BrainChangeRequest. */
  agentsCanMutateBrain: false,
  /** Production-impacting changes additionally require the Quality Gate (P0=0). */
  productionChangeRequiresQualityGate: true,
} as const);

export type BrainSafetyContract = typeof BRAIN_SAFETY;

/** Throws if any invariant has been tampered with (used by tests/diagnostics). */
export function assertBrainSafety(): void {
  if (
    BRAIN_SAFETY.touchesRuntime !== false ||
    BRAIN_SAFETY.sendsMessages !== false ||
    BRAIN_SAFETY.createsOrdersOrPayments !== false ||
    BRAIN_SAFETY.acceptsRawPII !== false ||
    BRAIN_SAFETY.agentsCanMutateBrain !== false ||
    BRAIN_SAFETY.productionChangeRequiresQualityGate !== true
  ) {
    throw new Error("BrainSafety inválido — invariantes do Brain foram violadas.");
  }
}
