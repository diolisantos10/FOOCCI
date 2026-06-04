/**
 * BuildOSMasterChannelService — status/QR/sync for the Foocci/Futi ADMIN WhatsApp
 * channel (the Build OS command line). Built ENTIRELY on the system-level admin
 * config (BuildOSMasterWhatsAppConfig) — it never reads a restaurant
 * EvolutionConfig, never lists restaurant instances, never uses sushicazza.
 *
 * Live Evolution calls use the admin snapshot and are time-bounded so an
 * unreachable server can't hang the request. No tokens/secrets/full phones are
 * ever returned. No Claude/GitHub/LLM.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { getExpectedEvolutionWebhookUrl } from "@/lib/public-url";
import { countActiveDbSenders } from "./BuildOSConfigService";
import {
  getAdminWhatsAppView,
  getAdminWhatsAppSnapshot,
} from "./AdminWhatsAppConfigService";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];
const LIVE_CALL_TIMEOUT_MS = 6000;

async function bounded<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), LIVE_CALL_TIMEOUT_MS)),
    ]);
  } catch {
    return fallback;
  }
}

/** Mask any phone/JID to "+55***5223" — never the full number. */
function maskNumber(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  const e164 = `+${digits}`;
  return `${e164.slice(0, 3)}***${e164.slice(-4)}`;
}

function findInstanceEntry(list: unknown[], instanceName: string): Record<string, unknown> | null {
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nested = (o.instance && typeof o.instance === "object" ? o.instance : null) as Record<string, unknown> | null;
    const name = (o.name ?? o.instanceName ?? nested?.instanceName ?? nested?.name) as string | undefined;
    if (name === instanceName) return o;
  }
  return null;
}

export interface MasterChannelReadiness {
  credentialsConfigured: boolean; // baseUrl + apiKey saved
  instanceNameSaved: boolean;
  channelEnabled: boolean;
  connectionOpen: boolean;
  webhookOk: boolean;             // enabled AND URL matches canonical
  messagesUpsert: boolean;
  operatorActive: boolean;
  lastEventReceived: boolean;
  allReady: boolean;
}

export interface MasterChannelStatus {
  // Admin config (masked).
  configured: boolean;            // credentials saved
  enabled: boolean;
  instanceName: string | null;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  envBaseUrl: string | null;
  // Live status (null when not configured / unreachable).
  connectionState: string | null;
  connectedNumberMasked: string | null;
  webhookUrl: string | null;
  webhookEnabled: boolean | null;
  hasMessagesUpsert: boolean;
  urlMatchesExpected: boolean;
  lastEventAt: string | null;
  lastEventAgeMinutes: number | null;
  // Operator + checklist.
  operatorMasked: string | null;
  expectedWebhookUrl: string;
  readiness: MasterChannelReadiness;
}

export async function getMasterChannelStatus(): Promise<MasterChannelStatus> {
  const view = await getAdminWhatsAppView();
  const expectedWebhookUrl = getExpectedEvolutionWebhookUrl();
  const operatorActive = (await countActiveDbSenders()) > 0;
  const operatorMasked = await getActiveOperatorMasked();

  const base: MasterChannelStatus = {
    configured: view.configured,
    enabled: view.isEnabled,
    instanceName: view.instanceName,
    baseUrl: view.baseUrl,
    apiKeyMasked: view.apiKeyMasked,
    hasApiKey: view.hasApiKey,
    hasWebhookSecret: view.hasWebhookSecret,
    envBaseUrl: view.envBaseUrl,
    connectionState: null,
    connectedNumberMasked: null,
    webhookUrl: null,
    webhookEnabled: null,
    hasMessagesUpsert: false,
    urlMatchesExpected: false,
    lastEventAt: null,
    lastEventAgeMinutes: null,
    operatorMasked,
    expectedWebhookUrl,
    readiness: {
      credentialsConfigured: view.configured,
      instanceNameSaved: !!view.instanceName,
      channelEnabled: view.isEnabled,
      connectionOpen: false,
      webhookOk: false,
      messagesUpsert: false,
      operatorActive,
      lastEventReceived: false,
      allReady: false,
    },
  };

  // Last event this instance delivered (DB only).
  if (view.instanceName) {
    try {
      const last = await prisma.evolutionWebhookEventLog.findFirst({
        where: { instanceName: view.instanceName },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      base.lastEventAt = last?.createdAt.toISOString() ?? null;
      base.lastEventAgeMinutes = last ? Math.max(0, Math.round((Date.now() - last.createdAt.getTime()) / 60000)) : null;
    } catch { /* tolerate */ }
  }

  // Live Evolution calls via the ADMIN snapshot (never a restaurant snapshot).
  const snapshot = await getAdminWhatsAppSnapshot();
  if (snapshot) {
    const state = await bounded(EvolutionClient.getInstanceStatus(snapshot).then((s) => s.state).catch(() => null), null);
    base.connectionState = state;

    const list = await bounded(EvolutionClient.fetchInstances(snapshot).catch(() => [] as unknown[]), [] as unknown[]);
    const entry = Array.isArray(list) ? findInstanceEntry(list, snapshot.instanceName) : null;
    if (entry) {
      const nested = (entry.instance && typeof entry.instance === "object" ? entry.instance : null) as Record<string, unknown> | null;
      const owner = entry.ownerJid ?? entry.owner ?? entry.number ?? nested?.owner ?? nested?.ownerJid;
      base.connectedNumberMasked = maskNumber(owner);
      if (!base.connectionState) base.connectionState = (entry.connectionStatus ?? entry.state ?? nested?.status ?? null) as string | null;
    }

    const raw = await bounded(EvolutionClient.getWebhook(snapshot).catch(() => ({} as Record<string, unknown>)), {} as Record<string, unknown>);
    const wh = (raw.webhook && typeof raw.webhook === "object" ? (raw.webhook as Record<string, unknown>) : raw) as Record<string, unknown>;
    const url = (wh.url as string | undefined) ?? null;
    base.webhookUrl = url ? (url.split("?")[0] ?? null) : null;
    base.webhookEnabled = (wh.enabled as boolean | undefined) ?? null;
    const events = Array.isArray(wh.events) ? (wh.events as string[]) : [];
    base.hasMessagesUpsert = events.some((e) => e === "MESSAGES_UPSERT");
    base.urlMatchesExpected = !!base.webhookUrl && base.webhookUrl.trim() === expectedWebhookUrl;
  }

  const r = base.readiness;
  r.connectionOpen = base.connectionState === "open";
  r.webhookOk = base.webhookEnabled === true && base.urlMatchesExpected === true;
  r.messagesUpsert = base.hasMessagesUpsert === true;
  r.lastEventReceived = !!base.lastEventAt;
  r.allReady =
    r.credentialsConfigured && r.instanceNameSaved && r.channelEnabled &&
    r.connectionOpen && r.webhookOk && r.messagesUpsert && r.operatorActive && r.lastEventReceived;

  return base;
}

async function getActiveOperatorMasked(): Promise<string | null> {
  try {
    const sender = await prisma.buildAuthorizedSender.findFirst({
      where: { isActive: true },
      orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }],
      select: { phone: true },
    });
    return sender?.phone ? maskNumber(sender.phone) : null;
  } catch {
    return null;
  }
}

export interface MasterSyncResult {
  ok: boolean;
  error?: string;
  instanceName?: string;
  webhookUrlConfigured?: string;
  events?: string[];
  enabled?: boolean | null;
  hasMessagesUpsert?: boolean;
  note?: string;
}

/** Re-apply the canonical webhook to the ADMIN instance (admin snapshot only). */
export async function syncMasterWebhook(): Promise<MasterSyncResult> {
  const snapshot = await getAdminWhatsAppSnapshot(true);
  if (!snapshot) {
    return { ok: false, error: "Credenciais Evolution do Canal Admin não configuradas. Configure baseUrl + apiKey primeiro." };
  }

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
    return { ok: false, error: `Falha ao configurar o webhook: ${msg}`, instanceName: snapshot.instanceName };
  }

  const raw = await EvolutionClient.getWebhook(snapshot).catch(() => ({} as Record<string, unknown>));
  const wh = (raw.webhook && typeof raw.webhook === "object" ? (raw.webhook as Record<string, unknown>) : raw) as Record<string, unknown>;
  const url = (wh.url as string | undefined) ?? null;
  const events = Array.isArray(wh.events) ? (wh.events as string[]) : [];
  const enabled = (wh.enabled as boolean | undefined) ?? null;
  const hasMessagesUpsert = events.some((e) => e === "MESSAGES_UPSERT");

  return {
    ok: true,
    instanceName: snapshot.instanceName,
    webhookUrlConfigured: url ? url.split("?")[0] : baseUrl,
    events,
    enabled,
    hasMessagesUpsert,
    note: hasMessagesUpsert
      ? "Webhook sincronizado no Canal Admin. Envie /build para validar a entrega."
      : "Webhook configurado, mas MESSAGES_UPSERT não apareceu na releitura — verifique a versão da Evolution.",
  };
}

export interface MasterQrResult {
  ok: boolean;
  error?: string;
  instanceName?: string;
  connected?: boolean;
  base64?: string | null;
  pairingCode?: string | null;
  state?: string | null;
  note?: string;
}

/** QR / pairing to connect the ADMIN number — admin snapshot only, no restaurant. */
export async function getMasterChannelQr(): Promise<MasterQrResult> {
  const snapshot = await getAdminWhatsAppSnapshot();
  if (!snapshot) {
    return { ok: false, error: "Credenciais Evolution do Canal Admin não configuradas. Configure baseUrl + apiKey + instanceName primeiro." };
  }

  try {
    const status = await EvolutionClient.getInstanceStatus(snapshot);
    if (status.state === "open") {
      return { ok: true, instanceName: snapshot.instanceName, connected: true, state: "open", note: "Canal Admin já conectado." };
    }
  } catch { /* fall through */ }

  try {
    const qr = await EvolutionClient.getQRCode(snapshot);
    if (qr.instanceState === "open") {
      return { ok: true, instanceName: snapshot.instanceName, connected: true, state: "open", note: "Canal Admin já conectado." };
    }
    if (qr.base64 || qr.pairingCode) {
      return {
        ok: true,
        instanceName: snapshot.instanceName,
        connected: false,
        base64: qr.base64,
        pairingCode: qr.pairingCode,
        state: qr.instanceState ?? null,
        note: "Escaneie o QR com o WhatsApp do número receptor do Futi Admin (Aparelhos conectados).",
      };
    }
    return {
      ok: false,
      instanceName: snapshot.instanceName,
      error: qr.countOnly
        ? "A Evolution está gerando um novo QR — tente novamente em alguns segundos."
        : "Não foi possível obter o QR do Canal Admin agora.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    return { ok: false, instanceName: snapshot.instanceName, error: `Falha ao obter QR: ${msg}` };
  }
}
