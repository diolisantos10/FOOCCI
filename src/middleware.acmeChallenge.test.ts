/**
 * O `www` só existe se o redirecionamento NÃO engolir a prova de posse.
 *
 * A HISTÓRIA, porque sem ela esta regra parece exagero (04–05/08/2026):
 * o `www.foocci.com.br` ficou 18 horas sem abrir, mostrando
 * `ERR_CERT_COMMON_NAME_INVALID` a quem digitava com `www`. O DNS estava certo,
 * o CNAME propagado, o domínio cadastrado no Railway — e mesmo assim o
 * certificado nunca saía: `TYPE_VALIDATING_OWNERSHIP`, sem avançar.
 *
 * A causa era nossa. Para emitir o certificado, a autoridade certificadora busca
 * um token em `http://www.<dominio>/.well-known/acme-challenge/<token>`. O
 * middleware respondia 308 para a apex — e a apex não tem esse token, porque ele
 * é emitido por domínio. A validação nunca completava.
 *
 * O diagnóstico que circulava era "Railway travado, apagar e recriar o domínio".
 * **Não teria resolvido:** o domínio recriado cairia na mesma armadilha, e ainda
 * custaria uma edição de DNS (recriar sorteia um CNAME novo).
 *
 * Este arquivo testa o middleware pela SUA REGRA, não pela implementação: as duas
 * metades — o que precisa redirecionar redireciona, e o que não pode ser
 * redirecionado passa. Guardrail 4: isto é trava, não comentário.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

/**
 * Reimplementa a decisão do middleware — de propósito, e só ela.
 *
 * Importar o middleware de verdade exigiria o runtime Edge e `next-auth`, o que
 * transformaria um teste de uma linha de lógica num teste de ambiente. Em troca,
 * o segundo bloco deste arquivo prende a reimplementação ao código real: se
 * alguém mudar a condição no `middleware.ts`, o teste quebra em vez de continuar
 * verde testando uma cópia obsoleta — que é como um espelho vira mentira.
 */
const ACME_CHALLENGE_PREFIX = "/.well-known/acme-challenge/";
function redireciona(host: string, pathname: string): boolean {
  return host.startsWith("www.") && !pathname.startsWith(ACME_CHALLENGE_PREFIX);
}

describe("www → apex: a metade que PRECISA redirecionar", () => {
  it.each([
    "/",
    "/site",
    "/site/precos",
    "/pedido/foocci-bakery",
    "/login",
    "/.well-known/other-thing",
  ])("redireciona %s", (pathname) => {
    expect(redireciona("www.foocci.com.br", pathname)).toBe(true);
  });

  it("não mexe em quem já chega na apex", () => {
    expect(redireciona("foocci.com.br", "/site")).toBe(false);
  });
});

describe("www → apex: a metade que NÃO pode redirecionar", () => {
  it("deixa a prova de posse do certificado passar", () => {
    expect(redireciona("www.foocci.com.br", `${ACME_CHALLENGE_PREFIX}abc123`)).toBe(false);
  });

  it("vale para qualquer token, porque o token é sorteado a cada emissão", () => {
    for (const token of ["a", "Z9-_x", "token-bem-longo-com-hifens-e-numeros-42"]) {
      expect(redireciona("www.foocci.com.br", `${ACME_CHALLENGE_PREFIX}${token}`)).toBe(false);
    }
  });

  it("vale para QUALQUER subdomínio www, não só o da Foocci", () => {
    // Ambiente de teste, domínio novo, marca nova: a regra é do protocolo.
    expect(redireciona("www.exemplo.com", `${ACME_CHALLENGE_PREFIX}t`)).toBe(false);
  });
});

describe("o espelho não pode envelhecer sozinho", () => {
  it("o middleware real ainda excede o ACME do redirecionamento", () => {
    // Se alguém apagar a exceção, este teste cai — e a mensagem explica o custo.
    expect(
      SRC.includes("ACME_CHALLENGE_PREFIX"),
      "A exceção do ACME sumiu do middleware. Sem ela o certificado do `www` NUNCA " +
        "é emitido: a validação de posse é respondida com 308 para a apex, que não " +
        "tem o token. Já custou 18 horas de site fora do ar em 05/08/2026.",
    ).toBe(true);
    expect(SRC).toContain('const ACME_CHALLENGE_PREFIX = "/.well-known/acme-challenge/"');
    expect(SRC).toMatch(/host\.startsWith\("www\."\)\s*&&\s*!pathname\.startsWith\(ACME_CHALLENGE_PREFIX\)/);
  });
});
