/**
 * GET /api/integrations/meta/oauth/start
 *
 * Begins the one-click "Conectar com Facebook" flow: validates the lojista
 * session, creates a single-use CSRF state, and redirects to the Meta OAuth
 * dialog. When the Meta app env is not configured, redirects back to the
 * settings page with a clear blocker (no crash). Never sends/creates anything.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { startMetaConnect, metaRedirectUri } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  const settings = new URL("/integracoes/instagram", req.nextUrl.origin);
  if (!ctx) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    settings.searchParams.set("meta", "forbidden");
    return NextResponse.redirect(settings);
  }

  const result = await startMetaConnect({
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    redirectUri: metaRedirectUri(req.nextUrl.origin),
  });

  if (!result.ok || !result.authUrl) {
    settings.searchParams.set("meta", result.blocked === "BLOCKED_BY_META_APP_ENV" ? "blocked_env" : "error");
    return NextResponse.redirect(settings);
  }
  return NextResponse.redirect(result.authUrl);
}
