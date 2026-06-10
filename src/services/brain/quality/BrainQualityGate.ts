/**
 * BrainQualityGate — the Brain's protection contract.
 *
 * Nothing with production impact ships unless the gate passes (P0 = 0). The
 * Waiter's runtime-merge quality gate (src/services/waiterRuntime/qualityGate)
 * is the v1 reference implementation; this contract is what every future agent
 * gate must satisfy.
 */

export interface BrainQualityGateResult {
  passed: boolean;
  p0Count: number;
  reason: string;
  ranAt: string;
}

export type BrainQualityGateRunner = (agentId: string) => Promise<BrainQualityGateResult>;

/** v1: the Waiter gate exposed through the Brain contract. */
export const runWaiterGateForBrain: BrainQualityGateRunner = async (agentId) => {
  if (agentId !== "waiter") {
    return { passed: false, p0Count: -1, reason: `Sem gate implementado para ${agentId} (v1: apenas waiter).`, ranAt: new Date().toISOString() };
  }
  const { runWaiterQualityGate } = await import("@/services/waiterRuntime/qualityGate");
  const gate = await runWaiterQualityGate();
  return { passed: gate.passed, p0Count: gate.p0Count, reason: gate.reason ?? "", ranAt: new Date().toISOString() };
};
