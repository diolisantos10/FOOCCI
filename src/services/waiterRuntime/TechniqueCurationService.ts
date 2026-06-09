/**
 * TechniqueCurationService — curation of Library techniques toward runtime use.
 *
 * Extraction NEVER auto-enables a technique. A human must:
 *   activate()  → status ACTIVE
 *   enableRuntime() → runtimeEnabled true
 * and only then can a version freeze it for LIBRARY_ASSISTED. This is the
 * governance layer that keeps raw extractions out of the live prompt.
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_AGENT = "waiter";

/** Lists techniques for an agent, optionally only the runtime-eligible ones. */
export async function listTechniques(params: {
  agentSlug?: string;
  onlyRuntimeEnabled?: boolean;
  status?: "EXTRACTED" | "IN_REVIEW" | "ACTIVE" | "ARCHIVED" | "REJECTED";
} = {}) {
  const agentSlug = params.agentSlug ?? DEFAULT_AGENT;
  return prisma.agentLibraryTechnique.findMany({
    where: {
      agentSlug,
      ...(params.status ? { status: params.status } : {}),
      ...(params.onlyRuntimeEnabled ? { status: "ACTIVE", runtimeEnabled: true } : {}),
    },
    orderBy: [{ runtimeEnabled: "desc" }, { runtimePriority: "desc" }, { createdAt: "desc" }],
  });
}

/** Approve a technique → ACTIVE. Does NOT enable runtime by itself. */
export async function activateTechnique(id: string, approvedBy?: string | null) {
  return prisma.agentLibraryTechnique.update({
    where: { id },
    data: { status: "ACTIVE", approvedAt: new Date(), approvedBy: approvedBy ?? null, rejectedAt: null, rejectionReason: null },
  });
}

/** Toggle whether an ACTIVE technique may be used by the runtime. */
export async function setRuntimeEnabled(id: string, enabled: boolean) {
  const technique = await prisma.agentLibraryTechnique.findUnique({ where: { id } });
  if (!technique) throw new Error("Técnica não encontrada.");
  if (enabled && technique.status !== "ACTIVE") {
    throw new Error("Só técnicas ACTIVE podem ser habilitadas no runtime.");
  }
  return prisma.agentLibraryTechnique.update({ where: { id }, data: { runtimeEnabled: enabled } });
}

/** Set runtime ordering priority (higher = earlier in the prompt). */
export async function setPriority(id: string, priority: number) {
  return prisma.agentLibraryTechnique.update({ where: { id }, data: { runtimePriority: Math.trunc(priority) } });
}

/** Reject a technique — removes it from any runtime consideration. */
export async function rejectTechnique(id: string, reason?: string | null) {
  return prisma.agentLibraryTechnique.update({
    where: { id },
    data: { status: "REJECTED", runtimeEnabled: false, rejectedAt: new Date(), rejectionReason: reason ?? null },
  });
}

/** Archive a technique — keeps it but takes it off the runtime. */
export async function archiveTechnique(id: string) {
  return prisma.agentLibraryTechnique.update({
    where: { id },
    data: { status: "ARCHIVED", runtimeEnabled: false },
  });
}
