/**
 * Canonical Evolution webhook URL — single source of truth.
 *
 * Guards against the bug where the diagnostics card said foocci.com.br but the
 * live-status/sync derived the URL from the Railway proxy host
 * (foocci.up.railway.app), risking a wrong webhook being configured.
 */

import { describe, it, expect } from "vitest";
import {
  getExpectedEvolutionWebhookUrl,
  getPublicMenuUrl,
  getPublicQrUrl,
  getPublicSiteUrl,
} from "./public-url";

describe("getExpectedEvolutionWebhookUrl", () => {
  it("is the canonical site URL + /api/webhooks/evolution", () => {
    expect(getExpectedEvolutionWebhookUrl()).toBe(
      `${getPublicSiteUrl()}/api/webhooks/evolution`,
    );
  });

  it("never points at a Railway proxy host", () => {
    expect(getExpectedEvolutionWebhookUrl()).not.toContain(".railway.app");
  });

  it("has no trailing slash before the path and no token", () => {
    const url = getExpectedEvolutionWebhookUrl();
    expect(url.endsWith("/api/webhooks/evolution")).toBe(true);
    expect(url).not.toContain("?token=");
  });

  it("defaults to https://foocci.com.br in the test env (no site env set)", () => {
    // No NEXT_PUBLIC_SITE_URL in unit env → hard fallback.
    expect(getExpectedEvolutionWebhookUrl()).toBe(
      "https://foocci.com.br/api/webhooks/evolution",
    );
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
