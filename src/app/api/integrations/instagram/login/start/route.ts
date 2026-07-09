/**
 * GET /api/integrations/instagram/login/start
 *
 * Begins the direct "Entrar com Instagram" flow (Instagram Business Login — no
 * Facebook). Validates the lojista session (OWNER/MANAGER), creates a single-use
 * CSRF state and redirects to the Instagram OAuth dialog. All return links and the
 * OAuth redirect URI use the PUBLIC base URL — never localhost/railway in
 * production. Blocks with a clear flag when INSTAGRAM_APP_ID / secret / public base
 * URL are missing. Never sends or creates anything.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getReturnBaseUrl } from "@/lib/public-base-url";
import { startInstagramLogin, instagramLoginRedirectUri } from "@/services/instagram/instagramLoginOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  const returnBase = getReturnBaseUrl(req.nextUrl.origin);
  const settings = new URL("/integracoes/instagram", returnBase);
  if (!ctx) return NextResponse.redirect(new URL("/login", returnBase));
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    settings.searchParams.set("ig", "forbidden");
    return NextResponse.redirect(settings);
  }

  const result = await startInstagramLogin({
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    redirectUri: instagramLoginRedirectUri(req.nextUrl.origin),
  });

  if (!result.ok || !result.authUrl) {
    const flag =
      result.blocked === "PUBLIC_BASE_URL_NOT_CONFIGURED" ? "blocked_base_url"
      : result.blocked === "BLOCKED_BY_INSTAGRAM_APP_ENV" ? "blocked_env"
      : "error";
    settings.searchParams.set("ig", flag);
    return NextResponse.redirect(settings);
  }
  return NextResponse.redirect(result.authUrl);
}
