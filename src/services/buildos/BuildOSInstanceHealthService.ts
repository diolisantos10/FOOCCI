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
import { normalizeSenderPhone, phoneVariants } from "./BuildCommandRouter";

const LIVE_CALL_TIMEOUT_MS = 6000;
const BUILD_PREFIXES = ["/build", "/cmd", "/prompt"];

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
  const e164 = `+${digits}`;
  return `${e164.slice(0, 3)}***${e164.slice(-4)}`;
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
  lastUpsertAt: string | null;
  lastUpsertAgeMinutes: number | null;
  lastConnectionUpdateAt: string | null;
  lastConnectionUpdateAgeMinutes: number | null;
  deliveryStatus: "healthy" | "stale" | "stopped";
  issues: string[];
  error: string | null;
}

/** The three numbers that get confused in this flow — all masked. */
export interface NumbersInvolved {
  connectedNumberMasked: string | null;       // the instance's own connected WhatsApp
  authorizedOperatorMasked: string | null;     // active Build OS operator
  lastBuildAttemptMasked: string | null;        // last number that tried /build
  activeOperatorCount: number;
  connectedMatchesOperator: boolean | null;     // null when either is unknown
  verdict: string;
  guidance: string;
}

export interface InstanceHealthReport {
  generatedAt: string;
  expectedWebhookUrl: string;
  expectedInstance: string | null;
  numbersInvolved: NumbersInvolved;
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

  // Connected raw digits per instance (server-side only — used to compare against
  // the operator number; NEVER returned in full).
  const connectedDigitsByInstance: Record<string, string> = {};

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
      lastUpsertAt: null,
      lastUpsertAgeMinutes: null,
      lastConnectionUpdateAt: null,
      lastConnectionUpdateAgeMinutes: null,
      deliveryStatus: "stopped",
      issues: [],
      error: null,
    };

    // Last webhook events Foocci received for THIS instance (DB only, no network).
    // We split message delivery (messages.upsert) from connection housekeeping
    // (connection.update) — a connected instance can keep emitting connection
    // updates while delivering ZERO messages, which is exactly this case.
    try {
      const [last, lastInbound, lastUpsert, lastConn] = await Promise.all([
        prisma.evolutionWebhookEventLog.findFirst({ where: { instanceName: cfg.instanceName }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.evolutionWebhookEventLog.findFirst({ where: { instanceName: cfg.instanceName, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.evolutionWebhookEventLog.findFirst({ where: { instanceName: cfg.instanceName, eventName: { contains: "UPSERT", mode: "insensitive" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.evolutionWebhookEventLog.findFirst({ where: { instanceName: cfg.instanceName, eventName: { contains: "CONNECTION", mode: "insensitive" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      ]);
      h.lastEventAt = last?.createdAt.toISOString() ?? null;
      h.lastEventAgeMinutes = ageMin(last?.createdAt);
      h.lastInboundAt = lastInbound?.createdAt.toISOString() ?? null;
      h.lastUpsertAt = lastUpsert?.createdAt.toISOString() ?? null;
      h.lastUpsertAgeMinutes = ageMin(lastUpsert?.createdAt);
      h.lastConnectionUpdateAt = lastConn?.createdAt.toISOString() ?? null;
      h.lastConnectionUpdateAgeMinutes = ageMin(lastConn?.createdAt);
      // Delivery status keyed on the most recent ANY event (delivery channel alive?).
      const a = h.lastEventAgeMinutes;
      h.deliveryStatus = a === null ? "stopped" : a <= 5 ? "healthy" : a <= 30 ? "stale" : "stopped";
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
      const ownerDigits = String(owner ?? "").replace(/\D/g, "");
      if (ownerDigits.length >= 6) connectedDigitsByInstance[cfg.instanceName] = ownerDigits;
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

  // ── numbersInvolved: the three numbers that get confused in this flow ──
  const numbersInvolved = await buildNumbersInvolved(
    expectedInstance ? (connectedDigitsByInstance[expectedInstance] ?? null) : null,
    expectedInstance ? (instances.find((i) => i.instanceName === expectedInstance)?.connectedNumberMasked ?? null) : null,
  );

  return {
    generatedAt: now.toISOString(),
    expectedWebhookUrl,
    expectedInstance,
    numbersInvolved,
    instances,
  };
}

/**
 * Compare the instance's connected number against the authorized operator and the
 * last number that tried /build — all masked. The full numbers never leave here;
 * the digit comparison is done server-side with Brazilian 9th-digit tolerance.
 */
async function buildNumbersInvolved(
  connectedDigits: string | null,
  connectedNumberMasked: string | null,
): Promise<NumbersInvolved> {
  let authorizedOperatorMasked: string | null = null;
  let operatorPhone: string | null = null;
  let activeOperatorCount = 0;
  let lastBuildAttemptMasked: string | null = null;

  try {
    const [activeSenders, lastBuildTrace] = await Promise.all([
      prisma.buildAuthorizedSender.findMany({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { phone: true } }),
      prisma.buildWebhookTrace.findFirst({ where: { prefixDetected: { in: BUILD_PREFIXES } }, orderBy: { createdAt: "desc" }, select: { maskedPhone: true } }),
    ]);
    activeOperatorCount = activeSenders.length;
    operatorPhone = activeSenders[0]?.phone ?? null;
    authorizedOperatorMasked = operatorPhone ? maskNumber(operatorPhone) : null;
    lastBuildAttemptMasked = lastBuildTrace?.maskedPhone ?? null;
  } catch {
    /* tolerate */
  }

  // Compare connected vs operator with 9th-digit tolerance.
  let connectedMatchesOperator: boolean | null = null;
  if (connectedDigits && operatorPhone) {
    const opNorm = normalizeSenderPhone(operatorPhone);
    const connNorm = normalizeSenderPhone(`+${connectedDigits}`);
    if (opNorm && connNorm) {
      const opVariants = new Set(phoneVariants(opNorm));
      connectedMatchesOperator = Array.from(phoneVariants(connNorm)).some((v) => opVariants.has(v));
    }
  }

  let verdict: string;
  let guidance: string;
  if (connectedMatchesOperator === true) {
    verdict = "O número conectado na instância COINCIDE com o operador autorizado.";
    guidance = "Os números batem. Se ainda não chega, o problema é entrega Evolution → Foocci (veja o status de entrega abaixo).";
  } else if (connectedMatchesOperator === false) {
    verdict = `O número conectado na instância (${connectedNumberMasked ?? "—"}) é DIFERENTE do operador autorizado (${authorizedOperatorMasked ?? "—"}).`;
    guidance = `Envie /build a partir do número AUTORIZADO (${authorizedOperatorMasked ?? "—"}) PARA o WhatsApp conectado nesta instância (${connectedNumberMasked ?? "—"}). Se você digita /build no próprio aparelho conectado (${connectedNumberMasked ?? "—"}) numa conversa com outra pessoa, ele chega como fromMe e o operador passa a ser ${connectedNumberMasked ?? "—"}, que não é o autorizado.`;
  } else {
    verdict = "Não foi possível comparar os números (conectado ou operador desconhecido).";
    guidance = "Garanta que há um operador autorizado e que a instância está conectada para comparar os números.";
  }

  return {
    connectedNumberMasked,
    authorizedOperatorMasked,
    lastBuildAttemptMasked,
    activeOperatorCount,
    connectedMatchesOperator,
    verdict,
    guidance,
  };
}
