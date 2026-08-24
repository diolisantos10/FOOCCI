/**
 * A BASE DE PREÇO — e a prova de que ela não é uma quinta tabela.
 *
 * O risco deste arquivo inteiro é um só: alguém, um dia, achar mais prático
 * escrever `"R$ 429,00"` aqui do que derivar da fonte única. Seria conveniente,
 * pareceria certo, e a Sala passaria a anunciar um valor que o cartão não cobra.
 *
 * Por isso o teste central abaixo **lê o próprio código-fonte** de `precos.ts`.
 * É incomum, e é proporcional: nenhuma asserção sobre o comportamento pegaria
 * uma tabela paralela que, hoje, por acaso, coincide com a verdadeira.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  tabelaPublicada,
  precoDoPlano,
  descontoPublicado,
  responderSobrePreco,
  motivoDeHandoffPorPreco,
  oQueAindaNaoSeSabe,
  naoSei,
  nomeComercial,
  idDoSite,
} from "./precos";
import {
  PLAN_CYCLE_CENTS,
  SITE_PLAN_TO_CODE,
  CYCLE_CODES,
  SITE_PLAN_IDS,
  formatBRL,
  firstChargeCents,
} from "@/lib/billing/pricing";

describe("a tabela sai da fonte única, e de nenhum outro lugar", () => {
  it("cada valor de ciclo bate, centavo a centavo, com `PLAN_CYCLE_CENTS`", () => {
    for (const plano of tabelaPublicada()) {
      for (const c of plano.ciclos) {
        expect(c.doCiclo, `${plano.id}/${c.ciclo}`).toBe(
          formatBRL(PLAN_CYCLE_CENTS[SITE_PLAN_TO_CODE[plano.id]][c.ciclo]),
        );
      }
    }
  });

  it("os três planos e os três ciclos aparecem inteiros — nada some no caminho", () => {
    const t = tabelaPublicada();
    expect(t.map((p) => p.id)).toEqual(SITE_PLAN_IDS);
    for (const p of t) expect(p.ciclos.map((c) => c.ciclo)).toEqual(CYCLE_CODES);
  });

  it("nenhum valor em reais está DIGITADO no código de `precos.ts`", () => {
    // A trava de verdade. Um `"R$ 429,00"` escrito aqui passaria em todos os
    // outros testes deste arquivo enquanto coincidisse com a tabela — e mentiria
    // no primeiro dia em que o CEO mudasse um preço.
    const fonte = readFileSync(path.join(__dirname, "precos.ts"), "utf8");

    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "") // blocos
      .replace(/^\s*\/\/.*$/gm, ""); // linhas

    const numeros = semComentarios.match(/\d{3,}/g) ?? [];
    expect(numeros, "número de 3+ dígitos no código — preço digitado à mão?").toEqual([]);

    expect(semComentarios, "'R$' seguido de dígito é preço fixo no código").not.toMatch(
      /R\$\s*\d/,
    );
  });

  it("a primeira cobrança do MENSAL é exatamente a metade — a regra do CEO, à risca", () => {
    for (const plano of tabelaPublicada()) {
      const codigo = SITE_PLAN_TO_CODE[plano.id];
      const mensal = plano.ciclos.find((c) => c.ciclo === "MENSAL")!;
      expect(mensal.primeiraCobranca).toBe(formatBRL(firstChargeCents(codigo, "MENSAL")));
      expect(firstChargeCents(codigo, "MENSAL") * 2).toBe(PLAN_CYCLE_CENTS[codigo].MENSAL);
    }
  });

  it("a mensalidade equivalente do anual é MENOR que a do mensal", () => {
    // A metade que passa. Sem ela, uma inversão de sinal em `monthlyEquivalent`
    // ficaria verde: os testes acima só conferem que o número bate com a função,
    // não que a função faz sentido comercial.
    for (const plano of tabelaPublicada()) {
      const mensal = plano.ciclos.find((c) => c.ciclo === "MENSAL")!;
      const anual = plano.ciclos.find((c) => c.ciclo === "ANUAL")!;
      expect(anual.equivalenteAoMes, plano.id).not.toBe(mensal.equivalenteAoMes);
    }
  });

  it("`precoDoPlano` não chuta plano nenhum", () => {
    expect(precoDoPlano("crescimento")?.id).toBe("crescimento");
    expect(precoDoPlano("CRESCIMENTO")?.id).toBe("crescimento");
    expect(precoDoPlano("premium")).toBeNull();
    expect(precoDoPlano("")).toBeNull();
  });

  it("o cliente nunca lê o nome do banco", () => {
    expect(nomeComercial("GROWTH")).toBe("Crescimento");
    expect(idDoSite("GROWTH")).toBe("crescimento");
  });
});

describe("o portão: o que a Sala pode dizer sobre dinheiro", () => {
  it("informar a tabela é permitido — é dado público", () => {
    const r = responderSobrePreco("tabela");
    expect(r.podeResponder).toBe(true);
    expect(r.tabela).toHaveLength(SITE_PLAN_IDS.length);
  });

  it("o desconto de 50% do primeiro mês pode ser informado", () => {
    const r = responderSobrePreco("descontoPublicado");
    expect(r.podeResponder).toBe(true);
    expect(r.desconto?.universal).toBe(true);
    expect(descontoPublicado().sabe).toBe(true);
  });

  it("desconto ALÉM da tabela é recusado, e diz quem decide", () => {
    const r = responderSobrePreco("descontoAlemDaTabela");
    expect(r.podeResponder).toBe(false);
    expect(r.decideQuem).toContain("CEO");
    // A recusa carrega o porquê. Uma recusa sem motivo obriga o humano a começar
    // a conversa do zero, que é o defeito que o dossiê de handoff existe para
    // evitar.
    expect(r.motivo?.length ?? 0).toBeGreaterThan(20);
  });

  it("prazo, forma de pagamento e alçada também são recusados", () => {
    for (const assunto of ["prazoDeImplantacao", "formaDePagamento", "quemPodeFechar"] as const) {
      const r = responderSobrePreco(assunto);
      expect(r.podeResponder, assunto).toBe(false);
      expect(r.decideQuem, assunto).toBeTruthy();
      expect(r.motivo, assunto).toBeTruthy();
      // E não vaza tabela junto com a recusa.
      expect(r.tabela, assunto).toBeUndefined();
    }
  });

  it("o motivo de handoff vem escrito quando não se pode responder, e vazio quando se pode", () => {
    expect(motivoDeHandoffPorPreco("tabela")).toBeNull();
    expect(motivoDeHandoffPorPreco("descontoPublicado")).toBeNull();

    const m = motivoDeHandoffPorPreco("formaDePagamento");
    expect(m).toBeTruthy();
    expect(m).toContain("Decide:");
  });

  it("`oQueAindaNaoSeSabe` lista tudo que está aberto, com dono", () => {
    const abertos = oQueAindaNaoSeSabe();
    expect(abertos.length).toBeGreaterThan(0);
    for (const a of abertos) {
      expect(a.motivo, a.assunto).toBeTruthy();
      expect(a.decideQuem, a.assunto).toBeTruthy();
    }
    // O item que o CEO corrigiu em 25/08 NÃO está aqui: preço de tabela é
    // fechado e publicado. Se voltar para esta lista, alguém regrediu.
    expect(abertos.map((a) => String(a.assunto))).not.toContain("tabela");
  });

  it("`naoSei` devolve sempre a forma fechada, nunca um valor", () => {
    const r = naoSei<string>("quemPodeFechar");
    expect(r.sabe).toBe(false);
    if (!r.sabe) {
      expect(r.decideQuem).toBeTruthy();
      expect(r.motivo).toBeTruthy();
    }
  });
});
