/**
 * O destino do `www` → apex não pode carregar a porta interna do contêiner.
 *
 * O DEFEITO, visto pelo CEO em produção em 23/08/2026, minutos depois de o
 * certificado do `www` finalmente sair:
 *
 *     https://www.foocci.com.br/  →  308  →  https://foocci.com.br:8080/
 *
 * `8080` é a porta em que o app escuta DENTRO do contêiner do Railway. Atrás do
 * proxy, `req.nextUrl` já vem com ela, e trocar apenas `dest.host` não a remove
 * (o setter `host` do WHATWG só mexe na porta se o valor novo trouxer uma). O
 * visitante recebia um endereço inexistente: "Não é possível acessar esse site".
 *
 * Trocamos o certificado quebrado por uma porta de entrada quebrada — o mesmo
 * dano, por outra causa.
 *
 * Estes casos REPROVAM contra o código antigo: o primeiro bloco compara com o
 * comportamento real do `clone()+host=`, para o teste morrer se alguém voltar
 * àquela forma.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  destinoCanonicoSemWww,
  hostSemPorta,
  raizVaiParaVitrine,
  origemPublica,
  DESTINO_DA_RAIZ,
  ehHostDaComercial,
} from "./canonicalHost";

/** O jeito antigo, preservado aqui só para provar que ele produz o defeito. */
function jeitoAntigo(host: string, url: string): string {
  const dest = new URL(url);
  dest.host = host.replace(/^www\./, "");
  return dest.toString();
}

describe("a porta interna nunca vaza para o destino", () => {
  it("o jeito antigo realmente produzia :8080 — é isto que estamos consertando", () => {
    expect(jeitoAntigo("www.foocci.com.br:8080", "https://www.foocci.com.br:8080/")).toContain(":8080");
  });

  it.each([
    ["www.foocci.com.br:8080", "/", ""],
    ["www.foocci.com.br:8080", "/site/precos", ""],
    ["www.foocci.com.br:3000", "/r/ABC123", "?utm_source=zap"],
    ["www.foocci.com.br", "/", ""],
  ])("host %s + %s não gera porta nenhuma", (host, pathname, search) => {
    const destino = destinoCanonicoSemWww(host, pathname, search);
    expect(destino).not.toMatch(/:\d+/);
    expect(new URL(destino).port).toBe("");
  });

  it("o destino é sempre https, mesmo que a conexão interna seja http", () => {
    expect(destinoCanonicoSemWww("www.foocci.com.br:8080", "/")).toBe("https://foocci.com.br/");
  });
});

describe("caminho e query sobrevivem ao redirecionamento", () => {
  it("link curto de cardápio que já foi para cliente cai no mesmo lugar", () => {
    expect(destinoCanonicoSemWww("www.foocci.com.br:8080", "/r/ABC123")).toBe(
      "https://foocci.com.br/r/ABC123",
    );
  });

  it("preserva a query inteira — é dela que sai a medição de campanha", () => {
    expect(
      destinoCanonicoSemWww("www.foocci.com.br", "/pedido/sushi-cazza", "?utm_source=insta&utm_campaign=x"),
    ).toBe("https://foocci.com.br/pedido/sushi-cazza?utm_source=insta&utm_campaign=x");
  });

  it("não inventa barra nem corta caminho profundo", () => {
    expect(destinoCanonicoSemWww("www.foocci.com.br", "/site/como-funciona")).toBe(
      "https://foocci.com.br/site/como-funciona",
    );
  });
});

describe("hostSemPorta", () => {
  it("tira a porta quando existe e não mexe quando não existe", () => {
    expect(hostSemPorta("www.foocci.com.br:8080")).toBe("www.foocci.com.br");
    expect(hostSemPorta("foocci.com.br")).toBe("foocci.com.br");
  });

  it("entende IPv6, onde cortar no primeiro ':' destruiria o endereço", () => {
    expect(hostSemPorta("[::1]:8080")).toBe("[::1]");
    expect(hostSemPorta("[::1]")).toBe("[::1]");
  });

  it("um host sem www passa intacto — a regra é do protocolo, não da marca", () => {
    expect(destinoCanonicoSemWww("foocci.com.br:8080", "/site")).toBe("https://foocci.com.br/site");
  });
});

/**
 * A raiz do domínio precisa de um `Location` DE VERDADE.
 *
 * O defeito (produção, 23/08/2026): com o desvio morando na página, o Next
 * pré-renderizava a rota e servia `307` com corpo `__next_error__` e **nenhum**
 * cabeçalho `Location`. Medido de fora com `curl -L`: zero saltos, código final
 * 307, ninguém chegava a `/site`. Navegador se virava pelo JavaScript; robô de
 * busca, prévia de link do WhatsApp e monitor, não.
 */
describe("a raiz vai para a vitrine", () => {
  it("desvia a raiz exata", () => {
    expect(raizVaiParaVitrine("/")).toBe(true);
  });

  it.each(["/site", "/site/precos", "/login", "/r/ABC123", "/api/health", "/pedido/sushi-cazza"])(
    "não desvia %s — só a raiz é vitrine",
    (pathname) => {
      expect(raizVaiParaVitrine(pathname)).toBe(false);
    },
  );

  it("o caminho de destino é relativo — quem monta a origem é origemPublica", () => {
    expect(DESTINO_DA_RAIZ.startsWith("/")).toBe(true);
    expect(DESTINO_DA_RAIZ).not.toMatch(/:\/\/|:\d+/);
  });

  it("em produção (https atrás do proxy) a porta interna some do destino", () => {
    const origem = origemPublica("foocci.com.br:8080", "https");
    expect(origem).toBe("https://foocci.com.br");
    expect(new URL(DESTINO_DA_RAIZ, origem).toString()).toBe("https://foocci.com.br/site");
  });

  it("em desenvolvimento a porta é PRESERVADA — senão localhost:3000 vira localhost", () => {
    const origem = origemPublica("localhost:3000", "http");
    expect(origem).toBe("http://localhost:3000");
    expect(new URL(DESTINO_DA_RAIZ, origem).toString()).toBe("http://localhost:3000/site");
  });

  it("aceita o protocolo com dois-pontos, como vem de nextUrl.protocol", () => {
    expect(origemPublica("foocci.com.br:8080", "https:")).toBe("https://foocci.com.br");
  });
});

describe("o espelho não pode envelhecer sozinho", () => {
  it("o desvio da raiz continua no middleware, e não na página", () => {
    const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(
      src.includes("raizVaiParaVitrine"),
      "O desvio da raiz saiu do middleware. Na página ele vira artefato estático e " +
        "responde 307 SEM `Location`: robô de busca, prévia de link e monitor param " +
        "de chegar em /site. Medido em produção em 23/08/2026.",
    ).toBe(true);
  });
});

describe("o host da Comercial", () => {
  it("reconhece vendas.foocci.com.br", () => {
    expect(ehHostDaComercial("vendas.foocci.com.br")).toBe(true);
  });

  it("reconhece mesmo com a porta interna do contêiner colada", () => {
    // O `:8080` do Railway já causou um defeito real neste arquivo. Um host
    // comparado com a porta junto nunca bate, e a Comercial cairia na vitrine
    // em produção — funcionando perfeitamente em desenvolvimento.
    expect(ehHostDaComercial("vendas.foocci.com.br:8080")).toBe(true);
  });

  it("não confunde o domínio principal com a Comercial", () => {
    expect(ehHostDaComercial("foocci.com.br")).toBe(false);
    expect(ehHostDaComercial("www.foocci.com.br")).toBe(false);
  });

  it("não basta conter 'vendas' — tem que ser o subdomínio", () => {
    // `minhasvendas.com.br` não é nossa sala comercial. Um `includes` teria
    // dito que sim.
    expect(ehHostDaComercial("minhasvendas.com.br")).toBe(false);
  });
});
