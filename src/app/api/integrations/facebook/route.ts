/**
 * GET /api/integrations/facebook — Facebook Messenger integration status (tenant-scoped).
 *
 * Reads the same `instagramChannelConfig` row as the Instagram route — the same
 * Facebook Page Access Token is used for both Instagram DMs and Facebook Messenger.
 * Returns a Facebook-perspective view: no Instagram-specific fields exposed.
 * Pure read — never sends messages, never creates orders/Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getMetaEnvStatus } from "@/services/instagram/metaOAuth";
import { getInstagramConfig } from "@/services/instagram/InstagramConfigService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getInstagramConfig(ctx.restaurantId);

  const facebookPageId = config?.facebookPageId ?? null;
  const tokenConfigured = !!(config?.pageAccessTokenEncrypted);
  const facebookPageName =
    (config?.metadata as Record<string, unknown> | null)?.facebookPageName as string | null ?? null;
  const lastWebhookAt = config?.lastWebhookAt?.toISOString() ?? null;
  const lastError = config?.lastError ?? null;
  const connected = !!(facebookPageId && tokenConfigured);

  // Status logic: if facebookPageId is set and tokenConfigured, status = "active";
  // if only facebookPageId set, "configured"; else "unconfigured".
  let status: "unconfigured" | "configured" | "active" = "unconfigured";
  if (facebookPageId && tokenConfigured) {
    status = "active";
  } else if (facebookPageId) {
    status = "configured";
  }

  const metaEnv = getMetaEnvStatus(req.nextUrl.origin);

  return NextResponse.json({
    provider: "facebook",
    status,
    isActive: status === "active",
    facebookPageId,
    facebookPageName,
    connected,
    tokenConfigured,
    lastWebhookAt,
    lastError,
    metaConnectAvailable: metaEnv.oauthReady,
    missingEnv: metaEnv.missing,
  });
}
