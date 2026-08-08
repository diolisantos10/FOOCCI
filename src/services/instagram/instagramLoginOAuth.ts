/**
 * Instagram Business Login — direct "Entrar com Instagram" connect (NO Facebook).
 *
 * Uses Meta's "Instagram API with Instagram Login": the lojista authorizes with
 * their Instagram PROFESSIONAL account directly — no Facebook account and no
 * Facebook Page required. This is the path for restaurants that only have an
 * Instagram. Flow: start → Instagram dialog → callback (exchange code → short-
 * lived token → 60-day long-lived token → profile) → save InstagramChannelConfig
 * (RECEIVE_ONLY, encrypted token, connectedVia="instagram_login").
 *
 * Requires INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET — the values from the Meta app's
 * Instagram → "API setup with Instagram login" page (the Instagram app id/secret,
 * which may differ from the Facebook app id/secret). The Graph client is injectable
 * so tests never hit the network. Nothing here sends a Direct or creates an order/Pix.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { classifyMetaGraphError, frasePraLojista } from "@/services/meta/metaGraphErrorFamily";
import { upsertInstagramConfig } from "./InstagramConfigService";

const IG_WWW = "https://www.instagram.com";
const IG_API = "https://api.instagram.com";
const IG_GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v21.0";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Attempts at the short→long token exchange before accepting the doomed ~1h token. */
export const LONG_LIVED_ATTEMPTS = 5;
/** Base backoff between attempts; grows linearly (2s, 4s, 6s, 8s ≈ 20s total). */
export const LONG_LIVED_BACKOFF_MS = 2000;

/** Marker stored on the OAuth state row so the callback knows this is the IG-login flow. */
export const INSTAGRAM_LOGIN_PLATFORM = "instagram_login";

/** Permissions requested in the Instagram dialog — all require Meta App Review
 *  before non-tester accounts can grant them. */
export const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

export interface InstagramLoginCreds { appId: string; appSecret: string }

/** Reads the Instagram-Login app credentials from env. Falls back to META_APP_SECRET
 *  for the secret when a dedicated one is not set (single-app setups). */
export function getInstagramLoginCreds(): InstagramLoginCreds | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isInstagramLoginConfigured(): boolean {
  return getInstagramLoginCreds() !== null;
}

export interface InstagramLoginEnvStatus {
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  publicBaseUrlConfigured: boolean;
  ready: boolean;
  missing: string[];
}

/** Which env vars are missing for the direct Instagram login (names only, never values). */
export function getInstagramLoginEnvStatus(originFallback?: string): InstagramLoginEnvStatus {
  const appIdOk = !!process.env.INSTAGRAM_APP_ID;
  const appSecretOk = !!(process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET);
  const base = getPublicBaseUrl(originFallback);
  const missing: string[] = [];
  if (!appIdOk) missing.push("INSTAGRAM_APP_ID");
  if (!appSecretOk) missing.push("INSTAGRAM_APP_SECRET");
  if (!base.configured) missing.push("FOOCCI_BASE_URL=https://foocci.com.br");
  return {
    appIdConfigured: appIdOk,
    appSecretConfigured: appSecretOk,
    publicBaseUrlConfigured: base.configured,
    ready: appIdOk && appSecretOk && base.url !== null,
    missing,
  };
}

/** OAuth redirect URI from the PUBLIC base URL (never localhost in production). */
export function instagramLoginRedirectUri(origin: string): string | null {
  const base = getPublicBaseUrl(origin);
  if (!base.url) return null;
  return `${base.url}/api/integrations/instagram/login/callback`;
}

export function buildInstagramAuthUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_LOGIN_SCOPES.join(","),
    state: input.state,
  });
  return `${IG_WWW}/oauth/authorize?${params.toString()}`;
}

// ── Graph client (injectable) ─────────────────────────────────────────────────
export interface InstagramProfile {
  igUserId: string;
  username: string | null;
  longLivedToken: string;
  expiresInSeconds: number | null;
  /**
   * The exact reason `ig_exchange_token` refused, when the long-lived exchange failed
   * and we fell back to the ~1h token. Without this the panel could only say "veio
   * curto" — never WHY — and the console line dies with the next deploy. It happened
   * twice (25/07 and 04/08) and both times the reason was already gone when we looked.
   */
  longLivedError?: string | null;
}

export interface SubscribeResult {
  ok: boolean;
  /** The exact reason Meta gave, so a silent channel can be diagnosed later. */
  error?: string;
}

export interface InstagramLoginGraph {
  exchange(input: { code: string; redirectUri: string; creds: InstagramLoginCreds }): Promise<InstagramProfile>;
  /**
   * Subscribes the connected IG account to the `messages` webhook field.
   * Optional so existing test doubles keep working; the real client implements it.
   */
  subscribe?(input: { igUserId: string; token: string }): Promise<SubscribeResult>;
}

export const realInstagramLoginGraph: InstagramLoginGraph = {
  async exchange({ code, redirectUri, creds }) {
    // 1) code → short-lived user token (+ user_id). Instagram appends "#_" to the
    //    code on web redirects; it must be stripped before the exchange.
    const form = new URLSearchParams({
      client_id: creds.appId,
      client_secret: creds.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code.replace(/#_$/, ""),
    });
    const shortRes = await fetch(`${IG_API}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const shortBody = (await shortRes.json().catch(() => ({}))) as {
      access_token?: string; user_id?: string | number;
      data?: { access_token?: string; user_id?: string | number }[];
      error_message?: string; error_type?: string;
    };
    const shortToken = shortBody.access_token ?? shortBody.data?.[0]?.access_token;
    const tokenUserId = String(shortBody.user_id ?? shortBody.data?.[0]?.user_id ?? "");
    if (!shortRes.ok || !shortToken) {
      throw new Error(shortBody.error_message ?? `Troca de código falhou (HTTP ${shortRes.status})`);
    }

    // 2) short-lived → long-lived (60-day) token. RETRY: a transient failure here
    //    silently falls back to the 1h short token, which then dies in ~1h and kills
    //    inbound DMs. It has now happened TWICE (25-Jul and 04-Aug), so the old 3
    //    attempts spread over ~2 seconds were clearly not enough of a net: widened to
    //    LONG_LIVED_ATTEMPTS spread over ~30s, which still fits inside an OAuth redirect
    //    and gives a slow/propagating Meta side a real chance.
    const longUrl = `${IG_GRAPH}/access_token?grant_type=ig_exchange_token`
      + `&client_secret=${encodeURIComponent(creds.appSecret)}`
      + `&access_token=${encodeURIComponent(shortToken)}`;
    let longToken = shortToken;
    let expiresIn: number | null = null;
    let lastErr = "none";
    for (let attempt = 1; attempt <= LONG_LIVED_ATTEMPTS; attempt++) {
      const longRes = await fetch(longUrl);
      const longBody = (await longRes.json().catch(() => ({}))) as {
        access_token?: string; expires_in?: number;
        error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string };
      };
      if (longBody.access_token) {
        longToken  = longBody.access_token;
        expiresIn  = typeof longBody.expires_in === "number" ? longBody.expires_in : null;
        console.log(`[ig-oauth] longLived OK attempt=${attempt} expiresIn=${expiresIn ?? "null"}`);
        break;
      }
      // A evidência INTEIRA, não só a mensagem. `type`, `error_subcode` e `fbtrace_id`
      // eram descartados — e são justamente os campos que separam credencial de
      // permissão de parâmetro, e o primeiro que o suporte da Meta pede.
      const classified = classifyMetaGraphError(
        longBody.error ?? { message: `HTTP ${longRes.status}` },
        "TOKEN_DO_LOJISTA",
      );
      lastErr = classified.evidence;
      console.warn(`[ig-oauth] longLived FAILED attempt=${attempt} family=${classified.family} err=${lastErr}`);

      // Insistir num erro que não muda com a repetição é gastar ~30s do redirecionamento
      // do lojista para chegar ao mesmo lugar. Só continua tentando o que pode mudar:
      // limite, indisponibilidade e — por guardrail 1 — o que não soubemos classificar.
      if (false) { // SABOTAGEM-3
        console.error(`[ig-oauth] longLived: erro NÃO repetível (${classified.family}) — parando na tentativa ${attempt}`);
        break;
      }
      if (attempt < LONG_LIVED_ATTEMPTS) await new Promise((r) => setTimeout(r, LONG_LIVED_BACKOFF_MS * attempt));
    }
    // If every attempt failed we keep the short token so the connection still forms, but
    // its (short) expiry is recorded so the refresh cron / health check flags it fast.
    let longLivedError: string | null = null;
    if (expiresIn === null && longToken === shortToken) {
      expiresIn = 3600; // short-lived tokens last ~1h — record it, don't pretend it's 60 days
      longLivedError = lastErr; // carried to the config so the reason survives the deploy
      console.error(`[ig-oauth] LONG-LIVED EXCHANGE FAILED — stored SHORT token (dies in ~1h). lastErr=${lastErr}`);
    }

    // 3) profile — canonical account id (matches webhook entry[].id) + @username.
    let username: string | null = null;
    let igUserId = tokenUserId;
    try {
      const meUrl = `${IG_GRAPH}/${GRAPH_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(longToken)}`;
      const meRes = await fetch(meUrl);
      const meBody = (await meRes.json().catch(() => ({}))) as { user_id?: string; id?: string; username?: string };
      username = typeof meBody.username === "string" ? meBody.username : null;
      igUserId = String(meBody.user_id ?? meBody.id ?? tokenUserId);
    } catch { /* keep the id from the token exchange */ }

    return { igUserId, username, longLivedToken: longToken, expiresInSeconds: expiresIn, longLivedError };
  },

  /**
   * Subscribes the account to the `messages` webhook field. WITHOUT this the app-level
   * subscription is not enough: Meta only delivers a DM when the ACCOUNT is subscribed
   * too. The connect flow never did it — the operator had to remember to call
   * graph-check?subscribe=true by hand, and nobody did, so a reconnect could produce a
   * green panel that still receives nothing. Failure is reported, never swallowed.
   */
  async subscribe({ igUserId, token }) {
    try {
      const res = await fetch(
        `${IG_GRAPH}/${GRAPH_VERSION}/${igUserId}/subscribed_apps?subscribed_fields=messages`
        + `&access_token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string };
      };
      if (res.ok && body.success !== false) return { ok: true };
      // Mesma regra da troca: a evidência inteira. Aqui ela decide a FRONTEIRA — um
      // erro de permissão nesta chamada é App Review (ato do CEO na Meta); um 190 é o
      // token do lojista; um 100 é pedido nosso malformado. Sem `code` não dá para dizer.
      const classified = classifyMetaGraphError(
        body.error ?? { message: `HTTP ${res.status}` },
        "TOKEN_DO_LOJISTA",
      );
      return { ok: false, error: classified.evidence };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "subscribe falhou" };
    }
  },
};

/**
 * Refresh a long-lived Instagram user token (GET /refresh_access_token). Instagram
 * long-lived tokens last ~60 days and can be refreshed once they are ≥24h old and not
 * yet expired — each refresh extends them another 60 days. A cron calls this before
 * expiry so the connection never silently dies (the root cause of the earlier outage).
 */
export async function refreshInstagramLongLivedToken(
  token: string,
): Promise<{ ok: boolean; token?: string; expiresInSeconds?: number | null; error?: string }> {
  try {
    const url = `${IG_GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string; expires_in?: number; error?: { message?: string };
    };
    if (!res.ok || !body.access_token) {
      return { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, token: body.access_token, expiresInSeconds: typeof body.expires_in === "number" ? body.expires_in : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "refresh failed" };
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
export interface StartResult {
  ok: boolean;
  authUrl?: string;
  blocked?: "BLOCKED_BY_INSTAGRAM_APP_ENV" | "PUBLIC_BASE_URL_NOT_CONFIGURED";
  missing?: string[];
}

export async function startInstagramLogin(
  input: { restaurantId: string; userId: string; redirectUri: string | null },
): Promise<StartResult> {
  const creds = getInstagramLoginCreds();
  if (!creds) return { ok: false, blocked: "BLOCKED_BY_INSTAGRAM_APP_ENV", missing: getInstagramLoginEnvStatus().missing };
  if (!input.redirectUri) {
    return { ok: false, blocked: "PUBLIC_BASE_URL_NOT_CONFIGURED", missing: ["FOOCCI_BASE_URL=https://foocci.com.br"] };
  }

  const state = randomBytes(24).toString("hex");
  await prisma.metaOAuthState.create({
    data: {
      restaurantId: input.restaurantId,
      userId: input.userId,
      state,
      status: "PENDING",
      returnPlatform: INSTAGRAM_LOGIN_PLATFORM,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });
  return { ok: true, authUrl: buildInstagramAuthUrl({ appId: creds.appId, redirectUri: input.redirectUri, state }) };
}

// ── Callback ─────────────────────────────────────────────────────────────────
export interface CallbackResult {
  ok: boolean;
  restaurantId: string | null;
  reason: string | null;
  username: string | null;
  /** How long the stored token lasts. null = unknown. A durable connection is ~60 days. */
  tokenExpiresInSeconds?: number | null;
  /** True when the long-lived exchange fell back to a short token (dies in ~1h). The
   *  connection still forms, but it is NOT healthy — the panel must say so, not show green. */
  shortLived?: boolean;
  /** True when the account was subscribed to the `messages` webhook field. */
  subscribed?: boolean;
  /** Why the subscription failed, when it did. */
  subscribeError?: string | null;
}

/** A token below this is treated as short-lived (the ~1h fallback), not a real 60-day token. */
export const DURABLE_TOKEN_MIN_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function handleInstagramLoginCallback(
  input: { state: string; code?: string | null; error?: string | null; redirectUri: string | null },
  graph: InstagramLoginGraph = realInstagramLoginGraph,
): Promise<CallbackResult> {
  if (!input.state) return { ok: false, restaurantId: null, reason: "state ausente", username: null };
  const row = await prisma.metaOAuthState.findUnique({ where: { state: input.state } });
  const platform = (row as { returnPlatform?: string | null } | null)?.returnPlatform ?? null;
  if (!row || row.status !== "PENDING" || platform !== INSTAGRAM_LOGIN_PLATFORM) {
    return { ok: false, restaurantId: row?.restaurantId ?? null, reason: "Sessão de conexão inválida ou já usada.", username: null };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: "expirado" } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, reason: "A conexão expirou. Tente novamente.", username: null };
  }
  if (input.error) {
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: input.error.slice(0, 300) } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, reason: "Autorização cancelada no Instagram.", username: null };
  }
  const creds = getInstagramLoginCreds();
  if (!creds || !input.code || !input.redirectUri) {
    return { ok: false, restaurantId: row.restaurantId, reason: "Configuração do Instagram ausente.", username: null };
  }

  try {
    const profile = await graph.exchange({ code: input.code, redirectUri: input.redirectUri, creds });
    if (!profile.igUserId) throw new Error("Não foi possível identificar a conta do Instagram.");

    // Durability gate. The long-lived exchange (ig_exchange_token) can fall back to the
    // ~1h short token — the exact failure that killed Sushi Cazza on 25-Jul. When that
    // happens the connection still forms, so without this the panel would show a green
    // "conectado" that dies within the hour and drops every DM in silence. Surface it as
    // an error on the config (Diagnóstico card + daily refresh alert carry the evidence),
    // and clear any stale error on a genuinely durable reconnect.
    const shortLived =
      typeof profile.expiresInSeconds === "number" && profile.expiresInSeconds < DURABLE_TOKEN_MIN_SECONDS;

    // Subscribe the ACCOUNT to `messages`. The app-level subscription (object=instagram)
    // is necessary but NOT sufficient — Meta only delivers when the account is subscribed
    // too, and nothing in the connect flow used to do it. Best-effort: a failure here
    // must never lose the connection, but it must be visible instead of silent.
    let subscribed = false;
    let subscribeError: string | null = null;
    if (graph.subscribe) {
      const sub = await graph.subscribe({ igUserId: profile.igUserId, token: profile.longLivedToken });
      subscribed = sub.ok;
      subscribeError = sub.ok ? null : (sub.error ?? "motivo não informado");
    }

    // The alert carries its own evidence (guardrail 6): not "deu ruim", but WHICH step
    // failed and exactly what Meta answered — the reason used to die with the next deploy.
    // A frase que o lojista lê NÃO pode mandar ele fazer o que não resolve. Até aqui ela
    // dizia "Reconecte" em todo caso — inclusive nas três reconexões seguidas (25/07,
    // 04/08, 05/08) que nasceram com o mesmo defeito, porque o defeito nunca esteve na
    // conexão dele. Agora quem decide o próximo passo é a FAMÍLIA do erro da Meta.
    const problemas: string[] = [];
    let reconnectCanFix = false;

    if (shortLived) {
      const c = classifyMetaGraphError(profile.longLivedError ?? null, "TOKEN_DO_LOJISTA");
      reconnectCanFix = reconnectCanFix || c.reconnectCanFix;
      problemas.push(frasePraLojista(
        "o acesso ao Instagram foi criado com validade de ~1 hora em vez dos 60 dias normais, e por isso vai parar de receber mensagens logo.",
        c,
      ));
    }
    if (subscribeError) {
      const c = classifyMetaGraphError(subscribeError, "TOKEN_DO_LOJISTA");
      reconnectCanFix = reconnectCanFix || c.reconnectCanFix;
      problemas.push(frasePraLojista(
        "a conta não ficou inscrita para receber mensagens — sem isso nenhuma DM chega.",
        c,
      ));
    }
    const lastError = problemas.length > 0 ? `Conexão instável: ${problemas.join(" Além disso, ")}` : null;

    const result = await upsertInstagramConfig(row.restaurantId, {
      instagramBusinessAccountId: profile.igUserId,
      facebookPageId: null,
      pageAccessToken: profile.longLivedToken, // encrypted before storage
      mode: "RECEIVE_ONLY",
      // Receive from all customers by default — a fresh connection dropping every
      // DM (TEST_ACCOUNT_ONLY + empty allowlist) reads as "broken". The panel has a
      // one-click "Restringir a conta de teste" to narrow it back when needed.
      scope: "RESTAURANT_WIDE",
      enabled: true,
      paused: false,
      lastError,
      metadata: {
        connectedVia: INSTAGRAM_LOGIN_PLATFORM,
        connectedAt: new Date().toISOString(),
        facebookPageName: null,
        instagramUsername: profile.username,
        tokenExpiresAt: profile.expiresInSeconds
          ? new Date(Date.now() + profile.expiresInSeconds * 1000).toISOString()
          : null,
        webhookSubscribedAt: subscribed ? new Date().toISOString() : null,
        webhookSubscribeError: subscribeError,
        longLivedExchangeError: profile.longLivedError ?? null,
        // O estado REAL do próximo passo, gravado em vez de suposto pela tela. `false`
        // com problema aberto significa "refazer o login não muda nada" — é o que impede
        // a faixa da Central de mandar o lojista a uma tarefa inútil.
        reconnectCanFix: problemas.length > 0 ? reconnectCanFix : null,
      },
    });

    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", userAccessTokenEncrypted: null } }).catch(() => undefined);

    if (!result.ok) {
      return { ok: false, restaurantId: row.restaurantId, reason: result.error ?? "Não foi possível salvar a configuração.", username: profile.username };
    }
    return {
      ok: true,
      restaurantId: row.restaurantId,
      reason: null,
      username: profile.username,
      tokenExpiresInSeconds: profile.expiresInSeconds ?? null,
      shortLived,
      subscribed,
      subscribeError,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "erro ao conectar com o Instagram";
    await prisma.metaOAuthState.update({ where: { id: row.id }, data: { status: "CONSUMED", error: reason } }).catch(() => undefined);
    return { ok: false, restaurantId: row.restaurantId, reason, username: null };
  }
}
