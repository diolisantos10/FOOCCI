/**
 * GET /api/admin/brain/activity?restaurantId=..&days=N
 *
 * Observabilidade PERSISTENTE do Brain ao vivo — lê o banco (não o log efêmero
 * do Railway, que só guarda ~500 linhas e rola rápido). Conta as respostas REAIS
 * que o Brain deu a clientes (mensagens OUTBOUND senderType=AI com
 * metadata.source = "WHATSAPP_BRAIN") na janela, por intenção, com amostras
 * sanitizadas. Assim os check-ins têm número de verdade sobre como o Brain se
 * comportou nos últimos dias. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }
  const days = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("days") ?? 7), 60));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Respostas REAIS do Brain a clientes (metadata.source = WHATSAPP_BRAIN).
  const brainWhere = {
    conversation: { is: { restaurantId } },
    direction: "OUTBOUND" as const,
    senderType: "AI",
    sentAt: { gte: since },
    metadata: { path: ["source"], equals: "WHATSAPP_BRAIN" },
  };

  const [brainReplies, customerInbound, recent] = await Promise.all([
    prisma.message.count({ where: brainWhere }).catch(() => 0),
    prisma.message
      .count({
        where: {
          conversation: { is: { restaurantId } },
          direction: "INBOUND",
          type: "TEXT",
          sentAt: { gte: since },
        },
      })
      .catch(() => 0),
    prisma.message
      .findMany({
        where: brainWhere,
        orderBy: { sentAt: "desc" },
        take: 400,
        select: { content: true, sentAt: true, metadata: true },
      })
      .catch(() => [] as Array<{ content: string; sentAt: Date; metadata: unknown }>),
  ]);

  // Quebra por intenção + amostras (sanitizadas).
  const byIntent: Record<string, number> = {};
  const samples: Array<{ when: string; intent: string; reply: string }> = [];
  for (const m of recent) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const intent = typeof meta.brainIntent === "string" ? meta.brainIntent : "—";
    byIntent[intent] = (byIntent[intent] ?? 0) + 1;
    if (samples.length < 15) {
      samples.push({ when: m.sentAt.toISOString(), intent, reply: sanitizeText(m.content).slice(0, 160) });
    }
  }

  return NextResponse.json({
    ok: true,
    restaurantId,
    windowDays: days,
    since: since.toISOString(),
    summary: {
      brainRepliesToCustomers: brainReplies,
      customerTextMessages: customerInbound,
      sampledForBreakdown: recent.length,
    },
    byIntent,
    samples,
    runtimeTouched: false,
  });
}
