/**
 * GET /api/integrations/meta/oauth/start
 *
 * Begins the one-click "Conectar com Facebook" flow: validates the lojista
 * session, creates a single-use CSRF state, and redirects to the Meta OAuth
 * dialog. All return links and the OAuth redirect URI use the PUBLIC base URL
 * (getPublicBaseUrl) — never localhost/railway in production. When Meta envs or
 * the public base URL are missing, redirects back with a clear blocker flag.
 * Never sends/creates anything.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getReturnBaseUrl } from "@/lib/public-base-url";
import { startMetaConnect, metaRedirectUri } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  // Return links must be browser-reachable: public base in production (canonical
  // fallback if env is missing), request origin only in dev — NEVER localhost:8080.
  const returnBase = getReturnBaseUrl(req.nextUrl.origin);
  const settings = new URL("/integracoes/instagram", returnBase);
  if (!ctx) return NextResponse.redirect(new URL("/login", returnBase));
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
    const flag =
      result.blocked === "PUBLIC_BASE_URL_NOT_CONFIGURED" ? "blocked_base_url"
      : result.blocked === "BLOCKED_BY_META_APP_ENV" ? "blocked_env"
      : "error";
    settings.searchParams.set("meta", flag);
    return NextResponse.redirect(settings);
  }
  return NextResponse.redirect(result.authUrl);
}
