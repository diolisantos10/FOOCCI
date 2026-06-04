/**
 * WebhookParserService — event-name normalization (Build OS real-path fix).
 *
 * Evolution builds send the event field as "messages.upsert" OR "MESSAGES_UPSERT"
 * OR "messages_upsert". The parser must accept all three, otherwise an inbound
 * /build message is dropped as "ignored" before reaching the Build OS branch
 * (root cause of the empty BuildWebhookTrace despite everything else HEALTHY).
 */

import { describe, it, expect } from "vitest";
import { WebhookParserService } from "./WebhookParserService";

function upsertPayload(eventName: string, text = "/build teste") {
  return {
    event: eventName,
    instance: "sushicazza",
    data: {
      key: { id: "MSG123", fromMe: false, remoteJid: "5511989400692@s.whatsapp.net" },
      pushName: "Diego",
      message: { conversation: text },
      messageTimestamp: 1_700_000_000,
    },
  };
}

describe("WebhookParserService — event name normalization", () => {
  it("parses the dotted lowercase form (messages.upsert)", () => {
    const r = WebhookParserService.parse(upsertPayload("messages.upsert"));
    expect(r.type).toBe("inbound_message");
  });

  it("parses the configured uppercase form (MESSAGES_UPSERT)", () => {
    const r = WebhookParserService.parse(upsertPayload("MESSAGES_UPSERT"));
    expect(r.type).toBe("inbound_message");
  });

  it("parses the underscore lowercase form (messages_upsert)", () => {
    const r = WebhookParserService.parse(upsertPayload("messages_upsert"));
    expect(r.type).toBe("inbound_message");
  });

  it("extracts phone + content for the Build OS branch", () => {
    const r = WebhookParserService.parse(upsertPayload("MESSAGES_UPSERT", "/build x"));
    if (r.type !== "inbound_message") throw new Error("expected inbound_message");
    expect(r.phone).toBe("+5511989400692");
    expect(r.content).toBe("/build x");
    expect(r.messageType).toBe("TEXT");
  });

  it("still ignores genuinely unknown events", () => {
    const r = WebhookParserService.parse({ event: "presence.update", instance: "x" });
    expect(r.type).toBe("ignored");
  });

  it("ignores group chats even with a valid event name", () => {
    const p = upsertPayload("MESSAGES_UPSERT");
    (p.data.key as Record<string, unknown>).remoteJid = "12345@g.us";
    const r = WebhookParserService.parse(p);
    expect(r.type).toBe("ignored");
  });
});

describe("WebhookParserService — text extraction across wrappers", () => {
  function withMessage(msg: Record<string, unknown>) {
    return {
      event: "MESSAGES_UPSERT",
      instance: "sushicazza",
      data: {
        key: { id: "M1", fromMe: false, remoteJid: "5511989400692@s.whatsapp.net" },
        pushName: "Diego",
        message: msg,
        messageTimestamp: 1_700_000_000,
      },
    };
  }
  function textOf(msg: Record<string, unknown>): string {
    const r = WebhookParserService.parse(withMessage(msg));
    if (r.type !== "inbound_message") throw new Error("expected inbound_message");
    return r.content;
  }

  it("extracts plain conversation text", () => {
    expect(textOf({ conversation: "/build x" })).toBe("/build x");
  });

  it("extracts extendedTextMessage.text", () => {
    expect(textOf({ extendedTextMessage: { text: "/build y" } })).toBe("/build y");
  });

  it("unwraps ephemeralMessage → inner conversation", () => {
    expect(textOf({ ephemeralMessage: { message: { conversation: "/build eph" } } })).toBe("/build eph");
  });

  it("unwraps editedMessage → inner extendedTextMessage", () => {
    expect(
      textOf({ editedMessage: { message: { extendedTextMessage: { text: "/build edited" } } } }),
    ).toBe("/build edited");
  });

  it("extracts list/button reply ids as text", () => {
    expect(textOf({ buttonsResponseMessage: { selectedButtonId: "/build btn" } })).toBe("/build btn");
    expect(
      textOf({ listResponseMessage: { singleSelectReply: { selectedRowId: "/build row" } } }),
    ).toBe("/build row");
  });
});

describe("WebhookParserService — fromMe /build operator resolution", () => {
  function fromMePayload(extra: Record<string, unknown> = {}, text = "/build do checkout") {
    return {
      event: "MESSAGES_UPSERT",
      instance: "sushicazza",
      // remoteJid here is the RECIPIENT (the customer the operator messaged).
      data: {
        key: { id: "OUT1", fromMe: true, remoteJid: "5511955555223@s.whatsapp.net" },
        message: { conversation: text },
        messageTimestamp: 1_700_000_000,
      },
      ...extra,
    };
  }

  it("routes fromMe text as external_outbound_message and extracts the command text", () => {
    const r = WebhookParserService.parse(fromMePayload({ sender: "5511989400692@s.whatsapp.net" }));
    if (r.type !== "external_outbound_message") throw new Error("expected external_outbound_message");
    expect(r.content).toBe("/build do checkout");
    // phone is the recipient (unchanged behavior for customer-message persistence)
    expect(r.phone).toBe("+5511955555223");
  });

  it("resolves the operator from the top-level sender JID (not remoteJid)", () => {
    const r = WebhookParserService.parse(fromMePayload({ sender: "5511989400692@s.whatsapp.net" }));
    if (r.type !== "external_outbound_message") throw new Error("expected external_outbound_message");
    expect(r.instanceOwnerPhone).toBe("+5511989400692");
    // The operator must NOT be the recipient.
    expect(r.instanceOwnerPhone).not.toBe(r.phone);
  });

  it("falls back to data.owner when there is no top-level sender", () => {
    const p = fromMePayload();
    (p.data as Record<string, unknown>).owner = "5511989400692@s.whatsapp.net";
    const r = WebhookParserService.parse(p);
    if (r.type !== "external_outbound_message") throw new Error("expected external_outbound_message");
    expect(r.instanceOwnerPhone).toBe("+5511989400692");
  });

  it("leaves instanceOwnerPhone undefined when the payload omits it", () => {
    const r = WebhookParserService.parse(fromMePayload());
    if (r.type !== "external_outbound_message") throw new Error("expected external_outbound_message");
    expect(r.instanceOwnerPhone).toBeUndefined();
  });

  it("ignores group JIDs as an owner source", () => {
    const r = WebhookParserService.parse(fromMePayload({ sender: "120363@g.us" }));
    if (r.type !== "external_outbound_message") throw new Error("expected external_outbound_message");
    expect(r.instanceOwnerPhone).toBeUndefined();
  });
});
