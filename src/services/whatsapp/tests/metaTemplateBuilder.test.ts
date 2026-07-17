import { describe, it, expect } from "vitest";
import { buildMetaTemplate } from "../metaTemplateBuilder";

describe("buildMetaTemplate", () => {
  it("converts named tokens to sequential {{n}} in reading order", () => {
    const r = buildMetaTemplate({
      name: "cliente_perdido",
      category: "MARKETING",
      message: "Oi, {nome}! 💔 Você ganhou {cupom} pra voltar! Válido até {validade}: {link_cardapio}",
      footer: "Para não receber mais ofertas, responda SAIR.",
      examples: { nome: "Maria", cupom: "20% de desconto", validade: "31/12", link_cardapio: "https://x.com" },
    });
    expect(r.bodyText).toBe("Oi, {{1}}! 💔 Você ganhou {{2}} pra voltar! Válido até {{3}}: {{4}}");
    expect(r.paramTokens).toEqual(["{nome}", "{cupom}", "{validade}", "{link_cardapio}"]);
    expect(r.bodyVariables).toBe(4);
  });

  it("builds body example values matching the token order", () => {
    const r = buildMetaTemplate({
      name: "t",
      category: "MARKETING",
      message: "{nome} - {link_cardapio}",
      examples: { nome: "Maria", link_cardapio: "https://foocci.com.br/pedido/x" },
    });
    const body = r.payload.components.find((c) => c.type === "BODY") as { example?: { body_text?: string[][] } };
    expect(body.example?.body_text).toEqual([["Maria", "https://foocci.com.br/pedido/x"]]);
  });

  it("adds a FOOTER component only when footer text is provided", () => {
    const withFooter = buildMetaTemplate({ name: "a", category: "MARKETING", message: "Oi {nome}", footer: "rodapé", examples: {} });
    const noFooter   = buildMetaTemplate({ name: "b", category: "UTILITY",  message: "Oi {nome}", footer: null,    examples: {} });
    expect(withFooter.payload.components.some((c) => c.type === "FOOTER")).toBe(true);
    expect(noFooter.payload.components.some((c) => c.type === "FOOTER")).toBe(false);
  });

  it("handles double-brace and spaced token variants", () => {
    const r = buildMetaTemplate({ name: "t", category: "UTILITY", message: "{{ nome }} no {restaurante}", examples: {} });
    expect(r.bodyText).toBe("{{1}} no {{2}}");
    expect(r.paramTokens).toEqual(["{nome}", "{restaurante}"]);
  });

  it("produces no example block when there are no variables", () => {
    const r = buildMetaTemplate({ name: "t", category: "UTILITY", message: "Mensagem fixa sem variáveis", examples: {} });
    const body = r.payload.components.find((c) => c.type === "BODY") as { example?: unknown };
    expect(body.example).toBeUndefined();
    expect(r.bodyVariables).toBe(0);
  });

  it("defaults language to pt_BR", () => {
    const r = buildMetaTemplate({ name: "t", category: "UTILITY", message: "Oi {nome}", examples: {} });
    expect(r.payload.language).toBe("pt_BR");
  });
});
