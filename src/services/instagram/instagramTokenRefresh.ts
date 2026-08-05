/**
 * instagramTokenRefresh — keeps Instagram long-lived tokens alive.
 *
 * Instagram user tokens last ~60 days. Without refreshing they silently expire and inbound
 * DMs stop arriving (the root cause of the July outage). This refreshes tokens BEFORE they
 * expire (default: within 10 days of expiry, or unknown/short expiry) via ig_refresh_token,
 * and stores the new token + expiry. Idempotent and best-effort — never throws.
 */

import { prisma } from "@/lib/prisma";
import { getInstagramConfig, decryptPageToken, upsertInstagramConfig } from "./InstagramConfigService";
import { refreshInstagramLongLivedToken } from "./instagramLoginOAuth";

export interface RefreshOneResult {
  restaurantId: string;
  refreshed:    boolean;
  reason?:      string;
  newExpiresAt?: string | null;
}

/** Refresh the token for one restaurant and persist the new token + expiry. */
export async function refreshInstagramTokenForRestaurant(restaurantId: string): Promise<RefreshOneResult> {
  const row = await getInstagramConfig(restaurantId);
  if (!row) return { restaurantId, refreshed: false, reason: "no config" };
  const token = decryptPageToken(row);
  if (!token) return { restaurantId, refreshed: false, reason: "no token" };

  const res = await refreshInstagramLongLivedToken(token);
  if (!res.ok || !res.token) {
    // Record the failure so a dead token is visible instead of silently expiring.
    await prisma.instagramChannelConfig.update({
      where: { restaurantId }, data: { lastError: `token refresh: ${res.error ?? "falhou"}` },
    }).catch(() => {});
    return { restaurantId, refreshed: false, reason: res.error ?? "refresh failed" };
  }

  const newExpiresAt = res.expiresInSeconds ? new Date(Date.now() + res.expiresInSeconds * 1000).toISOString() : null;
  await upsertInstagramConfig(restaurantId, {
    pageAccessToken: res.token,
    metadata: { tokenExpiresAt: newExpiresAt },
  });
  await prisma.instagramChannelConfig.update({ where: { restaurantId }, data: { lastError: null } }).catch(() => {});
  return { restaurantId, refreshed: true, newExpiresAt };
}

/**
 * Refresh every Instagram token that expires within `withinDays` (or whose expiry is
 * unknown). Instagram allows refreshing a token that is ≥24h old and not yet expired, so
 * running this daily keeps every connection alive indefinitely.
 */
export interface RefreshSweepResult {
  checked:   number;
  refreshed: number;
  results:   RefreshOneResult[];
  /** Every Instagram config that exists, enabled or not. */
  totalConfigs: number;
  /** Configs that exist but were skipped — enabled=false, or no stored token. */
  ineligible: Array<{ restaurantId: string; reason: string }>;
  /**
   * Canais LIGADOS que não recebem evento nenhum há dias. O sweep só olhava o token —
   * e o token não é o único jeito de um canal morrer. Entre 23/07 e 04/08 este canal
   * ficou treze dias mudo e quem percebeu foi o CEO, não a máquina. Silêncio prolongado
   * num canal ligado é, no mínimo, uma pergunta que alguém tem de responder.
   */
  silent: Array<{ restaurantId: string; lastWebhookAt: string | null; days: number | null }>;
  /**
   * True when this run deserves a human. The daily job used to answer
   * `{checked:0, refreshed:0}` with HTTP 200 and the workflow printed "✅ executado" —
   * an alarm that never fires. A restaurant whose token died drops out of the query
   * (enabled=false / token cleared), so the very failure the job exists to prevent
   * makes the job go quiet. That is guardrail 2 inverted: forgetting a gate must never
   * read as "approved".
   */
  needsAttention: boolean;
  /** Why attention is needed — the alert carries its own evidence (guardrail 6). */
  attention: string[];
}

/** A partir de quantos dias sem NENHUM evento um canal ligado vira pergunta para humano. */
export const SILENCE_ALERT_DAYS = 3;

export async function refreshExpiringInstagramTokens(withinDays = 10): Promise<RefreshSweepResult> {
  const all = await prisma.instagramChannelConfig.findMany({
    select: { restaurantId: true, metadata: true, enabled: true, pageAccessTokenEncrypted: true, lastError: true, lastWebhookAt: true },
  }).catch(() => [] as Array<{ restaurantId: string; metadata: unknown; enabled: boolean; pageAccessTokenEncrypted: string | null; lastError: string | null; lastWebhookAt: Date | null }>);

  const rows       = all.filter((r) => r.enabled && r.pageAccessTokenEncrypted);
  const ineligible = all
    .filter((r) => !r.enabled || !r.pageAccessTokenEncrypted)
    .map((r) => ({
      restaurantId: r.restaurantId,
      reason: !r.enabled
        ? `canal desabilitado${r.lastError ? ` — último erro: ${r.lastError.slice(0, 120)}` : ""}`
        : "sem token guardado — precisa de reconexão manual pelo dono",
    }));

  const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
  const results: RefreshOneResult[] = [];

  for (const row of rows) {
    const meta = (row.metadata && typeof row.metadata === "object") ? (row.metadata as Record<string, unknown>) : {};
    const expRaw = typeof meta.tokenExpiresAt === "string" ? meta.tokenExpiresAt : null;
    const expMs  = expRaw ? Date.parse(expRaw) : NaN;
    // Refresh when: expiry unknown, unparseable, or within the window. (An already-expired
    // token can't be refreshed — it needs a reconnect — but we still attempt and record it.)
    const due = !Number.isFinite(expMs) || expMs <= cutoff;
    if (!due) continue;
    results.push(await refreshInstagramTokenForRestaurant(row.restaurantId));
  }

  // Canal ligado e mudo. Não olha o token: olha se ALGUMA coisa chegou.
  const agora = Date.now();
  const silent = all
    .filter((r) => r.enabled)
    .map((r) => {
      const meta = (r.metadata && typeof r.metadata === "object") ? (r.metadata as Record<string, unknown>) : {};
      // Nunca recebeu nada? Então a régua é desde QUANDO foi conectado. Sem essa
      // referência não dá para dizer se o silêncio é longo — e ausência de informação
      // não é informação (guardrail 1): fica quieto em vez de alarmar no escuro.
      const conectado = typeof meta.connectedAt === "string" ? Date.parse(meta.connectedAt) : NaN;
      const referencia = r.lastWebhookAt ? r.lastWebhookAt.getTime() : (Number.isFinite(conectado) ? conectado : null);
      return {
        restaurantId: r.restaurantId,
        lastWebhookAt: r.lastWebhookAt ? r.lastWebhookAt.toISOString() : null,
        days: referencia === null ? null : Math.floor((agora - referencia) / (24 * 60 * 60 * 1000)),
        lastError: r.lastError,
      };
    })
    .filter((r) => r.days !== null && r.days >= SILENCE_ALERT_DAYS);

  const attention: string[] = [];
  for (const bad of ineligible) {
    attention.push(`Instagram do restaurante ${bad.restaurantId} não está sendo renovado: ${bad.reason}.`);
  }
  for (const r of results) {
    if (!r.refreshed) {
      attention.push(`Renovação falhou para ${r.restaurantId}: ${r.reason ?? "motivo não informado"}.`);
    }
  }
  // Guardrail 6: o alerta carrega a evidência — desde quando, quantos dias, e o último erro.
  for (const s of silent) {
    const desde = s.lastWebhookAt
      ? `desde ${s.lastWebhookAt} (${s.days} dias)`
      : `há ${s.days} dias — nunca recebeu nada desde que foi conectado`;
    const erro = s.lastError ? ` Último erro registrado: ${s.lastError.slice(0, 160)}` : "";
    attention.push(
      `Instagram do restaurante ${s.restaurantId} está LIGADO e MUDO ${desde}.`
      + ` Pode ser ausência real de mensagens, mas depois de ${SILENCE_ALERT_DAYS} dias alguém precisa olhar:`
      + ` confira o card Diagnóstico e o graph-check.${erro}`,
    );
  }

  return {
    checked:   rows.length,
    refreshed: results.filter((r) => r.refreshed).length,
    results,
    totalConfigs: all.length,
    ineligible,
    silent: silent.map(({ restaurantId, lastWebhookAt, days }) => ({ restaurantId, lastWebhookAt, days })),
    needsAttention: attention.length > 0,
    attention,
  };
}
