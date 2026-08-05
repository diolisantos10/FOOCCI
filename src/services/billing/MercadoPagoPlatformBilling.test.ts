/**
 * O diagnóstico da chave de cobrança — as DUAS metades.
 *
 * A metade que quase ninguém escreve é a segunda: provar que o diagnóstico
 * REPROVA quando deve. Um verificador que só foi visto aprovando é indistinguível
 * de um verificador que aprova sempre — e este aqui existe justamente porque
 * "variável presente" já enganava a gente uma vez.
 *
 * Nenhum teste toca a rede: `fetch` é substituído. O que se prova é a leitura do
 * veredito, não o Mercado Pago.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MercadoPagoPlatformBilling, isPlatformBillingConfigured } from "./MercadoPagoPlatformBilling";

const TOKEN = "APP_USR-token-de-mentira-para-teste";

beforeEach(() => {
  vi.stubEnv("MP_PLATFORM_ACCESS_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("checkCredential — a chave está viva?", () => {
  it("aprova e identifica a conta quando o Mercado Pago responde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: 123456, nickname: "FOOCCI", site_id: "MLB" }), { status: 200 })),
    );

    const r = await MercadoPagoPlatformBilling.checkCredential();

    expect(r.ok).toBe(true);
    // A conta faz parte do veredito de propósito: chave VÁLIDA da conta ERRADA
    // é um erro real, e sem o apelido ninguém perceberia.
    if (r.ok) expect(r.nickname).toBe("FOOCCI");
  });

  it("REPROVA quando o Mercado Pago recusa a chave — e diz o motivo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "invalid access token" }), { status: 401 })),
    );

    const r = await MercadoPagoPlatformBilling.checkCredential();

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("401");
      // Guardrail 6: o alerta carrega a evidência. "Falhou" sozinho é ruído.
      expect(r.reason).toContain("invalid access token");
    }
  });

  it("REPROVA quando o gateway não responde — e não confunde com chave inválida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));

    const r = await MercadoPagoPlatformBilling.checkCredential();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("não deu para falar com o Mercado Pago");
  });

  it("REPROVA sem token, sem sequer chamar a rede", async () => {
    vi.stubEnv("MP_PLATFORM_ACCESS_TOKEN", "");
    const chamou = vi.fn();
    vi.stubGlobal("fetch", chamou);

    const r = await MercadoPagoPlatformBilling.checkCredential();

    expect(r.ok).toBe(false);
    expect(chamou).not.toHaveBeenCalled();
  });

  it("o token NUNCA sai no veredito — nem inteiro, nem em pedaço", async () => {
    vi.stubGlobal(
      "fetch",
      // O MP devolvendo o token no corpo é absurdo — e é exatamente o tipo de
      // absurdo que vaza segredo para uma tela quando ninguém testou.
      vi.fn(async () => new Response(JSON.stringify({ id: 1, nickname: TOKEN, access_token: TOKEN }), { status: 200 })),
    );

    const r = await MercadoPagoPlatformBilling.checkCredential();
    const serializado = JSON.stringify(r);

    expect(serializado).not.toContain("token-de-mentira");
  });
});

describe("isPlatformBillingConfigured — a pergunta MAIS FRACA", () => {
  it("diz true só por a variável existir — por isso ela não basta", () => {
    vi.stubEnv("MP_PLATFORM_ACCESS_TOKEN", "qualquer-coisa-que-nao-e-token");
    expect(isPlatformBillingConfigured()).toBe(true);
  });

  it("diz false quando não há variável", () => {
    vi.stubEnv("MP_PLATFORM_ACCESS_TOKEN", "");
    expect(isPlatformBillingConfigured()).toBe(false);
  });
});
