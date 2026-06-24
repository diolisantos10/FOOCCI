/**
 * GET /api/integrations/google
 *
 * Returns the restaurant's Google connection status (masked — no tokens) plus
 * platform-readiness booleans for the "Avançado" section (OWNER/MANAGER only).
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { getGoogleConfig, toView } from "@/services/google/GoogleConfigService";
import { googleOAuthConfigured, isGoogleIntegrationEnabled } from "@/services/google/googleFlag";
import { getPublicBaseUrl } from "@/lib/public-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const row = await getGoogleConfig(ctx.restaurantId);
    const view = toView(row);

    const isManager = ctx.role === "OWNER" || ctx.role === "MANAGER";
    const env = isManager
      ? {
          oauthConfigured: googleOAuthConfigured(),
          encryptionKey:   Boolean(process.env.ENCRYPTION_KEY),
          publicBaseUrl:   Boolean(getPublicBaseUrl(req.nextUrl.origin).url),
        }
      : undefined;

    return ok({
      featureEnabled: isGoogleIntegrationEnabled(),
      ...view,
      env,
    });
  } catch (e) {
    console.error("[GET google status]", e);
    return serverError();
  }
}
