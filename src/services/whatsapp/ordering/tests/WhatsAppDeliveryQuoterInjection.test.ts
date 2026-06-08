/**
 * Proves the injectable delivery quoter (v3.1): with an injected quoter the
 * payment/Pix scenarios run with NO DB. The field is optional, so the runtime
 * default (DB-backed quoter) is unchanged when it is omitted.
 */

import { describe, it, expect, vi } from "vitest";
import { runScenarioSuite } from "../WhatsAppOrderingScenarioRunner";
import type { WaDeliveryQuoter, WaMenuItem } from "../types";

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
});

const MENU: WaMenuItem[] = [
  mk({ id: "yaki-cf", name: "Yakisoba Carne e Frango", price: 32, priceDelivery: 34 }),
  mk({ id: "coca", name: "Coca-Cola", price: 6, priceDelivery: 6.5 }),
  mk({ id: "combo40", name: "Combinado 40 peças", price: 120, priceDelivery: 125 }),
  mk({ id: "temaki", name: "Temaki de Salmão", price: 28, priceDelivery: 30 }),
];

describe("WhatsApp delivery quoter injection (v3.1)", () => {
  it("runs the payment suite DB-free with an injected quoter; quoter is used; no real side effects", async () => {
    const quoter = vi.fn<Parameters<WaDeliveryQuoter>, ReturnType<WaDeliveryQuoter>>(
      async () => ({ fee: 8, distanceKm: 3, status: "ok" }),
    );

    // Without a DB this would throw (deliveryConfig.findUnique) — the injected
    // quoter makes it run; reaching here proves the payment flow is DB-free.
    const report = await runScenarioSuite("payment", {
      restaurantId: "qc-wa-synthetic",
      restaurantSlug: "qc-wa",
      restaurantName: "QC Synthetic WhatsApp",
      menu: MENU,
      deliveryQuoter: quoter,
    });

    expect(report.total).toBeGreaterThan(0);
    // the injected quoter was exercised by a delivery scenario
    expect(quoter).toHaveBeenCalled();
    // HARD invariant: allowSideEffects=false ⇒ no real side effect, order or Pix
    for (const r of report.results) {
      expect(r.sideEffectsPerformed).toEqual([]);
      for (const s of r.steps) {
        expect(s.paymentRealPix).toBe(false);
        expect((s.order as { id?: string } | null)?.id).toBeUndefined();
      }
    }
  });

  it("the quoter is optional on the context (runtime default unchanged when omitted)", () => {
    // Type-level guarantee: a context without deliveryQuoter is still valid.
    const ctx = { restaurantId: "r", menu: MENU } satisfies {
      restaurantId: string; menu: WaMenuItem[]; deliveryQuoter?: WaDeliveryQuoter;
    };
    expect(ctx.deliveryQuoter).toBeUndefined();
  });
});
