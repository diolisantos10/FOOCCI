/**
 * WaiterLibraryRuntimeBridge — the ONLY governed path from the Library to the
 * Waiter runtime prompt.
 *
 * Contract (never throws, always returns a safe payload):
 *  1. No ACTIVE version for the scope            → enabled:false, mode:CURRENT
 *  2. Version exists but libraryEnabled=false or
 *     mode≠LIBRARY_ASSISTED                       → enabled:false, mode:CURRENT
 *  3. No ACTIVE + runtimeEnabled techniques       → enabled:false, mode:CURRENT
 *  4. Any DB/error                                → enabled:false + warning (fallback)
 *  5. Otherwise                                   → enabled:true, mode:LIBRARY_ASSISTED
 *
 * A technique reaches the prompt ONLY when ALL hold:
 *   technique.status === ACTIVE
 *   technique.runtimeEnabled === true
 *   technique is frozen into the ACTIVE version (WaiterRuntimeVersionTechnique)
 * Scope precedence: restaurant-specific ACTIVE version beats the global one.
 */

import { prisma } from "@/lib/prisma";
import { assembleLibraryPromptBlock } from "./promptAssembler";
import type {
  GetWaiterRuntimeKnowledgeInput,
  RuntimeTechnique,
  WaiterRuntimeKnowledge,
} from "./types";

const DEFAULT_AGENT = "waiter";

function safeFallback(warnings: string[] = []): WaiterRuntimeKnowledge {
  return { enabled: false, mode: "CURRENT", techniques: [], promptBlock: "", warnings };
}

/**
 * Resolves the active runtime knowledge for the Waiter. The runtime should treat
 * `enabled:false` as "behave exactly like today" — no behavioural change at all.
 */
export async function getWaiterRuntimeKnowledge(
  input: GetWaiterRuntimeKnowledgeInput = {},
): Promise<WaiterRuntimeKnowledge> {
  const agentSlug = input.agentSlug ?? DEFAULT_AGENT;
  const restaurantId = input.restaurantId ?? null;

  try {
    // 1. Active version — restaurant scope first, then global (restaurantId null).
    const version = await prisma.waiterRuntimeVersion.findFirst({
      where: {
        agentSlug,
        isActive: true,
        status: "ACTIVE",
        OR: [{ restaurantId }, { restaurantId: null }],
      },
      // restaurant-specific (non-null) should win over global (null).
      orderBy: [{ restaurantId: "desc" }, { activatedAt: "desc" }],
    });

    if (!version) return safeFallback();

    // 2. Library must be explicitly enabled AND the version must be assisted.
    if (!version.libraryEnabled || version.mode !== "LIBRARY_ASSISTED") {
      return safeFallback();
    }

    // 3. Load frozen techniques for this version, keep only ACTIVE + runtimeEnabled.
    const assignments = await prisma.waiterRuntimeVersionTechnique.findMany({
      where: { versionId: version.id },
      include: { technique: true },
      orderBy: { priority: "desc" },
    });

    const eligible = assignments
      .filter((a) => a.technique && a.technique.status === "ACTIVE" && a.technique.runtimeEnabled)
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          (b.technique.runtimePriority ?? 0) - (a.technique.runtimePriority ?? 0),
      );

    const techniques: RuntimeTechnique[] = eligible.map((a) => ({
      id: a.technique.id,
      name: a.technique.techniqueName,
      category: a.technique.category ?? "Atendimento",
      application: a.technique.application ?? "",
      usageRule: a.technique.usageRule ?? "",
      qualityTest: a.technique.qualityTest ?? undefined,
      priority: a.priority,
    }));

    const cap = Math.min(input.maxTechniques ?? version.maxTechniques, version.maxTechniques);
    const { promptBlock, used, dropped } = assembleLibraryPromptBlock(techniques, { maxTechniques: cap });

    if (used.length === 0) {
      // Version is assisted but nothing usable survived → behave like CURRENT.
      return safeFallback([
        `Versão ${version.id} ativa em LIBRARY_ASSISTED, mas nenhuma técnica utilizável (fallback CURRENT).`,
      ]);
    }

    const warnings: string[] = [];
    if (dropped > 0) warnings.push(`${dropped} técnica(s) descartada(s) por falta de substância.`);

    return {
      enabled: true,
      versionId: version.id,
      mode: "LIBRARY_ASSISTED",
      techniques: used,
      promptBlock,
      warnings,
    };
  } catch (err) {
    // Never break /pedido — degrade to the current runtime.
    const reason = err instanceof Error ? err.message.slice(0, 160) : "erro desconhecido";
    console.error("[WaiterLibraryRuntimeBridge] fallback to CURRENT:", reason);
    return safeFallback([`Bridge falhou, runtime atual mantido: ${reason}`]);
  }
}
