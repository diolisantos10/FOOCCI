/**
 * Meta WhatsApp Cloud provider — pure core tests (no network, no DB, no messages sent).
 *
 *   C — sendText builds the correct Graph API payload
 *   D — invalid phone is blocked before any Meta call
 *   E — webhook GET verification works (verify_token match)
 *   F — inbound text webhook normalizes to the internal shape
 *   G — every inbound carries the wamid (dedupe key the route enforces as unique)
 *   H — CRM send outside the 24h window without a template → META_TEMPLATE_REQUIRED
 *   I — CRM template send uses the template payload
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  buildMetaTextPayload,
  buildMetaTemplatePayload,
  buildMetaMediaPayload,
  toMetaRecipient,
  extractMetaMessageId,
  maskGraphResponse,
} from "./metaPayload";
import {
  verifyMetaChallenge,
  validateMetaSignature,
  normalizeMetaWebhook,
} from "./metaWebhook";
import { decideMetaSend } from "../metaSendPolicy";

describe("C — sendText payload", () => {
  it("builds the Graph API text payload", () => {
    expect(buildMetaTextPayload("5511999990000", "Olá!")).toEqual({
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to:                "5511999990000",
      type:              "text",
      text:              { body: "Olá!", preview_url: false },
    });
  });

  it("extracts the provider message id from a Graph response", () => {
    expect(extractMetaMessageId({ messages: [{ id: "wamid.ABC" }] })).toBe("wamid.ABC");
    expect(extractMetaMessageId({})).toBeNull();
  });

  it("masks tokens in Graph responses for safe logging", () => {
    const masked = maskGraphResponse({ access_token: "EAABwzLixnjYBO123456789", error: "x" });
    expect(masked).not.toContain("EAABwzLixnjYBO123456789");
    expect(masked).toContain("***");
  });

  it("builds media payloads by URL (caption on image/document, none on audio)", () => {
    expect(buildMetaMediaPayload("5511999990000", "image", "https://x/y.jpg", "olha")).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "5511999990000",
      type: "image", image: { link: "https://x/y.jpg", caption: "olha" },
    });
    expect(buildMetaMediaPayload("5511999990000", "document", "https://x/menu.pdf")).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "5511999990000",
      type: "document", document: { link: "https://x/menu.pdf" },
    });
    // audio never carries a caption
    expect(buildMetaMediaPayload("5511999990000", "audio", "https://x/a.ogg", "ignored")).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "5511999990000",
      type: "audio", audio: { link: "https://x/a.ogg" },
    });
  });
});

describe("D — invalid phone blocked before any Meta call", () => {
  it("toMetaRecipient returns null for invalid phones", () => {
    expect(toMetaRecipient("abc")).toBeNull();
    expect(toMetaRecipient("")).toBeNull();
    expect(toMetaRecipient("11999990000")).toBe("5511999990000"); // normalized + valid
  });

  it("decideMetaSend blocks an invalid phone", () => {
    const d = decideMetaSend({ phoneValid: false, lastInboundAt: new Date(), hasTemplate: true });
    expect(d).toMatchObject({ allowed: false, reason: "INVALID_PHONE" });
  });
});

describe("E — webhook GET verification", () => {
  it("echoes the challenge when the verify token matches", () => {
    expect(verifyMetaChallenge({ mode: "subscribe", token: "tok", challenge: "123" }, "tok")).toBe("123");
  });
  it("rejects a wrong token / mode / missing expected", () => {
    expect(verifyMetaChallenge({ mode: "subscribe", token: "bad", challenge: "123" }, "tok")).toBeNull();
    expect(verifyMetaChallenge({ mode: "x", token: "tok", challenge: "123" }, "tok")).toBeNull();
    expect(verifyMetaChallenge({ mode: "subscribe", token: "tok", challenge: "123" }, "")).toBeNull();
  });
});

describe("F/G — inbound webhook normalization", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511...", phone_number_id: "PN123" },
          contacts: [{ profile: { name: "Maria" }, wa_id: "5511988887777" }],
          messages: [{
            from: "5511988887777", id: "wamid.AAA", timestamp: "1700000000",
            type: "text", text: { body: "Quero pedir" },
          }],
          statuses: [{ id: "wamid.OUT", status: "delivered", timestamp: "1700000005", recipient_id: "5511988887777" }],
        },
      }],
    }],
  };

  it("F — normalizes an inbound text message + phone_number_id + profile", () => {
    const n = normalizeMetaWebhook(payload);
    expect(n.phoneNumberIds).toEqual(["PN123"]);
    expect(n.messages).toHaveLength(1);
    expect(n.messages[0]).toMatchObject({
      providerMessageId: "wamid.AAA",
      fromPhone:         "5511988887777",
      phoneNumberId:     "PN123",
      type:              "text",
      text:              "Quero pedir",
      profileName:       "Maria",
    });
    expect(n.statuses[0]).toMatchObject({ providerMessageId: "wamid.OUT", status: "delivered" });
  });

  it("G — every inbound carries its wamid (the unique dedupe key)", () => {
    const n = normalizeMetaWebhook(payload);
    expect(n.messages.every((m) => m.providerMessageId.startsWith("wamid."))).toBe(true);
  });

  it("returns empty for non-message payloads", () => {
    expect(normalizeMetaWebhook({}).messages).toEqual([]);
    expect(normalizeMetaWebhook({ entry: [] }).messages).toEqual([]);
  });

  it("H — captures inbound image media (id + mime + caption as body)", () => {
    const mediaPayload = {
      object: "whatsapp_business_account",
      entry: [{ id: "WABA1", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "PN123" },
        messages: [{
          from: "5511988887777", id: "wamid.IMG", timestamp: "1700000000",
          type: "image", image: { id: "MEDIA-1", mime_type: "image/jpeg", caption: "olha isso" },
        }],
      } }] }],
    };
    const n = normalizeMetaWebhook(mediaPayload);
    expect(n.messages[0].media).toMatchObject({ id: "MEDIA-1", mimeType: "image/jpeg", kind: "image" });
    // Caption surfaces as the message body so staff see the customer's text.
    expect(n.messages[0].text).toBe("olha isso");
  });

  it("H — captures document media with filename; text messages carry no media", () => {
    const docPayload = {
      object: "whatsapp_business_account",
      entry: [{ id: "WABA1", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "PN123" },
        messages: [{
          from: "5511988887777", id: "wamid.DOC", timestamp: "1700000000",
          type: "document", document: { id: "MEDIA-2", mime_type: "application/pdf", filename: "cardapio.pdf" },
        }],
      } }] }],
    };
    const n = normalizeMetaWebhook(docPayload);
    expect(n.messages[0].media).toMatchObject({ id: "MEDIA-2", filename: "cardapio.pdf", kind: "document" });
    // A plain text message has no media.
    expect(normalizeMetaWebhook(payload).messages[0].media).toBeNull();
  });
});

describe("signature validation", () => {
  it("accepts a correct sha256 HMAC and rejects a bad one", () => {
    const body = JSON.stringify({ a: 1 });
    const secret = "app_secret_123";
    const good = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(validateMetaSignature(body, good, secret)).toBe(true);
    expect(validateMetaSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(validateMetaSignature(body, null, secret)).toBe(false);
    expect(validateMetaSignature(body, good, "")).toBe(false);
  });
});

describe("H/I — 24h window + template gating", () => {
  const now = new Date("2026-01-10T12:00:00Z");

  it("H — outside 24h without a template → META_TEMPLATE_REQUIRED", () => {
    const d = decideMetaSend({
      phoneValid: true,
      lastInboundAt: new Date("2026-01-08T12:00:00Z"), // 48h ago
      hasTemplate: false,
      now,
    });
    expect(d).toMatchObject({ allowed: false, reason: "META_TEMPLATE_REQUIRED" });
  });

  it("I — outside 24h WITH a template → allowed in TEMPLATE mode", () => {
    const d = decideMetaSend({
      phoneValid: true,
      lastInboundAt: new Date("2026-01-08T12:00:00Z"),
      hasTemplate: true,
      now,
    });
    expect(d).toEqual({ allowed: true, mode: "TEMPLATE" });
  });

  it("inside 24h → freeform allowed", () => {
    const d = decideMetaSend({
      phoneValid: true,
      lastInboundAt: new Date("2026-01-10T06:00:00Z"), // 6h ago
      hasTemplate: false,
      now,
    });
    expect(d).toEqual({ allowed: true, mode: "FREEFORM" });
  });

  it("builds a template payload with body params", () => {
    const p = buildMetaTemplatePayload("5511999990000", "pedido_confirmado", "pt_BR", ["Maria", "#123"]);
    expect(p).toMatchObject({
      messaging_product: "whatsapp",
      to: "5511999990000",
      type: "template",
      template: {
        name: "pedido_confirmado",
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Maria" }, { type: "text", text: "#123" }] }],
      },
    });
  });
});
