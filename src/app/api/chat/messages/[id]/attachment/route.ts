/**
 * GET /api/chat/messages/[id]/attachment
 *
 * Authenticated media proxy for inbound WhatsApp attachments.
 *
 * WhatsApp media `url` fields point to AES-encrypted `.enc` blobs that the
 * browser cannot open. This route fetches the decrypted bytes from Evolution
 * (server-side, using the restaurant's stored credentials) and streams them
 * back with the correct Content-Type so staff can view images/files inline.
 *
 * Evolution credentials never reach the client — only the decrypted bytes do.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";

interface WaMediaMeta {
  whatsappMedia?: boolean;
  mimetype?: string;
  fileName?: string;
  remoteJid?: string;
  fromMe?: boolean;
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
  if (!meta.whatsappMedia || !message.externalMessageId || !meta.remoteJid) {
    return new NextResponse(null, { status: 404 });
  }

  const configResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
  if (!configResult.ok) return new NextResponse(null, { status: 502 });

  try {
    const { base64, mimetype } = await EvolutionClient.getBase64FromMediaMessage(
      configResult.data,
      {
        id:        message.externalMessageId,
        remoteJid: meta.remoteJid,
        fromMe:    meta.fromMe ?? false,
      },
    );

    if (!base64) return new NextResponse(null, { status: 502 });

    const buffer      = Buffer.from(base64, "base64");
    const contentType = mimetype || meta.mimetype || "application/octet-stream";

    const headers: Record<string, string> = {
      "Content-Type":  contentType,
      "Cache-Control": "private, max-age=3600",
    };
    if (meta.fileName) {
      headers["Content-Disposition"] = `inline; filename="${meta.fileName.replace(/"/g, "")}"`;
    }

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch (err) {
    console.error("[chat/messages/attachment] media download failed", err);
    return new NextResponse(null, { status: 502 });
  }
}
