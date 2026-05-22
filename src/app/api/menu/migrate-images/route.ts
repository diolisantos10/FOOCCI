/**
 * POST /api/menu/migrate-images
 *
 * Downloads externally-hosted product/category images for the authenticated
 * restaurant and re-uploads them to Foocci-owned storage (S3 or DB fallback).
 *
 * Authorization: OWNER or MANAGER only (same guard as other write operations).
 * Scope: always scoped to the JWT restaurantId — cannot target another tenant.
 *
 * Body (optional JSON):
 *   { "dryRun": true }  — preview only, no writes
 *
 * Response:
 *   { dryRun, totalChecked, skippedNoImage, skippedAlreadyInternal,
 *     externalUrlsFound, migratedSuccessfully, failures }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { migrateRestaurantImages } from "@/lib/image-migration";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) {
      return forbidden("Apenas gerentes e proprietários podem executar a migração de imagens.");
    }

    const body    = await req.json().catch(() => ({}));
    const dryRun  = body.dryRun === true;

    const stats = await migrateRestaurantImages(ctx.restaurantId, { dryRun });

    return ok({ dryRun, ...stats });
  } catch (err) {
    console.error("[POST /api/menu/migrate-images]", err);
    return serverError();
  }
}
