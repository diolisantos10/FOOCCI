/**
 * Regression guard: customer-facing short-redirect routes must stay PUBLIC.
 *
 * /r/[code] (WhatsApp menu link, cart recovery) and /l/[...] (tracking links)
 * are tapped by customers who are NOT logged in. If they fall out of the
 * middleware allowlist, NextAuth bounces them to /login and every short link
 * silently breaks. This locks them into PUBLIC_PATHS.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
const publicBlock = src.slice(
  src.indexOf("PUBLIC_PATHS"),
  src.indexOf("function isPublicPath"),
);

describe("middleware — public short-redirect routes", () => {
  it("keeps /r/ (short redirects: WhatsApp menu, recovery) public", () => {
    expect(publicBlock).toContain("/^\\/r(\\/.*)?$/");
  });

  it("keeps /l/ (tracking short links) public", () => {
    expect(publicBlock).toContain("/^\\/l(\\/.*)?$/");
  });

  it("keeps /pedido public (sanity — the redirects land here)", () => {
    expect(publicBlock).toContain("/^\\/pedido(\\/.*)?$/");
  });
});
