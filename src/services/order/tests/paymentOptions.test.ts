import { describe, it, expect } from "vitest";
import {
  payNowOptions,
  shouldShowPayNow,
  deliveryPaymentOptions,
  resolveArrivalMode,
  arrivalBlockTitle,
} from "../paymentOptions";

describe("paymentOptions — unified payment UI model", () => {
  it("'Pagar agora' shows Pix online when enabled", () => {
    expect(shouldShowPayNow(true)).toBe(true);
    const opts = payNowOptions(true);
    expect(opts).toHaveLength(1);
    expect(opts[0].id).toBe("pix_online");
    expect(opts[0].label).toBe("Pix");
  });

  it("'Pagar agora' is hidden when Pix online is unavailable", () => {
    expect(shouldShowPayNow(false)).toBe(false);
    expect(payNowOptions(false)).toEqual([]);
  });

  it("'Pagar na entrega' lists the existing on-arrival methods (no invented method)", () => {
    const ids = deliveryPaymentOptions().map((o) => o.id);
    expect(ids).toEqual(["cash", "card_machine", "pix_in_person"]);
    // every id is one of the existing PaymentMethodSub values
    for (const id of ids) expect(["cash", "card_machine", "pix_in_person"]).toContain(id);
  });

  it("maps fulfillment type to the existing arrival payment mode", () => {
    expect(resolveArrivalMode("delivery")).toBe("pay_on_delivery");
    expect(resolveArrivalMode("pickup")).toBe("pay_on_pickup");
    expect(resolveArrivalMode(null)).toBe("pay_on_delivery");
  });

  it("uses the right block title for delivery vs pickup", () => {
    expect(arrivalBlockTitle("delivery")).toBe("Pagar na entrega");
    expect(arrivalBlockTitle("pickup")).toBe("Pagar na retirada");
  });
});
