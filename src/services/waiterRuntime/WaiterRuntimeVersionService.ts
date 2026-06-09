/**
 * WaiterRuntimeVersionService — lifecycle of Waiter runtime versions.
 *
 * Governance rules enforced here:
 *  - Only ONE ACTIVE version per scope (agentSlug + restaurantId).
 *  - A version becomes ACTIVE only if the Quality gate passes (P0 === 0).
 *  - Rollback is INSTANT and gate-free (reverting to safety must never be blocked).
 *  - DRAFT/TESTING versions never affect a real customer (bridge only reads ACTIVE).
 *  - Techniques are FROZEN into a version (snapshot), so editing the Library later
 *    does not silently mutate an active version.
 */

import { prisma } from "@/lib/prisma";
import { runWaiterQualityGate } from "./qualityGate";
import type { WaiterQualityGateResult } from "./types";

const DEFAULT_AGENT = "waiter";

export interface CreateDraftInput {
  agentSlug?: string;
  restaurantId?: string | null;
  name: string;
  description?: string | null;
  mode?: "CURRENT" | "LIBRARY_ASSISTED";
  libraryEnabled?: boolean;
  maxTechniques?: number;
  techniqueIds?: string[];
  createdBy?: string | null;
}

export interface ActivateResult {
  ok: boolean;
  versionId: string;
  gate: WaiterQualityGateResult;
  reason: string;
}

function scopeWhere(agentSlug: string, restaurantId: string | null) {
  return { agentSlug, restaurantId: restaurantId ?? null };
}

/** Lists versions for a scope (newest first) with a frozen-technique count. */
export async function listVersions(params: { agentSlug?: string; restaurantId?: string | null } = {}) {
  const agentSlug = params.agentSlug ?? DEFAULT_AGENT;
  const versions = await prisma.waiterRuntimeVersion.findMany({
    where: { agentSlug, ...(params.restaurantId !== undefined ? { restaurantId: params.restaurantId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { techniques: true } } },
  });
  return versions;
}

/** Returns the ACTIVE version for a scope (restaurant scope beats global). */
export async function getActiveVersion(params: { agentSlug?: string; restaurantId?: string | null } = {}) {
  const agentSlug = params.agentSlug ?? DEFAULT_AGENT;
  const restaurantId = params.restaurantId ?? null;
  return prisma.waiterRuntimeVersion.findFirst({
    where: { agentSlug, isActive: true, status: "ACTIVE", OR: [{ restaurantId }, { restaurantId: null }] },
    orderBy: [{ restaurantId: "desc" }, { activatedAt: "desc" }],
    include: { _count: { select: { techniques: true } } },
  });
}

/** Full version with its frozen techniques (for the cockpit / comparison). */
export async function getVersion(versionId: string) {
  return prisma.waiterRuntimeVersion.findUnique({
    where: { id: versionId },
    include: { techniques: { include: { technique: true }, orderBy: { priority: "desc" } } },
  });
}

/** Creates a DRAFT version and (optionally) freezes a set of techniques into it. */
export async function createDraft(input: CreateDraftInput) {
  const agentSlug = input.agentSlug ?? DEFAULT_AGENT;
  const restaurantId = input.restaurantId ?? null;
  const mode = input.mode ?? "CURRENT";

  const version = await prisma.waiterRuntimeVersion.create({
    data: {
      agentSlug,
      restaurantId,
      name: input.name,
      description: input.description ?? null,
      status: "DRAFT",
      mode,
      isActive: false,
      libraryEnabled: input.libraryEnabled ?? mode === "LIBRARY_ASSISTED",
      maxTechniques: input.maxTechniques ?? 6,
    },
  });

  if (input.techniqueIds && input.techniqueIds.length > 0) {
    await assignTechniques(version.id, input.techniqueIds);
  }
  return getVersion(version.id);
}

/** Replaces the frozen technique set of a DRAFT/TESTING version. */
export async function assignTechniques(versionId: string, techniqueIds: string[]) {
  const version = await prisma.waiterRuntimeVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error("Versão não encontrada.");
  if (version.status === "ACTIVE" || version.status === "ROLLED_BACK") {
    throw new Error("Só versões DRAFT/TESTING podem ter técnicas alteradas.");
  }

  // Keep only real techniques for this agent scope.
  const valid = await prisma.agentLibraryTechnique.findMany({
    where: { id: { in: techniqueIds }, agentSlug: version.agentSlug },
    select: { id: true, runtimePriority: true },
  });

  await prisma.$transaction([
    prisma.waiterRuntimeVersionTechnique.deleteMany({ where: { versionId } }),
    prisma.waiterRuntimeVersionTechnique.createMany({
      data: valid.map((t) => ({ versionId, techniqueId: t.id, priority: t.runtimePriority ?? 0 })),
      skipDuplicates: true,
    }),
  ]);
  return getVersion(versionId);
}

/** Moves a DRAFT version into TESTING (still never seen by a customer). */
export async function markTesting(versionId: string) {
  const version = await prisma.waiterRuntimeVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error("Versão não encontrada.");
  if (version.status !== "DRAFT") throw new Error("Apenas DRAFT pode ir para TESTING.");
  return prisma.waiterRuntimeVersion.update({ where: { id: versionId }, data: { status: "TESTING" } });
}

/**
 * Activates a version — gated by Quality (P0 must be 0). On success, any other
 * ACTIVE version in the same scope is archived first, so only one stays active.
 */
export async function activateVersion(versionId: string, opts: { activatedBy?: string | null } = {}): Promise<ActivateResult> {
  const version = await prisma.waiterRuntimeVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error("Versão não encontrada.");
  if (version.status === "ACTIVE" && version.isActive) {
    const gate = await runWaiterQualityGate();
    return { ok: true, versionId, gate, reason: "Versão já estava ativa." };
  }

  const gate = await runWaiterQualityGate();
  // Record the gate snapshot regardless of outcome (audit trail).
  await prisma.waiterRuntimeVersion.update({
    where: { id: versionId },
    data: { qualityStatus: gate.passed ? "PASS" : "FAIL", lastQualityRunAt: new Date(gate.ranAt) },
  });

  if (!gate.passed) {
    return { ok: false, versionId, gate, reason: gate.reason };
  }

  const scope = scopeWhere(version.agentSlug, version.restaurantId ?? null);
  await prisma.$transaction([
    // Demote the current active version(s) in the same scope.
    prisma.waiterRuntimeVersion.updateMany({
      where: { ...scope, isActive: true, NOT: { id: versionId } },
      data: { isActive: false, status: "ARCHIVED" },
    }),
    prisma.waiterRuntimeVersion.update({
      where: { id: versionId },
      data: {
        status: "ACTIVE",
        isActive: true,
        activatedAt: new Date(),
        activatedBy: opts.activatedBy ?? null,
        rolledBackAt: null,
      },
    }),
  ]);

  return { ok: true, versionId, gate, reason: "Versão ativada com Quality gate aprovado." };
}

/**
 * Rolls back the currently ACTIVE version in a scope. Fast and gate-free.
 * If a rollbackToVersionId is provided/recorded, that version is reactivated;
 * otherwise the scope falls back to CURRENT (no active version → safe runtime).
 */
export async function rollbackVersion(
  versionId: string,
  opts: { rolledBackBy?: string | null; rollbackToVersionId?: string | null } = {},
) {
  const version = await prisma.waiterRuntimeVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error("Versão não encontrada.");

  const target = opts.rollbackToVersionId ?? version.rollbackToVersionId ?? null;

  const ops = [
    prisma.waiterRuntimeVersion.update({
      where: { id: versionId },
      data: { status: "ROLLED_BACK" as const, isActive: false, rolledBackAt: new Date(), rollbackToVersionId: target },
    }),
  ];

  if (target) {
    // Reactivate the previous version WITHOUT a gate (it was already vetted).
    ops.push(
      prisma.waiterRuntimeVersion.update({
        where: { id: target },
        data: { status: "ACTIVE" as const, isActive: true, activatedAt: new Date(), activatedBy: opts.rolledBackBy ?? null },
      }),
    );
  }

  await prisma.$transaction(ops);
  return { ok: true, versionId, restoredVersionId: target, mode: target ? "RESTORED_PREVIOUS" : "CURRENT_FALLBACK" };
}
