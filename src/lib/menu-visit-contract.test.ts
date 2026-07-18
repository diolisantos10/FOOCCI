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

  it("dashboard counts every MenuEvent (no customerId filter that would crash history)", () => {
    const src = read("src/app/api/dashboard/route.ts");
    // The two visit counts (current + previous period) must NOT filter customerId,
    // otherwise historical rows (null customerId from the old beacon) drop to ~0.
    const marker = "prisma.menuEvent.count(";
    const positions: number[] = [];
    for (let i = src.indexOf(marker); i !== -1; i = src.indexOf(marker, i + 1)) positions.push(i);
    expect(positions.length).toBeGreaterThanOrEqual(2);
    for (const pos of positions) {
      // inspect the count() call body (a comfortable window past the marker)
      const block = src.slice(pos, pos + 220);
      expect(block).not.toContain("customerId");
    }
  });
});
