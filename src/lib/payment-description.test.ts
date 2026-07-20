import { describe, it, expect } from "vitest";
import { paymentDescription } from "@/lib/payment-description";

describe("paymentDescription", () => {
  it("always includes Foocci + the restaurant name", () => {
    expect(paymentDescription("Sushi Cazza")).toBe("Foocci - Sushi Cazza");
    expect(paymentDescription("  Pizza do Zé  ")).toBe("Foocci - Pizza do Zé");
  });

  it("falls back to Foocci alone when the name is missing", () => {
    expect(paymentDescription()).toBe("Foocci");
    expect(paymentDescription("")).toBe("Foocci");
    expect(paymentDescription(null)).toBe("Foocci");
  });
});
