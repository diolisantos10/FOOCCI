/**
 * GET / PATCH /api/admin/settings/integrations/instagram
 *
 * Per-restaurant Instagram Direct connection config. Admin-only.
 * GET   ?restaurantSlug=... | ?restaurantId=...  → masked view (NEVER the token).
 * PATCH { restaurantSlug|restaurantId, enabled?, paused?, mode?, scope?,
 *         instagramBusinessAccountId?, facebookPageId?, pageAccessToken?,
 *         verifyToken?, appId?, appSecretRef?, allowlistedExternalUserIds? }
 *
 * Tokens are encrypted at rest (page token) / hashed (verify token) and never
 * returned. Pure config I/O — no Direct send, no order, no Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { prisma } from "@/lib/prisma";
import {
  getInstagramConfig,
  upsertInstagramConfig,
  toView,
} from "@/services/instagram/InstagramConfigService";
import { INSTAGRAM_MODES, INSTAGRAM_SCOPES } from "@/services/instagram/types";

async function resolveRestaurant(slugOrId: string) {
  return prisma.restaurant.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: { id: true, name: true, slug: true },
  });
}

function webhookUrl(req: NextRequest): string | null {
  // Public base only — never a localhost/railway URL in production.
  const base = getPublicBaseUrl(req.nextUrl.origin).url;
  return base ? `${base}/api/webhooks/instagram` : null;
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slugOrId = req.nextUrl.searchParams.get("restaurantSlug") ?? req.nextUrl.searchParams.get("restaurantId");
  if (!slugOrId) return NextResponse.json({ error: "restaurantSlug é obrigatório." }, { status: 400 });

  const restaurant = await resolveRestaurant(slugOrId);
  if (!restaurant) return NextResponse.json({ error: `Restaurante não encontrado: "${slugOrId}"` }, { status: 404 });

  const config = await getInstagramConfig(restaurant.id);
  return NextResponse.json({
    restaurant,
    configPresent: config !== null,
    config: config ? toView(config) : null,
    webhookUrl: webhookUrl(req),
    envVerifyTokenConfigured: !!process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    envAppSecretConfigured: !!process.env.INSTAGRAM_APP_SECRET,
  });
}

const patchSchema = z.object({
  restaurantSlug: z.string().min(1).max(100).optional(),
  restaurantId: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  mode: z.enum(INSTAGRAM_MODES as [string, ...string[]]).optional(),
  scope: z.enum(INSTAGRAM_SCOPES as [string, ...string[]]).optional(),
  instagramBusinessAccountId: z.string().max(100).nullable().optional(),
  facebookPageId: z.string().max(100).nullable().optional(),
  pageAccessToken: z.string().max(500).optional(),
  verifyToken: z.string().max(200).optional(),
  appId: z.string().max(100).nullable().optional(),
  appSecretRef: z.string().max(100).nullable().optional(),
  allowlistedExternalUserIds: z.array(z.string().min(1).max(64)).max(500).optional(),
}).refine((d) => d.restaurantSlug || d.restaurantId, { message: "restaurantSlug ou restaurantId é obrigatório." });

export async function PATCH(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Entrada inválida.", details: parsed.error.flatten() }, { status: 400 });
  }
  const slugOrId = parsed.data.restaurantSlug ?? parsed.data.restaurantId!;
  const restaurant = await resolveRestaurant(slugOrId);
  if (!restaurant) return NextResponse.json({ error: `Restaurante não encontrado: "${slugOrId}"` }, { status: 404 });

  const { restaurantSlug: _s, restaurantId: _i, mode, scope, ...rest } = parsed.data;
  const result = await upsertInstagramConfig(restaurant.id, {
    ...rest,
    mode: mode as never,
    scope: scope as never,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({
    restaurant,
    configPresent: true,
    config: result.view,
    webhookUrl: webhookUrl(req),
    sideEffects: "none — config only; no Instagram send, order, or Pix",
  });
}
