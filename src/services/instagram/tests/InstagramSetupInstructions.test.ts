/**
 * Instagram setup instructions — pure, no secrets.
 *
 *   contains every required env-var name + the recommended app secret.
 *   webhook URL + `messages` field; App Review/Tester reminder; never embeds a value.
 */

import { describe, it, expect } from "vitest";
import {
  buildInstagramSetupInstructions,
  instagramWebhookUrl,
  INSTAGRAM_WEBHOOK_FIELD,
  INSTAGRAM_REQUIRED_ENV,
  INSTAGRAM_REVIEW_SCOPES,
} from "../instagramSetupInstructions";

describe("buildInstagramSetupInstructions", () => {
  const txt = buildInstagramSetupInstructions();

  it("contains every required env-var name (+ the recommended app secret)", () => {
    for (const name of INSTAGRAM_REQUIRED_ENV) expect(txt).toContain(name);
    expect(txt).toContain("INSTAGRAM_APP_SECRET");
    expect(txt).toContain("FACEBOOK_APP_ID");
    expect(txt).toContain("FACEBOOK_APP_SECRET");
  });

  it("includes the webhook URL and the `messages` field", () => {
    expect(txt).toContain("https://foocci.com.br/api/webhooks/instagram");
    expect(txt).toContain(INSTAGRAM_WEBHOOK_FIELD);
  });

  it("lists the review scopes and warns about App Review / Tester", () => {
    for (const s of INSTAGRAM_REVIEW_SCOPES) expect(txt).toContain(s);
    expect(txt.toUpperCase()).toContain("APP REVIEW");
    expect(txt.toUpperCase()).toContain("TESTER");
  });

  it("never embeds a secret value (env lines end with `=` only)", () => {
    expect(txt).toMatch(/META_APP_SECRET=\s/);
    expect(txt).toMatch(/INSTAGRAM_WEBHOOK_VERIFY_TOKEN=\s*$/m);
    expect(txt).not.toMatch(/INSTAGRAM_WEBHOOK_VERIFY_TOKEN=\S/);
  });

  it("instagramWebhookUrl respects a custom base and strips a trailing slash", () => {
    expect(instagramWebhookUrl("https://example.com/")).toBe("https://example.com/api/webhooks/instagram");
  });
});
