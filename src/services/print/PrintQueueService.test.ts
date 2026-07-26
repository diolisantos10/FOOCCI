/**
 * PrintQueueService — station routing + idempotency.
 *   - CAIXA gets the full nota (all items); kitchens get only their routed items.
 *   - Caixa-only categories print NO kitchen comanda; unmapped ones fall back to the
 *     single default kitchen (never sprayed to all, never lost).
 *   - The printQueuedAt stamp makes enqueue once-only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  order:        { updateMany: vi.fn(), findUnique: vi.fn() },
  restaurant:   { findUnique: vi.fn() },
  printStation: { findMany: vi.fn() },
  menuCategory: { findMany: vi.fn() },
  printAgent:   { findUnique: vi.fn() },
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
  db.printAgent.findUnique.mockResolvedValue({ kitchenLargeFont: false });
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

  it("each kitchen gets only its routed items; unmapped falls back to ONE default kitchen", async () => {
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const j = jobsByStation();
    // Cozinha 1 is the default kitchen (first printable): sushi (cz1) + frango (cz1,cz2) + coca (unmapped→default)
    expect(j.COZINHA_1).toContain("HOT ROLL");
    expect(j.COZINHA_1).toContain("FRANGO EMPANADO");
    expect(j.COZINHA_1).toContain("COCA");
    // Cozinha 2: frango (cz2) only — NOT sushi (cz1 only), and NOT coca (unmapped no longer sprays here)
    expect(j.COZINHA_2).toContain("FRANGO EMPANADO");
    expect(j.COZINHA_2).not.toContain("COCA");
    expect(j.COZINHA_2).not.toContain("HOT ROLL");
    // kitchens carry no prices
    expect(j.COZINHA_1).not.toContain("TOTAL(=)");
  });

  it("a category mapped ONLY to the caixa prints no kitchen comanda (the nota already lists it)", async () => {
    db.menuCategory.findMany.mockResolvedValue([
      { id: "cat_sushi",  printStationKeys: ["CAIXA"] },      // caixa-only → no kitchen
      { id: "cat_frango", printStationKeys: ["COZINHA_2"] },
      { id: "cat_bebida", printStationKeys: ["COZINHA_2"] },
    ]);
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const j = jobsByStation();
    // Sushi routed to the caixa only → must not surface on any kitchen comanda…
    expect(j.COZINHA_1 ?? "").not.toContain("HOT ROLL");
    expect(j.COZINHA_2 ?? "").not.toContain("HOT ROLL");
    // …yet the caixa nota still lists every item, sushi included.
    expect(j.CAIXA).toContain("HOT ROLL");
  });

  it("unmapped items never spray to every kitchen — only the single default one", async () => {
    db.menuCategory.findMany.mockResolvedValue([
      { id: "cat_sushi",  printStationKeys: [] },
      { id: "cat_frango", printStationKeys: [] },
      { id: "cat_bebida", printStationKeys: [] },
    ]);
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const j = jobsByStation();
    // Everything lands on the default kitchen (Cozinha 1)…
    expect(j.COZINHA_1).toContain("HOT ROLL");
    expect(j.COZINHA_1).toContain("FRANGO EMPANADO");
    expect(j.COZINHA_1).toContain("COCA");
    // …and Cozinha 2 gets no comanda at all — no spray.
    expect(j.COZINHA_2).toBeUndefined();
  });

  it("a kitchen sharing the caixa printer gets NO comanda there — caixa = nota only", async () => {
    // Cozinha 1 mis-assigned to the caixa's physical printer.
    db.printStation.findMany.mockResolvedValue([
      { key: "CAIXA",     name: "Caixa",     printerName: "Caixa01", enabled: true, position: 0 },
      { key: "COZINHA_1", name: "Cozinha 1", printerName: "Caixa01", enabled: true, position: 1 },
      { key: "COZINHA_2", name: "Cozinha 2", printerName: "Cz2",     enabled: true, position: 2 },
    ]);
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const arg = db.printJob.createMany.mock.calls[0][0].data as Array<{ stationKey: string; printerName: string; body: string }>;
    // Exactly one job lands on Caixa01, and it's the full nota (not a comanda).
    const onCaixaPrinter = arg.filter((j) => j.printerName === "Caixa01");
    expect(onCaixaPrinter).toHaveLength(1);
    expect(onCaixaPrinter[0]!.stationKey).toBe("CAIXA");
    expect(onCaixaPrinter[0]!.body).toContain("TOTAL(=)");
    // Cozinha 2 still prints normally.
    expect(arg.some((j) => j.stationKey === "COZINHA_2")).toBe(true);
  });

  it("CAIXA + CUPOM on the same printer print the nota only once", async () => {
    db.printStation.findMany.mockResolvedValue([
      { key: "CAIXA", name: "Caixa", printerName: "Caixa01", enabled: true, position: 0 },
      { key: "CUPOM", name: "Cupom", printerName: "Caixa01", enabled: true, position: 1 },
    ]);
    await PrintQueueService.maybeEnqueueOrder("rest_1", "ord_1");
    const arg = db.printJob.createMany.mock.calls[0][0].data as Array<{ printerName: string }>;
    expect(arg.filter((j) => j.printerName === "Caixa01")).toHaveLength(1);
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

describe("reprint + large font", () => {
  it("reprintOrder bypasses the once-only guard and reports job count", async () => {
    db.printJob.createMany.mockResolvedValue({ count: 3 });
    const res = await PrintQueueService.reprintOrder("rest_1", "ord_1");
    expect(db.order.updateMany).not.toHaveBeenCalled(); // no guard stamp on reprint
    expect(res).toEqual({ ok: true, jobs: 3 });
  });

  it("kitchen body carries ESC/POS double-height only when the agent opts in", async () => {
    db.printAgent.findUnique.mockResolvedValue({ kitchenLargeFont: true });
    await PrintQueueService.reprintOrder("rest_1", "ord_1");
    const j = jobsByStation();
    expect(j.COZINHA_1).toContain("\x1d\x21\x01"); // big-font code present
    expect(j.CAIXA).not.toContain("\x1d\x21\x01"); // cashier never big
  });
});
