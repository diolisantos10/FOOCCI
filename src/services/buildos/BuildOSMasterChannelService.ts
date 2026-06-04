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
import { EvolutionClient, EvolutionApiError, type EvolutionConfigSnapshot } from "@/lib/evolution/EvolutionClient";
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
  baseUrlAvailable: boolean;
  apiKeyAvailable: boolean;       // resolved from saved OR env
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
  configured: boolean;            // instanceName + baseUrl + apiKey resolvable
  enabled: boolean;
  instanceName: string | null;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  /** Where the effective apiKey comes from — never the value. */
  apiKeySource: "saved" | "env" | "none";
  baseUrlSource: "saved" | "env" | "none";
  envApiKeyAvailable: boolean;
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
    apiKeySource: view.apiKeySource,
    baseUrlSource: view.baseUrlSource,
    envApiKeyAvailable: view.envApiKeyAvailable,
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
      baseUrlAvailable: !!view.baseUrl,
      apiKeyAvailable: view.hasApiKey,
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
    r.baseUrlAvailable && r.apiKeyAvailable && r.instanceNameSaved && r.channelEnabled &&
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
  /** True when the instance was just created on the Evolution server. */
  created?: boolean;
  base64?: string | null;
  pairingCode?: string | null;
  state?: string | null;
  note?: string;
}

/** Canonical webhook URL with the admin token appended server-side (never returned). */
function adminWebhookUrl(snapshot: EvolutionConfigSnapshot): string {
  const base = getExpectedEvolutionWebhookUrl();
  if (!snapshot.webhookSecret) return base;
  const u = new URL(base);
  u.searchParams.set("token", snapshot.webhookSecret);
  return u.toString();
}

/**
 * Ensure the Admin instance EXISTS on the Evolution server. The 404 on
 * /instance/connect comes from the instance never having been created (we only
 * stored DB config). Mirrors the restaurant provisioning (POST /instance/create)
 * but with the admin snapshot — no restaurant context.
 *
 * Returns { existed, created, connected } or throws EvolutionApiError on a real
 * Evolution failure (translated by the caller).
 */
async function ensureAdminInstance(
  snapshot: EvolutionConfigSnapshot,
): Promise<{ existed: boolean; created: boolean; connected: boolean }> {
  // 1. Does it already exist? connectionState 404 = not found.
  try {
    const status = await EvolutionClient.getInstanceStatus(snapshot);
    return { existed: true, created: false, connected: status.state === "open" };
  } catch (err) {
    if (!(err instanceof EvolutionApiError) || err.status !== 404) throw err;
    // 404 → instance does not exist yet → create it below.
  }

  // 2. Create it (same contract the restaurant flow uses).
  await EvolutionClient.createInstance(snapshot, {
    instanceName: snapshot.instanceName,
    integration: "WHATSAPP-BAILEYS",
    webhookUrl: adminWebhookUrl(snapshot),
    webhookByEvents: false,
    webhookEvents: WEBHOOK_EVENTS,
    webhookSecret: snapshot.webhookSecret,
  });
  return { existed: false, created: true, connected: false };
}

/** Friendly translation of Evolution errors — never surfaces a raw "HTTP 404". */
export function friendlyEvolutionError(err: unknown, instanceName: string): string {
  if (err instanceof EvolutionApiError) {
    if (err.status === 404) return `A instância "${instanceName}" ainda não existe na Evolution (e não foi possível criá-la automaticamente). Verifique a apiKey/baseUrl do servidor Evolution.`;
    if (err.status === 401 || err.status === 403) return "apiKey/token da Evolution sem permissão (401/403). Verifique a credencial do servidor Evolution.";
    return `Evolution respondeu HTTP ${err.status} ao preparar o Canal Admin. Verifique baseUrl/apiKey e a versão da Evolution.`;
  }
  const msg = err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
  return `Falha ao preparar/conectar o Canal Admin: ${msg}`;
}

/**
 * Prepare + connect the Admin number: ensure the instance exists (create if
 * missing), then return QR / pairing — admin snapshot only, no restaurant. Never
 * surfaces a raw HTTP 404.
 */
export async function getMasterChannelQr(): Promise<MasterQrResult> {
  const snapshot = await getAdminWhatsAppSnapshot(true);
  if (!snapshot) {
    return { ok: false, error: "Credenciais Evolution do Canal Admin não configuradas. Configure baseUrl + apiKey + instanceName primeiro." };
  }

  // 1. Ensure the instance exists (the real cause of the 404).
  let prep: { existed: boolean; created: boolean; connected: boolean };
  try {
    prep = await ensureAdminInstance(snapshot);
  } catch (err) {
    return { ok: false, instanceName: snapshot.instanceName, error: friendlyEvolutionError(err, snapshot.instanceName) };
  }

  if (prep.connected) {
    return { ok: true, instanceName: snapshot.instanceName, connected: true, created: prep.created, state: "open", note: "Canal Admin já conectado." };
  }

  // 2. Now that it exists, fetch the QR / pairing code.
  try {
    const qr = await EvolutionClient.getQRCode(snapshot);
    if (qr.instanceState === "open") {
      return { ok: true, instanceName: snapshot.instanceName, connected: true, created: prep.created, state: "open", note: "Canal Admin já conectado." };
    }
    if (qr.base64 || qr.pairingCode) {
      return {
        ok: true,
        instanceName: snapshot.instanceName,
        connected: false,
        created: prep.created,
        base64: qr.base64,
        pairingCode: qr.pairingCode,
        state: qr.instanceState ?? null,
        note: prep.created
          ? "Instância futi-admin criada. Escaneie o QR com o WhatsApp do número receptor do Futi Admin (Aparelhos conectados)."
          : "Escaneie o QR com o WhatsApp do número receptor do Futi Admin (Aparelhos conectados).",
      };
    }
    return {
      ok: false,
      instanceName: snapshot.instanceName,
      created: prep.created,
      error: qr.countOnly
        ? "A Evolution está gerando o QR — clique novamente em alguns segundos."
        : "Instância pronta, mas a Evolution não retornou o QR agora. Tente novamente em instantes.",
    };
  } catch (err) {
    return { ok: false, instanceName: snapshot.instanceName, created: prep.created, error: friendlyEvolutionError(err, snapshot.instanceName) };
  }
}
