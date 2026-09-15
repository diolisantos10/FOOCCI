import { describe, expect, it } from "vitest";
import { normalizeMetaWebhook } from "./metaWebhook";

function envelope(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "phone-1" },
          contacts: [{ wa_id: "5511999999999", profile: { name: "Cliente" } }],
          messages: [{
            from: "5511999999999",
            id: "wamid.1",
            timestamp: "1789500000",
            ...message,
          }],
        },
      }],
    }],
  };
}

describe("normalizeMetaWebhook — structured inbound content", () => {
  it("turns a shared contact into readable conversation text", () => {
    const result = normalizeMetaWebhook(envelope({
      type: "contacts",
      contacts: [{
        name: { formatted_name: "João Silva" },
        phones: [{ phone: "+55 11 98888-7777" }],
        org: { title: "Gerente", company: "Restaurante X" },
      }],
    }));

    expect(result.messages[0]?.type).toBe("text");
    expect(result.messages[0]?.text).toContain("João Silva");
    expect(result.messages[0]?.text).toContain("+55 11 98888-7777");
  });

  it("turns a shared location into readable conversation text", () => {
    const result = normalizeMetaWebhook(envelope({
      type: "location",
      location: { latitude: -23.56, longitude: -46.68, name: "Restaurante", address: "Rua Exemplo, 10" },
    }));

    expect(result.messages[0]?.type).toBe("text");
    expect(result.messages[0]?.text).toBe("📍 Restaurante — Rua Exemplo, 10");
  });

  it("surfaces interactive and legacy button replies as their selected text", () => {
    const interactive = normalizeMetaWebhook(envelope({
      type: "interactive",
      interactive: { button_reply: { id: "sim", title: "Sim, tenho interesse" } },
    }));
    expect(interactive.messages[0]?.type).toBe("text");
    expect(interactive.messages[0]?.text).toBe("Sim, tenho interesse");

    const button = normalizeMetaWebhook(envelope({
      type: "button",
      button: { payload: "QUERO_DEMO", text: "Quero uma demonstração" },
    }));
    expect(button.messages[0]?.type).toBe("text");
    expect(button.messages[0]?.text).toBe("Quero uma demonstração");
  });

  it("surfaces reactions as readable text", () => {
    const result = normalizeMetaWebhook(envelope({
      type: "reaction",
      reaction: { message_id: "wamid.original", emoji: "👍" },
    }));

    expect(result.messages[0]?.type).toBe("text");
    expect(result.messages[0]?.text).toBe("Reagiu 👍");
  });

  it("classifies stickers as image media so the inbox can render them", () => {
    const result = normalizeMetaWebhook(envelope({
      type: "sticker",
      sticker: { id: "media-1", mime_type: "image/webp" },
    }));

    expect(result.messages[0]?.type).toBe("sticker");
    expect(result.messages[0]?.media?.kind).toBe("image");
    expect(result.messages[0]?.media?.mimeType).toBe("image/webp");
  });
});
