/**
 * URL pública canônica — fonte única de verdade.
 *
 * ⚠️ MUDOU EM 04/08/2026. Este arquivo testava `getExpectedEvolutionWebhookUrl()`,
 * que saiu junto com a Evolution (na Meta a inscrição do webhook é do aplicativo,
 * não de cada restaurante). O que continua valendo — e é o motivo real do teste —
 * é a trava contra o host de proxy do Railway.
 *
 * Bug original: o card de diagnóstico dizia `foocci.com.br` enquanto o status ao
 * vivo derivava a URL do `host` da requisição (`foocci.up.railway.app`), com risco
 * de aplicar o endereço errado. A mesma armadilha vale para qualquer URL mostrada
 * ao cliente — por isso a trava fica.
 */

import { describe, it, expect } from "vitest";
// `getExpectedEvolutionWebhookUrl` saiu com a Evolution em 04/08 — os outros
// três helpers a padrão passou a cobrir, e essa cobertura fica.
import {
  getPublicMenuUrl,
  getPublicQrUrl,
  getPublicSiteUrl,
} from "./public-url";

describe("getPublicSiteUrl — nunca o host de proxy do Railway", () => {
  it("não aponta para um host .railway.app", () => {
    expect(getPublicSiteUrl()).not.toContain(".railway.app");
  });

  it("não tem barra no fim (a barra dupla já quebrou link de cliente)", () => {
    expect(getPublicSiteUrl().endsWith("/")).toBe(false);
  });

  it("cai no padrão https://foocci.com.br no ambiente de teste (sem env de site)", () => {
    expect(getPublicSiteUrl()).toBe("https://foocci.com.br");
  });
});

describe("getPublicMenuUrl — o link que vai para o cliente", () => {
  it("é a URL canônica + /pedido/<slug>", () => {
    expect(getPublicMenuUrl("sushi-cazza")).toBe(`${getPublicSiteUrl()}/pedido/sushi-cazza`);
  });

  it("nunca vaza o host de proxy do Railway", () => {
    expect(getPublicMenuUrl("sushi-cazza")).not.toContain(".railway.app");
  });
});

/**
 * Os endereços que viram QR CODE em `/site/experimente`.
 *
 * O botão da página usa caminho relativo (`/pedido/foocci-bakery`) e o QR usa o
 * absoluto vindo daqui — quem escaneia está em OUTRO aparelho. Se os dois
 * divergirem, o clique e a câmera passam a abrir telas diferentes, e ninguém
 * percebe: o erro só aparece no celular do visitante, longe da página. Estes
 * testes prendem o caminho que a página assume.
 */
describe("endereços públicos da vitrine (QR da degustação)", () => {
  it("o cardápio de mesa é <site>/qr/<slug>", () => {
    expect(getPublicQrUrl("foocci-bakery")).toBe(`${getPublicSiteUrl()}/qr/foocci-bakery`);
  });

  it("a loja é <site>/pedido/<slug> — a mesma base que o modo ?modo=loja usa", () => {
    expect(getPublicMenuUrl("foocci-bakery")).toBe(
      `${getPublicSiteUrl()}/pedido/foocci-bakery`,
    );
  });

  it("são absolutos e no domínio público — QR não abre caminho relativo", () => {
    for (const url of [getPublicQrUrl("foocci-bakery"), getPublicMenuUrl("foocci-bakery")]) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).not.toContain("localhost");
      expect(url).not.toContain(".railway.app");
    }
  });
});
