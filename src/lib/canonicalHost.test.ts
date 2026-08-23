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
import { destinoCanonicoSemWww, hostSemPorta } from "./canonicalHost";

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
