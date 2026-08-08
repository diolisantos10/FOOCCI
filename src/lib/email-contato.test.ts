/**
 * As DUAS metades do portão do e-mail.
 *
 * METADE 1 — o que tem de ser RECUSADO. `a@b` é o caso que dá nome ao problema:
 * o `type="email"` do navegador aceita, e por isso ele nunca foi validação.
 *
 * METADE 2 — o que tem de ser ACEITO. Sem ela, um `return false` fixo passaria na
 * metade de cima, e o portão viraria uma parede: recusar quem está certo custa
 * mais que aceitar dado sujo, porque barra o dono que estava tentando comprar.
 */

import { describe, it, expect } from "vitest";
import { analisarEmail, emailValido, formatarEmail, MENSAGEM_EMAIL_INVALIDO } from "./email-contato";

describe("e-mail recusado — a metade que barra", () => {
  it.each([
    ["a@b",                  "DOMINIO", "domínio sem ponto: o que o navegador aceita e nós não"],
    ["sem-arroba",           "ARROBA",  "não tem @"],
    ["joao@ tal.com",        "ESPACO",  "espaço no meio"],
    ["joao @tal.com",        "ESPACO",  "espaço antes do @"],
    ["joao@tal .com",        "ESPACO",  "espaço no domínio"],
    ["",                     "VAZIO",   "vazio"],
    ["   ",                  "VAZIO",   "só espaço"],
    ["@tal.com",             "LOCAL",   "sem nome antes do @"],
    ["joao@",                "DOMINIO", "sem domínio"],
    ["joao@tal",             "DOMINIO", "domínio sem ponto"],
    ["joao@tal.",            "DOMINIO", "termina em ponto"],
    ["joao@.com",            "DOMINIO", "rótulo vazio"],
    ["joao@tal..com",        "DOMINIO", "ponto duplo no domínio"],
    ["joao@-tal.com",        "DOMINIO", "rótulo começando em hífen"],
    ["joao@tal-.com",        "DOMINIO", "rótulo terminando em hífen"],
    ["joao@tal.c",           "DOMINIO", "TLD de uma letra"],
    ["joao@tal.c0m",         "DOMINIO", "TLD com número"],
    ["a@b@c.com",            "ARROBA",  "dois @"],
    ["joao..silva@tal.com",  "LOCAL",   "ponto duplo no nome"],
    [".joao@tal.com",        "LOCAL",   "começa com ponto"],
    ["joao.@tal.com",        "LOCAL",   "termina com ponto"],
    ["joão@tal.com",         "LOCAL",   "acento — não é entregável e o servidor recusa"],
    ["joao\n@tal.com",       "ESPACO",  "quebra de linha colada de um documento"],
  ])("recusa %s (%s)", (valor, motivo) => {
    const r = analisarEmail(valor);
    expect(r.ok, `"${valor}" passou e não deveria`).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe(motivo);
      // A recusa ensina o que fazer — mensagem sem exemplo devolve a pessoa ao
      // mesmo erro.
      expect(r.mensagem).toBe(MENSAGEM_EMAIL_INVALIDO);
      expect(r.mensagem).toContain("@");
    }
    expect(emailValido(valor)).toBe(false);
    expect(formatarEmail(valor)).toBeNull();
  });

  it("nada além de texto entra", () => {
    for (const v of [null, undefined, 12 as unknown as string, {} as unknown as string]) {
      expect(analisarEmail(v).ok).toBe(false);
    }
  });

  it("passa do tamanho que um servidor de e-mail aceita", () => {
    const gigante = `${"a".repeat(250)}@tal.com`;
    const localGigante = `${"a".repeat(65)}@tal.com`;
    expect(analisarEmail(gigante)).toMatchObject({ ok: false, motivo: "TAMANHO" });
    expect(analisarEmail(localGigante)).toMatchObject({ ok: false, motivo: "LOCAL" });
  });
});

describe("e-mail aceito — a metade que impede o portão de virar parede", () => {
  it.each([
    ["joao@tal.com",                       "joao@tal.com"],
    ["contato@pizzarianonna.com.br",       "contato@pizzarianonna.com.br"],
    ["  contato@nonna.com.br  ",           "contato@nonna.com.br"],   // colado com espaço
    ["Contato@Nonna.COM.BR",               "Contato@nonna.com.br"],   // teclado do celular capitaliza
    ["joao.da.silva@tal.com.br",           "joao.da.silva@tal.com.br"],
    ["joao+foocci@gmail.com",              "joao+foocci@gmail.com"],  // alias
    ["joao_silva@tal-restaurante.com.br",  "joao_silva@tal-restaurante.com.br"],
    ["financeiro@grupo.rede.nonna.com.br", "financeiro@grupo.rede.nonna.com.br"],
    ["contato@nonna.adm.br",               "contato@nonna.adm.br"],
    ["j@nonna.io",                         "j@nonna.io"],             // nome de uma letra
    ["contato@nonna.restaurant",           "contato@nonna.restaurant"], // TLD longo
    ["contato123@nonna2.com",              "contato123@nonna2.com"],
  ])("aceita %s", (valor, normalizado) => {
    const r = analisarEmail(valor);
    expect(r.ok, `"${valor}" foi recusado e não deveria`).toBe(true);
    if (r.ok) expect(r.normalizado).toBe(normalizado);
    expect(emailValido(valor)).toBe(true);
    expect(formatarEmail(valor)).toBe(normalizado);
  });

  it("o domínio sai em minúscula e separado, para agrupar sem reprocessar", () => {
    const r = analisarEmail("Contato@Nonna.COM.BR");
    expect(r.ok && r.dominio).toBe("nonna.com.br");
  });
});
