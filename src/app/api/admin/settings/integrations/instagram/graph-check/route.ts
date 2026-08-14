/**
 * GET /api/admin/settings/integrations/instagram/graph-check?restaurantId=…[&subscribe=true]
 *
 * Admin-only LIVE check against the Instagram Graph API using the restaurant's stored
 * (decrypted, server-side) token — to diagnose why inbound DMs aren't arriving:
 *   • token valid?           → GET /me (id, username, account_type)
 *   • webhook subscribed?    → GET /{igId}/subscribed_apps (must include "messages")
 *   • subscribe=true         → POST /{igId}/subscribed_apps?subscribed_fields=messages
 *                              (re-subscribe — the common fix; no App Review needed)
 *
 * Read-only unless subscribe=true. NEVER returns the token. Meta-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getInstagramConfig, decryptPageToken } from "@/services/instagram/InstagramConfigService";
import { GRAPH_INSTAGRAM_BASE, GRAPH_FACEBOOK_BASE } from "@/services/instagram/InstagramSendClient";
import { DURABLE_TOKEN_MIN_SECONDS, missingInstagramPermissions } from "@/services/instagram/instagramLoginOAuth";

export const dynamic = "force-dynamic";

async function graphGet(base: string, path: string, token: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${base}/${path}${sep}access_token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? req.nextUrl.searchParams.get("restaurantSlug");
  const doSubscribe  = req.nextUrl.searchParams.get("subscribe") === "true";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId é obrigatório." }, { status: 400 });

  const config = await getInstagramConfig(restaurantId);
  if (!config) return NextResponse.json({ error: "Sem config de Instagram para este restaurante." }, { status: 404 });

  const token = decryptPageToken(config);
  if (!token) return NextResponse.json({ error: "Token não configurado." }, { status: 400 });

  const igId = config.instagramBusinessAccountId;
  const connectedVia = (config.metadata?.connectedVia as string) ?? null;
  const base = connectedVia === "instagram_login" ? GRAPH_INSTAGRAM_BASE : GRAPH_FACEBOOK_BASE;

  // Token lifetime — the load-bearing signal after a reconnect. `tokenValid` (a live /me
  // boolean) can NOT tell a durable 60-day token from a doomed ~1h one: both answer /me
  // fine while alive. So surface the stored expiry too, or "check the new token is ~60
  // days" is impossible to actually do. A short remaining lifetime on a FRESH connect is
  // the fingerprint of the ig_exchange_token fallback that killed Sushi Cazza on 25-Jul.
  const tokenExpiresAtRaw = typeof config.metadata?.tokenExpiresAt === "string" ? config.metadata.tokenExpiresAt : null;
  const expMs = tokenExpiresAtRaw ? Date.parse(tokenExpiresAtRaw) : NaN;
  const expiresInDays = Number.isFinite(expMs) ? Math.round(((expMs - Date.now()) / (24 * 60 * 60 * 1000)) * 10) / 10 : null;

  /**
   * 🔴 ESTE CAMPO MENTIA, E A MENTIRA CUSTOU CARO.
   *
   * Ele era `expiresInDays < 7` — ou seja, o tempo que FALTA. Duas consequências, e as
   * duas apareceram em produção:
   *   1. Um token de 60 dias perfeitamente saudável, com 55 dias de idade, reportava
   *      "nasceu curto: true".
   *   2. **Todo token expirado reporta `true` por aritmética**, sempre, porque dias
   *      restantes negativos são menores que 7. Foi assim que o raio-x de 14/08 leu
   *      "vence em -2,4 dias · nasceu curto? true" — a segunda metade não era prova
   *      de nada, era consequência da primeira.
   *
   * O que realmente identifica o defeito é a vida com que o token NASCEU, e a vitrine
   * já dizia isso: `tokenExpiresAt − connectedAt ≈ 1h` é a assinatura digital do
   * fallback de `ig_exchange_token`. Aritmética simples, que dispensa log — e que
   * continua verdadeira depois que o token morre.
   *
   * Guardrail 1: sem `connectedAt` não dá para calcular a vida de nascimento, e aí a
   * resposta é `null` ("não sei"), nunca `false` ("nasceu bem").
   */
  const connectedAtRaw = typeof config.metadata?.connectedAt === "string" ? config.metadata.connectedAt : null;
  // Âncora exata da emissão, com queda para `connectedAt` nas conexões anteriores a
  // 14/08. Nas antigas a conta erra para MAIS, ou seja, falso negativo — o lado seguro.
  const issuedAtRaw = typeof config.metadata?.tokenIssuedAt === "string" ? config.metadata.tokenIssuedAt : connectedAtRaw;
  const connMs = issuedAtRaw ? Date.parse(issuedAtRaw) : NaN;
  const tokenIssuedForSeconds =
    Number.isFinite(expMs) && Number.isFinite(connMs) ? Math.round((expMs - connMs) / 1000) : null;
  const tokenIssuedForDays =
    tokenIssuedForSeconds !== null ? Math.round((tokenIssuedForSeconds / (24 * 60 * 60)) * 10) / 10 : null;
  // Um long-lived do Instagram dura ~60 dias. Menos de 7 na EMISSÃO é o fallback.
  const tokenBornShort = tokenIssuedForSeconds === null ? null : tokenIssuedForSeconds < DURABLE_TOKEN_MIN_SECONDS;
  // Mantido com o nome antigo porque o raio-x e os scripts já o leem — mas agora ele
  // mede o que o nome promete. O "está vencendo" virou campo próprio.
  const tokenLooksShortLived = tokenBornShort === true;
  const tokenExpiringSoon = expiresInDays !== null && expiresInDays < 7;

  /**
   * A EVIDÊNCIA QUE ESTAVA ENTERRADA. Desde 05/08 o callback grava, no metadata, o
   * motivo LITERAL que a Meta deu para recusar a troca — justamente para o motivo
   * sobreviver ao deploy, já que a retenção de log do Railway é por deploy. Só que
   * NENHUMA rota devolvia esses campos: campo escrito sem caminho de leitura é
   * evidência morta. Ficaram nove dias com a resposta no banco, sem ninguém ler.
   */
  const meta = config.metadata ?? {};
  const longLivedExchangeError = typeof meta.longLivedExchangeError === "string" ? meta.longLivedExchangeError : null;
  const webhookSubscribedAt    = typeof meta.webhookSubscribedAt === "string" ? meta.webhookSubscribedAt : null;
  const webhookSubscribeError  = typeof meta.webhookSubscribeError === "string" ? meta.webhookSubscribeError : null;
  const profileError           = typeof meta.profileError === "string" ? meta.profileError : null;
  /**
   * AS PERMISSÕES CONCEDIDAS. É a peça que separa "a chamada está errada" de "a Meta
   * não autorizou" — e a ausência dela custou quatro tentativas de reconexão, porque
   * a Meta recusa por falta de permissão dizendo `Unsupported request`, que se lê como
   * endpoint errado. Gravadas na conexão desde 14/08; conexões anteriores não as têm.
   */
  const grantedPermissions = Array.isArray(meta.grantedPermissions)
    ? (meta.grantedPermissions as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const missingPermissions = missingInstagramPermissions(grantedPermissions);

  // 1) Token validity + account identity.
  const me = await graphGet(base, "me?fields=id,username,account_type,name", token);

  // 2) Webhook subscription for this IG account (must include the "messages" field).
  const subs = igId
    ? await graphGet(base, `${igId}/subscribed_apps`, token)
    : { ok: false, status: 0, json: { error: "no instagramBusinessAccountId" } };

  // 3) Optional fix: (re)subscribe to the messages field.
  let subscribeResult: unknown = null;
  if (doSubscribe && igId) {
    const res = await fetch(
      `${base}/${igId}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
    subscribeResult = { status: res.status, json: await res.json().catch(() => ({})) };
  }

  return NextResponse.json({
    restaurantId,
    connectedVia,
    graphBase: base,
    instagramBusinessAccountId: igId,
    tokenValid: me.ok,
    tokenExpiresAt: tokenExpiresAtRaw,
    connectedAt: connectedAtRaw,
    tokenIssuedAt: issuedAtRaw,
    expiresInDays,
    // Quanto o token durou DESDE A EMISSÃO — é isto que acusa a troca falhando.
    tokenIssuedForDays,
    tokenBornShort,
    tokenLooksShortLived,
    // Quanto FALTA — outra pergunta, outro campo. Confundir as duas custou 22 dias.
    tokenExpiringSoon,
    // O motivo literal da Meta, que já estava no banco e ninguém devolvia.
    longLivedExchangeError,
    webhookSubscribedAt,
    webhookSubscribeError,
    profileError,
    // Vazio pode significar "conexão anterior a 14/08", não "nenhuma permissão".
    grantedPermissions,
    missingPermissions,
    lastError: config.lastError,
    me: me.json,
    subscribedApps: subs.json,
    subscribedAppsOk: subs.ok,
    subscribeAttempted: doSubscribe,
    subscribeResult,
  });
}
