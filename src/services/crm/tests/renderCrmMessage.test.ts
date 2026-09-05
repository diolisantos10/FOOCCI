import { describe, it, expect } from "vitest";
import {
  renderCrmMessage,
  resolveCrmVariables,
  findUnknownCrmVariables,
  couponValidadeLabel,
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

  it("{cupom} renders a CUSTOM reward's text", () => {
    const r = renderCrmMessage("Você ganhou {cupom} 🎁", customer, { ...ctx, coupon: { type: "CUSTOM", value: 8, description: "sobremesa grátis" } });
    expect(r).toBe("Você ganhou sobremesa grátis 🎁");
  });

  it("{cupom} is empty when there is no coupon", () => {
    expect(renderCrmMessage("Ganhe {cupom}", customer, ctx)).toBe("Ganhe ");
  });

  it("{validade} renders the coupon expiry (today + validityDays) as dd/mm", () => {
    const out = renderCrmMessage("Válido até {validade}", customer, {
      ...ctx, coupon: { type: "PERCENTAGE", value: 20, validityDays: 30 },
    });
    const expected = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    expect(out).toBe(`Válido até ${expected}`);
  });

  it("{validade} is empty when there is no coupon", () => {
    expect(renderCrmMessage("Vence {validade}", customer, ctx)).toBe("Vence ");
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

describe("couponValidadeLabel — real wallet expiry (cupom-vencendo)", () => {
  it("uses the coupon's actual expiresAt over validityDays for {validade}", () => {
    const expiresAt = new Date("2026-08-05T12:00:00.000Z");
    const label = couponValidadeLabel({ type: "PERCENTAGE", value: 10, validityDays: 30, expiresAt });
    expect(label).toBe(expiresAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
  });

  it("falls back to validityDays when expiresAt is absent or invalid", () => {
    const fromDays = couponValidadeLabel({ type: "PERCENTAGE", value: 10, validityDays: 5 });
    const expected = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    expect(fromDays).toBe(expected);
    expect(couponValidadeLabel({ type: "PERCENTAGE", value: 10, validityDays: 5, expiresAt: "not-a-date" })).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O CUPOM QUE NÃO ENCONTRAVA O DONO — achado pelo CEO em 05/09/2026
// ═══════════════════════════════════════════════════════════════════════════

describe("{link_cardapio} identifica quem recebe", () => {
  // O CEO recebeu "você ganhou 20% de desconto, só pelo nosso link", clicou, e
  // caiu numa tela pedindo "informe seu WhatsApp para identificarmos seu
  // cadastro" — do lado de fora do cadastro que continha o cupom dele.
  //
  // O link do robô (`/r/{code}`) abria com "Olá, diego" porque gera um waToken
  // assinado. O do CRM mandava a URL nua. A campanha custa disparo, e quem cai
  // numa catraca pedindo telefone entende "não é pra mim" e fecha.

  const base: RenderContext = {
    restaurantName: "Sushi Cazza",
    pedidoUrl: "https://foocci.com.br/pedido/sushi-cazza",
  };

  it("⭐ com telefone conhecido, o link leva o waToken assinado", () => {
    const v = resolveCrmVariables(
      { name: "Diego Santos", phone: "5511999998888" },
      base,
    );

    expect(v.link_cardapio).toContain("waToken=");
    expect(v.link_cardapio).toContain("src=crm");
    expect(v.link_cardapio.startsWith("https://foocci.com.br/pedido/sushi-cazza?")).toBe(true);
  });

  it("⛔ sem telefone, sai como sempre saiu — nada quebra para quem não tem o dado", () => {
    const v = resolveCrmVariables({ name: "Diego Santos" }, base);
    expect(v.link_cardapio).toBe("https://foocci.com.br/pedido/sushi-cazza");
  });

  it("⭐ a mensagem real do cupom sai com o link identificado", () => {
    // O template exato que o CEO recebeu.
    const texto = renderCrmMessage(
      "Oi, {nome}! 🍽️ Você ganhou {cupom} pra voltar a pedir. Aproveite até {validade}, só pelo nosso link: {link_cardapio}",
      { name: "Diego Santos", phone: "5511999998888" },
      { ...base, coupon: { type: "PERCENTAGE", value: 20, validityDays: 15 } },
    );

    expect(texto).toContain("waToken=");
    // E o link nu NÃO pode sobrar no fim da frase.
    expect(texto.endsWith("/pedido/sushi-cazza")).toBe(false);
  });

  it("não confunde com {link_indicacao}, que é outra coisa", () => {
    // Indicação é o link que o cliente COMPARTILHA (ref=<id>); cardápio é o que
    // ELE abre. Misturar os dois faria o amigo dele entrar como se fosse ele.
    const v = resolveCrmVariables(
      { name: "Diego", phone: "5511999998888", id: "cus_1" },
      base,
    );

    expect(v.link_indicacao).toContain("ref=cus_1");
    expect(v.link_indicacao).not.toContain("waToken=");
    expect(v.link_cardapio).not.toContain("ref=");
  });

  it("o caminho de envio real (personalizeMessage) leva o telefone adiante", () => {
    // A trava contra o conserto inerte: `AudienceCustomer` sempre teve o
    // telefone e ele não era repassado. Se alguém tirar o campo de novo, aqui
    // reprova.
    const texto = personalizeMessage(
      "Pedido novo? {link_cardapio}",
      {
        id: "cus_1",
        name: "Diego Santos",
        phone: "5511999998888",
        tier: "OURO",
        segment: "VIP",
        totalOrders: 3,
        totalSpend: 300,
        lastOrderAt: null,
      },
      base,
    );

    expect(texto).toContain("waToken=");
  });
});
