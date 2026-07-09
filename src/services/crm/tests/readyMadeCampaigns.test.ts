import { describe, it, expect } from "vitest";
import {
  READY_MADE_CAMPAIGNS,
  getReadyMadeCampaign,
  buildReadyMadeCampaignPayload,
} from "../readyMadeCampaigns";
import { inferCampaignPriority } from "../CRMWhatsAppBudgetPlanner";
import { renderCrmMessage } from "../renderCrmMessage";

const ctx = {
  restaurantName:  "Sushi Cazza",
  pedidoUrl:       "https://foocci.com.br/sushicazza",
  googleReviewUrl: "https://g.page/r/x",
  instagramUrl:    "https://www.instagram.com/sushicazzaoficial/",
};
const customer = { name: "Diego Santos", tier: "OURO", lastOrderAt: null };

describe("ready-made campaign catalog", () => {
  it("ships the 8 expected campaigns with unique ids", () => {
    expect(READY_MADE_CAMPAIGNS).toHaveLength(8);
    const ids = READY_MADE_CAMPAIGNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(8);
    expect(ids).toEqual([
      "pedido-avaliacao",
      "aniversariantes",
      "segunda-compra",
      "quente-esfriando",
      "reativar-mornos",
      "recuperar-frios",
      "clientes-vip",
      "carrinho-abandonado",
    ]);
  });

  it("every campaign has owner-facing name, tagline and a non-empty message", () => {
    for (const c of READY_MADE_CAMPAIGNS) {
      expect(c.name.trim()).not.toBe("");
      expect(c.tagline.trim()).not.toBe("");
      expect(c.defaultMessage.trim().length).toBeGreaterThan(10);
      expect(c.emoji.trim()).not.toBe("");
    }
  });

  it("default messages render cleanly (no leftover braces, name resolved)", () => {
    for (const c of READY_MADE_CAMPAIGNS) {
      const out = renderCrmMessage(c.defaultMessage, customer, ctx);
      expect(out).toContain("Diego");
      expect(out).not.toMatch(/\{+\s*Diego\s*\}+/);
      // Only known variables are used — nothing unresolved remains.
      expect(out).not.toMatch(/\{[a-z_]+\}/);
    }
  });

  it("each campaign's id maps to the priority the budget planner will infer", () => {
    for (const c of READY_MADE_CAMPAIGNS) {
      expect(inferCampaignPriority({ templateId: c.id, targetSegment: c.targetSegment })).toBe(c.priority);
    }
  });

  it("getReadyMadeCampaign finds by id and returns null for unknown", () => {
    expect(getReadyMadeCampaign("aniversariantes")?.name).toBe("Aniversário");
    expect(getReadyMadeCampaign("nope")).toBeNull();
  });
});

describe("buildReadyMadeCampaignPayload", () => {
  it("builds a recurring payload from safe defaults", () => {
    const rm = getReadyMadeCampaign("recuperar-frios")!;
    const p = buildReadyMadeCampaignPayload(rm);
    expect(p.templateId).toBe("recuperar-frios");
    expect(p.targetSegment).toBe("recuperar-frios");
    expect(p.channel).toBe("WHATSAPP");
    expect(p.couponCode).toBe("VOLTEI10"); // suggested coupon applied
    expect(p.scheduleConfig.mode).toBe("RECURRING");
    expect(p.scheduleConfig.priority).toBe("REACTIVATION_COLD");
    expect(p.scheduleConfig).not.toHaveProperty("endCondition"); // stays ACTIVE
  });

  it("applies owner overrides on top of defaults", () => {
    const rm = getReadyMadeCampaign("clientes-vip")!;
    const p = buildReadyMadeCampaignPayload(rm, {
      message:    "Oi {nome}, mimo VIP!",
      couponCode: "MEUVIP",
      dailyLimit: 7,
      weekdays:   [1, 2, 3, 4, 5],
      timeWindow: { start: "18:00", end: "21:00" },
    });
    expect(p.messageTemplate).toBe("Oi {nome}, mimo VIP!");
    expect(p.couponCode).toBe("MEUVIP");
    expect(p.scheduleConfig.dailyLimit).toBe(7);
    expect(p.scheduleConfig.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(p.scheduleConfig.timeWindow).toEqual({ start: "18:00", end: "21:00" });
  });

  it("omits couponCode when there is neither a suggestion nor an override", () => {
    const rm = getReadyMadeCampaign("quente-esfriando")!;
    const p = buildReadyMadeCampaignPayload(rm);
    expect(p).not.toHaveProperty("couponCode");
  });

  it("refuses to build a recurring payload for the cart-recovery engine", () => {
    const rm = getReadyMadeCampaign("carrinho-abandonado")!;
    expect(() => buildReadyMadeCampaignPayload(rm)).toThrow(/CART_RECOVERY/);
  });
});
