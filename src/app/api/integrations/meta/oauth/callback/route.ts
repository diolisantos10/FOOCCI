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
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { handleMetaCallback, metaRedirectUri } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const returnBase = getPublicBaseUrl(req.nextUrl.origin).url ?? req.nextUrl.origin;
  const settings = new URL("/integracoes/instagram", returnBase);

  const result = await handleMetaCallback({
    state: params.get("state") ?? "",
    code: params.get("code"),
    error: params.get("error") ?? params.get("error_message"),
    redirectUri: metaRedirectUri(req.nextUrl.origin),
  });

  if (!result.ok) {
    settings.searchParams.set("meta", "error");
    return NextResponse.redirect(settings);
  }
  settings.searchParams.set("meta", result.candidateCount > 0 ? "select_page" : "no_pages");
  return NextResponse.redirect(settings);
}
