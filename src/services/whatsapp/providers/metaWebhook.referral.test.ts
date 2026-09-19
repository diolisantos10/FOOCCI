/**
 * O `referral` — o campo que SEMPRE chegou e era jogado fora.
 *
 * Quando a pessoa clica num anúncio clique-para-WhatsApp, a Meta anexa à
 * primeira mensagem um objeto `referral` com o anúncio de origem. O tipo
 * `RawMessage` deste normalizador não declarava o campo, então nenhuma linha da
 * casa o lia: o lead de mídia paga chegava como mensagem solta de número
 * desconhecido. Não era dado que faltava — era dado que a gente descartava.
 */
import { describe, it, expect } from "vitest";
import { normalizeMetaWebhook } from "./metaWebhook";

function envelope(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA1", changes: [{ value: {
      metadata: { phone_number_id: "PN1" },
      contacts: [{ wa_id: "5511988887777", profile: { name: "Ana" } }],
      messages: [message],
    } }] }],
  };
}

const REFERRAL = {
  source_url: "https://fb.me/2abcDEF",
  source_type: "ad",
  source_id: "120210000000000001",
  headline: "Cardápio digital que vende sozinho",
  body: "Teste grátis por 7 dias",
  ctwa_clid: "ARBxyz123",
};

describe("normalizeMetaWebhook + referral", () => {
  it("⭐ a mensagem de texto vinda de anúncio traz o anúncio junto", () => {
    const n = normalizeMetaWebhook(envelope({
      id: "wamid.A", from: "5511988887777", timestamp: "1758294000",
      type: "text", text: { body: "oi, quero saber do cardápio" }, referral: REFERRAL,
    }));

    expect(n.messages).toHaveLength(1);
    const m = n.messages[0]!;
    expect(m.text).toBe("oi, quero saber do cardápio");
    expect(m.referral).toEqual({
      sourceType: "ad",
      sourceId: "120210000000000001",
      sourceUrl: "https://fb.me/2abcDEF",
      headline: "Cardápio digital que vende sozinho",
      body: "Teste grátis por 7 dias",
      ctwaClid: "ARBxyz123",
    });
  });

  it("⭐ o primeiro contato por ÁUDIO também carrega o anúncio", () => {
    // A pessoa pode clicar e mandar um áudio. Perder o referral aí seria
    // perder o lead mais caro pelo formato da primeira mensagem.
    const n = normalizeMetaWebhook(envelope({
      id: "wamid.B", from: "5511988887777", timestamp: "1758294000",
      type: "audio", audio: { id: "media-1", mime_type: "audio/ogg" }, referral: REFERRAL,
    }));

    expect(n.messages[0]!.media?.kind).toBe("audio");
    expect(n.messages[0]!.referral?.ctwaClid).toBe("ARBxyz123");
  });

  it("mensagem comum não inventa origem", () => {
    const n = normalizeMetaWebhook(envelope({
      id: "wamid.C", from: "5511988887777", timestamp: "1758294000",
      type: "text", text: { body: "oi" },
    }));
    expect(n.messages[0]!.referral).toBeNull();
  });

  it("⛔ referral vazio é ausência, não origem", () => {
    const n = normalizeMetaWebhook(envelope({
      id: "wamid.D", from: "5511988887777", timestamp: "1758294000",
      type: "text", text: { body: "oi" }, referral: {},
    }));
    expect(n.messages[0]!.referral).toBeNull();
  });
});
