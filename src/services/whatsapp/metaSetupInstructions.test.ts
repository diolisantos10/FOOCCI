/**
 * Meta platform setup instructions — pure, no secrets.
 *
 *   H — the copyable instructions contain the exact env-var names + webhook details.
 *   + uses META_GRAPH_VERSION (not META_GRAPH_API_VERSION) and never embeds a value.
 */

import { describe, it, expect } from "vitest";
import {
  buildMetaSetupInstructions,
  metaWebhookUrl,
  META_WEBHOOK_PATH,
  META_WEBHOOK_FIELD,
  META_REQUIRED_ENV,
  META_BUILD_TIME_ENV,
} from "./metaSetupInstructions";

describe("buildMetaSetupInstructions", () => {
  const txt = buildMetaSetupInstructions();

  it("H — contains every required env var name", () => {
    for (const name of META_REQUIRED_ENV) expect(txt).toContain(name);
    expect(txt).toContain("META_TEST_PHONE");
    expect(txt).toContain("META_GRAPH_VERSION=v21.0");
  });

  it("uses META_GRAPH_VERSION, never META_GRAPH_API_VERSION", () => {
    expect(txt).toContain("META_GRAPH_VERSION");
    expect(txt).not.toContain("META_GRAPH_API_VERSION");
  });

  it("includes the webhook URL and the `messages` field", () => {
    expect(txt).toContain("https://foocci.com.br/api/webhooks/meta/whatsapp");
    expect(txt).toContain(META_WEBHOOK_FIELD);
  });

  it("flags the NEXT_PUBLIC_* build-time + redeploy requirement", () => {
    for (const name of META_BUILD_TIME_ENV) expect(txt).toContain(name);
    expect(txt.toUpperCase()).toContain("REDEPLOY");
  });

  it("never embeds a secret value (env lines end with `=` only)", () => {
    // Each "META_*_SECRET=" / token line has no value after the '='.
    expect(txt).toMatch(/META_APP_SECRET=\s*$/m);
    expect(txt).toMatch(/META_WEBHOOK_VERIFY_TOKEN=\s*$/m);
    expect(txt).not.toMatch(/META_APP_SECRET=\S/);
  });

  it("metaWebhookUrl respects a custom base and strips a trailing slash", () => {
    expect(metaWebhookUrl("https://example.com/")).toBe(`https://example.com${META_WEBHOOK_PATH}`);
  });
});
