import { describe, it, expect, afterEach } from "vitest";
import { criarCookieInterno, type SessaoInterna } from "./internal-auth";

/**
 * A trava do segredo de sessão.
 *
 * Os dois lados importam. Um teste que só prova a recusa deixaria passar uma
 * trava que recusa sempre — inclusive quem está configurado direito.
 */

const SESSAO: SessaoInterna = {
  userId: "u1",
  nome: "Fulano",
  role: "MEMBRO",
  departamentos: [],
  gerencia: [],
};

const AMBIENTE = process.env.NODE_ENV;
const SEGREDO_ORIGINAL = process.env.INTERNAL_SESSION_SECRET;

function comAmbiente(valor: string | undefined) {
  // NODE_ENV é readonly no tipo do Node; em teste precisamos trocar de verdade.
  const env = process.env as Record<string, string | undefined>;
  if (valor === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = valor;
}

afterEach(() => {
  comAmbiente(AMBIENTE);
  if (SEGREDO_ORIGINAL === undefined) delete process.env.INTERNAL_SESSION_SECRET;
  else process.env.INTERNAL_SESSION_SECRET = SEGREDO_ORIGINAL;
});

describe("segredo da sessão interna", () => {
  it("em produção, sem segredo configurado, recusa assinar", () => {
    comAmbiente("production");
    delete process.env.INTERNAL_SESSION_SECRET;

    // Sortear um segredo aqui produziria instâncias que derrubam o login umas
    // das outras, em silêncio. Falhar alto é o comportamento correto.
    expect(() => criarCookieInterno(SESSAO)).toThrow(/INTERNAL_SESSION_SECRET/);
  });

  it("em produção, segredo curto demais também é recusado", () => {
    comAmbiente("production");
    process.env.INTERNAL_SESSION_SECRET = "curta";

    expect(() => criarCookieInterno(SESSAO)).toThrow(/32/);
  });

  it("em produção, com segredo válido, assina normalmente", () => {
    comAmbiente("production");
    process.env.INTERNAL_SESSION_SECRET = "x".repeat(48);

    const cookie = criarCookieInterno(SESSAO);
    expect(cookie).toContain("foocci-internal-session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("fora de produção, a ausência do segredo não trava o desenvolvimento", () => {
    comAmbiente("development");
    delete process.env.INTERNAL_SESSION_SECRET;

    expect(() => criarCookieInterno(SESSAO)).not.toThrow();
  });
});
