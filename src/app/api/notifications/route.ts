/**
 * GET /api/notifications
 *
 * Returns a unified list of operational notifications derived from real data.
 * This is a SYSTEM-WIDE notification hub covering:
 *
 *   1. Conversations awaiting human support or with unread messages
 *   2. Delayed orders (past expected completion thresholds)
 *   3. Failed / expired payments (last 24 h)
 *   4. Integration errors (IntegrationConfig entries with a lastError)
 *
 * Auth required (tenant context injected by middleware).
 * Designed to be polled every ~10 seconds by the TopBar bell.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { unauthorized, serverError } from "@/lib/api-response";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifType =
  | "atendimento"
  | "pedido"
  | "pagamento"
  | "integracao"
  | "sistema";

export type NotifPriority = "normal" | "important" | "critical";

export interface NotificationItem {
  id: string;
  type: NotifType;
  priority: NotifPriority;
  message: string;
  href: string;
  createdAt: string; // ISO
}

// ── Delay thresholds for orders (milliseconds) ────────────────────────────────

const ORDER_DELAY_MS: Record<string, number> = {
  PENDING:   10 * 60 * 1000, // 10 min
  CONFIRMED: 20 * 60 * 1000, // 20 min
  PREPARING: 30 * 60 * 1000, // 30 min
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING:   "Novo",
  CONFIRMED: "Confirmado",
  PREPARING: "Preparando",
};

const PROVIDER_LABELS: Record<string, string> = {
  stone:        "Stone",
  mercadopago:  "Mercado Pago",
  tipos:        "Tipos",
  whatsapp:     "WhatsApp",
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { restaurantId } = ctx;
    const now = Date.now();
    const notifications: NotificationItem[] = [];

    // ── 1. Conversations with unread messages ─────────────────────────────────
    const convs = await prisma.conversation.findMany({
      where: {
        restaurantId,
        unreadCount: { gt: 0 },
        status: { not: "RESOLVED" },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        unreadCount: true,
        lastMessageAt: true,
        customer: { select: { name: true } },
      },
    });

    for (const conv of convs) {
      if (!conv.customer) continue;
      const firstName = conv.customer.name.trim().split(/\s+/)[0];

      let priority: NotifPriority;
      let message: string;

      if (conv.status === "OPEN") {
        // No agent assigned — customer is waiting for a human
        priority = "critical";
        message = `${firstName} aguarda atendimento humano`;
      } else if (conv.status === "BOT") {
        priority = "important";
        message = `Nova mensagem de ${firstName} (IA em andamento)`;
      } else {
        // HUMAN — assigned agent has new unread messages
        priority = "normal";
        message = `Nova mensagem de ${firstName}`;
      }

      notifications.push({
        id: `conv-${conv.id}`,
        type: "atendimento",
        priority,
        message,
        href: "/atendimento",
        createdAt:
          conv.lastMessageAt?.toISOString() ?? new Date().toISOString(),
      });
    }

    // ── 2. Delayed orders ────────────────────────────────────────────────────
    const pendingOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ["PENDING", "CONFIRMED", "PREPARING"] },
      },
      orderBy: { createdAt: "asc" },
      take: 15,
      select: {
        id: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });

    for (const order of pendingOrders) {
      const threshold = ORDER_DELAY_MS[order.status as string];
      if (!threshold) continue;

      const ageMs = now - new Date(order.createdAt).getTime();
      if (ageMs < threshold) continue;

      const minutes = Math.floor(ageMs / 60_000);
      const firstName = order.customer.name.trim().split(/\s+/)[0];
      const shortId = order.id.slice(-5).toUpperCase();
      const statusLabel =
        ORDER_STATUS_LABELS[order.status as string] ?? order.status;

      notifications.push({
        id: `order-${order.id}`,
        type: "pedido",
        priority: ageMs > threshold * 2 ? "critical" : "important",
        message: `Pedido #${shortId} de ${firstName} há ${minutes}min (${statusLabel})`,
        href: "/orders",
        createdAt: order.createdAt.toISOString(),
      });
    }

    // ── 3. Failed / expired payments (last 24 h) ─────────────────────────────
    const cutoff24h = new Date(now - 24 * 60 * 60_000);

    const failedPayments = await prisma.payment.findMany({
      where: {
        order: { restaurantId },
        status: { in: ["FAILED", "EXPIRED"] },
        updatedAt: { gte: cutoff24h },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            customer: { select: { name: true } },
          },
        },
      },
    });

    for (const payment of failedPayments) {
      const firstName = payment.order.customer.name.trim().split(/\s+/)[0];
      const shortId = payment.order.id.slice(-5).toUpperCase();
      const label = payment.status === "FAILED" ? "falhou" : "expirou";

      notifications.push({
        id: `payment-${payment.id}`,
        type: "pagamento",
        priority: payment.status === "FAILED" ? "important" : "normal",
        message: `Pagamento do pedido #${shortId} de ${firstName} ${label}`,
        href: "/orders",
        createdAt: payment.updatedAt.toISOString(),
      });
    }

    // ── 4. Integration errors ────────────────────────────────────────────────
    const integrationErrors = await prisma.integrationConfig.findMany({
      where: {
        restaurantId,
        lastError: { not: null },
      },
      select: {
        id: true,
        provider: true,
        lastError: true,
        updatedAt: true,
      },
    });

    for (const cfg of integrationErrors) {
      const providerLabel = PROVIDER_LABELS[cfg.provider] ?? cfg.provider;

      notifications.push({
        id: `integration-${cfg.id}`,
        type: "integracao",
        priority: "important",
        message: `Integração ${providerLabel} com erro — verifique as configurações`,
        href: "/integracoes",
        createdAt: cfg.updatedAt.toISOString(),
      });
    }

    // ── Sort: critical first, then important, then normal; ties by recency ───
    const PRIORITY_SCORE: Record<NotifPriority, number> = {
      critical:  0,
      important: 1,
      normal:    2,
    };

    notifications.sort((a, b) => {
      const pd = PRIORITY_SCORE[a.priority] - PRIORITY_SCORE[b.priority];
      if (pd !== 0) return pd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    return serverError();
  }
}
