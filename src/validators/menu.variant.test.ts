/**
 * Variant validation — price is OPTIONAL and inherits the product price when blank.
 *
 *   A/D — name + blank/null/omitted price is ACCEPTED (price null = inherit).
 *   B   — blank name is REJECTED.
 *   C   — a filled-but-invalid price (negative) is REJECTED.
 *   +   — a valid filled price is accepted (override).
 */

import { describe, it, expect } from "vitest";
import { createVariantSchema, updateVariantSchema } from "./menu";

describe("createVariantSchema — variant price is optional", () => {
  it("A/D — accepts a name with an explicit null price (inherits product)", () => {
    const r = createVariantSchema.safeParse({ name: "Coca-Cola", price: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBeNull();
  });

  it("A/D — accepts a name with the price omitted entirely", () => {
    const r = createVariantSchema.safeParse({ name: "Sprite" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price ?? null).toBeNull();
  });

  it("B — rejects a blank name", () => {
    const r = createVariantSchema.safeParse({ name: "   ".trim(), price: null });
    expect(r.success).toBe(false);
  });

  it("C — rejects a filled but invalid (negative) price", () => {
    const r = createVariantSchema.safeParse({ name: "Coca 2L", price: -5 });
    expect(r.success).toBe(false);
  });

  it("accepts a valid filled price (override)", () => {
    const r = createVariantSchema.safeParse({ name: "Coca 2L", price: 14 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe(14);
  });

  it("update — null price clears the override (inherit)", () => {
    const r = updateVariantSchema.safeParse({ price: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBeNull();
  });
});
