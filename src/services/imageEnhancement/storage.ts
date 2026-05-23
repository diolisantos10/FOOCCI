/**
 * Storage helper for enhanced images.
 * Uploads to S3 (primary) with PostgreSQL MediaUpload fallback.
 * Uses a dedicated key prefix so enhanced images are clearly separated.
 */

import crypto from "crypto";
import { uploadToS3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

export async function storeEnhancedImage(
  buffer:      Buffer,
  mimeType:    string,
  restaurantId: string,
  menuItemId:  string,
): Promise<string> {
  const ext = MIME_EXT[mimeType] ?? "jpg";
  const key = `restaurants/${restaurantId}/enhanced/${menuItemId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

  try {
    return await uploadToS3(buffer, key, mimeType);
  } catch {
    // S3 unavailable — fall back to PostgreSQL binary storage
    const record = await prisma.mediaUpload.create({
      data: {
        id:           crypto.randomBytes(16).toString("hex"),
        restaurantId,
        mimeType,
        data:         buffer,
      },
      select: { id: true },
    });
    return `/api/media/${record.id}`;
  }
}
