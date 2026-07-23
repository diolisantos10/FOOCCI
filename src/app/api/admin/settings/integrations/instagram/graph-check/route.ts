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
    me: me.json,
    subscribedApps: subs.json,
    subscribedAppsOk: subs.ok,
    subscribeAttempted: doSubscribe,
    subscribeResult,
  });
}
