import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { uploadToS3 } from "@/lib/s3";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return badRequest("Nenhum arquivo enviado.");

    if (!ALLOWED_TYPES.includes(file.type)) {
      return badRequest(
        `Tipo de arquivo não permitido. Use: JPEG, PNG ou WebP.`
      );
    }

    if (file.size > MAX_BYTES) {
      return badRequest("Arquivo muito grande. Tamanho máximo: 5 MB.");
    }

    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const key = `restaurants/${ctx.restaurantId}/menu/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToS3(buffer, key, file.type);

    return ok({ url });
  } catch (err) {
    console.error("[POST /api/menu/upload]", err);

    const isConfigError =
      err instanceof Error && err.message.includes("not configured");

    return serverError(
      isConfigError
        ? "Serviço de upload não configurado. Configure as variáveis AWS no servidor."
        : "Falha ao enviar imagem. Tente novamente."
    );
  }
}
