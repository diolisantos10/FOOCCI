import { describe, it, expect } from "vitest";
import { sumupConfigSchema, parseProviderConfig, isValidProvider } from "@/validators/integrations";

describe("sumupConfigSchema", () => {
  it("accepts a valid config and coerces maxInstallments from string", () => {
    const r = sumupConfigSchema.safeParse({
      environment: "production",
      apiKey: "sup_sk_abc",
      merchantCode: "MC123",
      maxInstallments: "6",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.maxInstallments).toBe(6);
  });

  it("defaults maxInstallments to 1 (à vista) when omitted", () => {
    const r = sumupConfigSchema.safeParse({
      environment: "production",
      apiKey: "",              // empty = keep existing
      merchantCode: "MC123",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.maxInstallments).toBe(1);
  });

  it("rejects a missing merchant code and out-of-range installments", () => {
    expect(sumupConfigSchema.safeParse({ environment: "production", apiKey: "x", merchantCode: "" }).success).toBe(false);
    expect(sumupConfigSchema.safeParse({ environment: "production", apiKey: "x", merchantCode: "MC", maxInstallments: 99 }).success).toBe(false);
  });

  it("is registered as a valid provider and routes through parseProviderConfig", () => {
    expect(isValidProvider("sumup")).toBe(true);
    const parsed = parseProviderConfig("sumup", { environment: "production", apiKey: "k", merchantCode: "MC" });
    expect(parsed?.success).toBe(true);
  });
});
