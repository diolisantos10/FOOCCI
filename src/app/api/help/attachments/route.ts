/**
 * POST /api/help/attachments — o lojista anexa print, foto ou PDF ao suporte.
 * GET  /api/help/attachments — os rascunhos ainda não enviados da conversa.
 *
 * O arquivo entra como RASCUNHO (sem mensagem). Isso é o que permite
 * pré-visualizar e remover antes de enviar. `/api/help/message` amarra os
 * rascunhos à mensagem no momento do envio.
 *
 * Toda a validação de tipo e de tamanho é do `HelpAttachmentService` — que
 * decide pelos BYTES do arquivo, não pelo que o navegador declarou.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { HelpThreadService } from "@/services/help/HelpThreadService";
import { HelpAttachmentService } from "@/services/help/HelpAttachmentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    let file: File | null = null;
    try {
      const form = await req.formData();
      const raw = form.get("file");
      if (raw instanceof File) file = raw;
    } catch (err) {
      // Mesmo cuidado do microfone: dizer o próximo passo, e deixar rastro.
      console.warn(
        `[help/attachments] BODY_UNREADABLE ${JSON.stringify({
          restaurantId: ctx.restaurantId,
          contentType: req.headers.get("content-type"),
        })} ${err instanceof Error ? err.message : String(err)}`,
      );
      return badRequest(
        "O arquivo não chegou inteiro — costuma ser oscilação da internet. Tente anexar de novo.",
      );
    }

    if (!file) return badRequest("Nenhum arquivo foi escolhido.");

    const threadId = await HelpThreadService.activeThreadId(ctx.restaurantId, ctx.userId);

    const result = await HelpAttachmentService.upload({
      restaurantId: ctx.restaurantId,
      threadId,
      userId: ctx.userId,
      file,
    });
    if (!result.ok) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: result.status ?? 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/help/attachments]", err);
    return serverError();
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const threadId = await HelpThreadService.activeThreadId(ctx.restaurantId, ctx.userId);
    return ok(await HelpAttachmentService.listPending(threadId));
  } catch (err) {
    console.error("[GET /api/help/attachments]", err);
    return serverError();
  }
}
