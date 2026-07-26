/**
 * Order → builder-item mapping. Locks the Decimal→number conversion, the codigo
 * fallback (code → menuItemId → id), and the item/categoria fiscal passthrough
 * that feeds the tax-resolution cascade.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { mapOrderItemsToBuilder, type OrderItemForFiscal } from "../FiscalEmissionService";

const D = (n: number) => new Prisma.Decimal(n);

const emptyFiscal = {
  fiscalNcm: null,
  fiscalCest: null,
  fiscalCfop: null,
  fiscalCsosn: null,
  fiscalCst: null,
  fiscalOrigem: null,
  fiscalUnidade: null,
};

describe("mapOrderItemsToBuilder", () => {
  it("maps values, converts Decimal→number, and carries item + categoria fiscal", () => {
    const items: OrderItemForFiscal[] = [
      {
        id: "oi1",
        menuItemId: "mi1",
        name: "Hot Roll",
        price: D(10),
        quantity: 2,
        total: D(20),
        menuItem: {
          code: "SKU1",
          ...emptyFiscal,
          fiscalNcm: "11111111",
          fiscalIcmsAliquota: D(18),
          category: { ...emptyFiscal, fiscalNcm: "22222222", fiscalCfop: "5102", fiscalCsosn: "102" },
        },
      },
    ];
    const [b] = mapOrderItemsToBuilder(items);
    expect(b!.codigo).toBe("SKU1");
    expect(b!.descricao).toBe("Hot Roll");
    expect(b!.quantidade).toBe(2);
    expect(b!.valorUnitario).toBe(10);
    expect(b!.valorTotal).toBe(20);
    expect(b!.item?.ncm).toBe("11111111");
    expect(b!.item?.icmsAliquota).toBe(18);
    expect(b!.categoria?.ncm).toBe("22222222");
    expect(b!.categoria?.csosn).toBe("102");
  });

  it("falls back codigo: code → menuItemId → id", () => {
    const base = { name: "X", price: D(1), quantity: 1, total: D(1) };
    const [noCode] = mapOrderItemsToBuilder([
      { id: "oi", menuItemId: "mi2", ...base, menuItem: { code: null, ...emptyFiscal, fiscalIcmsAliquota: null, category: null } },
    ]);
    expect(noCode!.codigo).toBe("mi2");

    const [noMenuItem] = mapOrderItemsToBuilder([{ id: "oiZ", menuItemId: null, ...base, menuItem: null }]);
    expect(noMenuItem!.codigo).toBe("oiZ");
    expect(noMenuItem!.item).toBeNull();
    expect(noMenuItem!.categoria).toBeNull();
  });
});
