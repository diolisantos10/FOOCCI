import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SendResult } from "@/services/whatsapp/providers/types";

// Mock the template registry so we control what findApproved returns (no DB).
vi.mock("@/services/whatsapp/MetaTemplateService", () => ({
  MetaTemplateService: { findApproved: vi.fn() },
}));

import { sendMetaCrmMessage } from "./metaCrmSend";
import { MetaTemplateService } from "@/services/whatsapp/MetaTemplateService";

const findApproved = MetaTemplateService.findApproved as unknown as ReturnType<typeof vi.fn>;

const okResult: SendResult = { ok: true, provider: "META_CLOUD_API", status: "SENT", providerMessageId: "wamid.1" };

/**
 * Provedor que APLICA a janela de 24h no próprio `sendText` — é o papel do
 * `WhatsAppMessagingService` em produção. Texto livre só é permitido por um
 * provedor assim; ver `providerCru()` abaixo.
 */
function makeProvider() {
  return {
    enforcesCustomerWindow: true as const,
    sendText:     vi.fn(async (): Promise<SendResult> => okResult),
    sendTemplate: vi.fn(async (): Promise<SendResult> => okResult),
  };
}

/** Provedor CRU: fala com a Meta sem checar janela nenhuma. */
function providerCru() {
  return {
    sendText:     vi.fn(async (): Promise<SendResult> => okResult),
    sendTemplate: vi.fn(async (): Promise<SendResult> => okResult),
  };
}

beforeEach(() => { findApproved.mockReset(); });

describe("sendMetaCrmMessage", () => {
  it("sends an approved template with the first name as the single body param", async () => {
    findApproved.mockResolvedValue({
      id: "t1", templateName: "reativar_frios", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 1, mappedCampaignType: "RECUPERAR",
    });
    const provider = makeProvider();

    const { result, usedTemplate } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi João, volta!",
      campaign: { objective: "RECUPERAR", audienceConfig: null }, firstName: "João",
    });

    expect(usedTemplate).toBe(true);
    expect(result.ok).toBe(true);
    expect(provider.sendTemplate).toHaveBeenCalledWith({
      restaurantId: "r1", to: "5511999990000",
      templateName: "reativar_frios", language: "pt_BR", bodyParams: ["João"],
    });
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it("resolves explicit audienceConfig params, replacing {nome} with the first name", async () => {
    findApproved.mockResolvedValue({
      id: "t2", templateName: "promo_dupla", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 2, mappedCampaignType: null,
    });
    const provider = makeProvider();

    await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "x",
      campaign: { objective: "OUTRO", audienceConfig: { metaTemplate: { name: "promo_dupla", params: ["{nome}", "10%"] } } },
      firstName: "Maria",
    });

    expect(provider.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "promo_dupla", bodyParams: ["Maria", "10%"] }),
    );
  });

  it("fills multi-variable body params via renderToken (full CRM context)", async () => {
    findApproved.mockResolvedValue({
      id: "t3", templateName: "cliente_perdido", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 4, mappedCampaignType: null,
    });
    const provider = makeProvider();
    const render: Record<string, string> = {
      "{nome}": "Maria", "{cupom}": "20% de desconto", "{validade}": "31/12", "{link_cardapio}": "https://foocci.com.br/pedido/x",
    };

    await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "x",
      campaign: { objective: null, audienceConfig: { metaTemplate: { name: "cliente_perdido", params: ["{nome}", "{cupom}", "{validade}", "{link_cardapio}"] } } },
      firstName: "Maria",
      renderToken: (t) => render[t] ?? t,
    });

    expect(provider.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ bodyParams: ["Maria", "20% de desconto", "31/12", "https://foocci.com.br/pedido/x"] }),
    );
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it("bails to freeform when a multi-variable token cannot be resolved (no renderToken)", async () => {
    findApproved.mockResolvedValue({
      id: "t4", templateName: "cliente_perdido", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 2, mappedCampaignType: null,
    });
    const provider = makeProvider();

    const { usedTemplate } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi Maria!",
      campaign: { objective: null, audienceConfig: { metaTemplate: { name: "cliente_perdido", params: ["{nome}", "{cupom}"] } } },
      firstName: "Maria",
    });

    // {cupom} stays literal without a renderToken → unsafe → freeform.
    expect(usedTemplate).toBe(false);
    expect(provider.sendText).toHaveBeenCalledWith({ restaurantId: "r1", to: "5511999990000", text: "Oi Maria!" });
    expect(provider.sendTemplate).not.toHaveBeenCalled();
  });

  it("bails to freeform when resolved param count mismatches template variable count", async () => {
    findApproved.mockResolvedValue({
      id: "t5", templateName: "promo", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 3, mappedCampaignType: null,
    });
    const provider = makeProvider();

    const { usedTemplate } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi!",
      campaign: { objective: null, audienceConfig: { metaTemplate: { name: "promo", params: ["{nome}", "10%"] } } },
      firstName: "Maria", renderToken: (t) => (t === "{nome}" ? "Maria" : t),
    });

    expect(usedTemplate).toBe(false);
    expect(provider.sendTemplate).not.toHaveBeenCalled();
  });

  it("falls back to freeform text when no approved template resolves", async () => {
    findApproved.mockResolvedValue(null);
    const provider = makeProvider();

    const { usedTemplate } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi João!",
      campaign: { objective: "RECUPERAR", audienceConfig: null }, firstName: "João",
    });

    expect(usedTemplate).toBe(false);
    expect(provider.sendText).toHaveBeenCalledWith({ restaurantId: "r1", to: "5511999990000", text: "Oi João!" });
    expect(provider.sendTemplate).not.toHaveBeenCalled();
  });
});

/**
 * A TRAVA DA JANELA DE 24h — 23/08/2026.
 *
 * A recuperação de carrinho passava o provedor CRU (`new MetaWhatsAppCloudProvider()`).
 * Sem modelo aprovado, o texto livre saía direto para a Meta, SEM checar a janela:
 * mensagem iniciada pela empresa fora da janela, que a Meta recusa e que, quando
 * passa, conta como violação de política contra o número do cliente. O comentário
 * do código logo acima jurava que "fora dela ele volta BLOCKED e isso é contado" —
 * e isso só valia para o outro galho. Promessa em comentário não é trava.
 *
 * A recusa agora mora no ponto de estrangulamento: quem não declara que checa a
 * janela não manda texto livre, e nenhum chamador futuro consegue repetir o erro.
 */
describe("texto livre exige provedor que aplique a janela de 24h", () => {
  it("RECUSA o texto livre quando o provedor não checa a janela", async () => {
    findApproved.mockResolvedValue(null); // nenhum modelo aprovado
    const provider = providerCru();

    const { result, usedTemplate } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi João, volta!",
      campaign: { objective: "CART_ABANDONED", audienceConfig: null }, firstName: "João",
    });

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(usedTemplate).toBe(false);
    expect(result.ok).toBe(false);
    // BLOCKED = política, não falha de entrega. Os chamadores distinguem os dois:
    // só FAILED alimenta disjuntor e retentativa.
    expect(result.status).toBe("BLOCKED");
    expect(result.blockReason).toBe("META_TEMPLATE_REQUIRED");
  });

  it("PERMITE o texto livre quando o provedor aplica a janela", async () => {
    findApproved.mockResolvedValue(null);
    const provider = makeProvider();

    const { result } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi João, volta!",
      campaign: { objective: "CART_ABANDONED", audienceConfig: null }, firstName: "João",
    });

    expect(provider.sendText).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("MODELO aprovado passa mesmo pelo provedor cru — é para isso que o modelo existe", async () => {
    findApproved.mockResolvedValue({
      id: "t1", templateName: "carrinho_abandonado", languageCode: "pt_BR",
      category: "MARKETING", status: "APPROVED", bodyVariables: 1, mappedCampaignType: "CART_ABANDONED",
    });
    const provider = providerCru();

    const { result, usedTemplate } = await sendMetaCrmMessage(provider, {
      restaurantId: "r1", phone: "5511999990000", freeformText: "Oi João, volta!",
      campaign: { objective: "CART_ABANDONED", audienceConfig: null }, firstName: "João",
    });

    expect(usedTemplate).toBe(true);
    expect(result.ok).toBe(true);
    expect(provider.sendTemplate).toHaveBeenCalled();
  });
});
