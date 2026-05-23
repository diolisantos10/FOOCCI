/**
 * ImageEnhancementService
 *
 * Orchestrates the menu photo enhancement pipeline for a single restaurant:
 *   1. Load product images for the restaurant
 *   2. Migrate external images to Foocci storage (if needed)
 *   3. Run enhancement via configured provider
 *   4. Record results in MenuItemImageEnhancement table (pending approval)
 *
 * Critical invariants:
 * - Never overwrites MenuItem.imageUrl automatically
 * - Approval is always required before updating the public product image
 * - Original imageUrl is preserved in the enhancement record for rollback
 * - Restaurant-scoped: never processes another restaurant's products
 */

import { prisma } from "@/lib/prisma";
import { migrateRestaurantImages, isInternalImageUrl } from "@/lib/image-migration";
import type { EnhancementJobOptions, EnhancementJobStats, EnhancementJobItem, ProcessMode } from "./types";
import { getEnhancementProvider } from "./providers/index";

export async function runEnhancementJob(opts: EnhancementJobOptions): Promise<EnhancementJobStats> {
  const {
    restaurantId,
    productIds,
    dryRun          = false,
    processMode     = "enhance+upscale",
    forceReprocess  = false,
  } = opts;

  const provider = getEnhancementProvider();

  // 1. Load products (restaurant-scoped, always)
  const products = await prisma.menuItem.findMany({
    where: {
      category:  { restaurantId },
      isActive:  true,
      ...(productIds?.length ? { id: { in: productIds } } : {}),
    },
    select: {
      id:       true,
      name:     true,
      imageUrl: true,
    },
    orderBy: { name: "asc" },
  });

  const stats: EnhancementJobStats = {
    total:             products.length,
    skippedNoImage:    0,
    skippedNoProvider: 0,
    skippedApproved:   0,
    skippedReady:      0,
    migrated:          0,
    enqueued:          0,
    failed:            0,
    items:             [],
    dryRun,
  };

  // 2. Migrate external images first (idempotent — skips already-internal URLs)
  if (!dryRun) {
    const externalProducts = products.filter(
      (p) => p.imageUrl && !isInternalImageUrl(p.imageUrl)
    );
    if (externalProducts.length > 0) {
      const migrationStats = await migrateRestaurantImages(restaurantId, {
        dryRun: false,
      });
      stats.migrated = migrationStats.migratedSuccessfully;
    }
  }

  // 3. Re-fetch after migration so imageUrl reflects the new internal URLs
  const freshProducts = dryRun
    ? products
    : await prisma.menuItem.findMany({
        where: {
          category: { restaurantId },
          isActive: true,
          ...(productIds?.length ? { id: { in: productIds } } : {}),
        },
        select: { id: true, name: true, imageUrl: true },
      });

  // 4. Process each product
  for (const product of freshProducts) {
    const item: EnhancementJobItem = {
      menuItemId:   product.id,
      menuItemName: product.name,
      imageUrl:     product.imageUrl,
      status:       "skipped",
    };

    if (!product.imageUrl) {
      stats.skippedNoImage++;
      item.reason = "no image";
      stats.items.push(item);
      continue;
    }

    if (!provider.isConfigured()) {
      stats.skippedNoProvider++;
      item.status = "skipped";
      item.reason = "provider not configured";
      stats.items.push(item);
      continue;
    }

    if (dryRun) {
      item.status = "dry-run";
      item.reason = `would enhance with ${provider.name} (${processMode})`;
      stats.enqueued++;
      stats.items.push(item);
      continue;
    }

    // Guard: never reprocess APPROVED items; skip READY unless forceReprocess.
    const existingJob = await prisma.menuItemImageEnhancement.findUnique({
      where:  { menuItemId: product.id },
      select: { status: true },
    });
    if (existingJob?.status === "APPROVED") {
      stats.skippedApproved++;
      item.status = "skipped";
      item.reason = "already approved — skipped to preserve approval";
      stats.items.push(item);
      continue;
    }
    if (!forceReprocess && existingJob?.status === "READY") {
      stats.skippedReady++;
      item.status = "skipped";
      item.reason = "already ready for review";
      stats.items.push(item);
      continue;
    }

    // Mark as processing in DB (approvedAt is intentionally NOT reset here —
    // APPROVED items are already guarded above; this is extra safety).
    await prisma.menuItemImageEnhancement.upsert({
      where:  { menuItemId: product.id },
      create: {
        menuItemId:   product.id,
        restaurantId,
        originalUrl:  product.imageUrl,
        status:       "PROCESSING",
        processMode:  processMode as string,
      },
      update: {
        originalUrl:  product.imageUrl,
        status:       "PROCESSING",
        processMode:  processMode as string,
        errorReason:  null,
        enhancedUrl:  null,
      },
    });

    // Run enhancement
    const result = await provider.enhance({
      menuItemId:   product.id,
      restaurantId,
      imageUrl:     product.imageUrl,
      processMode:  processMode as ProcessMode,
    });

    if (result.success) {
      await prisma.menuItemImageEnhancement.update({
        where: { menuItemId: product.id },
        data: {
          status:       "READY",
          enhancedUrl:  result.enhancedUrl,
          providerName: result.providerName,
          notes:        result.notes ?? null,
          errorReason:  null,
        },
      });
      item.status = "ready";
      stats.enqueued++;
    } else {
      const isLowQ = "lowSourceQuality" in result && result.lowSourceQuality;
      await prisma.menuItemImageEnhancement.update({
        where: { menuItemId: product.id },
        data: {
          status:      isLowQ ? "LOW_SOURCE_QUALITY" : "FAILED",
          errorReason: result.error,
        },
      });
      item.status = isLowQ ? "low_source_quality" : "failed";
      item.reason = result.error;
      stats.failed++;
    }

    stats.items.push(item);
  }

  return stats;
}

/** Approve an enhancement: update MenuItem.imageUrl to the enhanced version. */
export async function approveEnhancement(
  jobId:        string,
  restaurantId: string,
): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const job = await prisma.menuItemImageEnhancement.findFirst({
    where: { id: jobId, restaurantId },
  });
  if (!job)           return { ok: false, error: "Enhancement job not found" };
  if (!job.enhancedUrl) return { ok: false, error: "No enhanced image available" };
  if (job.status !== "READY" && job.status !== "REJECTED") {
    return { ok: false, error: `Cannot approve job with status ${job.status}` };
  }

  await prisma.$transaction([
    prisma.menuItem.update({
      where: { id: job.menuItemId },
      data:  { imageUrl: job.enhancedUrl },
    }),
    prisma.menuItemImageEnhancement.update({
      where: { id: jobId },
      data:  { status: "APPROVED", approvedAt: new Date() },
    }),
  ]);

  return { ok: true, imageUrl: job.enhancedUrl };
}

/** Reject an enhancement — keeps original imageUrl, marks job rejected. */
export async function rejectEnhancement(
  jobId:        string,
  restaurantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const job = await prisma.menuItemImageEnhancement.findFirst({
    where: { id: jobId, restaurantId },
  });
  if (!job) return { ok: false, error: "Enhancement job not found" };

  await prisma.menuItemImageEnhancement.update({
    where: { id: jobId },
    data:  { status: "REJECTED" },
  });
  return { ok: true };
}

/** Rollback an approved enhancement — restores the originalUrl. */
export async function rollbackEnhancement(
  jobId:        string,
  restaurantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const job = await prisma.menuItemImageEnhancement.findFirst({
    where: { id: jobId, restaurantId },
  });
  if (!job)            return { ok: false, error: "Enhancement job not found" };
  if (job.status !== "APPROVED") return { ok: false, error: "Job is not approved — nothing to roll back" };
  if (!job.originalUrl?.trim()) {
    return { ok: false, error: "Cannot rollback — original image URL is missing from enhancement record" };
  }

  await prisma.$transaction([
    prisma.menuItem.update({
      where: { id: job.menuItemId },
      data:  { imageUrl: job.originalUrl },
    }),
    prisma.menuItemImageEnhancement.update({
      where: { id: jobId },
      data:  { status: "REJECTED", approvedAt: null },
    }),
  ]);
  return { ok: true };
}
