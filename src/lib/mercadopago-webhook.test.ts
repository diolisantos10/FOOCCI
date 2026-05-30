import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { verifyMpWebhookSignature } from "./mercadopago";

const TEST_SECRET = "test_mp_webhook_secret_abc123";
const DATA_ID     = "1234567890";
const REQUEST_ID  = "req-uuid-test-001";
const TS          = "1704682860";

function buildSignature(dataId: string, requestId: string, ts: string, secret = TEST_SECRET): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest, "utf8").digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("verifyMpWebhookSignature", () => {
  beforeEach(() => {
    vi.stubEnv("MERCADO_PAGO_WEBHOOK_SECRET", TEST_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verified — valid signature for known sample data", () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, TS);
    expect(verifyMpWebhookSignature(DATA_ID, xSignature, REQUEST_ID)).toBe("verified");
  });

  it("verified — different valid inputs produce correct manifest", () => {
    const xSignature = buildSignature("9999", "req-other", "1600000000");
    expect(verifyMpWebhookSignature("9999", xSignature, "req-other")).toBe("verified");
  });

  it("invalid — wrong dataId", () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, TS);
    expect(verifyMpWebhookSignature("0000000000", xSignature, REQUEST_ID)).toBe("invalid");
  });

  it("invalid — wrong requestId", () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, TS);
    expect(verifyMpWebhookSignature(DATA_ID, xSignature, "different-request-id")).toBe("invalid");
  });

  it("invalid — signed with wrong secret", () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, TS, "totally_wrong_secret");
    expect(verifyMpWebhookSignature(DATA_ID, xSignature, REQUEST_ID)).toBe("invalid");
  });

  it("invalid — tampered v1 (all-zeros)", () => {
    const xSignature = `ts=${TS},v1=${"0".repeat(64)}`;
    expect(verifyMpWebhookSignature(DATA_ID, xSignature, REQUEST_ID)).toBe("invalid");
  });

  it("invalid — malformed x-signature (no ts or v1 keys)", () => {
    expect(verifyMpWebhookSignature(DATA_ID, "garbage_string", REQUEST_ID)).toBe("invalid");
  });

  it("invalid — x-signature has ts but missing v1", () => {
    expect(verifyMpWebhookSignature(DATA_ID, `ts=${TS}`, REQUEST_ID)).toBe("invalid");
  });

  it("invalid — non-hex v1 value", () => {
    expect(verifyMpWebhookSignature(DATA_ID, `ts=${TS},v1=not_hex_at_all!!!`, REQUEST_ID)).toBe("invalid");
  });

  it("missing — empty x-signature string", () => {
    expect(verifyMpWebhookSignature(DATA_ID, "", REQUEST_ID)).toBe("missing");
  });

  it("no_secret — secret env var not set", () => {
    vi.unstubAllEnvs();
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, TS);
    expect(verifyMpWebhookSignature(DATA_ID, xSignature, REQUEST_ID)).toBe("no_secret");
  });
});
