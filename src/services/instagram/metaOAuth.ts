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
    return { accessToken: body.access_token };
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
  const creds = getMetaAppCreds();
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
  const creds = getMetaAppCreds();
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
  if (!page.hasInstagram || !page.instagramBusinessAccountId) {
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
    },
  });
  if (!result.ok) return { ok: false, view: null, reason: result.error ?? "Não foi possível salvar a configuração." };

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
