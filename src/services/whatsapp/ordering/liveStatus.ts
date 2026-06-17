/**
 * WhatsApp Text Order — live status (read-only, no PII).
 *
 * Aggregates the last hour of REAL (source="webhook") ordering sessions so the
 * team can watch the go-live: how many customers entered the flow, how many
 * orders/Pix were created, how many handed off, and a few safe error summaries.
 * Returns ONLY counts + internal ids + status-derived reasons — never a phone,
 * name, address, item or message content.
 */

import { prisma } from "@/lib/prisma";

export interface LiveStatusError {
  time: string;
  conversationId: string | null;
  reason: string;
  safeSummary: string;
}

export interface LiveStatusResult {
  ok: boolean;
  restaurantSlug: string | null;
  windowMinutes: number;
  lastHour: {
    conversationsEnteredTextOrder: number;
    ordersCreated: number;
    pixGenerated: number;
    handoffs: number;
    errors: number;
    unknownResponses: number;
  };
  lastErrors: LiveStatusError[];
  generatedAt: string;
  error: string | null;
}

const WINDOW_MS = 60 * 60 * 1000;

const STATUS_REASON: Record<string, string> = {
  HANDOFF_REQUIRED: "cliente encaminhado para atendente",
  CANCELLED: "sessão cancelada",
  EXPIRED: "sessão expirou sem concluir",
};

export async function getWhatsAppLiveStatus(input: {
  restaurantId?: string;
  restaurantSlug?: string;
}): Promise<LiveStatusResult> {
  const base: LiveStatusResult = {
    ok: false, restaurantSlug: input.restaurantSlug ?? null, windowMinutes: 60,
    lastHour: { conversationsEnteredTextOrder: 0, ordersCreated: 0, pixGenerated: 0, handoffs: 0, errors: 0, unknownResponses: 0 },
    lastErrors: [], generatedAt: new Date().toISOString(), error: null,
  };

  let restaurantId = input.restaurantId ?? null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant.findFirst({ where: { slug: input.restaurantSlug }, select: { id: true } }).catch(() => null);
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) {
    base.error = "restaurante não encontrado";
    return base;
  }

  const since = new Date(Date.now() - WINDOW_MS);

  // Only REAL customer sessions (source="webhook"); admin_test never counts.
  const sessions = await prisma.whatsAppOrderingSession
    .findMany({
      where: { restaurantId, source: "webhook", createdAt: { gte: since } },
      select: {
        conversationId: true, status: true, paymentStatus: true,
        orderId: true, pixPaymentId: true, createdAt: true, updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    })
    .catch(() => [] as Array<{
      conversationId: string | null; status: string; paymentStatus: string | null;
      orderId: string | null; pixPaymentId: string | null; createdAt: Date; updatedAt: Date;
    }>);

  const errorStatuses = new Set(["CANCELLED", "EXPIRED"]);
  const lastErrors: LiveStatusError[] = [];
  let ordersCreated = 0, pixGenerated = 0, handoffs = 0, errors = 0;

  for (const s of sessions) {
    if (s.orderId) ordersCreated++;
    if (s.pixPaymentId || s.paymentStatus === "AWAITING_PIX" || s.paymentStatus === "PAID") pixGenerated++;
    if (s.status === "HANDOFF_REQUIRED") handoffs++;
    if (errorStatuses.has(s.status) || s.paymentStatus === "FAILED") {
      errors++;
      if (lastErrors.length < 10) {
        lastErrors.push({
          time: s.updatedAt.toISOString(),
          conversationId: s.conversationId,
          reason: s.paymentStatus === "FAILED" ? "pagamento falhou" : (STATUS_REASON[s.status] ?? s.status),
          safeSummary: "sessão não concluída — sem dados pessoais expostos",
        });
      }
    }
  }

  base.ok = true;
  base.lastHour = {
    conversationsEnteredTextOrder: sessions.length,
    ordersCreated,
    pixGenerated,
    handoffs,
    errors,
    // unknownResponses live in the receptionist log (not the ordering session),
    // so they are reported via the receptionist `responseType` log, not here.
    unknownResponses: 0,
  };
  base.lastErrors = lastErrors;
  return base;
}
