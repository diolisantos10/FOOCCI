/**
 * GET /api/chat/messages/[id]/attachment
 *
 * Authenticated media proxy for inbound WhatsApp attachments.
 *
 * Mídia de WhatsApp não abre direto no navegador. Esta rota baixa os bytes pela
 * Graph API da Meta (server-side, com o token guardado do restaurante) e devolve
 * com o Content-Type certo, para a equipe ver imagem/arquivo na hora.
 *
 * O token nunca chega ao cliente — só os bytes decodificados.
 *
 * ⚠️ Mídia ANTIGA, recebida pela Evolution antes de 04/08/2026, não tem
 * `metaMediaId` e **não pode mais ser baixada**: o provedor que guardava aquele
 * blob saiu do Foocci. A rota devolve 404 declarado em vez de 500 — a mensagem
 * continua visível na Central, só o anexo é que não abre.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { downloadMetaMedia } from "@/services/whatsapp/metaMedia";

interface WaMediaMeta {
  whatsappMedia?: boolean;
  mimetype?: string;
  fileName?: string;
  remoteJid?: string;
  fromMe?: boolean;
  /** Meta Cloud API media id — present on inbound media received via the official API. */
  metaMediaId?: string;
}

function mediaHeaders(contentType: string, fileName?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type":  contentType,
    "Cache-Control": "private, max-age=3600",
  };
  if (fileName) headers["Content-Disposition"] = `inline; filename="${fileName.replace(/"/g, "")}"`;
  return headers;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return new NextResponse(null, { status: 401 });

  const message = await prisma.message.findUnique({
    where:  { id: params.id },
    select: {
      externalMessageId: true,
      metadata:          true,
      conversation:      { select: { restaurantId: true } },
    },
  });

  // Scope strictly to the operator's restaurant.
  if (!message || message.conversation.restaurantId !== ctx.restaurantId) {
    return new NextResponse(null, { status: 404 });
  }

  const meta = (message.metadata ?? {}) as WaMediaMeta;

  // Meta Cloud API media → download via the Graph API (token-authenticated, server-side).
  if (meta.metaMediaId) {
    const dl = await downloadMetaMedia(ctx.restaurantId, meta.metaMediaId);
    if (!dl.ok || !dl.buffer) return new NextResponse(null, { status: 502 });
    const contentType = dl.mimeType || meta.mimetype || "application/octet-stream";
    return new NextResponse(new Uint8Array(dl.buffer), { status: 200, headers: mediaHeaders(contentType, meta.fileName) });
  }

  // Sem `metaMediaId` só sobra mídia legada da Evolution — sem provedor para
  // buscar o blob. 404 honesto (o anexo não existe mais para nós), nunca 500.
  if (meta.whatsappMedia) {
    console.info(`[chat/messages/attachment] anexo legado sem metaMediaId (msg ${params.id}) — não há de onde baixar`);
  }
  return new NextResponse(null, { status: 404 });
}
