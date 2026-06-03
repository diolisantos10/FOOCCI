/**
 * BuildCommandService — persistence + audit for Build OS commands (Priority 1.1).
 *
 * Intake ONLY: stores a command, appends events, resolves the default project,
 * and exposes a read-only admin projection. NO Claude relay, NO GitHub, NO LLM
 * prompt generation, NO execution. All methods are defensive — they never throw
 * into the webhook hot path (callers should still guard, but failures here must
 * not break WhatsApp customer service).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  resolveBuildProjectFromMessage,
  type ProjectResolution,
} from "./BuildProjectService";
import { classifyBuildCommandText } from "./BuildCommandClassifier";
import type {
  AdminBuildCommandView,
  CreateBuildCommandFromWhatsAppInput,
} from "./types";

/** Standard event types for the append-only audit log. */
export const BUILD_EVENT = {
  RECEIVED: "RECEIVED",
  PROJECT_RESOLVED: "PROJECT_RESOLVED",
  PROJECT_UNRESOLVED: "PROJECT_UNRESOLVED",
  COMMAND_CLASSIFIED: "COMMAND_CLASSIFIED",
  CONFIRMATION_SENT: "CONFIRMATION_SENT",
  CONFIRMATION_FAILED: "CONFIRMATION_FAILED",
} as const;

/**
 * Append an audit event to a command. Best-effort: swallows errors so it never
 * breaks the caller. Returns true on success.
 */
export async function logBuildCommandEvent(
  commandId: string,
  type: string,
  message?: string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  try {
    await prisma.buildCommandEvent.create({
      data: {
        commandId,
        type,
        message: message ?? null,
        metadata: (metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a BuildCommand from a WhatsApp message, resolve its project
 * deterministically (Priority 1.2), and write the audit events. Caller MUST have
 * already verified authorization. Returns the created command id + resolved
 * project, or null on failure.
 *
 * Project resolution is best-effort and NEVER blocks command creation: an
 * unresolved project still produces a command (projectId null) plus a
 * PROJECT_UNRESOLVED event. No LLM is used.
 */
export async function createBuildCommandFromWhatsApp(
  input: CreateBuildCommandFromWhatsAppInput,
): Promise<{ id: string; projectId: string | null } | null> {
  // Deterministic, keyword-based resolution from the RAW message (active-only).
  let resolution: ProjectResolution = { projectId: null, slug: null, method: "UNRESOLVED" };
  try {
    resolution = await resolveBuildProjectFromMessage(input.rawMessage);
  } catch {
    // keep UNRESOLVED — never block creation
  }

  // Deterministic (non-LLM) classification from the RAW message (Priority 1.3).
  const classification = classifyBuildCommandText(input.rawMessage);

  try {
    const command = await prisma.buildCommand.create({
      data: {
        projectId: resolution.projectId,
        senderPhone: input.senderPhone,
        senderName: input.senderName ?? null,
        sourceChannel: "WHATSAPP",
        rawMessage: input.rawMessage,
        commandPrefix: input.prefix,
        commandText: input.commandText,
        status: "RECEIVED",
        taskType: classification.taskType,
        riskLevel: classification.riskLevel,
        executionIntent: classification.executionIntent,
        targetArea: classification.targetArea,
        requiresHumanConfirmation: classification.requiresHumanConfirmation,
        classificationSummary: classification.classificationSummary,
      },
      select: { id: true, projectId: true },
    });

    await logBuildCommandEvent(command.id, BUILD_EVENT.RECEIVED, "Comando recebido via WhatsApp.", {
      prefix: input.prefix,
      senderPhone: input.senderPhone,
    });

    // Audit the deterministic classification.
    await logBuildCommandEvent(
      command.id,
      BUILD_EVENT.COMMAND_CLASSIFIED,
      classification.classificationSummary,
      {
        taskType: classification.taskType,
        riskLevel: classification.riskLevel,
        executionIntent: classification.executionIntent,
        targetArea: classification.targetArea,
        requiresHumanConfirmation: classification.requiresHumanConfirmation,
      },
    );

    // Audit the project resolution outcome.
    if (resolution.projectId) {
      await logBuildCommandEvent(
        command.id,
        BUILD_EVENT.PROJECT_RESOLVED,
        `Projeto resolvido: ${resolution.slug} (${resolution.method}).`,
        { slug: resolution.slug, method: resolution.method },
      );
    } else {
      await logBuildCommandEvent(
        command.id,
        BUILD_EVENT.PROJECT_UNRESOLVED,
        "Nenhum projeto resolvido — seleção ficará para uma fase posterior.",
        { method: resolution.method },
      );
    }

    return { id: command.id, projectId: command.projectId };
  } catch {
    return null;
  }
}

/** Short, human-friendly id (last 6 chars of the cuid). */
export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

/**
 * Read-only projection of recent commands for the internal admin page.
 * Newest first. Defensive: returns [] on any failure.
 */
export async function getBuildCommandsForAdmin(limit = 100): Promise<AdminBuildCommandView[]> {
  try {
    const rows = await prisma.buildCommand.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        project: { select: { slug: true, name: true } },
        _count: { select: { events: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      shortId: shortId(r.id),
      senderPhone: r.senderPhone,
      senderName: r.senderName,
      commandPrefix: r.commandPrefix,
      commandText: r.commandText,
      rawMessage: r.rawMessage,
      status: r.status,
      riskLevel: r.riskLevel,
      taskType: r.taskType,
      executionIntent: r.executionIntent,
      targetArea: r.targetArea,
      requiresHumanConfirmation: r.requiresHumanConfirmation,
      classificationSummary: r.classificationSummary,
      sourceChannel: r.sourceChannel,
      projectSlug: r.project?.slug ?? null,
      projectName: r.project?.name ?? null,
      createdAt: r.createdAt.toISOString(),
      eventCount: r._count.events,
    }));
  } catch {
    return [];
  }
}
