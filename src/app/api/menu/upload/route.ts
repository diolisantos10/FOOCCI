import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { uploadToS3 } from "@/lib/s3";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Fallback: persist to /public/uploads/ when S3 is not configured. */
async function saveLocally(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = ALLOWED_TYPES[mimeType]!;
  // Unique filename: timestamp + 16 random hex chars + extension
  const unique = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, unique), buffer);
  return `/uploads/${unique}`;
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
      const msg = s3Err instanceof Error ? s3Err.message : "";
      const fallback =
        msg.includes("not configured") ||
        msg.includes("AccessControlListNotSupported") ||
        msg.includes("InvalidBucketAclWithObjectOwnership");
      if (fallback) {
        // S3 not configured or bucket blocks ACLs — store locally
        url = await saveLocally(buffer, file.type);
      } else {
        throw s3Err;
      }
    }

    return ok({ url });
  } catch (err) {
    console.error("[POST /api/menu/upload]", err);
    return serverError("Falha ao enviar imagem. Tente novamente.");
  }
}
