/**
 * Meta / Instagram one-click connect — OAuth orchestration.
 *
 * Flow: start → Meta dialog → callback (exchange code, list pages) → select page
 * → save InstagramChannelConfig (RECEIVE_ONLY, encrypted token). The CSRF `state`
 * is single-use and short-lived; the user access token is stored ENCRYPTED only
 * between callback and selection; Page candidates persisted WITHOUT tokens.
 * Nothing here sends a Direct, creates an order/Pix, or stores a token in plaintext.
 *
 * The Graph client is injectable so tests never hit the network.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { upsertInstagramConfig, getInstagramConfig, toView, type InstagramConfigView } from "./InstagramConfigService";

const GRAPH_VERSION = "v21.0";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Permissions requested in the OAuth dialog (final set may depend on App Review). */
export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_messaging",
] as const;

export interface MetaAppCreds { appId: string; appSecret: string }

/** Reads the Meta app credentials from env (META_* preferred, FACEBOOK_* fallback). */
export function getMetaAppCreds(): MetaAppCreds | null {
  const appId = process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.META_APP_SECRET ?? process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isMetaConnectConfigured(): boolean {
  return getMetaAppCreds() !== null;
}

/**
 * A MESMA leitura, respeitando **banco primeiro, ambiente depois**.
 *
 * Igual ao caso do Instagram Login: este era um dos três pontos que liam `process.env`
 * direto e furavam a precedência de `MetaAppCredentialsService` (achado 1 do raio-x de
 * 05/08). Rotacionar o segredo pela tela `/admin/meta` sem tocar no Railway deixava
 * este caminho de OAuth com a credencial velha — e ele falharia calado, na renovação
 * seguinte, sem log óbvio. O fallback para o env continua, então nada que funciona
 * hoje deixa de funcionar.
 */
export async function resolveMetaAppCreds(): Promise<MetaAppCreds | null> {
  try {
    const { MetaAppCredentialsService } = await import("@/services/meta/MetaAppCredentialsService");
    const r = await MetaAppCredentialsService.getResolved();
    if (r.appId && r.appSecret) return { appId: r.appId, appSecret: r.appSecret };
  } catch {
    // Banco fora do ar não pode impedir um OAuth que o env já sustentava.
  }
  return getMetaAppCreds();
}

/** Exactly which env vars are missing for one-click connect (names only, never values). */
export interface MetaEnvStatus {
  metaAppIdConfigured: boolean;
  metaAppSecretConfigured: boolean;
  publicBaseUrlConfigured: boolean;
  publicBaseUrl: string | null;
  usesLocalhostInProduction: boolean;
  oauthReady: boolean;
  missing: string[];
}

export function getMetaEnvStatus(originFallback?: string): MetaEnvStatus {
  const appIdOk = !!(process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID);
  const appSecretOk = !!(process.env.META_APP_SECRET ?? process.env.FACEBOOK_APP_SECRET);
  const base = getPublicBaseUrl(originFallback);
  const missing: string[] = [];
  if (!appIdOk) missing.push("META_APP_ID");
  if (!appSecretOk) missing.push("META_APP_SECRET");
  if (!base.configured) missing.push("FOOCCI_BASE_URL=https://foocci.com.br");
  return {
    metaAppIdConfigured: appIdOk,
    metaAppSecretConfigured: appSecretOk,
    publicBaseUrlConfigured: base.configured,
    publicBaseUrl: base.url,
    usesLocalhostInProduction: base.usesLocalhostInProduction,
    oauthReady: appIdOk && appSecretOk && base.url !== null,
    missing,
  };
}

/** A discovered Facebook Page + its connected Instagram (token kept internal only). */
export interface PageCandidate {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
  hasInstagram: boolean;
}

/** Candidate as persisted/returned to the UI — NEVER includes a token. */
export type PublicPageCandidate = Omit<PageCandidate, "pageAccessToken">;

function strip(c: PageCandidate): PublicPageCandidate {
  const { pageAccessToken: _t, ...rest } = c;
  return rest;
}

// ── Graph client (injectable) ────────────────────────────────────────────────
export interface MetaGraph {
  exchangeCode(input: { code: string; redirectUri: string; creds: MetaAppCreds }): Promise<{ accessToken: string }>;
  listPages(userAccessToken: string): Promise<PageCandidate[]>;
}

/**
 * Exchanges a short-lived user token (~1–2h) for a long-lived one (~60 days) via
 * `grant_type=fb_exchange_token`. Returns null on any failure so the caller can
 * fall back to the short-lived token (connection still works, just briefly).
 */
async function exchangeForLongLivedToken(shortToken: string, creds: MetaAppCreds): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
    + `?grant_type=fb_exchange_token`
    + `&client_id=${encodeURIComponent(creds.appId)}`
    + `&client_secret=${encodeURIComponent(creds.appSecret)}`
    + `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
  try {
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as { access_token?: string };
    return res.ok && body.access_token ? body.access_token : null;
  } catch {
    return null;
  }
}

/**
 * Subscribes a Facebook Page to Messenger webhook fields so inbound Page DMs are
 * delivered to our webhook (POST /{page-id}/subscribed_apps). Uses the Page access
 * token. Best-effort: returns false on any failure (the caller treats it as non-fatal).
 */
async function subscribePageToMessenger(pageId: string, pageAccessToken: string): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/subscribed_apps`
      + `?subscribed_fields=${encodeURIComponent("messages,messaging_postbacks,message_echoes")}`
      + `&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: unknown };
    return res.ok && body.success !== false;
  } catch {
    return false;
  }
}

export const realMetaGraph: MetaGraph = {
  async exchangeCode({ code, redirectUri, creds }) {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
      + `?client_id=${encodeURIComponent(creds.appId)}`
      + `&client_secret=${encodeURIComponent(creds.appSecret)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&code=${encodeURIComponent(code)}`;
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || body.error || !body.access_token) {
      throw new Error(body.error?.message ?? `Troca de código falhou (HTTP ${res.status})`);
    }
    // The code grant returns a SHORT-lived user token; the Page tokens derived
    // from it (via me/accounts) inherit that ~1–2h lifetime and the connection
    // dies almost immediately. Upgrade to a long-lived user token first so the
    // derived Page tokens are long-lived (~60 days) too.
    const longLived = await exchangeForLongLivedToken(body.access_token, creds);
    return { accessToken: longLived ?? body.access_token };
  },
  async listPages(userAccessToken) {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
      + `?fields=${encodeURIComponent("id,name,access_token,instagram_business_account{id,username}")}`
      + `&access_token=${encodeURIComponent(userAccessToken)}`;
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } }[];
      error?: { message?: string };
    };
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `Falha ao listar páginas (HTTP ${res.status})`);
    return (body.data ?? []).map((p) => ({
      pageId: p.id,
      pageName: p.name ?? p.id,
      pageAccessToken: p.access_token ?? "",
      instagramBusinessAccountId: p.instagram_business_account?.id ?? null,
      instagramUsername: p.instagram_business_account?.username ?? null,
      hasInstagram: !!p.instagram_business_account?.id,
    }));
  },
};

// ── Auth URL ─────────────────────────────────────────────────────────────────
export function buildAuthUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// ── Start ────────────────────────────────────────────────────────────────────
export interface StartResult {
  ok: boolean;
  authUrl?: string;
  blocked?: "BLOCKED_BY_META_APP_ENV" | "PUBLIC_BASE_URL_NOT_CONFIGURED";
  missing?: string[];
  error?: string;
}

export async function startMetaConnect(input: { restaurantId: string; userId: string; redirectUri: string | null; returnPlatform?: string }): Promise<StartResult> {
  const creds = await resolveMetaAppCreds();
  if (!creds) return { ok: false, blocked: "BLOCKED_BY_META_APP_ENV", missing: getMetaEnvStatus().missing };
  // Never build an OAuth dialog pointing at a broken/localhost redirect URI.
  const redirectUri = input.redirectUri;
  if (!redirectUri) {
    return { ok: false, blocked: "PUBLIC_BASE_URL_NOT_CONFIGURED", missing: ["FOOCCI_BASE_URL=https://foocci.com.br"] };
  }

  const state = randomBytes(24).toString("hex");
  await prisma.metaOAuthState.create({
    data: {
      restaurantId: input.restaurantId,
      userId: input.userId,
      state,
      status: "PENDING",
      returnPlatform: input.returnPlatform ?? "instagram",
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  return { ok: true, authUrl: buildAuthUrl({ appId: creds.appId, redirectUri, state }) };
}

// ── Callback ─────────────────────────────────────────────────────────────────
export interface CallbackResult {
  ok: boolean;
  restaurantId: string | null;
  candidateCount: number;
  reason: string | null;
  returnPlatform: string | null;
}

export async function handleMetaCallback(
  input: { state: string; code?: string | null; error?: string | null; redirectUri: string | null },
  graph: MetaGraph = realMetaGraph,
): Promise<CallbackResult> {
  if (!input.state) return { ok: false, restaurantId: null, candidateCount: 0, reason: "state ausente", returnPlatform: null };
  const row = await prisma.metaOAuthState.findUnique({ where: { state: input.state } });
  if (!row || row.status !== "PENDING") return { ok: false, restaurantId: null, candidateCount: 0, reason: "Sessão de conexão inválida ou já usada.", returnPlatform: null };
  const platform = (row as { returnPlatform?: string | null }).returnPlatform ?? "instagram";
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: "expirado" } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, candidateCount: 0, reason: "A conexão expirou. Tente novamente.", returnPlatform: platform };
  }
  if (input.error) {
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: input.error.slice(0, 300) } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, candidateCount: 0, reason: "Autorização cancelada na Meta.", returnPlatform: platform };
  }
  const creds = await resolveMetaAppCreds();
  if (!creds || !input.code || !input.redirectUri) {
    return { ok: false, restaurantId: row.restaurantId, candidateCount: 0, reason: "Configuração da Meta ausente.", returnPlatform: platform };
  }

  try {
    const { accessToken } = await graph.exchangeCode({ code: input.code, redirectUri: input.redirectUri, creds });
    const candidates = await graph.listPages(accessToken);
    await prisma.metaOAuthState.update({
      where: { id: row.id },
      data: {
        status: "AWAITING_SELECTION",
        userAccessTokenEncrypted: encrypt(accessToken),
        candidates: candidates.map(strip) as object,
      },
    });
    return { ok: true, restaurantId: row.restaurantId, candidateCount: candidates.length, reason: null, returnPlatform: platform };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "erro ao conectar com a Meta";
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: reason } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, candidateCount: 0, reason, returnPlatform: platform };
  }
}

// ── Candidates (for the page-selection UI) ───────────────────────────────────
async function latestSelectionState(restaurantId: string) {
  return prisma.metaOAuthState.findFirst({
    where: { restaurantId, status: "AWAITING_SELECTION", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCandidates(restaurantId: string): Promise<PublicPageCandidate[]> {
  const row = await latestSelectionState(restaurantId);
  const list = Array.isArray(row?.candidates) ? (row!.candidates as unknown as PublicPageCandidate[]) : [];
  return list;
}

// ── Select page ──────────────────────────────────────────────────────────────
export interface SelectResult {
  ok: boolean;
  view: InstagramConfigView | null;
  reason: string | null;
}

export async function selectPage(
  input: { restaurantId: string; pageId: string },
  graph: MetaGraph = realMetaGraph,
): Promise<SelectResult> {
  const row = await latestSelectionState(input.restaurantId);
  if (!row || !row.userAccessTokenEncrypted) return { ok: false, view: null, reason: "Nenhuma conexão pendente. Conecte com o Facebook novamente." };

  const candidates = Array.isArray(row.candidates) ? (row.candidates as unknown as PublicPageCandidate[]) : [];
  if (!candidates.some((c) => c.pageId === input.pageId)) {
    return { ok: false, view: null, reason: "Página inválida para esta conexão." };
  }

  let userToken: string;
  try { userToken = decrypt(row.userAccessTokenEncrypted); }
  catch { return { ok: false, view: null, reason: "Token de conexão indisponível. Conecte novamente." }; }

  // Re-fetch fresh page tokens (never persisted in candidates).
  let page: PageCandidate | undefined;
  try {
    const pages = await graph.listPages(userToken);
    page = pages.find((p) => p.pageId === input.pageId);
  } catch (err) {
    return { ok: false, view: null, reason: err instanceof Error ? err.message.slice(0, 200) : "Falha ao buscar a Página." };
  }
  if (!page || !page.pageAccessToken) return { ok: false, view: null, reason: "Não consegui obter o acesso desta Página." };

  // The Facebook/Messenger flow (returnPlatform="facebook") connects a Page for Messenger
  // DMs and does NOT require a linked Instagram account. The Instagram flow still does.
  const platform = (row as { returnPlatform?: string | null }).returnPlatform ?? "instagram";
  const isMessenger = platform === "facebook";
  if (!isMessenger && (!page.hasInstagram || !page.instagramBusinessAccountId)) {
    return { ok: false, view: null, reason: "Esta Página não possui Instagram profissional conectado." };
  }

  const result = await upsertInstagramConfig(input.restaurantId, {
    facebookPageId: page.pageId,
    instagramBusinessAccountId: page.instagramBusinessAccountId,
    pageAccessToken: page.pageAccessToken,
    mode: "RECEIVE_ONLY",
    scope: "TEST_ACCOUNT_ONLY",
    enabled: true,
    paused: false,
    metadata: {
      connectedVia: "oauth",
      connectedAt: new Date().toISOString(),
      facebookPageName: page.pageName,
      instagramUsername: page.instagramUsername,
      platform,
    },
  });
  if (!result.ok) return { ok: false, view: null, reason: result.error ?? "Não foi possível salvar a configuração." };

  // Subscribe the Page to Messenger webhook fields so inbound DMs reach our webhook.
  // Best-effort: a failure must NOT block the connection (it can be re-run / set in the
  // Meta App Dashboard). Instagram-linked Pages benefit from this too.
  try { await subscribePageToMessenger(page.pageId, page.pageAccessToken); } catch { /* non-fatal */ }

  // Consume the state and wipe the stored user token.
  await prisma.metaOAuthState.update({
    where: { id: row.id }, data: { status: "CONSUMED", userAccessTokenEncrypted: null },
  }).catch(() => undefined);

  return { ok: true, view: result.view ?? null, reason: null };
}

// ── Disconnect ───────────────────────────────────────────────────────────────
export interface DisconnectResult { ok: boolean; conversationsPreserved: true }

/**
 * Disconnects the Meta/Instagram integration: pauses + disables, clears the
 * stored Page token, keeps the config row. Customer/Conversation/Message are
 * NEVER touched — conversation history is preserved.
 */
export async function disconnectMeta(restaurantId: string): Promise<DisconnectResult> {
  const existing = await getInstagramConfig(restaurantId);
  if (existing) {
    await prisma.instagramChannelConfig.update({
      where: { restaurantId },
      data: {
        enabled: false,
        paused: true,
        mode: "DISABLED",
        pageAccessTokenEncrypted: null, // wipe token — history preserved
        metadata: { ...(existing.metadata ?? {}), connectedVia: null, disconnectedAt: new Date().toISOString() } as object,
      },
    }).catch(() => undefined);
  }
  // Invalidate any pending OAuth states for this restaurant.
  await prisma.metaOAuthState.updateMany({
    where: { restaurantId, status: { in: ["PENDING", "AWAITING_SELECTION"] } },
    data: { status: "CONSUMED", userAccessTokenEncrypted: null },
  }).catch(() => undefined);

  return { ok: true, conversationsPreserved: true };
}

/**
 * OAuth redirect URI from the PUBLIC base URL (never localhost in production).
 * Returns null when the public base URL is not configured in production.
 */
export function metaRedirectUri(origin: string): string | null {
  const base = getPublicBaseUrl(origin);
  if (!base.url) return null;
  return `${base.url}/api/integrations/meta/oauth/callback`;
}
