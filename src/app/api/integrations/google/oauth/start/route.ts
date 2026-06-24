/**
 * GET /api/integrations/google/oauth/start
 *
 * Begins the one-click "Conectar Google" flow: validates the lojista session,
 * creates a single-use CSRF state, and redirects to the Google consent screen.
 * Return links and the redirect URI use the PUBLIC base URL — never localhost in
 * production. On missing env / base URL, redirects back with a clear flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getReturnBaseUrl } from "@/lib/public-base-url";
import { startGoogleConnect } from "@/services/google/googleOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  const returnBase = getReturnBaseUrl(req.nextUrl.origin);
  const settings = new URL("/integracoes/google", returnBase);

  if (!ctx) return NextResponse.redirect(new URL("/login", returnBase));
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    settings.searchParams.set("google", "forbidden");
    return NextResponse.redirect(settings);
  }

  const result = await startGoogleConnect({
    restaurantId: ctx.restaurantId,
    userId: ctx.userId,
    originFallback: req.nextUrl.origin,
  });

  if (!result.ok || !result.authUrl) {
    const flag =
      result.blocked === "PUBLIC_BASE_URL_NOT_CONFIGURED" ? "blocked_base_url"
      : result.blocked === "BLOCKED_BY_GOOGLE_APP_ENV" ? "blocked_env"
      : "error";
    settings.searchParams.set("google", flag);
    return NextResponse.redirect(settings);
  }
  return NextResponse.redirect(result.authUrl);
}
