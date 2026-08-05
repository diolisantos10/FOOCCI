/**
 * A origem do contato — o que se pode afirmar e o que não se pode.
 *
 * O guardrail 1 aplicado a atribuição: ausência de parâmetro não autoriza
 * inventar canal. Sem sinal, o resultado é "não identificado", e a tela mostra
 * isso em vez de fingir que sabe.
 */

import { describe, it, expect } from "vitest";
import {
  extrairOrigem, canalDoContato, rotuloDaOrigem, normalizaWhatsapp,
  normalizaReferrer, linkWhatsapp,
} from "../leadOrigin";

function p(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe("extrairOrigem", () => {
  it("lê os parâmetros de campanha da URL de entrada", () => {
    const o = extrairOrigem(
      p("utm_source=facebook&utm_medium=cpc&utm_campaign=Restaurantes-SP&utm_content=video-30s&fbclid=ABC123"),
      "https://l.facebook.com/",
      "/site?utm_source=facebook",
    );
    expect(o.utmSource).toBe("facebook");
    expect(o.utmMedium).toBe("cpc");
    expect(o.utmCampaign).toBe("Restaurantes-SP");
    expect(o.utmContent).toBe("video-30s");
    expect(o.clickId).toBe("ABC123");
    expect(o.landingPath).toBe("/site?utm_source=facebook");
    expect(o.referrer).toBe("l.facebook.com");
  });

  it("aceita ?src= como atalho de utm_source", () => {
    expect(extrairOrigem(p("src=instagram"), null, "/site").utmSource).toBe("instagram");
  });

  it("DESCARTA macro não substituída do Gerenciador de Anúncios", () => {
    // Campanha mal configurada entrega "{{campaign.name}}" literal. Gravar isso
    // como nome de campanha polui a base e cria uma "campanha" fantasma no topo
    // do relatório.
    const o = extrairOrigem(p("utm_campaign={{campaign.name}}&utm_source=facebook"), null, "/site");
    expect(o.utmCampaign).toBeNull();
    expect(o.utmSource).toBe("facebook");
  });

  it("limita o tamanho — a query é entrada de atacante", () => {
    const gigante = "x".repeat(5000);
    const o = extrairOrigem(p(`utm_campaign=${gigante}`), null, "/site");
    expect(o.utmCampaign!.length).toBeLessThanOrEqual(200);
  });

  it("sem nada na URL, devolve tudo null — não inventa", () => {
    const o = extrairOrigem(p(""), "", "/site");
    expect(o.utmSource).toBeNull();
    expect(o.utmCampaign).toBeNull();
    expect(o.clickId).toBeNull();
    expect(o.referrer).toBeNull();
  });
});

describe("normalizaReferrer", () => {
  it("guarda host e caminho, joga a query fora", () => {
    // A query de um site de terceiro pode carregar dado pessoal que não é nosso.
    expect(normalizaReferrer("https://www.google.com/search?q=nome+de+alguem"))
      .toBe("google.com/search");
  });

  it("home vira só o host", () => {
    expect(normalizaReferrer("https://instagram.com/")).toBe("instagram.com");
  });

  it("vazio é null", () => {
    expect(normalizaReferrer("")).toBeNull();
    expect(normalizaReferrer(null)).toBeNull();
  });
});

describe("canalDoContato", () => {
  it("o que o anunciante declarou vence", () => {
    expect(canalDoContato({ utmSource: "facebook", referrer: "google.com" })).toBe("facebook");
  });

  it("reconhece apelidos e domínios", () => {
    expect(canalDoContato({ utmSource: "ig" })).toBe("instagram");
    expect(canalDoContato({ utmSource: "l.facebook.com" })).toBe("facebook");
  });

  it("cai no referrer quando não há utm", () => {
    expect(canalDoContato({ referrer: "instagram.com/foocci" })).toBe("instagram");
  });

  it("sem sinal nenhum é 'direto', que é a verdade", () => {
    expect(canalDoContato({})).toBe("direto");
  });

  it("fonte desconhecida vira 'outro', nunca um palpite", () => {
    expect(canalDoContato({ utmSource: "portal-do-chef" })).toBe("outro");
  });
});

describe("rotuloDaOrigem — granularidade honesta", () => {
  it("campanha + anúncio quando existem os dois", () => {
    expect(rotuloDaOrigem({ utmCampaign: "Black Friday", utmContent: "carrossel-A" }))
      .toBe("Black Friday · carrossel-A");
  });

  it("canal quando só há fonte", () => {
    expect(rotuloDaOrigem({ utmSource: "facebook" })).toBe("Facebook");
  });

  it("sem sinal, diz que não identificou — e não chuta campanha", () => {
    expect(rotuloDaOrigem({})).toBe("Direto / não identificado");
  });

  it("o campo legado `origem` nunca vira nome de campanha", () => {
    // Era exatamente o problema: TODO contato tinha origem "/site/demonstracao",
    // o que agrupava 100% da base numa "origem" só e não respondia nada.
    const r = rotuloDaOrigem({ origem: "/site/demonstracao" });
    expect(r).toContain("Direto");
    expect(r).toContain("/site/demonstracao");
  });
});

describe("normalizaWhatsapp", () => {
  it("põe o DDI 55 quando falta", () => {
    expect(normalizaWhatsapp("(11) 99999-8888")).toBe("5511999998888");
  });

  it("não duplica o DDI que já veio", () => {
    expect(normalizaWhatsapp("+55 11 99999-8888")).toBe("5511999998888");
  });

  it("aceita fixo de 8 dígitos", () => {
    expect(normalizaWhatsapp("11 3333-4444")).toBe("551133334444");
  });

  it("recusa o que não pode ser telefone — número fantasma na base é pior que ausência", () => {
    expect(normalizaWhatsapp("123")).toBeNull();
    expect(normalizaWhatsapp("não tenho")).toBeNull();
    expect(normalizaWhatsapp("5511999998888000")).toBeNull();
    expect(normalizaWhatsapp(null)).toBeNull();
  });

  it("o link do WhatsApp usa o número normalizado", () => {
    expect(linkWhatsapp("(11) 99999-8888")).toBe("https://wa.me/5511999998888");
    expect(linkWhatsapp("abc")).toBeNull();
  });
});
