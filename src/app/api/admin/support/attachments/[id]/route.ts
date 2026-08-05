/**
 * GET /api/admin/support/attachments/[id] — o anexo do lojista, para quem atende.
 *
 * Existe separado da rota do lojista por uma razão de arquitetura, não de
 * gosto: `/api/help/attachments/[id]` autoriza pelo **tenant** da sessão
 * (`x-restaurant-id`, injetado pelo middleware) e a área `/admin` não passa por
 * esse middleware — ela se autentica por cookie/segredo de admin. A equipe
 * tomaria 404 na rota do lojista.
 *
 * O anexo continua fora do alcance de quem não está autenticado: aqui a porta é
 * `checkAdminRequest`, e nada disso vive em bucket público.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { unauthorized, notFound, serverError } from "@/lib/api-response";
import { kindOfMime } from "@/services/help/HelpAttachmentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const a = await prisma.helpAttachment.findUnique({
      where: { id: params.id },
      select: { data: true, mimeType: true, fileName: true },
    });
    if (!a) return notFound("Anexo não encontrado");

    const disposition = kindOfMime(a.mimeType) === "PDF" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(a.data), {
      status: 200,
      headers: {
        "Content-Type": a.mimeType,
        "Content-Disposition": `${disposition}; filename="${a.fileName.replace(/"/g, "")}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/support/attachments/[id]]", err);
    return serverError();
  }
}
