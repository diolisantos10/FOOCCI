/**
 * GET    /api/help/attachments/[id] — serve o anexo do suporte.
 * DELETE /api/help/attachments/[id] — remove um rascunho antes de enviar.
 *
 * ⚠️ **Esta rota é o motivo de o binário não morar no S3.** O `uploadToS3`
 * deste projeto grava com `ACL: "public-read"` e o `/api/media/[id]` que serve
 * aquele acervo não pede sessão nenhuma — foi feito para foto de cardápio.
 * Anexo de suporte é print de painel: tem nome, telefone e endereço de cliente
 * final. Aqui o arquivo só sai depois de conferir que a sessão pertence ao
 * MESMO restaurante que o anexou.
 *
 * (A equipe Foocci vê os anexos por `/api/admin/support/attachments/[id]`, que
 * é autenticada como admin — a área /admin não passa por este middleware.)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized, notFound, serverError, ok } from "@/lib/api-response";
import { HelpAttachmentService, kindOfMime } from "@/services/help/HelpAttachmentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabeçalhos que impedem o anexo de virar vetor: o navegador não adivinha o
 * tipo (`nosniff`), o arquivo não carrega script nenhum (CSP), e nada disso
 * entra em cache compartilhado (`private, no-store`) — é conteúdo de um
 * restaurante só.
 */
function serve(data: Buffer, mimeType: string, fileName: string) {
  // Imagem abre na tela; PDF baixa. PDF aberto no visualizador do navegador
  // roda no nosso domínio — não vale o risco por uma conveniência pequena.
  const disposition = kindOfMime(mimeType) === "PDF" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "")}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const a = await prisma.helpAttachment.findUnique({
      where: { id: params.id },
      select: { data: true, mimeType: true, fileName: true, restaurantId: true },
    });
    // Anexo de outro restaurante responde 404, não 403: quem tenta adivinhar
    // não pode nem descobrir que o id existe.
    if (!a || a.restaurantId !== ctx.restaurantId) return notFound("Anexo não encontrado");

    return serve(a.data, a.mimeType, a.fileName);
  } catch (err) {
    console.error("[GET /api/help/attachments/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await HelpAttachmentService.removePending(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[DELETE /api/help/attachments/[id]]", err);
    return serverError();
  }
}
