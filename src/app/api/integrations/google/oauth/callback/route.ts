/**
 * GET /api/integrations/google/oauth/callback
 *
 * Google redirects here after authorization. Validates the single-use state,
 * exchanges the code for tokens (encrypted at rest), reads the connected account
 * email, then redirects back to the settings page with a status flag. Trust is
 * anchored on the `state` row. Never sends/creates anything outbound.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReturnBaseUrl } from "@/lib/public-base-url";
import { handleGoogleCallback } from "@/services/google/googleOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const returnBase = getReturnBaseUrl(req.nextUrl.origin);
  const settings = new URL("/integracoes/google", returnBase);

  const result = await handleGoogleCallback({
    state: params.get("state") ?? "",
    code: params.get("code"),
    error: params.get("error") ?? params.get("error_description"),
    originFallback: req.nextUrl.origin,
  });

  settings.searchParams.set("google", result.ok ? "connected" : "error");
  return NextResponse.redirect(settings);
}
