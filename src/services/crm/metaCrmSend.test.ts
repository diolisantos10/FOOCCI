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

function makeProvider() {
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
