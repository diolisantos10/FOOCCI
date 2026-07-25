/**
 * freeFormGovernance — as três transições governadas do raciocínio livre,
 * nos moldes exatos do productionGovernance do Text Ordering:
 *
 *  • promoteFreeFormToAllowlist — SHADOW_ONLY → ALLOWLIST (telefones do time),
 *    SÓ com todos os gates PASS + confirm explícito;
 *  • promoteFreeFormToWide — ALLOWLIST → RESTAURANT_WIDE, com reconhecimento
 *    explícito de clientes reais + gates + BrainChangeRequest (CRITICAL/PRODUCTION);
 *  • rollbackFreeForm — kill de 30 segundos: volta para SHADOW_ONLY (o shadow
 *    continua colhendo evidência; o recepcionista continua atendendo).
 *
 * Tudo aqui muda SÓ config: nenhum envio, nenhum pedido, nenhum Pix —
 * runtimeTouched é false por construção.
 */

import { runGateForBrain } from "../quality/BrainQualityGate";
import { restaurantKnowledgeAdapter } from "../knowledge/RestaurantKnowledgeAdapter";
import { createChangeRequest } from "../director/PersistentBrainDirectorService";
import { getShadowStats } from "./BrainShadowEvidenceService";
import { getFreeFormConfig, writeFreeFormConfig, type FreeFormMode } from "./BrainFreeFormConfigService";

export const PROMOTE_ALLOWLIST_CONFIRM = "PROMOTE_BRAIN_FREEFORM_ALLOWLIST";
export const PROMOTE_WIDE_CONFIRM = "PROMOTE_BRAIN_FREEFORM_RESTAURANT_WIDE";
export const ROLLBACK_FREEFORM_CONFIRM = "ROLLBACK_BRAIN_FREEFORM";

/** Piso de completude da verdade para o Brain poder falar ao vivo. */
export const KNOWLEDGE_COMPLETENESS_FLOOR = 0.6;

/** Evidência de sombra mínima por degrau — números auditáveis, não achismo. */
export const SHADOW_EVIDENCE = {
  ALLOWLIST: { minSamples: 20, minPassRate: 0.7 },
  RESTAURANT_WIDE: { minSamples: 100, minPassRate: 0.85 },
} as const;

export interface FreeFormGates {
  diagnosticPass: boolean; // golden set hermético (incl. caso rodízio) p0=0
  knowledgeComplete: boolean; // completenessScore ≥ piso
  completenessScore: number;
  shadowEvidence: boolean; // amostras + taxa de coerência PASS ≥ mínimos do degrau
  shadowSamples: number;
  shadowPassRate: number;
  allPass: boolean;
  notes: string[];
}

export interface FreeFormTransitionResult {
  success: boolean;
  previousMode: FreeFormMode;
  newMode: FreeFormMode;
  gates: FreeFormGates | null;
  changeRequestId: string | null;
  error: string | null;
  runtimeTouched: false;
}

export async function runFreeFormGates(
  restaurantId: string,
  stage: keyof typeof SHADOW_EVIDENCE = "ALLOWLIST",
): Promise<FreeFormGates> {
  const notes: string[] = [];

  const gate = await runGateForBrain("whatsapp");
  const diagnosticPass = gate.passed;
  if (!diagnosticPass) notes.push(`gate whatsapp: ${gate.reason}`);

  const snapshot = await restaurantKnowledgeAdapter.getSnapshot(restaurantId).catch(() => null);
  const completenessScore = snapshot?.completenessScore ?? 0;
  const knowledgeComplete = completenessScore >= KNOWLEDGE_COMPLETENESS_FLOOR;
  if (!knowledgeComplete) {
    notes.push(
      `verdade incompleta (${completenessScore.toFixed(2)} < ${KNOWLEDGE_COMPLETENESS_FLOOR}) — cadastre horários/cardápio/conhecimento antes de falar ao vivo`,
    );
  }

  // Evidência de sombra: o Brain só sobe de degrau com desempenho PROVADO em
  // tráfego real (amostras suficientes + coerência PASS acima do mínimo).
  const required = SHADOW_EVIDENCE[stage];
  const stats = await getShadowStats(restaurantId, { agentId: "whatsapp" });
  const shadowEvidence = stats.llmSamples >= required.minSamples && stats.coherencePassRate >= required.minPassRate;
  if (!shadowEvidence) {
    notes.push(
      `evidência de sombra insuficiente para ${stage} (amostras LLM ${stats.llmSamples}/${required.minSamples}, ` +
        `coerência PASS ${(stats.coherencePassRate * 100).toFixed(0)}%/${required.minPassRate * 100}%) — deixe o shadow colher tráfego real`,
    );
  }

  return {
    diagnosticPass,
    knowledgeComplete,
    completenessScore,
    shadowEvidence,
    shadowSamples: stats.llmSamples,
    shadowPassRate: stats.coherencePassRate,
    allPass: diagnosticPass && knowledgeComplete && shadowEvidence,
    notes,
  };
}

/** SHADOW_ONLY → ALLOWLIST. Exige gates PASS, telefones e confirm exato. */
export async function promoteFreeFormToAllowlist(input: {
  restaurantId: string;
  phones: string[];
  confirm: string;
}): Promise<FreeFormTransitionResult> {
  const current = await getFreeFormConfig(input.restaurantId);
  const fail = (error: string, gates: FreeFormGates | null = null): FreeFormTransitionResult =>
    ({ success: false, previousMode: current.mode, newMode: current.mode, gates, changeRequestId: null, error, runtimeTouched: false });

  if (input.confirm !== PROMOTE_ALLOWLIST_CONFIRM) return fail(`Confirmação inválida — envie confirm: "${PROMOTE_ALLOWLIST_CONFIRM}".`);
  if (current.mode !== "SHADOW_ONLY") return fail(`mode atual ${current.mode} — a escada não pula degrau (esperado SHADOW_ONLY).`);
  const phones = input.phones.map((p) => p.trim()).filter(Boolean);
  if (!phones.length) return fail("Allowlist vazia — informe os telefones do time.");

  const gates = await runFreeFormGates(input.restaurantId);
  if (!gates.allPass) return fail(`Gates reprovados: ${gates.notes.join("; ")}`, gates);

  await writeFreeFormConfig(input.restaurantId, {
    mode: "ALLOWLIST",
    allowlistedPhones: phones,
    paused: false,
    notes: `[AUDIT ${new Date().toISOString()}] promote ALLOWLIST (${phones.length} tel, gates PASS, confirm explícito)`,
  });

  return { success: true, previousMode: current.mode, newMode: "ALLOWLIST", gates, changeRequestId: null, error: null, runtimeTouched: false };
}

/** ALLOWLIST → RESTAURANT_WIDE. Reconhecimento explícito + gates + CR CRITICAL. */
export async function promoteFreeFormToWide(input: {
  restaurantId: string;
  confirm: string;
  acknowledgeRealCustomers?: boolean;
}): Promise<FreeFormTransitionResult> {
  const current = await getFreeFormConfig(input.restaurantId);
  const fail = (error: string, gates: FreeFormGates | null = null): FreeFormTransitionResult =>
    ({ success: false, previousMode: current.mode, newMode: current.mode, gates, changeRequestId: null, error, runtimeTouched: false });

  if (input.confirm !== PROMOTE_WIDE_CONFIRM) return fail(`Confirmação inválida — envie confirm: "${PROMOTE_WIDE_CONFIRM}".`);
  if (input.acknowledgeRealCustomers !== true) return fail("Falta acknowledgeRealCustomers: true — clientes REAIS receberão respostas do Brain.");
  if (current.mode !== "ALLOWLIST") return fail(`mode atual ${current.mode} — valide a ALLOWLIST antes de abrir para todo o restaurante.`);

  const gates = await runFreeFormGates(input.restaurantId, "RESTAURANT_WIDE");
  if (!gates.allPass) return fail(`Gates reprovados (não abrir): ${gates.notes.join("; ")}`, gates);

  // Trilha de governança (best-effort — nunca bloqueia, mas fica registrada).
  let changeRequestId: string | null = null;
  try {
    const cr = await createChangeRequest({
      businessId: input.restaurantId,
      businessType: "RESTAURANT",
      requestedByType: "CEO",
      requestedById: "admin",
      target: "AGENT_POLICY",
      summary: "Abrir raciocínio livre do Brain (free-form) para RESTAURANT_WIDE",
      rationale:
        "Abertura do free-form para clientes finais por decisão explícita (confirm + acknowledge). " +
        `Gates PASS (diagnóstico p0=0; completude ${gates.completenessScore.toFixed(2)}). ` +
        "Crítico claim-vs-snapshot + piso de confiança ativos por mensagem. Rollback de 30s (SHADOW_ONLY).",
      proposedChange: { restaurantId: input.restaurantId, from: { mode: current.mode }, to: { mode: "RESTAURANT_WIDE" } },
      riskLevel: "CRITICAL",
      runtimeImpact: "PRODUCTION",
      metadata: { executed: true, gates: { ...gates } },
    });
    changeRequestId = cr?.id ?? null;
  } catch {
    changeRequestId = null;
  }

  await writeFreeFormConfig(input.restaurantId, {
    mode: "RESTAURANT_WIDE",
    paused: false,
    notes: `[RW_OPENED ${new Date().toISOString()}] free-form → RESTAURANT_WIDE (gates PASS${changeRequestId ? `, CR:${changeRequestId}` : ""})`,
  });

  return { success: true, previousMode: current.mode, newMode: "RESTAURANT_WIDE", gates, changeRequestId, error: null, runtimeTouched: false };
}

/** Kill de 30 segundos: volta para SHADOW_ONLY. Allowlist e histórico preservados. */
export async function rollbackFreeForm(input: { restaurantId: string; confirm: string }): Promise<FreeFormTransitionResult> {
  const current = await getFreeFormConfig(input.restaurantId);
  if (input.confirm !== ROLLBACK_FREEFORM_CONFIRM) {
    return {
      success: false, previousMode: current.mode, newMode: current.mode, gates: null, changeRequestId: null,
      error: `Confirmação inválida — envie confirm: "${ROLLBACK_FREEFORM_CONFIRM}".`, runtimeTouched: false,
    };
  }
  await writeFreeFormConfig(input.restaurantId, {
    mode: "SHADOW_ONLY",
    paused: false,
    notes: `[AUDIT ${new Date().toISOString()}] ROLLBACK → SHADOW_ONLY (kill de 30s)`,
  });
  return { success: true, previousMode: current.mode, newMode: "SHADOW_ONLY", gates: null, changeRequestId: null, error: null, runtimeTouched: false };
}
