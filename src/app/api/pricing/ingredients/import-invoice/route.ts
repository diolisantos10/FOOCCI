import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { extractFromImage, extractFromText } from "@/services/menu/InvoiceExtractService";
import { buildProposals } from "@/services/menu/InvoiceMatchService";
import { extractTextFromUpload } from "@/services/agentLibrary/extractText";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/pricing/ingredients/import-invoice — foto ou PDF da nota de
 * compra → IA extrai os itens → proposals casadas com o catálogo de insumos.
 * READ-ONLY: nada é gravado aqui; o lojista revisa e confirma na tela, e a
 * aplicação usa os endpoints existentes (auditoria + ficha + dispositivo).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return badRequest("Nenhum arquivo enviado.");

    const isImage = IMAGE_TYPES.has(file.type);
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      return badRequest("Tipo não suportado. Envie foto (JPEG, PNG, WebP) ou PDF da nota.");
    }
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      return badRequest("Foto muito grande. Tamanho máximo: 8 MB.");
    }
    if (isPdf && file.size > MAX_PDF_BYTES) {
      return badRequest("PDF muito grande. Tamanho máximo: 10 MB.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let extracted;
    try {
      if (isImage) {
        extracted = await extractFromImage(buffer.toString("base64"), file.type);
      } else {
        const { text } = await extractTextFromUpload(buffer, file.name || "nota.pdf", file.type);
        extracted = await extractFromText(text);
      }
    } catch (err) {
      console.error("[import-invoice] extração falhou", err);
      return badRequest(
        "Não consegui ler a nota. Tente uma foto mais nítida (bem iluminada, sem corte) ou um PDF com texto."
      );
    }

    if (extracted.length === 0) {
      return badRequest(
        "Nenhum item de compra encontrado no arquivo. Confira se é mesmo uma nota/cupom de compra de insumos."
      );
    }

    const catalog = await prisma.ingredient.findMany({
      where: { restaurantId: ctx.restaurantId },
      select: { id: true, name: true, unit: true, costPerUnit: true },
    });

    const proposals = buildProposals(
      extracted,
      catalog.map((c) => ({
        id: c.id,
        name: c.name,
        unit: c.unit,
        costPerUnit: c.costPerUnit === null ? null : Number(c.costPerUnit),
      }))
    );

    return ok({ proposals, extractedCount: extracted.length });
  } catch (err) {
    console.error("[POST /api/pricing/ingredients/import-invoice]", err);
    return serverError();
  }
}
