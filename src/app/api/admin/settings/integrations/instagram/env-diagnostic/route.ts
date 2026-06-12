/**
 * GET /api/admin/settings/integrations/instagram/env-diagnostic
 *
 * Read-only environment check for the Meta one-click connect: which env vars
 * are configured (booleans + names only — NEVER values/secrets), the resolved
 * public base URL, and the final webhook/redirect URIs. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getMetaEnvStatus, metaRedirectUri } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = getMetaEnvStatus(req.nextUrl.origin);
  const redirectUri = metaRedirectUri(req.nextUrl.origin);

  return NextResponse.json({
    metaAppIdConfigured: status.metaAppIdConfigured,
    metaAppSecretConfigured: status.metaAppSecretConfigured,
    publicBaseUrlConfigured: status.publicBaseUrlConfigured,
    publicBaseUrl: status.publicBaseUrl,
    usesLocalhostInProduction: status.usesLocalhostInProduction,
    oauthReady: status.oauthReady,
    webhookUrl: status.publicBaseUrl ? `${status.publicBaseUrl}/api/webhooks/instagram` : null,
    redirectUri,
    missing: status.missing,
  });
}
