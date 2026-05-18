import crypto from "crypto";
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { uploadToS3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Fallback: store image binary in PostgreSQL when S3 is not configured.
 * Returns a /api/media/[id] URL that is served by the public media route.
 * This persists across container restarts (unlike local filesystem on Railway).
 */
async function saveToDatabase(
  buffer: Buffer,
  mimeType: string,
  restaurantId: string
): Promise<string> {
  const record = await prisma.mediaUpload.create({
    data: {
      id: crypto.randomBytes(16).toString("hex"),
      restaurantId,
      mimeType,
      data: buffer,
    },
    select: { id: true },
  });
  return `/api/media/${record.id}`;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return badRequest("Nenhum arquivo enviado.");

    if (!(file.type in ALLOWED_TYPES)) {
      return badRequest("Tipo de arquivo não permitido. Use: JPEG, PNG ou WebP.");
    }

    if (file.size > MAX_BYTES) {
      return badRequest("Arquivo muito grande. Tamanho máximo: 5 MB.");
    }

    const ext = ALLOWED_TYPES[file.type]!;
    const key = `restaurants/${ctx.restaurantId}/menu/${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;
    try {
      url = await uploadToS3(buffer, key, file.type);
    } catch (s3Err) {
      // Log real error for server-side debugging (no secrets exposed in message/name)
      const errName = s3Err instanceof Error ? s3Err.name : "UnknownError";
      const errMsg  = s3Err instanceof Error ? s3Err.message : String(s3Err);
      console.warn(`[upload] S3 unavailable (${errName}: ${errMsg}), falling back to DB storage.`);
      // Any S3 failure → store in PostgreSQL. Persists across container restarts.
      url = await saveToDatabase(buffer, file.type, ctx.restaurantId);
    }

    return ok({ url });
  } catch (err) {
    console.error("[POST /api/menu/upload]", err);
    return serverError("Falha no upload: S3 indisponível e armazenamento local também falhou. Tente novamente.");
  }
}
