/**
 * GET /api/integrations/instagram/login/callback
 *
 * Instagram redirects here after the direct login. Validates the single-use state,
 * exchanges the code for a 60-day Instagram user token, saves the
 * InstagramChannelConfig (RECEIVE_ONLY, encrypted token) and redirects back to the
 * Instagram settings page with a status flag for the UI. Trust is anchored on the
 * `state` row. Never sends a Direct, never creates an order/Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReturnBaseUrl } from "@/lib/public-base-url";
import { handleInstagramLoginCallback, instagramLoginRedirectUri } from "@/services/instagram/instagramLoginOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  // Browser-reachable return base — never the internal localhost:8080 origin.
  const returnBase = getReturnBaseUrl(req.nextUrl.origin);
  const settings = new URL("/integracoes/instagram", returnBase);

  const result = await handleInstagramLoginCallback({
    state: params.get("state") ?? "",
    code: params.get("code"),
    error: params.get("error") ?? params.get("error_message") ?? params.get("error_description"),
    redirectUri: instagramLoginRedirectUri(req.nextUrl.origin),
  });

  settings.searchParams.set("ig", result.ok ? "connected" : "error");
  return NextResponse.redirect(settings);
}
