/**
 * Waiter Runtime Merge — end-to-end operational diagnostic (synthetic, safe).
 *
 * Proves the full governed cycle in a real DB WITHOUT touching any real customer:
 *   synthetic source + technique → ACTIVE + runtimeEnabled → DRAFT version
 *   → TESTING → Quality gate → ACTIVE (LIBRARY_ASSISTED) → bridge enabled
 *   → rollback → CURRENT fallback → cleanup.
 *
 * Safety:
 *  - The synthetic version is scoped to a UNIQUE, non-existent restaurantId, so the
 *    bridge query (OR restaurantId / null) NEVER matches a real restaurant — no real
 *    /pedido turn can ever pick up the synthetic technique. runtimeTouched stays false.
 *  - Never creates an order, never sends WhatsApp, never calls Evolution/Pix/MP.
 *  - Always attempts full cleanup (delete version → technique → source).
 *  - Never throws: a controlled FAIL is returned with the failing stage.
 */

import { prisma } from "@/lib/prisma";
import {
  createDraft,
  markTesting,
  activateVersion,
  rollbackVersion,
  getActiveVersion,
} from "./WaiterRuntimeVersionService";
import { activateTechnique, setRuntimeEnabled, setPriority } from "./TechniqueCurationService";
import { getWaiterRuntimeKnowledge } from "./WaiterLibraryRuntimeBridge";
import { runWaiterQualityGate } from "./qualityGate";

/** Self-authored synthetic technique (no copyrighted material). */
export const DIAG_TECHNIQUE = {
  techniqueName: "Pergunta de intenção antes da sugestão",
  category: "venda consultiva",
  application:
    "Quando o cliente pedir sugestão genérica, identificar ocasião, fome e preferência antes de sugerir poucos cards reais.",
  usageRule:
    "Nunca listar o cardápio inteiro; sugerir poucas opções compatíveis e conduzir ao próximo passo.",
  qualityTest:
    "A resposta deve ter recomendação clara, motivo e pergunta/CTA de fechamento.",
};

export interface MergeDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  stage?: string;
  versionCreated: boolean;
  techniqueCreated: boolean;
  qualityGateP0: number;
  activated: boolean;
  bridgeEnabled: boolean;
  promptBlockIncludedTechnique: boolean;
  rolledBack: boolean;
  fallbackCurrent: boolean;
  cleanup: boolean;
  runtimeTouched: false;
  message: string;
}

const AGENT = "waiter";

export async function runWaiterRuntimeMergeDiagnostic(): Promise<MergeDiagnosticResult> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Unique synthetic scope — no real restaurant can ever match this id.
  const fakeRestaurantId = `__waiter_merge_diag_${stamp}`;

  let sourceId: string | null = null;
  let techniqueId: string | null = null;
  let versionId: string | null = null;

  const res: MergeDiagnosticResult = {
    ok: false,
    status: "FAIL",
    versionCreated: false,
    techniqueCreated: false,
    qualityGateP0: -1,
    activated: false,
    bridgeEnabled: false,
    promptBlockIncludedTechnique: false,
    rolledBack: false,
    fallbackCurrent: false,
    cleanup: false,
    runtimeTouched: false,
    message: "",
  };

  try {
    // 1. Synthetic source + technique, then curate to ACTIVE + runtimeEnabled.
    const source = await prisma.agentLibrarySource.create({
      data: {
        agentSlug: AGENT,
        title: `__DIAG Waiter Runtime Merge ${stamp}`,
        sourceType: "INTERNAL_NOTE",
        category: DIAG_TECHNIQUE.category,
        extractionStatus: "EXTRACTED",
        status: "DRAFT",
      },
      select: { id: true },
    });
    sourceId = source.id;

    const technique = await prisma.agentLibraryTechnique.create({
      data: {
        agentSlug: AGENT,
        sourceId: source.id,
        techniqueName: DIAG_TECHNIQUE.techniqueName,
        category: DIAG_TECHNIQUE.category,
        application: DIAG_TECHNIQUE.application,
        usageRule: DIAG_TECHNIQUE.usageRule,
        qualityTest: DIAG_TECHNIQUE.qualityTest,
        confidence: 0.9,
      },
      select: { id: true },
    });
    techniqueId = technique.id;
    res.techniqueCreated = true;

    await activateTechnique(technique.id, "merge-diagnostic");
    await setRuntimeEnabled(technique.id, true);
    await setPriority(technique.id, 100);

    // 2. DRAFT version scoped to the synthetic restaurant, with the technique frozen.
    const draft = await createDraft({
      agentSlug: AGENT,
      restaurantId: fakeRestaurantId,
      name: `Library Assisted Test ${stamp}`,
      mode: "LIBRARY_ASSISTED",
      libraryEnabled: true,
      maxTechniques: 3,
      techniqueIds: [technique.id],
      createdBy: "merge-diagnostic",
    });
    if (!draft) {
      res.stage = "create_draft";
      res.message = "Falha ao criar a versão DRAFT.";
      return await finalize(res, { sourceId, techniqueId, versionId });
    }
    versionId = draft.id;
    res.versionCreated = true;
    if ((draft.techniques?.length ?? 0) < 1) {
      res.stage = "assign_technique";
      res.message = "Técnica não foi congelada na versão.";
      return await finalize(res, { sourceId, techniqueId, versionId });
    }

    // 3. TESTING.
    await markTesting(versionId);

    // 4. Quality gate.
    const gate = await runWaiterQualityGate();
    res.qualityGateP0 = gate.p0Count;
    if (!gate.passed) {
      res.stage = "quality_gate";
      res.message = gate.reason;
      return await finalize(res, { sourceId, techniqueId, versionId });
    }

    // 5. Activate (gated).
    const activation = await activateVersion(versionId, { activatedBy: "merge-diagnostic" });
    if (!activation.ok) {
      res.stage = "activate";
      res.message = activation.reason;
      return await finalize(res, { sourceId, techniqueId, versionId });
    }
    res.activated = true;

    // Only one ACTIVE version in this (synthetic) scope, and it is ours.
    const active = await getActiveVersion({ agentSlug: AGENT, restaurantId: fakeRestaurantId });
    if (!active || active.id !== versionId) {
      res.stage = "activate_verify";
      res.message = "A versão ativada não é a esperada no escopo.";
      return await finalize(res, { sourceId, techniqueId, versionId });
    }

    // 6. Bridge check — must be enabled, LIBRARY_ASSISTED, with the technique in the block.
    const k = await getWaiterRuntimeKnowledge({ restaurantId: fakeRestaurantId, agentSlug: AGENT });
    res.bridgeEnabled = k.enabled && k.mode === "LIBRARY_ASSISTED" && k.techniques.length > 0;
    res.promptBlockIncludedTechnique =
      k.promptBlock.includes(DIAG_TECHNIQUE.techniqueName) && /fonte da verdade/i.test(k.promptBlock);
    if (!res.bridgeEnabled || !res.promptBlockIncludedTechnique) {
      res.stage = "bridge_check";
      res.message = `Bridge não refletiu a versão ativa (enabled=${k.enabled}, techniques=${k.techniques.length}).`;
      return await finalize(res, { sourceId, techniqueId, versionId });
    }

    // 7. Rollback → must fall back to CURRENT (no active version in scope).
    await rollbackVersion(versionId, { rolledBackBy: "merge-diagnostic" });
    res.rolledBack = true;

    const k2 = await getWaiterRuntimeKnowledge({ restaurantId: fakeRestaurantId, agentSlug: AGENT });
    res.fallbackCurrent = !k2.enabled && k2.mode === "CURRENT" && k2.promptBlock === "";
    if (!res.fallbackCurrent) {
      res.stage = "fallback_check";
      res.message = `Fallback CURRENT não confirmado (enabled=${k2.enabled}, mode=${k2.mode}).`;
      return await finalize(res, { sourceId, techniqueId, versionId });
    }

    // All gates green.
    res.ok = true;
    res.status = "PASS";
    res.message =
      `Ciclo completo validado: técnica ACTIVE+runtimeEnabled → DRAFT → TESTING → gate P0=${res.qualityGateP0} ` +
      `→ ACTIVE LIBRARY_ASSISTED → bridge enabled → rollback → CURRENT fallback.`;
    return await finalize(res, { sourceId, techniqueId, versionId });
  } catch (err) {
    res.stage = res.stage ?? "exception";
    res.message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return await finalize(res, { sourceId, techniqueId, versionId });
  }
}

/** Best-effort cleanup (version → technique → source). Sets res.cleanup. */
async function finalize(
  res: MergeDiagnosticResult,
  ids: { sourceId: string | null; techniqueId: string | null; versionId: string | null },
): Promise<MergeDiagnosticResult> {
  try {
    if (ids.versionId) await prisma.waiterRuntimeVersion.deleteMany({ where: { id: ids.versionId } });
    if (ids.techniqueId) await prisma.agentLibraryTechnique.deleteMany({ where: { id: ids.techniqueId } });
    if (ids.sourceId) await prisma.agentLibrarySource.deleteMany({ where: { id: ids.sourceId } });

    // Verify nothing synthetic remains.
    const leftoverVersion = ids.versionId
      ? await prisma.waiterRuntimeVersion.count({ where: { id: ids.versionId } })
      : 0;
    const leftoverSource = ids.sourceId
      ? await prisma.agentLibrarySource.count({ where: { id: ids.sourceId } })
      : 0;
    res.cleanup = leftoverVersion === 0 && leftoverSource === 0;
  } catch (err) {
    res.cleanup = false;
    if (!res.message) res.message = err instanceof Error ? err.message.slice(0, 160) : "cleanup falhou";
  }
  res.ok = res.status === "PASS";
  return res;
}
