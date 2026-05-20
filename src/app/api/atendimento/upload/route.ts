import crypto from "crypto";
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { uploadToS3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const ALLOWED_TYPES: Record<string, { ext: string; mediaType: "IMAGE" | "DOCUMENT" }> = {
  "image/jpeg":      { ext: "jpg",  mediaType: "IMAGE"    },
  "image/png":       { ext: "png",  mediaType: "IMAGE"    },
  "image/webp":      { ext: "webp", mediaType: "IMAGE"    },
  "image/gif":       { ext: "gif",  mediaType: "IMAGE"    },
  "application/pdf": { ext: "pdf",  mediaType: "DOCUMENT" },
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

async function saveToDatabase(
  buffer: Buffer,
  mimeType: string,
  restaurantId: string,
  baseUrl: string,
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
  return `${baseUrl}/api/media/${record.id}`;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return badRequest("Nenhum arquivo enviado.");

    const typeInfo = ALLOWED_TYPES[file.type];
    if (!typeInfo) {
      return badRequest("Tipo não permitido. Use: JPEG, PNG, WebP, GIF ou PDF.");
    }

    if (file.size > MAX_BYTES) {
      return badRequest("Arquivo muito grande. Tamanho máximo: 10 MB.");
    }

    const { ext, mediaType } = typeInfo;
    const key = `restaurants/${ctx.restaurantId}/chat/${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;
    try {
      url = await uploadToS3(buffer, key, file.type);
    } catch (s3Err) {
      const errName = s3Err instanceof Error ? s3Err.name : "UnknownError";
      const errMsg  = s3Err instanceof Error ? s3Err.message : String(s3Err);
      console.warn(`[atendimento/upload] S3 unavailable (${errName}: ${errMsg}), falling back to DB.`);
      const proto   = req.headers.get("x-forwarded-proto") ?? "https";
      const host    = req.headers.get("host") ?? "";
      url = await saveToDatabase(buffer, file.type, ctx.restaurantId, `${proto}://${host}`);
    }

    return ok({ url, fileName: file.name, mimeType: file.type, size: file.size, mediaType });
  } catch (err) {
    console.error("[POST /api/atendimento/upload]", err);
    return serverError("Falha no upload. Tente novamente.");
  }
}
