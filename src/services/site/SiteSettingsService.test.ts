/**
 * Site analytics ids — validated because they are interpolated into a <script>.
 *
 * These values go into the page source of every public page. A malformed one is not a
 * cosmetic problem: it is a script-injection vector. So the rule is a strict whitelist,
 * and anything that does not match is DROPPED rather than rendered.
 *
 * The other half of the contract is that the site must never break because analytics is
 * misconfigured — a wrong id means no tracking, never a broken page.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { siteSettings: { findUnique: vi.fn() } } }));

import { SiteSettingsService } from "./SiteSettingsService";

const { cleanGa, cleanPixel, cleanVerification } = SiteSettingsService.validate;

describe("cleanGa — GA4 measurement id", () => {
  it("accepts a real id", () => {
    expect(cleanGa("G-ABC1234567")).toBe("G-ABC1234567");
    expect(cleanGa("  G-XYZ99999  ")).toBe("G-XYZ99999");
  });

  it("rejects anything that could break out of the script tag", () => {
    for (const bad of [
      "G-ABC';alert(1);//",
      "</script><script>alert(1)</script>",
      "G-ABC 1234",
      "UA-12345-1", // old Universal Analytics, not GA4
      "",
      null,
      undefined,
    ]) {
      expect(cleanGa(bad as string)).toBeNull();
    }
  });
});

describe("cleanPixel — Meta Pixel id", () => {
  it("accepts digits only", () => {
    expect(cleanPixel("123456789012345")).toBe("123456789012345");
  });

  it("rejects letters, quotes and injection attempts", () => {
    for (const bad of ["12345", "abc123456789", "123');fbq('track", "", null]) {
      expect(cleanPixel(bad as string)).toBeNull();
    }
  });
});

describe("cleanVerification — Search Console token", () => {
  it("accepts the token format Google issues", () => {
    expect(cleanVerification("abcDEF123_-xyz789")).toBe("abcDEF123_-xyz789");
  });

  it("rejects markup — the operator may paste the whole meta tag by mistake", () => {
    expect(cleanVerification('<meta name="google-site-verification" content="x" />')).toBeNull();
    expect(cleanVerification("short")).toBeNull();
  });
});
