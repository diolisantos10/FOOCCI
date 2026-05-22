/**
 * Image Migration Utility
 *
 * Downloads externally-hosted product/category images and re-uploads them to
 * Foocci-owned storage (S3 primary, PostgreSQL MediaUpload fallback).
 * Only images that are NOT already in Foocci storage are processed.
 *
 * Usage:
 *   import { migrateRestaurantImages } from "@/lib/image-migration";
 *   const stats = await migrateRestaurantImages(restaurantId, { dryRun: true });
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { uploadToS3 } from "@/lib/s3";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

const MAX_BYTES    = 5 * 1024 * 1024; // 5 MB — mirrors the upload route limit
const TIMEOUT_MS   = 10_000;           // 10-second download timeout per image

/**
 * Returns true if the URL already points to Foocci-owned storage
 * (S3 bucket on amazonaws.com or internal /api/media/ route).
 * A missing/empty URL is treated as "internal" (nothing to migrate).
 */
export function isInternalImageUrl(url: string): boolean {
  if (!url.trim()) return true;
  if (url.startsWith("/api/media/")) return true;
  try {
    return new URL(url).hostname.endsWith(".amazonaws.com");
  } catch {
    return false;
  }
}

async function downloadImage(
  url: string
): Promise<{ buffer: Buffer; mimeType: string } | { error: string }> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const mimeType = ((res.headers.get("content-type") ?? "").split(";")[0] ?? "").trim();
    if (!(mimeType in ALLOWED_MIME)) return { error: `Unsupported type: ${mimeType}` };

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return { error: `Too large: ${bytes.byteLength} bytes` };

    return { buffer: Buffer.from(bytes), mimeType };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function storeImage(
  buffer: Buffer,
  mimeType: string,
  restaurantId: string
): Promise<string> {
  const ext = ALLOWED_MIME[mimeType]!;
  const key = `restaurants/${restaurantId}/menu/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  try {
    return await uploadToS3(buffer, key, mimeType);
  } catch {
    const record = await prisma.mediaUpload.create({
      data: {
        id:          crypto.randomBytes(16).toString("hex"),
        restaurantId,
        mimeType,
        data:        buffer,
      },
      select: { id: true },
    });
    return `/api/media/${record.id}`;
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface MigrationFailure {
  id:     string;
  name:   string;
  url:    string;
  reason: string;
}

export interface MigrationStats {
  totalChecked:           number;
  skippedNoImage:         number;
  skippedAlreadyInternal: number;
  externalUrlsFound:      number;
  migratedSuccessfully:   number;
  failures:               MigrationFailure[];
}

// ── Core migration function ───────────────────────────────────────────────────

/**
 * Migrates all external product/category images for a single restaurant.
 * Pass `dryRun: true` to preview without writing any changes.
 */
export async function migrateRestaurantImages(
  restaurantId: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationStats> {
  const { dryRun = false } = options;

  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where:  { category: { restaurantId } },
      select: { id: true, name: true, imageUrl: true },
    }),
    prisma.menuCategory.findMany({
      where:  { restaurantId },
      select: { id: true, name: true, imageUrl: true },
    }),
  ]);

  const stats: MigrationStats = {
    totalChecked:           items.length + categories.length,
    skippedNoImage:         0,
    skippedAlreadyInternal: 0,
    externalUrlsFound:      0,
    migratedSuccessfully:   0,
    failures:               [],
  };

  type Row = { id: string; name: string; imageUrl: string | null; kind: "item" | "category" };
  const rows: Row[] = [
    ...items.map((i) => ({ ...i, kind: "item"     as const })),
    ...categories.map((c) => ({ ...c, kind: "category" as const })),
  ];

  for (const row of rows) {
    if (!row.imageUrl) {
      stats.skippedNoImage++;
      continue;
    }

    if (isInternalImageUrl(row.imageUrl)) {
      stats.skippedAlreadyInternal++;
      continue;
    }

    stats.externalUrlsFound++;

    if (dryRun) {
      console.log(`[image-migration][dryRun] ${row.kind} "${row.name}" → ${row.imageUrl}`);
      continue;
    }

    const downloaded = await downloadImage(row.imageUrl);
    if ("error" in downloaded) {
      stats.failures.push({ id: row.id, name: row.name, url: row.imageUrl, reason: downloaded.error });
      continue;
    }

    let newUrl: string;
    try {
      newUrl = await storeImage(downloaded.buffer, downloaded.mimeType, restaurantId);
    } catch (err) {
      stats.failures.push({ id: row.id, name: row.name, url: row.imageUrl, reason: `Upload error: ${String(err)}` });
      continue;
    }

    try {
      if (row.kind === "item") {
        await prisma.menuItem.update({ where: { id: row.id }, data: { imageUrl: newUrl } });
      } else {
        await prisma.menuCategory.update({ where: { id: row.id }, data: { imageUrl: newUrl } });
      }
      stats.migratedSuccessfully++;
      console.log(`[image-migration] ✓ ${row.kind} "${row.name}": ${row.imageUrl} → ${newUrl}`);
    } catch (err) {
      stats.failures.push({ id: row.id, name: row.name, url: row.imageUrl, reason: `DB update error: ${String(err)}` });
    }
  }

  return stats;
}
