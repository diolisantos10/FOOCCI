/**
 * GET   /api/integrations/instagram  — masked config view (store owner / tenant)
 * PATCH /api/integrations/instagram  — upsert Meta/Instagram config
 *
 * Lojista-facing (tenant-scoped via session) counterpart of the admin route.
 * restaurantId always comes from the session, never the client. The Page Access
 * Token is encrypted at rest and NEVER returned; the verify token is hashed.
 * Pure config I/O — no Instagram send, no order, no Pix, no AI.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { getMetaEnvStatus } from "@/services/instagram/metaOAuth";
import {
  getInstagramConfig,
  upsertInstagramConfig,
  toView,
} from "@/services/instagram/InstagramConfigService";
import { INSTAGRAM_MODES, INSTAGRAM_SCOPES } from "@/services/instagram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webhookUrl(req: NextRequest): string | null {
  // Public base only — never a localhost/railway URL in production.
  const base = getPublicBaseUrl(req.nextUrl.origin).url;
  return base ? `${base}/api/webhooks/instagram` : null;
}

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getInstagramConfig(ctx.restaurantId);
  const view = config ? toView(config) : null;
  const wbUrl = webhookUrl(req);

  // Env readiness — booleans only, NEVER values. Drives the Avançado checklist.
  const env = {
    appId:              !!(process.env.META_APP_ID || process.env.FACEBOOK_APP_ID),
    appSecret:          !!(process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET),
    webhookVerifyToken: !!process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    instagramAppSecret: !!process.env.INSTAGRAM_APP_SECRET,
    baseUrl:            !!wbUrl, // public base resolves → webhook URL is generatable
    encryptionKey:      !!process.env.ENCRYPTION_KEY,
    signatureEnforced:  !!process.env.INSTAGRAM_APP_SECRET, // POST signature only checked when set
    webhookReachable:   !!wbUrl, // route is public (middleware-allowlisted) when a base exists
  };

  // Status for the Integrations Center card (lojista-friendly).
  let status: "unconfigured" | "configured" | "active" | "error" | "pending_validation" = "unconfigured";
  if (view) {
    if (view.lastError) status = "error";
    else if (view.paused) status = "configured";
    else if (view.enabled && view.mode !== "DISABLED" && view.lastWebhookAt) status = "active";
    else if (view.enabled && view.mode !== "DISABLED") status = "pending_validation";
    else if (view.tokenConfigured || view.instagramBusinessAccountId || view.facebookPageId) status = "configured";
  }

  return NextResponse.json({
    data: {
      provider: "instagram",
      status,
      isActive: status === "active",
      lastTestedAt: view?.lastWebhookAt ?? null,
      configured: config !== null,
      enabled: view?.enabled ?? false,
      paused: view?.paused ?? false,
      mode: view?.mode ?? "DISABLED",
      scope: view?.scope ?? "TEST_ACCOUNT_ONLY",
      instagramBusinessAccountId: view?.instagramBusinessAccountId ?? null,
      facebookPageId: view?.facebookPageId ?? null,
      tokenConfigured: view?.tokenConfigured ?? false,
      verifyTokenConfigured: view?.verifyTokenConfigured ?? false,
      connectedVia: view?.connectedVia ?? null,
      connectedAt: view?.connectedAt ?? null,
      facebookPageName: view?.facebookPageName ?? null,
      instagramUsername: view?.instagramUsername ?? null,
      metaConnectAvailable: getMetaEnvStatus(req.nextUrl.origin).oauthReady,
      missingEnv: getMetaEnvStatus(req.nextUrl.origin).missing,
      webhookUrl: wbUrl,
      lastWebhookAt: view?.lastWebhookAt ?? null,
      lastError: view?.lastError ?? null,
      allowlistedExternalUserIds: config?.allowlistedExternalUserIds ?? [],
      appId: view?.appId ?? null,
      envVerifyTokenConfigured: !!process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      envAppSecretConfigured: !!process.env.INSTAGRAM_APP_SECRET,
      env,
    },
  });
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  mode: z.enum(INSTAGRAM_MODES as [string, ...string[]]).optional(),
  scope: z.enum(INSTAGRAM_SCOPES as [string, ...string[]]).optional(),
  instagramBusinessAccountId: z.string().max(100).nullable().optional(),
  facebookPageId: z.string().max(100).nullable().optional(),
  pageAccessToken: z.string().max(500).optional(),
  verifyToken: z.string().max(200).optional(),
  appId: z.string().max(100).nullable().optional(),
  allowlistedExternalUserIds: z.array(z.string().min(1).max(64)).max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return NextResponse.json({ error: "Apenas o proprietário ou gerente pode alterar integrações." }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Entrada inválida.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { mode, scope, ...rest } = parsed.data;
  const result = await upsertInstagramConfig(ctx.restaurantId, { ...rest, mode: mode as never, scope: scope as never });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({
    data: { ...result.view, webhookUrl: webhookUrl(req), sideEffects: "none — config only; no Instagram send, order, or Pix" },
  });
}
