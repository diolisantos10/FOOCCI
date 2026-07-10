import { describe, it, expect } from "vitest";
import {
  renderCrmMessage,
  resolveCrmVariables,
  findUnknownCrmVariables,
  type RenderCustomer,
  type RenderContext,
} from "../renderCrmMessage";
import { personalizeMessage } from "../CrmCampaignService";

const customer: RenderCustomer = { name: "Diego Santos", tier: "OURO", lastOrderAt: null };
const ctx: RenderContext = {
  restaurantName:  "Sushi Cazza",
  pedidoUrl:       "https://foocci.com.br/sushicazza",
  googleReviewUrl: "https://g.page/r/review",
  instagramUrl:    "https://www.instagram.com/sushicazzaoficial/",
};

describe("renderCrmMessage — variable syntax (Section 2)", () => {
  it("{nome} → first name, no braces", () => {
    expect(renderCrmMessage("Oi, {nome}!", customer, ctx)).toBe("Oi, Diego!");
  });

  it("{{nome}} (double brace) → first name, never {Diego}", () => {
    const out = renderCrmMessage("Oi, {{nome}}! 😊", customer, ctx);
    expect(out).toBe("Oi, Diego! 😊");
    expect(out).not.toContain("{Diego}");
    expect(out).not.toContain("{{Diego}}");
  });

  it("tolerates inner whitespace: { nome } and {{ nome }}", () => {
    expect(renderCrmMessage("Oi, { nome }!", customer, ctx)).toBe("Oi, Diego!");
    expect(renderCrmMessage("Oi, {{ nome }}!", customer, ctx)).toBe("Oi, Diego!");
  });

  it("output NEVER contains a braced resolved value", () => {
    for (const tpl of ["{nome}", "{{nome}}", "{ nome }", "olá {{nome}} tudo bem {nome}?"]) {
      const out = renderCrmMessage(tpl, customer, ctx);
      expect(out).not.toMatch(/\{+\s*Diego\s*\}+/);
    }
  });

  it("resolves {restaurante}, {ultimo_pedido}, {nivel}", () => {
    const recent: RenderCustomer = { name: "Ana", tier: "PRATA", lastOrderAt: new Date(Date.now() - 2 * 86_400_000).toISOString() };
    const out = renderCrmMessage("{nome} pediu {ultimo_pedido} na {restaurante} · nível {nivel}", recent, ctx);
    expect(out).toBe("Ana pediu há 2 dias na Sushi Cazza · nível Prata");
  });

  it("unknown variables are left unchanged and reported", () => {
    const out = renderCrmMessage("Oi {nome}, seu {codigo_secreto}!", customer, ctx);
    expect(out).toBe("Oi Diego, seu {codigo_secreto}!");
    expect(findUnknownCrmVariables(out)).toEqual(["codigo_secreto"]);
  });
});

describe("renderCrmMessage — link preservation (Section 4)", () => {
  it("a literal Instagram URL in the template is preserved byte-for-byte", () => {
    const tpl = "Segue a gente!\nhttps://www.instagram.com/sushicazzaoficial/";
    const out = renderCrmMessage(tpl, customer, ctx);
    expect(out).toBe(tpl);
    expect(out).toContain("https://www.instagram.com/sushicazzaoficial/");
    expect(out).not.toContain("@sushicazzaoficial");
  });

  it("{instagram} with a full URL resolves to that exact URL (clickable)", () => {
    const out = renderCrmMessage("IG: {instagram}", customer, ctx);
    expect(out).toBe("IG: https://www.instagram.com/sushicazzaoficial/");
  });

  it("{instagram} with a bare @handle is normalized to a full clickable URL (never @handle)", () => {
    const handleCtx: RenderContext = { ...ctx, instagramUrl: "@sushicazzaoficial" };
    const out = renderCrmMessage("IG: {instagram}", customer, handleCtx);
    expect(out).toBe("IG: https://www.instagram.com/sushicazzaoficial");
    expect(out).not.toContain("@sushicazzaoficial");
  });

  it("preserves https://, trailing slash, line breaks and emojis around a link", () => {
    const tpl = "Oi, {{nome}}! 😊\n\nNos seg: https://www.instagram.com/sushicazzaoficial/\nAté! 🍣";
    const out = renderCrmMessage(tpl, customer, ctx);
    expect(out).toBe("Oi, Diego! 😊\n\nNos seg: https://www.instagram.com/sushicazzaoficial/\nAté! 🍣");
  });

  it("a value containing a regex replacement token ($&) is inserted literally", () => {
    // Defensive: function replacer means even odd restaurant names can't corrupt output.
    const weird: RenderContext = { ...ctx, restaurantName: "Bar $& Grill" };
    expect(renderCrmMessage("{restaurante}", customer, weird)).toBe("Bar $& Grill");
  });
});

describe("renderCrmMessage — exact saved message only (Section 3)", () => {
  it("renders ONLY the saved template — no default greeting/AI text prepended", () => {
    const saved = "Oi, {{nome}}! 😊 Espero que tenha gostado.";
    const out = renderCrmMessage(saved, customer, ctx);
    expect(out).toBe("Oi, Diego! 😊 Espero que tenha gostado.");
    // The default POST_ORDER pool phrase must never appear unless it's in the template.
    expect(out).not.toContain("A gente vive de feedbacks honestos");
    expect(out).not.toContain("Tudo bem com o pedido");
  });

  it("empty template renders empty (default fallback is a caller decision, not a prefix)", () => {
    expect(renderCrmMessage("", customer, ctx)).toBe("");
  });
});

describe("personalizeMessage delegates to the canonical renderer", () => {
  it("now handles {{nome}} (previously produced {Diego})", () => {
    const out = personalizeMessage(
      "Oi, {{nome}}!",
      { id: "c1", name: "Diego", phone: "x", tier: "OURO", segment: "VIP", totalOrders: 3, totalSpend: 100, lastOrderAt: null },
      { restaurantName: "Sushi Cazza", pedidoUrl: "https://foocci.com.br/x", googleReviewUrl: null },
    );
    expect(out).toBe("Oi, Diego!");
    expect(out).not.toContain("{Diego}");
  });
});

describe("renderCrmMessage — coupon + social variables", () => {
  it("{cupom} renders the real coupon benefit and updates with the value", () => {
    const withPct = renderCrmMessage("Ganhe {cupom}!", customer, { ...ctx, coupon: { type: "PERCENTAGE", value: 20 } });
    expect(withPct).toBe("Ganhe 20% de desconto!");
    const withFixed = renderCrmMessage("Ganhe {cupom}!", customer, { ...ctx, coupon: { type: "FIXED", value: 10 } });
    expect(withFixed).toBe("Ganhe R$ 10 de desconto!");
  });

  it("{cupom} is empty when there is no coupon", () => {
    expect(renderCrmMessage("Ganhe {cupom}", customer, ctx)).toBe("Ganhe ");
  });

  it("{tiktok} / {facebook} / {youtube} resolve to full clickable URLs from handles", () => {
    const out = renderCrmMessage("IG {instagram} TT {tiktok} FB {facebook} YT {youtube}", customer, {
      ...ctx, tiktokUrl: "@cazza", facebookUrl: "cazzapage", youtubeUrl: "@cazzatube",
    });
    expect(out).toContain("https://www.tiktok.com/@cazza");
    expect(out).toContain("https://www.facebook.com/cazzapage");
    expect(out).toContain("https://www.youtube.com/@cazzatube");
  });
});

describe("resolveCrmVariables", () => {
  it("exposes the resolved value map", () => {
    const v = resolveCrmVariables(customer, ctx);
    expect(v.nome).toBe("Diego");
    expect(v.restaurante).toBe("Sushi Cazza");
    expect(v.instagram).toBe("https://www.instagram.com/sushicazzaoficial/");
  });
});
