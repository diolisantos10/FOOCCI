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
