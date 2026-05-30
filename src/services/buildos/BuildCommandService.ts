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
import type {
  AdminBuildCommandView,
  CreateBuildCommandFromWhatsAppInput,
} from "./types";

/** Standard event types for the append-only audit log. */
export const BUILD_EVENT = {
  RECEIVED: "RECEIVED",
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
 * Resolve the default BuildProject id, or null if none is configured.
 * Priority 1.1 does not parse a project from the command text yet — every
 * command is attributed to the default project (Foocci) when one exists.
 */
async function resolveDefaultProjectId(): Promise<string | null> {
  try {
    const project = await prisma.buildProject.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });
    return project?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a BuildCommand from a WhatsApp message and write the initial RECEIVED
 * event. Caller MUST have already verified authorization. Returns the created
 * command id + resolved project, or null on failure.
 */
export async function createBuildCommandFromWhatsApp(
  input: CreateBuildCommandFromWhatsAppInput,
): Promise<{ id: string; projectId: string | null } | null> {
  const projectId = await resolveDefaultProjectId();

  try {
    const command = await prisma.buildCommand.create({
      data: {
        projectId,
        senderPhone: input.senderPhone,
        senderName: input.senderName ?? null,
        sourceChannel: "WHATSAPP",
        rawMessage: input.rawMessage,
        commandPrefix: input.prefix,
        commandText: input.commandText,
        status: "RECEIVED",
        // riskLevel / taskType default to UNKNOWN — classification is a later phase.
      },
      select: { id: true, projectId: true },
    });

    await logBuildCommandEvent(command.id, BUILD_EVENT.RECEIVED, "Comando recebido via WhatsApp.", {
      prefix: input.prefix,
      senderPhone: input.senderPhone,
    });

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
