/**
 * GET /api/notifications
 *
 * Returns a unified list of operational notifications derived from real data:
 *   - Conversations with unread messages (urgency by status)
 *   - Orders that are delayed (past expected completion thresholds)
 *
 * Auth required (tenant context injected by middleware).
 * Designed to be polled every ~10 seconds by the TopBar bell.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { unauthorized, serverError } from "@/lib/api-response";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifType = "atendimento" | "pedido" | "pagamento" | "sistema";
export type NotifPriority = "normal" | "important" | "urgent";

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
      const firstName = conv.customer.name.trim().split(/\s+/)[0];

      let priority: NotifPriority;
      let message: string;

      if (conv.status === "OPEN") {
        // Open + unread → customer is waiting, no one handling
        priority = "urgent";
        message = `${firstName} aguarda atendimento humano`;
      } else if (conv.status === "BOT") {
        priority = "important";
        message = `Nova mensagem de ${firstName} (IA em andamento)`;
      } else {
        // HUMAN
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
      const statusLabel = ORDER_STATUS_LABELS[order.status as string] ?? order.status;

      notifications.push({
        id: `order-${order.id}`,
        type: "pedido",
        priority: ageMs > threshold * 2 ? "urgent" : "important",
        message: `Pedido #${shortId} de ${firstName} há ${minutes}min (${statusLabel})`,
        href: "/orders",
        createdAt: order.createdAt.toISOString(),
      });
    }

    // ── Sort: urgent first, then by recency ──────────────────────────────────
    const PRIORITY_SCORE: Record<NotifPriority, number> = {
      urgent: 0,
      important: 1,
      normal: 2,
    };

    notifications.sort((a, b) => {
      const pd = PRIORITY_SCORE[a.priority] - PRIORITY_SCORE[b.priority];
      if (pd !== 0) return pd;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    return serverError();
  }
}
