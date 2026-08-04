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
import { getPublicSiteUrl, getPublicMenuUrl } from "./public-url";

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
