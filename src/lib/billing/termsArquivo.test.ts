/**
 * O RÓTULO GRAVADO NO ACEITE PRECISA APONTAR PARA UM TEXTO QUE EXISTE.
 *
 * ── O achado (29/08/2026) ───────────────────────────────────────────────────
 *
 * `PlanSubscription` guarda `termsVersion`, `termsAcceptedAt`, `termsAcceptedIp`
 * e `termsAcceptedBy`. Não guarda **o texto**. Enquanto existiu uma versão só,
 * rótulo e texto eram a mesma coisa e ninguém sentiu falta. No dia em que o
 * texto muda — hoje —, todo aceite carimbado "v1" passa a apontar para o texto
 * novo, que aquela pessoa nunca leu. A prova que se desfaz é a NOSSA.
 *
 * Estes testes travam a correção mínima: o texto de cada versão aposentada fica
 * congelado e resolvível pelo rótulo. A correção definitiva — gravar o texto (ou
 * o hash dele) NO PRÓPRIO ACEITE — é mudança de schema e decisão do CEO.
 */

import { describe, it, expect } from "vitest";
import { TERMS_SECTIONS, TERMS_VERSION } from "./terms";
import { TERMOS_ARQUIVADOS, secoesDaVersao, versoesConhecidas } from "./termsArquivo";

describe("⭐ toda versão já carimbada num aceite continua reproduzível", () => {
  it("a v1 resolve, e resolve para o texto DELA", () => {
    const v1 = secoesDaVersao("v1-2026-08-03");
    expect(v1, "o texto da v1 sumiu — todo aceite da v1 virou promessa vazia").toBeDefined();
    expect(v1).toHaveLength(9);
  });

  it("a v2 resolve, e é o texto que ela tinha antes da segunda decisão do CEO", () => {
    // A v2 durou algumas horas — nasceu e foi aposentada em 29/08/2026. Isso não
    // a torna descartável: enquanto ninguém puder AFIRMAR que nenhum aceite foi
    // colhido sob ela, o rótulo v2 precisa significar alguma coisa. Presumir o
    // contrário seria concluir uma negação do silêncio.
    const v2 = secoesDaVersao("v2-2026-08-29");
    expect(v2, "o texto da v2 sumiu").toBeDefined();
    const secao4 = v2!.find((s) => s.title.startsWith("4."))!;
    // Ela já dizia a regra da devolução…
    expect(secao4.body).toMatch(/proporcional/i);
    expect(secao4.body).toMatch(/arrepend/i);
    // …e ainda NÃO dizia que a conta usa o que o cliente pagou de verdade.
    expect(secao4.body).not.toMatch(/promo[çc]|efetivamente pagos/i);
  });

  it("a versão vigente resolve para o texto vigente", () => {
    expect(secoesDaVersao(TERMS_VERSION)).toBe(TERMS_SECTIONS);
  });

  it("⭐ só a versão vigente fala de promoção que não se recupera", () => {
    // A diferença entre v2 e v3 em duas asserções — é a decisão do CEO, e é o
    // que dá sentido a existirem duas versões no mesmo dia.
    const atual = TERMS_SECTIONS.find((s) => s.title.startsWith("4."))!;
    expect(atual.body).toMatch(/promo[çc]/i);
    expect(atual.body).toMatch(/efetivamente pagos/i);
  });

  it("⛔ o arquivo NÃO é uma cópia do texto de hoje", () => {
    // O jeito silencioso de este arquivo virar mentira: alguém "atualiza" a
    // versão arquivada junto com a vigente, e as duas passam a dizer a mesma
    // coisa. Aí o rótulo v1 volta a apontar para um texto que ninguém aceitou.
    const secao4Antiga = secoesDaVersao("v1-2026-08-03")!.find((s) =>
      s.title.startsWith("4."),
    )!;
    const secao4Atual = TERMS_SECTIONS.find((s) => s.title.startsWith("4."))!;
    expect(secao4Antiga.body).not.toBe(secao4Atual.body);

    // E o que muda entre elas é exatamente o que o CEO decidiu: a v1 calava
    // sobre dinheiro; a v2 diz a regra inteira.
    expect(secao4Antiga.body).not.toMatch(/devolv|proporcional|arrepend/i);
    expect(secao4Atual.body).toMatch(/proporcional/i);
    expect(secao4Atual.body).toMatch(/arrepend/i);
  });

  it("rótulo desconhecido devolve null — e null aqui é achado, não erro a engolir", () => {
    // Significa que existe aceite apontando para texto que a casa não reproduz.
    // Quem chamar precisa MOSTRAR isso; por isso não devolvemos o texto atual
    // como se fosse aquele.
    expect(secoesDaVersao("v3-inventada")).toBeNull();
    expect(secoesDaVersao(null)).toBeNull();
    expect(secoesDaVersao("")).toBeNull();
  });

  it("a versão vigente não se repete dentro do arquivo", () => {
    for (const v of TERMOS_ARQUIVADOS) expect(v.versao).not.toBe(TERMS_VERSION);
    const conhecidas = versoesConhecidas();
    expect(new Set(conhecidas).size).toBe(conhecidas.length);
  });

  it("cada versão arquivada diz quando foi aprovada e por que saiu", () => {
    for (const v of TERMOS_ARQUIVADOS) {
      expect(v.aprovadaEm, v.versao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.aposentadaPor?.length ?? 0, v.versao).toBeGreaterThan(20);
      expect(v.secoes.length, v.versao).toBeGreaterThan(0);
    }
  });
});
