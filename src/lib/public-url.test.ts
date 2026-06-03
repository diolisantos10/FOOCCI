/**
 * Canonical Evolution webhook URL — single source of truth.
 *
 * Guards against the bug where the diagnostics card said foocci.com.br but the
 * live-status/sync derived the URL from the Railway proxy host
 * (foocci.up.railway.app), risking a wrong webhook being configured.
 */

import { describe, it, expect } from "vitest";
import { getExpectedEvolutionWebhookUrl, getPublicSiteUrl } from "./public-url";

describe("getExpectedEvolutionWebhookUrl", () => {
  it("is the canonical site URL + /api/webhooks/evolution", () => {
    expect(getExpectedEvolutionWebhookUrl()).toBe(
      `${getPublicSiteUrl()}/api/webhooks/evolution`,
    );
  });

  it("never points at a Railway proxy host", () => {
    expect(getExpectedEvolutionWebhookUrl()).not.toContain(".railway.app");
  });

  it("has no trailing slash before the path and no token", () => {
    const url = getExpectedEvolutionWebhookUrl();
    expect(url.endsWith("/api/webhooks/evolution")).toBe(true);
    expect(url).not.toContain("?token=");
  });

  it("defaults to https://foocci.com.br in the test env (no site env set)", () => {
    // No NEXT_PUBLIC_SITE_URL in unit env → hard fallback.
    expect(getExpectedEvolutionWebhookUrl()).toBe(
      "https://foocci.com.br/api/webhooks/evolution",
    );
  });
});
