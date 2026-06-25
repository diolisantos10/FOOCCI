/**
 * PrintQueueService — station routing + idempotency.
 *   - CAIXA gets the full nota (all items); kitchens get only their routed items.
 *   - Unmapped-category items fall back to ALL kitchens (never lost).
 *   - The printQueuedAt stamp makes enqueue once-only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  order:        { updateMany: vi.fn(), findUnique: vi.fn() },
  restaurant:   { findUnique: vi.fn() },
  printStation: { findMany: vi.fn() },
  menuCategory: { findMany: vi.fn() },
  printJob:     { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { PrintQueueService } from "./PrintQueueService";

const ORDER = {
  id: "ord_1", orderNumber: 50, type: "DELIVERY",
  subtotal: 100, deliveryFee: 5, discount: 0, total: 105, notes: null,
  createdAt: new Date("2026-06-24T21:00:00Z"), estimatedAt: null,
  customer: { name: "Cliente", phone: "11999998888" },
  deliveryAddress: { street: "R. A", number: "1", complement: null, neighborhood: "Centro", city: "Poá", state: "SP" },
  payment: { method: "ONLINE", amount: 105, status: "PAID" },
  items: [
    { name: "Hot Roll",        price: 30, quantity: 1, notes: null, addonsJson: null, categoryId: "cat_sushi" },
    { name: "Frango Empanado", price: 20, quantity: 2, notes: null, addonsJson: null, categoryId: "cat_frango" },
    { name: "Coca",            price: 10, quantity: 3, notes: null, addonsJson: null, categoryId: "cat_bebida" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.order.updateMany.mockResolvedValue({ count: 1 }); // guard wins
  db.order.findUnique.mockResolvedValue(ORDER);
  db.restaurant.findUnique.mockResolvedValue({ name: "Sushi Cazza", address: null, timezone: "America/Sao_Paulo", storeProfile: { cnpj: "123", street: "Av X", streetNumber: "10", complement: null, neighborhood: "Centro", city: "Poá", state: "SP", cep: null } });
  db.printStation.findMany.mockResolvedValue([
    { key: "CAIXA",     name: "Caixa",     printerName: "Caixa01", enabled: true, position: 0 },
    { key: "COZINHA_1", name: "Cozinha 1", printerName: "Cz1",     enabled: true, position: 1 },
    { key: "COZINHA_2", name: "Cozinha 2", printerName: "Cz2",     enabled: true, position: 2 },
  ]);
  db.menuCategory.findMany.mockResolvedValue([
    { id: "cat_sushi",  printStationKeys: ["COZINHA_1"] },
    { id: "cat_frango", printStationKeys: ["COZINHA_1", "COZINHA_2"] },
    { id: "cat_bebida", printStationKeys: [] }, // unmapped → fail-safe to all kitchens
  ]);
  db.printJob.createMany.mockResolvedValue({ count: 0 });
});

function jobsByStation() {
  const arg = db.printJob.createMany.mock.calls[0][0].data as Array<{ stationKey: string; body: string }>;
  return Object.fromEntries(arg.map((j) => [j.stationKey, j.body]));
}

describe("station routing", () => {
  it("CAIXA gets the full nota with every item + totals", async () => {
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const j = jobsByStation();
    expect(j.CAIXA).toContain("HOT ROLL");
    expect(j.CAIXA).toContain("FRANGO EMPANADO");
    expect(j.CAIXA).toContain("COCA");
    expect(j.CAIXA).toContain("TOTAL(=)");
  });

  it("each kitchen gets only its routed items (+ unmapped fail-safe)", async () => {
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const j = jobsByStation();
    // Cozinha 1: sushi (cz1) + frango (cz1,cz2) + coca (unmapped→all)
    expect(j.COZINHA_1).toContain("HOT ROLL");
    expect(j.COZINHA_1).toContain("FRANGO EMPANADO");
    expect(j.COZINHA_1).toContain("COCA");
    // Cozinha 2: frango (cz2) + coca (unmapped→all), but NOT sushi (only cz1)
    expect(j.COZINHA_2).toContain("FRANGO EMPANADO");
    expect(j.COZINHA_2).toContain("COCA");
    expect(j.COZINHA_2).not.toContain("HOT ROLL");
    // kitchens carry no prices
    expect(j.COZINHA_1).not.toContain("TOTAL(=)");
  });

  it("is idempotent — does nothing when the guard already stamped", async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(db.printJob.createMany).not.toHaveBeenCalled();
  });

  it("enqueues nothing when no station has a printer", async () => {
    db.printStation.findMany.mockResolvedValue([
      { key: "CAIXA", name: "Caixa", printerName: null, enabled: true, position: 0 },
    ]);
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    expect(db.printJob.createMany).not.toHaveBeenCalled();
  });
});
