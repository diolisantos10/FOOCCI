/**
 * GET /api/integrations/meta/oauth/callback
 *
 * Meta redirects here after authorization. Validates the single-use state,
 * exchanges the code for a user token, lists the Pages + connected Instagram
 * accounts, stores the candidates (NO tokens) and redirects back to the settings
 * page with a status flag for the UI. Trust is anchored on the `state` row, not
 * just the session. Never sends a Direct, never creates an order/Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReturnBaseUrl } from "@/lib/public-base-url";
import { handleMetaCallback, metaRedirectUri } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  // Browser-reachable return base — never the internal localhost:8080 origin.
  const returnBase = getReturnBaseUrl(req.nextUrl.origin);

  const result = await handleMetaCallback({
    state: params.get("state") ?? "",
    code: params.get("code"),
    error: params.get("error") ?? params.get("error_message"),
    redirectUri: metaRedirectUri(req.nextUrl.origin),
  });

  // Redirect to the platform that initiated the OAuth flow (instagram or facebook).
  const platform = result.returnPlatform === "facebook" ? "facebook" : "instagram";
  const settings = new URL(`/integracoes/${platform}`, returnBase);

  if (!result.ok) {
    settings.searchParams.set("meta", "error");
    return NextResponse.redirect(settings);
  }
  settings.searchParams.set("meta", result.candidateCount > 0 ? "select_page" : "no_pages");
  return NextResponse.redirect(settings);
}
