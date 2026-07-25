/**
 * BrainQualityGate — the Brain's protection contract + o REGISTRY por agente.
 *
 * Nothing with production impact ships unless the gate passes (P0 = 0). Cada
 * agente registra seu runner (como o registry de auditores do Quality Control);
 * uma vertical nova registra o dela sem tocar no core. Agente sem gate = gate
 * REPROVADO por construção — nunca "passa por não existir".
 */

export interface BrainQualityGateResult {
  passed: boolean;
  p0Count: number;
  reason: string;
  ranAt: string;
}

export type BrainQualityGateRunner = (agentId: string) => Promise<BrainQualityGateResult>;

// ── Registry (Fase 5): gates por agentSlug ──────────────────────────────────────
const gateRegistry = new Map<string, BrainQualityGateRunner>();

export function registerQualityGate(agentId: string, runner: BrainQualityGateRunner): void {
  gateRegistry.set(agentId, runner);
}

export function registeredGateAgents(): string[] {
  return [...gateRegistry.keys()];
}

/** Roda o gate do agente. Sem gate registrado = REPROVADO (seguro por default). */
export async function runGateForBrain(agentId: string): Promise<BrainQualityGateResult> {
  const runner = gateRegistry.get(agentId);
  if (!runner) {
    return {
      passed: false,
      p0Count: -1,
      reason: `Nenhum quality gate registrado para "${agentId}" — mudança gated não pode ser aplicada.`,
      ranAt: new Date().toISOString(),
    };
  }
  try {
    return await runner(agentId);
  } catch (err) {
    return {
      passed: false,
      p0Count: -1,
      reason: `Gate de "${agentId}" falhou ao executar: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`,
      ranAt: new Date().toISOString(),
    };
  }
}

/** v1: the Waiter gate exposed through the Brain contract. */
export const runWaiterGateForBrain: BrainQualityGateRunner = async (agentId) => {
  if (agentId !== "waiter") {
    return { passed: false, p0Count: -1, reason: `Sem gate implementado para ${agentId} (v1: apenas waiter).`, ranAt: new Date().toISOString() };
  }
  const { runWaiterQualityGate } = await import("@/services/waiterRuntime/qualityGate");
  const gate = await runWaiterQualityGate();
  return { passed: gate.passed, p0Count: gate.p0Count, reason: gate.reason ?? "", ranAt: new Date().toISOString() };
};

/** Gate do WhatsApp: o diagnóstico hermético (inclui o caso rodízio) com P0=0. */
export const runWhatsAppGateForBrain: BrainQualityGateRunner = async () => {
  const { runWhatsAppBrainDiagnostic } = await import("@/services/whatsapp/brain/WhatsAppBrainDiagnostic");
  const diag = runWhatsAppBrainDiagnostic();
  return {
    passed: diag.status === "PASS" && diag.p0 === 0,
    p0Count: diag.p0,
    reason: diag.status === "PASS" ? `diagnóstico PASS (${diag.passed}/${diag.total})` : `diagnóstico FAIL (${diag.passed}/${diag.total}, p0=${diag.p0})`,
    ranAt: new Date().toISOString(),
  };
};

/** Gate do CRM: diagnóstico hermético do piso de segurança (sem oferta inventada,
 *  sem spam, sem repetição) com P0=0 — mais a BATERIA ADVERSARIAL (injeção de
 *  desconto, vigilância/LGPD, urgência, quase-duplicata). Promoção só sobe se o
 *  piso segurar tanto o caminho feliz quanto os ataques. Mesmo molde do WhatsApp. */
export const runCrmGateForBrain: BrainQualityGateRunner = async () => {
  const [{ runCrmBrainDiagnostic }, { runCrmAdversarialProbes }] = await Promise.all([
    import("@/services/crm/CrmBrainDiagnostic"),
    import("@/services/crm/CrmAdversarialProbes"),
  ]);
  const diag = runCrmBrainDiagnostic();
  const probes = runCrmAdversarialProbes();
  const passed = diag.status === "PASS" && diag.p0 === 0 && probes.status === "PASS" && probes.leaks === 0;
  const p0Count = diag.p0 + probes.leaks;
  return {
    passed,
    p0Count,
    reason: passed
      ? `diagnóstico PASS (${diag.passed}/${diag.total}) + probes adversariais PASS (${probes.passed}/${probes.total})`
      : `piso REPROVADO — diagnóstico ${diag.passed}/${diag.total} (p0=${diag.p0}), probes ${probes.passed}/${probes.total} (vazamentos=${probes.leaks})`,
    ranAt: new Date().toISOString(),
  };
};

/** Gate do Suporte Técnico: prova que o freio de mão da escada de ação segura —
 *  em sombra nada executa, ação fora do catálogo nunca é reconhecida — com P0=0. */
export const runSupportGateForBrain: BrainQualityGateRunner = async () => {
  const { runSupportBrainDiagnostic } = await import("@/services/support/SupportBrainDiagnostic");
  const diag = runSupportBrainDiagnostic();
  return {
    passed: diag.status === "PASS" && diag.p0 === 0,
    p0Count: diag.p0,
    reason: diag.status === "PASS" ? `diagnóstico PASS (${diag.passed}/${diag.total})` : `diagnóstico FAIL (${diag.passed}/${diag.total}, p0=${diag.p0})`,
    ranAt: new Date().toISOString(),
  };
};

// Gates built-in registrados na carga do módulo.
registerQualityGate("waiter", runWaiterGateForBrain);
registerQualityGate("whatsapp", runWhatsAppGateForBrain);
registerQualityGate("crm", runCrmGateForBrain);
registerQualityGate("suporte-tecnico", runSupportGateForBrain);
