/**
 * BuildOSMasterChannelService — admin-safe setup/validation for the Build OS
 * WhatsApp Master/Admin channel (separate from restaurant WhatsApp).
 *
 * Read path reuses runInstanceHealthCheck() (single source of truth for live
 * connection/number/webhook/last-event), focused on the configured Master
 * instance. Sync path re-applies the canonical webhook config to the Master
 * instance only. No tokens/secrets/full phones are ever returned. No mutations
 * to restaurant instances. No Claude/GitHub/LLM.
 */

import { getBuildOsChannel, countActiveDbSenders } from "./BuildOSConfigService";
import { runInstanceHealthCheck, type InstanceHealth } from "./BuildOSInstanceHealthService";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { getExpectedEvolutionWebhookUrl } from "@/lib/public-url";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

/** End-to-end readiness checklist for sending a real /build to the Master channel. */
export interface MasterChannelReadiness {
  instanceNameSaved: boolean;
  instanceExists: boolean;
  connectionOpen: boolean;
  webhookOk: boolean;          // enabled AND URL matches the canonical webhook
  messagesUpsert: boolean;
  operatorActive: boolean;     // at least one active authorized operator (Diego)
  lastEventReceived: boolean;
  allReady: boolean;
}

export interface MasterChannelStatus {
  configured: boolean;            // instance set AND enabled
  instanceName: string | null;
  enabled: boolean;
  legacyFallbackEnabled: boolean;
  existsInEvolution: boolean;     // is the Master a configured Evolution instance?
  /** Live health of the Master instance (null when not found / not configured). */
  health: InstanceHealth | null;
  /** Masked authorized operator + comparison, from the health report. */
  numbersInvolved: Awaited<ReturnType<typeof runInstanceHealthCheck>>["numbersInvolved"] | null;
  /** Masked authorized operator (e.g. "+55***5223") — never the full number. */
  operatorMasked: string | null;
  expectedWebhookUrl: string;
  readiness: MasterChannelReadiness;
}

/** Focused status for the Master channel card (reuses the instance-health probe). */
export async function getMasterChannelStatus(): Promise<MasterChannelStatus> {
  const ch = await getBuildOsChannel();
  const expectedWebhookUrl = getExpectedEvolutionWebhookUrl();
  const operatorActive = (await countActiveDbSenders()) > 0;

  if (!ch.instanceName) {
    return {
      configured: ch.configured,
      instanceName: null,
      enabled: ch.enabled,
      legacyFallbackEnabled: ch.legacyFallbackEnabled,
      existsInEvolution: false,
      health: null,
      numbersInvolved: null,
      operatorMasked: null,
      expectedWebhookUrl,
      readiness: {
        instanceNameSaved: false,
        instanceExists: false,
        connectionOpen: false,
        webhookOk: false,
        messagesUpsert: false,
        operatorActive,
        lastEventReceived: false,
        allReady: false,
      },
    };
  }

  const report = await runInstanceHealthCheck();
  const health = report.instances.find((i) => i.instanceName === ch.instanceName) ?? null;
  const operatorMasked = report.numbersInvolved?.authorizedOperatorMasked ?? null;

  const readiness: MasterChannelReadiness = {
    instanceNameSaved: true,
    instanceExists: !!health,
    connectionOpen: health?.connectionState === "open",
    webhookOk: health?.webhookEnabled === true && health?.urlMatchesExpected === true,
    messagesUpsert: health?.hasMessagesUpsert === true,
    operatorActive,
    lastEventReceived: !!health?.lastEventAt,
    allReady: false,
  };
  readiness.allReady =
    readiness.instanceNameSaved &&
    readiness.instanceExists &&
    readiness.connectionOpen &&
    readiness.webhookOk &&
    readiness.messagesUpsert &&
    readiness.operatorActive &&
    readiness.lastEventReceived &&
    ch.enabled;

  return {
    configured: ch.configured,
    instanceName: ch.instanceName,
    enabled: ch.enabled,
    legacyFallbackEnabled: ch.legacyFallbackEnabled,
    existsInEvolution: !!health,
    health,
    numbersInvolved: report.numbersInvolved,
    operatorMasked,
    expectedWebhookUrl,
    readiness,
  };
}

export interface MasterSyncResult {
  ok: boolean;
  error?: string;
  instanceName?: string;
  webhookUrlConfigured?: string; // base URL only — token stripped
  events?: string[];
  enabled?: boolean | null;
  hasMessagesUpsert?: boolean;
  note?: string;
}

/**
 * Re-apply the canonical webhook config to the Master instance ONLY.
 * The URL is always the canonical one (never the Railway proxy host); the token
 * is appended server-side and never returned.
 */
export async function syncMasterWebhook(): Promise<MasterSyncResult> {
  const ch = await getBuildOsChannel();
  if (!ch.instanceName) {
    return { ok: false, error: "Canal Master não configurado (defina o instanceName primeiro)." };
  }

  const snapResult = await EvolutionConfigService.getSnapshotByInstanceName(ch.instanceName, true);
  if (!snapResult.ok) {
    return {
      ok: false,
      error: `A instância "${ch.instanceName}" não existe na Evolution (nenhuma config encontrada). Crie/conecte essa instância antes de sincronizar.`,
      instanceName: ch.instanceName,
    };
  }
  const snapshot = snapResult.data;

  const baseUrl = getExpectedEvolutionWebhookUrl();
  let finalUrl = baseUrl;
  if (snapshot.webhookSecret) {
    const u = new URL(baseUrl);
    u.searchParams.set("token", snapshot.webhookSecret);
    finalUrl = u.toString();
  }

  try {
    await EvolutionClient.setWebhook(snapshot, finalUrl, WEBHOOK_EVENTS, snapshot.webhookSecret || undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    return { ok: false, error: `Falha ao configurar o webhook: ${msg}`, instanceName: ch.instanceName };
  }

  // Read back to confirm (masked; token stripped).
  const raw = await EvolutionClient.getWebhook(snapshot).catch(() => ({} as Record<string, unknown>));
  const wh = (raw.webhook && typeof raw.webhook === "object" ? (raw.webhook as Record<string, unknown>) : raw) as Record<string, unknown>;
  const url = (wh.url as string | undefined) ?? null;
  const events = Array.isArray(wh.events) ? (wh.events as string[]) : [];
  const enabled = (wh.enabled as boolean | undefined) ?? null;
  const hasMessagesUpsert = events.some((e) => e === "MESSAGES_UPSERT");

  return {
    ok: true,
    instanceName: ch.instanceName,
    webhookUrlConfigured: url ? url.split("?")[0] : baseUrl,
    events,
    enabled,
    hasMessagesUpsert,
    note: hasMessagesUpsert
      ? "Webhook sincronizado no Canal Master. Envie /build novamente para validar a entrega."
      : "Webhook configurado, mas MESSAGES_UPSERT não apareceu na releitura — verifique a versão da Evolution.",
  };
}
