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

/**
 * A MESMA leitura, mas respeitando a regra da casa: **banco primeiro, ambiente depois**.
 *
 * `getInstagramLoginCreds()` acima lê só `process.env` — e era um dos três lugares que
 * furavam a precedência de `MetaAppCredentialsService` (achado 1 do raio-x de 05/08).
 * O efeito prático do furo: ao rotacionar o segredo do aplicativo pela tela
 * `/admin/meta` sem mexer no Railway, o WhatsApp passava a usar a credencial nova e o
 * Instagram continuava com a velha. Dois valores em vigor ao mesmo tempo, para o mesmo
 * aplicativo, sem erro nenhum — a falha silenciosa que este papel existe para impedir.
 *
 * O fallback para o env permanece intacto: nada que funcionava hoje deixa de funcionar.
 * A versão síncrona continua existindo para a tela de status (que só reporta presença
 * de variável de ambiente e não pode virar assíncrona por causa disso).
 */
export async function resolveInstagramLoginCreds(): Promise<InstagramLoginCreds | null> {
  try {
    const { MetaAppCredentialsService } = await import("@/services/meta/MetaAppCredentialsService");
    const r = await MetaAppCredentialsService.getResolved();
    // O `igAppSecret` do banco não cai para `META_APP_SECRET` sozinho — quem faz isso é
    // o fallback histórico daqui. Mantido, na mesma ordem, para não mudar comportamento.
    const appId     = r.igAppId ?? process.env.INSTAGRAM_APP_ID;
    const appSecret = r.igAppSecret ?? process.env.INSTAGRAM_APP_SECRET ?? r.appSecret ?? process.env.META_APP_SECRET;
    if (appId && appSecret) return { appId, appSecret };
  } catch {
    // Banco indisponível não pode impedir uma conexão que o env já sustentava.
  }
  return getInstagramLoginCreds();
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
   * As permissões que a Meta REALMENTE concedeu, devolvidas pelo próprio passo 1
   * (`POST /oauth/access_token` → campo `permissions`).
   *
   * Isto era jogado fora, e era a evidência que decidia tudo. `Unsupported request`
   * nos passos seguintes não é endpoint errado — é a Meta recusando a OPERAÇÃO para
   * um token que não carrega a permissão exigida. Com esta lista, a diferença entre
   * "a chamada está errada" e "o usuário não concedeu / o App Review não saiu" deixa
   * de ser adivinhação.
   */
  grantedPermissions: string[];
  /**
   * Erro do `GET /me`, quando houve. Antes ele era engolido: `fetch` não lança em
   * HTTP 400, então uma resposta de erro virava `username: null` + `igUserId` caindo
   * silenciosamente para o id do passo 1 — e esse id ia direto para a inscrição do
   * webhook. Três falhas na mesma função e só duas deixavam rastro.
   */
  profileError: string | null;
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
      access_token?: string; user_id?: string | number; permissions?: string | string[];
      data?: { access_token?: string; user_id?: string | number; permissions?: string | string[] }[];
      error_message?: string; error_type?: string;
    };
    const shortToken = shortBody.access_token ?? shortBody.data?.[0]?.access_token;
    const tokenUserId = String(shortBody.user_id ?? shortBody.data?.[0]?.user_id ?? "");
    if (!shortRes.ok || !shortToken) {
      throw new Error(shortBody.error_message ?? `Troca de código falhou (HTTP ${shortRes.status})`);
    }

    // AS PERMISSÕES CONCEDIDAS, que vinham na resposta e eram descartadas.
    // O Business Login devolve `permissions` como lista separada por vírgula (ou
    // array). Sem ela, "Unsupported request" nos passos seguintes é indistinguível
    // de um erro de endpoint — e foi por isso que se investigou host e verbo por
    // quatro tentativas, quando a resposta estava no primeiro passo o tempo todo.
    const permsRaw = shortBody.permissions ?? shortBody.data?.[0]?.permissions;
    const grantedPermissions = Array.isArray(permsRaw)
      ? permsRaw.filter((s): s is string => typeof s === "string")
      : typeof permsRaw === "string"
        ? permsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

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
        access_token?: string; expires_in?: number; error?: { message?: string; code?: number; type?: string };
      };
      if (longBody.access_token) {
        longToken  = longBody.access_token;
        expiresIn  = typeof longBody.expires_in === "number" ? longBody.expires_in : null;
        console.log(`[ig-oauth] longLived OK attempt=${attempt} expiresIn=${expiresIn ?? "null"}`);
        break;
      }
      const code = longBody.error?.code != null ? ` (code ${longBody.error.code})` : "";
      lastErr = `${longBody.error?.message ?? `HTTP ${longRes.status}`}${code}`;
      console.warn(`[ig-oauth] longLived FAILED attempt=${attempt} err=${lastErr}`);
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
    //
    // ⚠️ ESTE BLOCO ENGOLIA ERRO. `fetch` NÃO lança em HTTP 400: uma resposta de erro
    // caía fora do `catch`, `username` virava null e `igUserId` caía em silêncio para
    // o id do passo 1 — que é justamente o id usado depois para inscrever a conta no
    // webhook. Se o `/me` estivesse falhando, ninguém saberia, e o subscribe iria para
    // um id possivelmente errado. Agora a falha é registrada e viaja com o perfil.
    let username: string | null = null;
    let igUserId = tokenUserId;
    let profileError: string | null = null;
    try {
      const meUrl = `${IG_GRAPH}/${GRAPH_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(longToken)}`;
      const meRes = await fetch(meUrl);
      const meBody = (await meRes.json().catch(() => ({}))) as {
        user_id?: string; id?: string; username?: string; error?: { message?: string; code?: number };
      };
      if (!meRes.ok || meBody.error) {
        const c = meBody.error?.code != null ? ` (code ${meBody.error.code})` : "";
        profileError = `${meBody.error?.message ?? `HTTP ${meRes.status}`}${c}`;
        console.warn(`[ig-oauth] /me FALHOU err=${profileError}`);
      } else {
        username = typeof meBody.username === "string" ? meBody.username : null;
        igUserId = String(meBody.user_id ?? meBody.id ?? tokenUserId);
      }
    } catch (e) {
      profileError = e instanceof Error ? e.message : "falha ao ler o perfil";
    }

    return { igUserId, username, longLivedToken: longToken, expiresInSeconds: expiresIn, longLivedError, grantedPermissions, profileError };
  },

  /**
   * Subscribes the account to the `messages` webhook field. WITHOUT this the app-level
   * subscription is not enough: Meta only delivers a DM when the ACCOUNT is subscribed
   * too. The connect flow never did it — the operator had to remember to call
   * graph-check?subscribe=true by hand, and nobody did, so a reconnect could produce a
   * green panel that still receives nothing. Failure is reported, never swallowed.
   */
  async subscribe({ igUserId, token }) {
    // A doc da Meta prescreve `POST /me/subscribed_apps` (o `me` resolve para a conta
    // dona do token). Usávamos o id numérico vindo do `/me` — e o `/me` podia ter
    // falhado calado, deixando aqui o id do passo 1. `me` primeiro elimina essa
    // dependência; o id numérico fica como segunda tentativa, porque o exemplo oficial
    // também o aceita e um dos dois pode responder melhor conforme o tipo de conta.
    const alvos = ["me", igUserId].filter((v, i, a) => !!v && a.indexOf(v) === i);
    let ultimoErro = "subscribe não tentado";
    for (const alvo of alvos) {
      try {
        const res = await fetch(
          `${IG_GRAPH}/${GRAPH_VERSION}/${alvo}/subscribed_apps?subscribed_fields=messages`
          + `&access_token=${encodeURIComponent(token)}`,
          { method: "POST" },
        );
        const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string; code?: number } };
        if (res.ok && body.success !== false && !body.error) return { ok: true };
        const c = body.error?.code != null ? ` (code ${body.error.code})` : "";
        ultimoErro = `${body.error?.message ?? `HTTP ${res.status}`}${c} [alvo: ${alvo}]`;
      } catch (e) {
        ultimoErro = `${e instanceof Error ? e.message : "subscribe falhou"} [alvo: ${alvo}]`;
      }
    }
    return { ok: false, error: ultimoErro };
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
  const creds = await resolveInstagramLoginCreds();
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

/**
 * Permissões sem as quais NADA depois do primeiro passo funciona.
 *
 * `instagram_business_basic` é exigida pelo próprio `/access_token?grant_type=
 * ig_exchange_token` (a doc da Meta a lista em "Permissions", para apps que usam
 * Business Login for Instagram). `instagram_business_manage_messages` é a que
 * permite inscrever a conta em `messages` e receber DM.
 *
 * Sem elas, a Meta não responde "faltou permissão": responde
 * **`Unsupported request - method type: get/post` (code 100)** — que se lê como
 * endpoint errado e mandou esta casa investigar host, verbo e versão por quatro
 * tentativas. Por isso a checagem é explícita aqui, com nome.
 */
export const INSTAGRAM_REQUIRED_PERMISSIONS = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
] as const;

/** Quais das permissões obrigatórias faltam. Lista vazia de entrada = "não sei" → []. */
export function missingInstagramPermissions(granted: string[]): string[] {
  if (!granted || granted.length === 0) return []; // guardrail 1: silêncio não vira acusação
  return INSTAGRAM_REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
}

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
  const creds = await resolveInstagramLoginCreds();
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
    const problemas: string[] = [];
    if (shortLived) {
      problemas.push(
        "o Instagram devolveu um token de curta duração (expira em ~1h) em vez do de 60 dias"
        + (profile.longLivedError ? ` — a Meta respondeu: "${profile.longLivedError}"` : "")
        + ". Reconecte; se repetir, a troca long-lived está falhando em produção.",
      );
    }
    if (subscribeError) {
      problemas.push(`a conta não foi inscrita no webhook de mensagens — a Meta respondeu: "${subscribeError}". Sem isso nenhuma DM chega.`);
    }
    // A CAUSA, quando é ela. Vem por último no texto mas é a primeira coisa a checar:
    // faltando permissão, os erros acima são consequência e enganam.
    const faltando = missingInstagramPermissions(profile.grantedPermissions ?? []);
    if (faltando.length > 0) {
      problemas.push(
        `a Meta concedeu apenas [${profile.grantedPermissions.join(", ")}] e faltam [${faltando.join(", ")}].`
        + " Enquanto faltar, a Meta recusa a troca do token de 60 dias e a inscrição no webhook com"
        + " \"Unsupported request\" — que PARECE endpoint errado e não é. Isso se resolve no App Review, não no código.",
      );
    }
    if (profile.profileError) {
      problemas.push(`não foi possível ler o perfil da conta — a Meta respondeu: "${profile.profileError}".`);
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
        // Âncora EXATA da emissão deste token. `connectedAt` servia de aproximação, mas
        // ele não se move numa renovação — então, depois do primeiro refresh, a conta
        // "quanto o token durou ao nascer" passava a medir outra coisa. Com isto a
        // aritmética que denuncia a troca falhando (`expira − emitido ≈ 1h`) fica exata
        // e continua válida a vida inteira da conexão.
        tokenIssuedAt: new Date().toISOString(),
        webhookSubscribedAt: subscribed ? new Date().toISOString() : null,
        webhookSubscribeError: subscribeError,
        longLivedExchangeError: profile.longLivedError ?? null,
        // A evidência que decide o diagnóstico, gravada para sobreviver ao deploy.
        grantedPermissions: profile.grantedPermissions ?? [],
        missingPermissions: faltando,
        profileError: profile.profileError ?? null,
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
