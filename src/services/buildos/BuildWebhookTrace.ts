/**
 * BuildWebhookTrace — persist a diagnostic trace of each Build OS webhook attempt.
 *
 * Lets the admin confirm — without console/Railway — whether the REAL Evolution
 * webhook reached the Build OS branch and what happened. Best-effort: never
 * throws into the webhook hot path. Stores NO secrets (phone is masked).
 */

import { prisma } from "@/lib/prisma";

export interface WebhookTraceInput {
  maskedPhone?: string | null;
  /** Full normalized E.164 phone — stored server-side only, never logged/exposed. */
  rawPhone?: string | null;
  /** Evolution instance the event arrived on (Master vs restaurant channel). */
  /** Identidade do canal (hoje o `phone_number_id` da Meta). Coluna com nome legado. */
  instanceName?: string | null;
  prefixDetected?: string | null;
  configEnabled?: boolean | null;
  configSource?: string | null;
  authorized?: boolean | null;
  fromMe?: boolean | null;
  commandCreated?: boolean;
  promptDrafted?: boolean;
  responseSent?: boolean;
  shortCircuited?: boolean;
  failureReason?: string | null;
}

/** Mask a phone for safe storage (keeps country + last 4). */
export function maskPhoneForTrace(phone: string): string {
  if (!phone || phone.length <= 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

/** Write a trace row. Best-effort; swallows all errors. */
export async function recordWebhookTrace(input: WebhookTraceInput): Promise<void> {
  try {
    await prisma.buildWebhookTrace.create({
      data: {
        maskedPhone: input.maskedPhone ?? null,
        rawPhone: input.rawPhone ?? null,
        instanceName: input.instanceName ?? null,
        prefixDetected: input.prefixDetected ?? null,
        configEnabled: input.configEnabled ?? null,
        configSource: input.configSource ?? null,
        authorized: input.authorized ?? null,
        fromMe: input.fromMe ?? null,
        commandCreated: input.commandCreated ?? false,
        promptDrafted: input.promptDrafted ?? false,
        responseSent: input.responseSent ?? false,
        shortCircuited: input.shortCircuited ?? false,
        failureReason: input.failureReason ?? null,
      },
    });
  } catch {
    /* tracing must never break the webhook */
  }
}

export interface WebhookTraceView {
  /** Short, display-only id (last 6 chars, uppercased). */
  id: string;
  /** Full trace id — the ONLY token the admin "Autorizar" action sends back. */
  traceId: string;
  /**
   * True when this trace stored a recoverable full phone server-side, so the
   * "Autorizar" action can work. Old traces (created before the rawPhone column)
   * are false → the UI shows "reenvie /build" instead of a dead button. This is a
   * boolean ONLY — the phone itself is never exposed.
   */
  canAuthorize: boolean;
  maskedPhone: string | null;
  instanceName: string | null;
  prefixDetected: string | null;
  configEnabled: boolean | null;
  configSource: string | null;
  authorized: boolean | null;
  fromMe: boolean | null;
  commandCreated: boolean;
  promptDrafted: boolean;
  responseSent: boolean;
  shortCircuited: boolean;
  failureReason: string | null;
  createdAt: string;
}

/** Latest webhook traces for the admin Diagnóstico tab. Defensive: [] on error. */
export async function getRecentWebhookTraces(limit = 10): Promise<WebhookTraceView[]> {
  try {
    const rows = await prisma.buildWebhookTrace.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id.slice(-6).toUpperCase(),
      traceId: r.id,
      // Boolean only — never the phone. Derived from whether a full number is stored.
      canAuthorize: !!r.rawPhone,
      maskedPhone: r.maskedPhone,
      instanceName: r.instanceName,
      prefixDetected: r.prefixDetected,
      configEnabled: r.configEnabled,
      configSource: r.configSource,
      authorized: r.authorized,
      fromMe: r.fromMe,
      commandCreated: r.commandCreated,
      promptDrafted: r.promptDrafted,
      responseSent: r.responseSent,
      shortCircuited: r.shortCircuited,
      failureReason: r.failureReason,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
