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
import { getInstagramLoginEnvStatus } from "@/services/instagram/instagramLoginOAuth";
import {
  getInstagramConfig,
  upsertInstagramConfig,
  toView,
} from "@/services/instagram/InstagramConfigService";
import { INSTAGRAM_MODES, INSTAGRAM_SCOPES } from "@/services/instagram/types";
import { CHANNEL_SILENCE_ATTENTION_MS, instagramCardStatus } from "@/services/channels/channelHealth";

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
  //
  // ⚠️ O selo tem PRAZO DE VALIDADE. Até 07/08/2026 bastava `lastWebhookAt` ser
  // não-nulo para o cartão ficar verde: um carimbo de quinze dias valia igual a
  // um de um minuto, e foi assim que o Instagram passou treze dias "Ativo" com o
  // canal morto. Agora, silêncio acima do limite vira **"attention"**.
  //
  // "attention" NÃO é "error", e a diferença é deliberada (guardrail 5): um
  // restaurante de baixo movimento pode passar dois dias sem um Direct de forma
  // perfeitamente legítima. Vermelho continua exigindo um fato positivo de falha
  // — `lastError`. Trocar um selo que mente "tudo bem" por um alarme que mente
  // "quebrou" seria a proteção pior que o problema.
  const now = new Date();
  const lastWebhookAgeMs = view?.lastWebhookAt ? now.getTime() - new Date(view.lastWebhookAt).getTime() : null;
  const webhookIsStale = lastWebhookAgeMs !== null && lastWebhookAgeMs > CHANNEL_SILENCE_ATTENTION_MS;
  const status = instagramCardStatus({
    configured: view !== null,
    enabled: view?.enabled ?? false,
    paused: view?.paused ?? false,
    mode: view?.mode ?? "DISABLED",
    lastError: view?.lastError ?? null,
    lastWebhookAt: view?.lastWebhookAt ?? null,
    tokenConfigured: view?.tokenConfigured ?? false,
    hasAccountIds: !!(view?.instagramBusinessAccountId || view?.facebookPageId),
    now,
  });

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
      // Direct "Entrar com Instagram" (Instagram Business Login — no Facebook).
      instagramLoginAvailable: getInstagramLoginEnvStatus(req.nextUrl.origin).ready,
      instagramLoginMissingEnv: getInstagramLoginEnvStatus(req.nextUrl.origin).missing,
      webhookUrl: wbUrl,
      lastWebhookAt: view?.lastWebhookAt ?? null,
      // Para a tela poder dizer "não chega nada há X" ao lado da data, em vez de
      // mostrar um carimbo antigo com ar de normalidade.
      webhookIsStale,
      lastError: view?.lastError ?? null,
      // Refazer o login resolve ESTE erro? `null` = não sabemos, e aí a tela não
      // promete nada. Só a conclusão trafega — nunca o erro cru da credencial.
      reconnectCanFix: view?.reconnectCanFix ?? null,
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
