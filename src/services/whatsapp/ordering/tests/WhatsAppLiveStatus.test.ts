/**
 * WhatsAppLiveStatus — go-live monitor is read-only and exposes NO PII.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findFirst: vi.fn() },
  whatsAppOrderingSession: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getWhatsAppLiveStatus } from "../liveStatus";

const now = new Date();
function session(over: Record<string, unknown> = {}) {
  return {
    conversationId: "conv-1", status: "ACTIVE", paymentStatus: null,
    orderId: null, pixPaymentId: null, createdAt: now, updatedAt: now, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.restaurant.findFirst.mockResolvedValue({ id: "r1" });
});

describe("getWhatsAppLiveStatus", () => {
  it("agrega a última hora: sessões, pedidos, pix, handoff, erros", async () => {
    db.whatsAppOrderingSession.findMany.mockResolvedValue([
      session({ orderId: "o1", pixPaymentId: "p1", paymentStatus: "PAID" }),
      session({ status: "HANDOFF_REQUIRED" }),
      session({ status: "CANCELLED" }),
      session({}),
    ]);
    const r = await getWhatsAppLiveStatus({ restaurantSlug: "sushi-cazza" });
    expect(r.ok).toBe(true);
    expect(r.lastHour.conversationsEnteredTextOrder).toBe(4);
    expect(r.lastHour.ordersCreated).toBe(1);
    expect(r.lastHour.pixGenerated).toBe(1);
    expect(r.lastHour.handoffs).toBe(1);
    expect(r.lastHour.errors).toBe(1);
  });

  it("só conta sessões REAIS (source=webhook)", async () => {
    db.whatsAppOrderingSession.findMany.mockResolvedValue([]);
    await getWhatsAppLiveStatus({ restaurantSlug: "sushi-cazza" });
    const where = db.whatsAppOrderingSession.findMany.mock.calls[0][0].where;
    expect(where.source).toBe("webhook");
  });

  it("NÃO expõe PII (sem phone/name/address/items/content)", async () => {
    db.whatsAppOrderingSession.findMany.mockResolvedValue([
      session({ status: "CANCELLED", conversationId: "conv-9" }),
    ]);
    const r = await getWhatsAppLiveStatus({ restaurantSlug: "sushi-cazza" });
    const blob = JSON.stringify(r).toLowerCase();
    for (const pii of ["phone", "telefone", "address", "endere", "\"name\"", "items", "content", "messagetext"]) {
      expect(blob).not.toContain(pii);
    }
    // a select não pode pedir campos sensíveis
    const select = db.whatsAppOrderingSession.findMany.mock.calls[0][0].select;
    expect(select.phone).toBeUndefined();
    expect(select.address).toBeUndefined();
    expect(select.selectedItems).toBeUndefined();
  });

  it("restaurante inexistente → ok=false sem vazar nada", async () => {
    db.restaurant.findFirst.mockResolvedValue(null);
    const r = await getWhatsAppLiveStatus({ restaurantSlug: "nope" });
    expect(r.ok).toBe(false);
    expect(r.lastErrors).toEqual([]);
  });
});
