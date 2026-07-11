/**
 * ChangeRequestApplier — a ponte approve→apply que fechava o maior buraco da
 * governança: aprovar um BrainChangeRequest passava a não fazer NADA.
 *
 * Agora: um CR APPROVED é aplicado por um humano identificado, com o quality
 * gate EXIGIDO no momento do apply (requiresQualityGate deixa de ser
 * advisory), executando somente escritas de CONFIG governada:
 *
 *  • AI_ENGINE_ROUTING → upsert em brain_engine_routing (troca de piloto);
 *  • AGENT_POLICY com proposedChange.freeForm → modo do raciocínio livre;
 *  • TRAINING_RULE → grava um learning APROVADO no pool canônico
 *    (WaiterTrainingSuggestionStore) — o CR já foi aprovado por humano, então
 *    materializar o aprendizado É a aplicação. O runtime só o consome pelos
 *    caminhos governados existentes (bloco "APRENDIZADOS APROVADOS").
 *
 * Nunca envia mensagem, nunca cria pedido/Pix, nunca toca prompt/runtime —
 * config-only, com trilha via markApplied.
 */

import { prisma } from "@/lib/prisma";
import { findChangeRequest } from "./BrainDirectorRepository";
import { markApplied } from "./PersistentBrainDirectorService";
import { runGateForBrain } from "../quality/BrainQualityGate";
import { __clearEngineRoutingCache } from "../engines/AIEngineRouter";
import { writeFreeFormConfig, type FreeFormMode } from "../runtime/BrainFreeFormConfigService";

const NON_HUMAN_APPLIERS = /^(agent|system|bot|ai)$/i;
const PROVIDERS = new Set(["OPENAI", "CLAUDE", "GEMINI"]);
const TASK_PROFILES = new Set(["CLASSIFY", "REASON", "JUDGE", "GENERATE"]);
const FREEFORM_MODES = new Set<FreeFormMode>(["SHADOW_ONLY", "ALLOWLIST", "RESTAURANT_WIDE"]);

export interface ApplyResult {
  success: boolean;
  changeRequestId: string;
  target: string | null;
  gate: { passed: boolean; reason: string } | null;
  applied: Record<string, unknown> | null;
  error: string | null;
  runtimeTouched: false;
}

interface EngineRoutingChange {
  agentId?: string;
  provider?: string;
  model?: string;
  taskProfile?: string;
  businessId?: string | null;
}

interface FreeFormChange {
  restaurantId?: string;
  mode?: string;
}

interface TrainingRuleChange {
  agentId?: string;
  title?: string;
  trainingRule?: string;
  sourceType?: string;
  riskLevel?: string;
  restaurantId?: string | null;
}

const LEARNING_SOURCE_TYPES = new Set(["REAL_CONVERSATION", "SIMULATION", "LIBRARY", "RESULT_EVIDENCE"]);
const LEARNING_RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);

export async function applyChangeRequest(input: { id: string; appliedBy: string }): Promise<ApplyResult> {
  const fail = (error: string, extra: Partial<ApplyResult> = {}): ApplyResult =>
    ({ success: false, changeRequestId: input.id, target: null, gate: null, applied: null, error, runtimeTouched: false, ...extra });

  if (!input.appliedBy?.trim() || NON_HUMAN_APPLIERS.test(input.appliedBy.trim())) {
    return fail("Apenas um humano identificado pode aplicar uma mudança (agent/system/bot/ai recusados).");
  }

  const request = await findChangeRequest(input.id);
  if (!request) return fail(`Change request ${input.id} não encontrado.`);
  if (request.status !== "APPROVED") return fail(`Só APPROVED pode ser aplicado — status atual: ${request.status}.`);

  const proposed = (request.proposedChange ?? {}) as Record<string, unknown>;

  // ── Gate obrigatório no APPLY (não no approve) ──────────────────────────────
  let gateInfo: ApplyResult["gate"] = null;
  if (request.requiresQualityGate) {
    const gateAgent =
      typeof (proposed as EngineRoutingChange).agentId === "string"
        ? String((proposed as EngineRoutingChange).agentId)
        : "whatsapp"; // política de free-form/WhatsApp usa o gate do whatsapp
    const gate = await runGateForBrain(gateAgent);
    gateInfo = { passed: gate.passed, reason: gate.reason };
    if (!gate.passed) return fail(`Quality gate reprovado no apply: ${gate.reason}`, { gate: gateInfo, target: request.target });
  }

  // ── Execução por target (config-only) ──────────────────────────────────────
  if (request.target === "AI_ENGINE_ROUTING") {
    const change = proposed as EngineRoutingChange;
    const agentId = change.agentId?.trim();
    const provider = change.provider?.toUpperCase().trim();
    const taskProfile = (change.taskProfile ?? "REASON").toUpperCase().trim();
    if (!agentId || !provider) return fail("proposedChange precisa de agentId e provider.", { gate: gateInfo, target: request.target });
    if (!PROVIDERS.has(provider)) return fail(`provider inválido: ${provider}.`, { gate: gateInfo, target: request.target });
    if (!TASK_PROFILES.has(taskProfile)) return fail(`taskProfile inválido: ${taskProfile}.`, { gate: gateInfo, target: request.target });

    // businessId é anulável (null = default global) — chave composta anulável não
    // aceita upsert no Prisma, então find + create/update.
    const businessId = change.businessId ?? null;
    const existing = await prisma.brainEngineRouting.findFirst({
      where: { businessId, agentId, taskProfile },
      select: { id: true },
    });
    if (existing) {
      await prisma.brainEngineRouting.update({
        where: { id: existing.id },
        data: { provider, model: change.model ?? null, enabled: true, appliedFromChangeRequestId: request.id },
      });
    } else {
      await prisma.brainEngineRouting.create({
        data: { businessId, agentId, taskProfile, provider, model: change.model ?? null, appliedFromChangeRequestId: request.id },
      });
    }
    __clearEngineRoutingCache();
    await markApplied(request.id, input.appliedBy);
    return {
      success: true, changeRequestId: request.id, target: request.target, gate: gateInfo,
      applied: { agentId, taskProfile, provider, model: change.model ?? null, businessId }, error: null, runtimeTouched: false,
    };
  }

  if (request.target === "AGENT_POLICY" && typeof (proposed as { freeForm?: unknown }).freeForm === "object") {
    const change = (proposed as { freeForm: FreeFormChange }).freeForm;
    const restaurantId = change.restaurantId?.trim();
    const mode = change.mode?.toUpperCase().trim() as FreeFormMode | undefined;
    if (!restaurantId || !mode) return fail("proposedChange.freeForm precisa de restaurantId e mode.", { gate: gateInfo, target: request.target });
    if (!FREEFORM_MODES.has(mode)) return fail(`mode inválido: ${mode}.`, { gate: gateInfo, target: request.target });

    await writeFreeFormConfig(restaurantId, {
      mode,
      notes: `[APPLIED ${new Date().toISOString()}] via CR:${request.id} por ${input.appliedBy}`,
    });
    await markApplied(request.id, input.appliedBy);
    return {
      success: true, changeRequestId: request.id, target: request.target, gate: gateInfo,
      applied: { restaurantId, mode }, error: null, runtimeTouched: false,
    };
  }

  if (request.target === "TRAINING_RULE") {
    const change = proposed as TrainingRuleChange;
    const agentSlug = change.agentId?.trim() || "whatsapp";
    const trainingRule = (change.trainingRule?.trim() || request.rationale?.trim()) ?? "";
    if (!trainingRule) {
      return fail("TRAINING_RULE precisa de proposedChange.trainingRule ou rationale no CR.", { gate: gateInfo, target: request.target });
    }
    const sourceType = change.sourceType?.toUpperCase().trim() ?? "RESULT_EVIDENCE";
    if (!LEARNING_SOURCE_TYPES.has(sourceType)) return fail(`sourceType inválido: ${sourceType}.`, { gate: gateInfo, target: request.target });
    const riskLevel = (change.riskLevel ?? request.riskLevel ?? "LOW").toUpperCase().trim();

    // Store canônico dos aprendizados aprovados — import dinâmico para não puxar
    // a cadeia de reasoning do garçom em quem só usa os outros executores.
    const { insertApprovedLearning } = await import("@/services/waiterTraining/WaiterTrainingSuggestionStore");
    const learning = await insertApprovedLearning({
      agentSlug,
      title: change.title?.trim() || request.summary,
      trainingRule,
      sourceType: sourceType as "REAL_CONVERSATION" | "SIMULATION" | "LIBRARY" | "RESULT_EVIDENCE",
      riskLevel: (LEARNING_RISK_LEVELS.has(riskLevel) ? riskLevel : "HIGH") as "LOW" | "MEDIUM" | "HIGH", // CRITICAL colapsa em HIGH
      restaurantId: change.restaurantId ?? request.businessId ?? null,
      sourceId: `cr:${request.id}`, // dedupe — reaplicar o mesmo CR não duplica o learning
      approvedBy: input.appliedBy,
    });
    await markApplied(request.id, input.appliedBy);
    return {
      success: true, changeRequestId: request.id, target: request.target, gate: gateInfo,
      applied: { agentSlug, learningId: learning.id, trainingRule }, error: null, runtimeTouched: false,
    };
  }

  return fail(
    `Target ${request.target} ainda não tem executor — alvo aplicável hoje: AI_ENGINE_ROUTING, AGENT_POLICY(freeForm), TRAINING_RULE.`,
    { gate: gateInfo, target: request.target },
  );
}
