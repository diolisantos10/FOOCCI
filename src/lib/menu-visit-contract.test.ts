/**
 * Contract test for the conversion "visita" signal.
 *
 * A visita = an IDENTIFIED entry: someone who passed the mandatory phone screen.
 * It is logged SERVER-SIDE in /api/qr/[slug]/identify (reliable, ad-block-proof,
 * one row per entry). The old client-side open-beacon was removed because it
 * counted anonymous bounces and could be blocked/missed.
 *
 * These are source-level guards so a future refactor can't silently regress the
 * KPI back to "1 visita" (the bug where an identified-only filter crashed the
 * historical count, or a double-counting client beacon inflated it).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("conversion visita contract", () => {
  it("identify route logs an identified visit (MenuEvent with customerId)", () => {
    const src = read("src/app/api/qr/[slug]/identify/route.ts");
    expect(src).toContain("menuEvent");
    expect(src).toMatch(/logVisit\s*\(/);
    // Fire-and-forget so analytics never blocks or fails the identify response.
    expect(src).toMatch(/void\s+prisma\.menuEvent\s*\.?\s*\n?\s*\.create/);
  });

  it("logs a visit in BOTH the existing-customer and new-customer branches", () => {
    const src = read("src/app/api/qr/[slug]/identify/route.ts");
    const calls = src.match(/logVisit\(/g) ?? [];
    // one definition + two call sites (existing + newly-created)
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("PedidoClient no longer fires the fragile open-beacon", () => {
    const src = read("src/app/pedido/[slug]/PedidoClient.tsx");
    expect(src).not.toContain("menu/analytics/event");
    expect(src).not.toContain("viewFiredKey");
  });

  it("conversion = buyers ÷ loggers (compraram ÷ logaram com o número)", () => {
    const src = read("src/app/api/dashboard/route.ts");
    // Denominator = loggers (distinct identified customers); numerator = buyers.
    expect(src).toMatch(/loggersNow\s*>\s*0\s*\?\s*Math\.round\(\(buyersNowN\s*\/\s*loggersNow\)/);
    // Loggers are built from login-events (MenuEvent w/ customerId) + carts + buyers,
    // so they have real history AND buyers are a subset (ratio always ≤ 100%).
    expect(src).toContain("loggersNowSet");
    expect(src).toMatch(/prisma\.orderDraft\.findMany/);
    expect(src).toMatch(/customerId:\s*\{\s*not:\s*null\s*\}[\s\S]*?distinct:\s*\[\s*"customerId"\s*\]/);
    // The old "count every open" and clamp hacks are gone.
    expect(src).not.toContain("visitsNowAdj");
    expect(src).not.toContain("CARDAPIO_ORDER_SOURCES");
  });
});
