/**
 * crmAgentGovernance — as transições governadas do Agente de CRM, no mesmo molde
 * do freeFormGovernance do recepcionista:
 *
 *  • promoteCrmAgentToAllowlist — SHADOW_ONLY → ALLOWLIST (telefones do time),
 *    só com gates PASS + confirm explícito;
 *  • promoteCrmAgentToWide — ALLOWLIST → RESTAURANT_WIDE, com reconhecimento
 *    explícito de clientes reais + gates;
 *  • rollbackCrmAgent — kill de 30s: volta para SHADOW_ONLY (o sorteio nunca parou).
 *
 * Gates = o quality-gate do CRM (diagnóstico + probes adversariais) + evidência de
 * sombra PROVADA do próprio agente (getShadowStats agentId="crm"). Tudo muda SÓ
 * config: nenhum envio — runtimeTouched é false por construção.
 */

import { runGateForBrain } from "@/services/brain/quality/BrainQualityGate";
import { getShadowStats } from "@/services/brain/runtime/BrainShadowEvidenceService";
import { getCrmPilotConfig, writeCrmPilotConfig, type CrmPilotMode } from "./CrmAgentPilotService";

export const PROMOTE_CRM_ALLOWLIST_CONFIRM = "PROMOTE_CRM_AGENT_ALLOWLIST";
export const PROMOTE_CRM_WIDE_CONFIRM = "PROMOTE_CRM_AGENT_RESTAURANT_WIDE";
export const ROLLBACK_CRM_CONFIRM = "ROLLBACK_CRM_AGENT";

/** Evidência de sombra mínima por degrau — números auditáveis, não achismo. */
export const CRM_SHADOW_EVIDENCE = {
  ALLOWLIST: { minSamples: 20, minPassRate: 0.7 },
  RESTAURANT_WIDE: { minSamples: 100, minPassRate: 0.85 },
} as const;

export interface CrmPilotGates {
  gatePass: boolean; // diagnóstico + probes adversariais (p0=0)
  gateReason: string;
  shadowEvidence: boolean; // amostras crm + coerência PASS ≥ mínimos do degrau
  shadowSamples: number;
  shadowPassRate: number;
  allPass: boolean;
  notes: string[];
}

export interface CrmPilotTransitionResult {
  success: boolean;
  previousMode: CrmPilotMode;
  newMode: CrmPilotMode;
  gates: CrmPilotGates | null;
  error: string | null;
  runtimeTouched: false;
}

export async function runCrmPilotGates(
  restaurantId: string,
  stage: keyof typeof CRM_SHADOW_EVIDENCE = "ALLOWLIST",
): Promise<CrmPilotGates> {
  const notes: string[] = [];

  const gate = await runGateForBrain("crm");
  if (!gate.passed) notes.push(`gate crm: ${gate.reason}`);

  const required = CRM_SHADOW_EVIDENCE[stage];
  const stats = await getShadowStats(restaurantId, { agentId: "crm" });
  const shadowEvidence = stats.llmSamples >= required.minSamples && stats.coherencePassRate >= required.minPassRate;
  if (!shadowEvidence) {
    notes.push(
      `evidência de sombra insuficiente para ${stage} (amostras LLM ${stats.llmSamples}/${required.minSamples}, ` +
        `coerência PASS ${(stats.coherencePassRate * 100).toFixed(0)}%/${required.minPassRate * 100}%) — deixe o shadow colher disparos reais`,
    );
  }

  return {
    gatePass: gate.passed,
    gateReason: gate.reason,
    shadowEvidence,
    shadowSamples: stats.llmSamples,
    shadowPassRate: stats.coherencePassRate,
    allPass: gate.passed && shadowEvidence,
    notes,
  };
}

/** SHADOW_ONLY → ALLOWLIST. Exige gates PASS, telefones e confirm exato. */
export async function promoteCrmAgentToAllowlist(input: {
  restaurantId: string;
  phones: string[];
  abTestPercent?: number;
  confirm: string;
}): Promise<CrmPilotTransitionResult> {
  const current = await getCrmPilotConfig(input.restaurantId);
  const fail = (error: string, gates: CrmPilotGates | null = null): CrmPilotTransitionResult =>
    ({ success: false, previousMode: current.mode, newMode: current.mode, gates, error, runtimeTouched: false });

  if (input.confirm !== PROMOTE_CRM_ALLOWLIST_CONFIRM) return fail(`Confirmação inválida — envie confirm: "${PROMOTE_CRM_ALLOWLIST_CONFIRM}".`);
  if (current.mode !== "SHADOW_ONLY") return fail(`mode atual ${current.mode} — a escada não pula degrau (esperado SHADOW_ONLY).`);
  const phones = input.phones.map((p) => p.trim()).filter(Boolean);
  if (!phones.length) return fail("Allowlist vazia — informe os telefones do time.");

  const gates = await runCrmPilotGates(input.restaurantId);
  if (!gates.allPass) return fail(`Gates reprovados: ${gates.notes.join("; ")}`, gates);

  await writeCrmPilotConfig(input.restaurantId, {
    mode: "ALLOWLIST",
    allowlistedPhones: phones,
    paused: false,
    ...(input.abTestPercent !== undefined ? { abTestPercent: input.abTestPercent } : {}),
    notes: `[AUDIT ${new Date().toISOString()}] promote ALLOWLIST (${phones.length} tel, gates PASS, confirm explícito)`,
  });

  return { success: true, previousMode: current.mode, newMode: "ALLOWLIST", gates, error: null, runtimeTouched: false };
}

/** ALLOWLIST → RESTAURANT_WIDE. Reconhecimento explícito de clientes reais + gates. */
export async function promoteCrmAgentToWide(input: {
  restaurantId: string;
  confirm: string;
  acknowledgeRealCustomers?: boolean;
  abTestPercent?: number;
}): Promise<CrmPilotTransitionResult> {
  const current = await getCrmPilotConfig(input.restaurantId);
  const fail = (error: string, gates: CrmPilotGates | null = null): CrmPilotTransitionResult =>
    ({ success: false, previousMode: current.mode, newMode: current.mode, gates, error, runtimeTouched: false });

  if (input.confirm !== PROMOTE_CRM_WIDE_CONFIRM) return fail(`Confirmação inválida — envie confirm: "${PROMOTE_CRM_WIDE_CONFIRM}".`);
  if (input.acknowledgeRealCustomers !== true) return fail("Falta acknowledgeRealCustomers: true — clientes REAIS receberão mensagens compostas pelo agente.");
  if (current.mode !== "ALLOWLIST") return fail(`mode atual ${current.mode} — valide a ALLOWLIST antes de abrir para todo o restaurante.`);

  const gates = await runCrmPilotGates(input.restaurantId, "RESTAURANT_WIDE");
  if (!gates.allPass) return fail(`Gates reprovados (não abrir): ${gates.notes.join("; ")}`, gates);

  await writeCrmPilotConfig(input.restaurantId, {
    mode: "RESTAURANT_WIDE",
    paused: false,
    ...(input.abTestPercent !== undefined ? { abTestPercent: input.abTestPercent } : {}),
    notes: `[RW_OPENED ${new Date().toISOString()}] agente CRM → RESTAURANT_WIDE (gates PASS)`,
  });

  return { success: true, previousMode: current.mode, newMode: "RESTAURANT_WIDE", gates, error: null, runtimeTouched: false };
}

/** Kill de 30 segundos: volta para SHADOW_ONLY. Allowlist e histórico preservados. */
export async function rollbackCrmAgent(input: { restaurantId: string; confirm: string }): Promise<CrmPilotTransitionResult> {
  const current = await getCrmPilotConfig(input.restaurantId);
  if (input.confirm !== ROLLBACK_CRM_CONFIRM) {
    return {
      success: false, previousMode: current.mode, newMode: current.mode, gates: null,
      error: `Confirmação inválida — envie confirm: "${ROLLBACK_CRM_CONFIRM}".`, runtimeTouched: false,
    };
  }
  await writeCrmPilotConfig(input.restaurantId, {
    mode: "SHADOW_ONLY",
    paused: false,
    notes: `[AUDIT ${new Date().toISOString()}] ROLLBACK → SHADOW_ONLY (kill de 30s)`,
  });
  return { success: true, previousMode: current.mode, newMode: "SHADOW_ONLY", gates: null, error: null, runtimeTouched: false };
}
