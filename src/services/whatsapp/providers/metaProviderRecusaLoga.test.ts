/**
 * Recusa de envio da Meta deixa de ser muda.
 *
 * As quatro saídas de falha deste provedor — sem config, telefone inválido,
 * erro HTTP da Graph e erro de rede — devolviam um `SendResult` com `ok:false` e
 * NADA no log. Quem lia o log via a mensagem do restaurante desaparecer sem uma
 * palavra: exatamente o buraco que deixou um cliente do Sushi Cazza sem resposta
 * e sem explicação.
 *
 * O formato copia o do recepcionista (`WhatsAppReceptionistService.sendReply`,
 * "envio recusado (…): status=…") de propósito — os dois caminhos de saída
 * precisam ser comparáveis num único grep.
 *
 * ⚠️ Nenhum comportamento de envio muda aqui: os mesmos `SendResult` de antes,
 * com os mesmos `errorCode`. Só o log é novo. E o teste do segredo é dele
 * também: token e telefone cru NUNCA podem aparecer na linha.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const meta = vi.hoisted(() => ({ MetaConfigService: { getResolved: vi.fn() } }));
vi.mock("../MetaConfigService", () => meta);

vi.mock("@/services/meta/MetaAppCredentialsService", () => ({
  MetaAppCredentialsService: { getResolved: vi.fn(async () => ({ appSecret: "s" })) },
}));
vi.mock("../metaFlag", () => ({ metaGraphUrl: (p: string) => `https://graph.facebook.com/v20.0/${p}` }));

import { MetaWhatsAppCloudProvider } from "./MetaWhatsAppCloudProvider";

const TOKEN = "EAABwzLixnjYBO_token_secreto_123456789";
const TELEFONE = "5511987654321";
const provider = new MetaWhatsAppCloudProvider();

let error: ReturnType<typeof vi.spyOn>;
const fetchOriginal = globalThis.fetch;

/** Todas as linhas de recusa emitidas no caso. */
function recusas(): string[] {
  return error.mock.calls
    .map((c) => c.map(String).join(" "))
    .filter((l) => l.includes("[MetaWhatsAppCloudProvider] envio recusado"));
}

beforeEach(() => {
  vi.clearAllMocks();
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  meta.MetaConfigService.getResolved.mockResolvedValue({
    restaurantId: "rest_1", phoneNumberId: "pnid_1", accessToken: TOKEN,
    connectionStatus: "CONNECTED", displayPhoneNumber: "+55 11 3333-0000",
  });
});

afterEach(() => {
  error.mockRestore();
  globalThis.fetch = fetchOriginal;
});

describe("as quatro recusas do provedor Meta viram log", () => {
  it("sem config: o log diz o restaurante e o código, e o retorno não muda", async () => {
    meta.MetaConfigService.getResolved.mockResolvedValue(null);

    const r = await provider.sendText({ restaurantId: "rest_1", to: TELEFONE, text: "oi" });

    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("META_NOT_CONNECTED");
    const linha = recusas()[0];
    expect(linha, "'sem config' continua mudo").toBeDefined();
    expect(linha).toContain("rest_1");
    expect(linha).toContain("META_NOT_CONNECTED");
    expect(linha).toContain("status=FAILED");
  });

  it("telefone inválido: registrado antes de qualquer chamada à Meta", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const r = await provider.sendText({ restaurantId: "rest_1", to: "123", text: "oi" });

    expect(r.errorCode).toBe("INVALID_PHONE");
    expect(fetchSpy).not.toHaveBeenCalled(); // nada saiu para a Meta
    expect(recusas()[0]).toContain("INVALID_PHONE");
  });

  it("erro HTTP da Graph: código da Meta e mensagem no log", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 400,
      json: async () => ({ error: { message: "Recipient phone number not in allowed list", code: 131030 } }),
    })) as unknown as typeof fetch;

    const r = await provider.sendText({ restaurantId: "rest_1", to: TELEFONE, text: "oi" });

    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("META_131030");
    const linha = recusas()[0];
    expect(linha).toContain("META_131030");
    expect(linha).toContain("not in allowed list");
  });

  it("erro de rede: registrado como NETWORK e retryable", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;

    const r = await provider.sendText({ restaurantId: "rest_1", to: TELEFONE, text: "oi" });

    expect(r.errorCode).toBe("NETWORK");
    expect(r.retryable).toBe(true);
    expect(recusas()[0]).toContain("NETWORK");
  });

  it("envio que dá certo NÃO loga recusa — aviso só para o que falhou", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.OK" }] }),
    })) as unknown as typeof fetch;

    const r = await provider.sendText({ restaurantId: "rest_1", to: TELEFONE, text: "oi" });

    expect(r.ok).toBe(true);
    expect(recusas()).toHaveLength(0);
  });

  it("SEGREDO: nem o token nem o telefone cru entram na linha de log", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: { message: `Invalid OAuth token ${TOKEN}`, code: 190 } }),
    })) as unknown as typeof fetch;

    await provider.sendText({ restaurantId: "rest_1", to: TELEFONE, text: "oi" });

    const linha = recusas()[0];
    expect(linha).not.toContain(TOKEN);
    expect(linha).not.toContain(TELEFONE);
    // Mascarado o bastante para identificar o número sem expor o cliente.
    expect(linha).toContain("5511***21");
  });

  it("template e mídia usam a MESMA porta de log — não sobra caminho mudo", async () => {
    meta.MetaConfigService.getResolved.mockResolvedValue(null);

    await provider.sendTemplate({ restaurantId: "rest_1", to: TELEFONE, templateName: "t", language: "pt_BR" });
    await provider.sendMedia({ restaurantId: "rest_1", to: TELEFONE, mediaType: "image", mediaUrl: "https://x/y.jpg" });

    expect(recusas()).toHaveLength(2);
  });
});
