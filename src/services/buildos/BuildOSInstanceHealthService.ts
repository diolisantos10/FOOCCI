/**
 * BuildOSInstanceHealthService — admin-safe Evolution instance / webhook-delivery
 * health check (read-only).
 *
 * Answers "the webhook stopped delivering" WITHOUT console/Railway/DATABASE_URL:
 * for every configured Evolution instance it reports — masked, no tokens/secrets —
 *   • live connection state (open/close/connecting)
 *   • the connected WhatsApp number (masked)
 *   • the live webhook URL + events (incl. MESSAGES_UPSERT) vs the expected URL
 *   • the last webhook event Foocci received for that instance + its age
 *
 * Every live Evolution call is best-effort and time-bounded so a hung/unreachable
 * Evolution server can never hang the admin request. NO mutations are performed.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { getExpectedEvolutionWebhookUrl } from "@/lib/public-url";

const LIVE_CALL_TIMEOUT_MS = 6000;

/** Bound a possibly-hanging promise; resolves to `fallback` on timeout/error. */
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

/** Mask any phone/JID to "+55***0692" — never the full number. */
function maskNumber(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `+${digits.slice(0, 3)}***${digits.slice(-4)}`;
}

/** Pull the matching instance entry from a fetchInstances() result (v1 + v2 shapes). */
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

export interface InstanceHealth {
  instanceName: string;
  restaurant: string | null;
  isActiveDb: boolean;
  reachable: boolean;
  connectionState: string | null;       // open | close | connecting | null
  connectedNumberMasked: string | null;  // masked, never full
  profileName: string | null;
  webhookUrl: string | null;             // base URL (no token)
  webhookEnabled: boolean | null;
  events: string[];
  hasMessagesUpsert: boolean;
  urlMatchesExpected: boolean;
  lastEventAt: string | null;
  lastEventAgeMinutes: number | null;
  lastInboundAt: string | null;
  issues: string[];
  error: string | null;
}

export interface InstanceHealthReport {
  generatedAt: string;
  expectedWebhookUrl: string;
  expectedInstance: string | null;
  instances: InstanceHealth[];
}

export async function runInstanceHealthCheck(): Promise<InstanceHealthReport> {
  const now = new Date();
  const expectedWebhookUrl = getExpectedEvolutionWebhookUrl();
  const ageMin = (d: Date | null | undefined) =>
    d ? Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000)) : null;

  let configs: Array<{ restaurantId: string; instanceName: string; isActive: boolean; restaurant: { slug: string | null; name: string | null } | null }> = [];
  try {
    configs = await prisma.evolutionConfig.findMany({
      select: { restaurantId: true, instanceName: true, isActive: true, restaurant: { select: { slug: true, name: true } } },
    });
  } catch {
    configs = [];
  }

  const instances: InstanceHealth[] = [];
  for (const cfg of configs) {
    const h: InstanceHealth = {
      instanceName: cfg.instanceName,
      restaurant: cfg.restaurant?.slug ?? cfg.restaurant?.name ?? null,
      isActiveDb: cfg.isActive,
      reachable: false,
      connectionState: null,
      connectedNumberMasked: null,
      profileName: null,
      webhookUrl: null,
      webhookEnabled: null,
      events: [],
      hasMessagesUpsert: false,
      urlMatchesExpected: false,
      lastEventAt: null,
      lastEventAgeMinutes: null,
      lastInboundAt: null,
      issues: [],
      error: null,
    };

    // Last webhook event Foocci received for THIS instance (DB only, no network).
    try {
      const [last, lastInbound] = await Promise.all([
        prisma.evolutionWebhookEventLog.findFirst({ where: { instanceName: cfg.instanceName }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.evolutionWebhookEventLog.findFirst({ where: { instanceName: cfg.instanceName, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      ]);
      h.lastEventAt = last?.createdAt.toISOString() ?? null;
      h.lastEventAgeMinutes = ageMin(last?.createdAt);
      h.lastInboundAt = lastInbound?.createdAt.toISOString() ?? null;
    } catch {
      /* tolerate */
    }

    const snap = await EvolutionConfigService.getSnapshot(cfg.restaurantId, true);
    if (!snap.ok) {
      h.error = "Snapshot/credenciais indisponíveis para esta instância.";
      instances.push(h);
      continue;
    }
    const snapshot = snap.data;

    // 1) Live connection state.
    const status = await bounded(EvolutionClient.getInstanceStatus(snapshot).then((s) => s.state).catch(() => null), null);
    h.connectionState = status;
    h.reachable = status !== null;

    // 2) Connected number + profile (masked).
    const list = await bounded(EvolutionClient.fetchInstances(snapshot).catch(() => [] as unknown[]), [] as unknown[]);
    const entry = Array.isArray(list) ? findInstanceEntry(list, cfg.instanceName) : null;
    if (entry) {
      const nested = (entry.instance && typeof entry.instance === "object" ? entry.instance : null) as Record<string, unknown> | null;
      const owner = entry.ownerJid ?? entry.owner ?? entry.number ?? nested?.owner ?? nested?.ownerJid;
      h.connectedNumberMasked = maskNumber(owner);
      h.profileName = (entry.profileName ?? nested?.profileName ?? null) as string | null;
      if (!h.connectionState) {
        h.connectionState = (entry.connectionStatus ?? entry.state ?? nested?.status ?? null) as string | null;
        h.reachable = h.reachable || h.connectionState !== null;
      }
    }

    // 3) Live webhook config.
    const raw = await bounded(EvolutionClient.getWebhook(snapshot).catch(() => ({} as Record<string, unknown>)), {} as Record<string, unknown>);
    const wh = (raw.webhook && typeof raw.webhook === "object" ? (raw.webhook as Record<string, unknown>) : raw) as Record<string, unknown>;
    const url = (wh.url as string | undefined) ?? null;
    h.webhookUrl = url ? (url.split("?")[0] ?? null) : null;
    h.webhookEnabled = (wh.enabled as boolean | undefined) ?? null;
    h.events = Array.isArray(wh.events) ? (wh.events as string[]) : [];
    h.hasMessagesUpsert = h.events.some((e) => e === "MESSAGES_UPSERT");
    h.urlMatchesExpected = !!h.webhookUrl && h.webhookUrl.trim() === expectedWebhookUrl;

    // 4) Issues / verdict.
    if (h.connectionState && h.connectionState !== "open") {
      h.issues.push(`Instância NÃO conectada (estado: ${h.connectionState}). WhatsApp desconectado → nenhum evento será entregue.`);
    }
    if (h.connectionState === null) {
      h.issues.push("Não foi possível consultar o estado da instância (Evolution inacessível ou credenciais inválidas).");
    }
    if (h.webhookEnabled === false) h.issues.push("Webhook desabilitado (enabled=false).");
    if (h.webhookUrl && !h.urlMatchesExpected) h.issues.push(`URL do webhook diverge — Evolution: "${h.webhookUrl}", esperado: "${expectedWebhookUrl}".`);
    if (h.events.length > 0 && !h.hasMessagesUpsert) h.issues.push("MESSAGES_UPSERT não está nos eventos configurados.");
    if (h.connectionState === "open" && h.lastEventAgeMinutes !== null && h.lastEventAgeMinutes > 10) {
      h.issues.push(`Conectada, mas sem eventos há ${h.lastEventAgeMinutes} min — possível problema de entrega Evolution → Foocci.`);
    }

    instances.push(h);
  }

  // Expected test instance: the active one (or the first configured).
  const expectedInstance = instances.find((i) => i.isActiveDb)?.instanceName ?? instances[0]?.instanceName ?? null;

  return {
    generatedAt: now.toISOString(),
    expectedWebhookUrl,
    expectedInstance,
    instances,
  };
}
