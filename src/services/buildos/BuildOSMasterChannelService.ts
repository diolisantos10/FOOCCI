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
import { prisma } from "@/lib/prisma";

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
  /** Existing Evolution instances the admin can designate as Master (names only). */
  availableInstances: Array<{ instanceName: string; restaurant: string | null }>;
}

/** Focused status for the Master channel card (reuses the instance-health probe). */
export async function getMasterChannelStatus(): Promise<MasterChannelStatus> {
  const ch = await getBuildOsChannel();
  const expectedWebhookUrl = getExpectedEvolutionWebhookUrl();
  const operatorActive = (await countActiveDbSenders()) > 0;

  // Existing Evolution instances (names only) so the admin can DESIGNATE one as
  // Master from a dropdown instead of typing a name that doesn't exist.
  let availableInstances: Array<{ instanceName: string; restaurant: string | null }> = [];
  try {
    const rows = await prisma.evolutionConfig.findMany({
      select: { instanceName: true, restaurant: { select: { slug: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    availableInstances = rows.map((r) => ({
      instanceName: r.instanceName,
      restaurant: r.restaurant?.slug ?? r.restaurant?.name ?? null,
    }));
  } catch {
    availableInstances = [];
  }

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
      availableInstances,
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
    availableInstances,
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

export interface MasterQrResult {
  ok: boolean;
  error?: string;
  instanceName?: string;
  /** True when the Master instance is already connected (no QR needed). */
  connected?: boolean;
  base64?: string | null;       // data:image/png;... QR image
  pairingCode?: string | null;  // 8-digit pairing code (alternative to QR)
  state?: string | null;
  note?: string;
}

/**
 * Fetch the QR / pairing code to connect the Build OS MASTER number — admin-only,
 * by instanceName, with NO restaurant context. Reuses the restaurant-agnostic
 * EvolutionClient.getQRCode/getInstanceStatus. Requires that the Master instance
 * already exists as an Evolution config (creds live there); otherwise returns an
 * honest "instance not configured" — we never fall back to a restaurant screen.
 */
export async function getMasterChannelQr(): Promise<MasterQrResult> {
  const ch = await getBuildOsChannel();
  if (!ch.instanceName) {
    return { ok: false, error: "Defina e salve o instanceName do Canal Master primeiro." };
  }

  const snapResult = await EvolutionConfigService.getSnapshotByInstanceName(ch.instanceName, false);
  if (!snapResult.ok) {
    return {
      ok: false,
      instanceName: ch.instanceName,
      error: `A instância "${ch.instanceName}" ainda não existe na Evolution (sem credenciais). Selecione uma instância existente no seletor, ou conecte uma instância dedicada do Futi Admin. NÃO use a integração do restaurante.`,
    };
  }
  const snapshot = snapResult.data;

  // Already connected? No QR needed.
  try {
    const status = await EvolutionClient.getInstanceStatus(snapshot);
    if (status.state === "open") {
      return { ok: true, instanceName: ch.instanceName, connected: true, state: "open", note: "Canal Master já conectado." };
    }
  } catch {
    /* fall through to QR attempt */
  }

  try {
    const qr = await EvolutionClient.getQRCode(snapshot);
    if (qr.instanceState === "open") {
      return { ok: true, instanceName: ch.instanceName, connected: true, state: "open", note: "Canal Master já conectado." };
    }
    if (qr.base64 || qr.pairingCode) {
      return {
        ok: true,
        instanceName: ch.instanceName,
        connected: false,
        base64: qr.base64,
        pairingCode: qr.pairingCode,
        state: qr.instanceState ?? null,
        note: "Escaneie o QR Code com o WhatsApp do número receptor do Futi Admin (Aparelhos conectados).",
      };
    }
    return {
      ok: false,
      instanceName: ch.instanceName,
      error: qr.countOnly
        ? "A Evolution está gerando um novo QR — tente novamente em alguns segundos."
        : "Não foi possível obter o QR da instância Master agora.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    return { ok: false, instanceName: ch.instanceName, error: `Falha ao obter QR: ${msg}` };
  }
}
