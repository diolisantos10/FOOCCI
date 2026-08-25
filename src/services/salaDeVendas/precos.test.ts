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

  /**
   * ── AS TRÊS QUE O CHECKOUT RESPONDEU (CEO, 25/08/2026) ────────────────────
   *
   * Estes casos afirmavam o contrário há uma rodada: desconto, forma de
   * pagamento e alçada eram recusas com "decide: CEO". O CEO respondeu quem
   * fecha — *"quem fecha é o checkout, o cliente no próprio checkout"* — e as
   * três deixaram de ser perguntas.
   *
   * A distinção que estes testes guardam: elas não viraram "pode negociar".
   * Viraram "a máquina faz assim". O vendedor informa, como informa o preço.
   */
  it("as três respostas do checkout são informáveis, e não recusas", () => {
    for (const assunto of ["comoFecha", "descontoAlemDaTabela", "formaDePagamento"] as const) {
      const r = responderSobrePreco(assunto);
      expect(r.podeResponder, assunto).toBe(true);
      expect(r.resposta?.length ?? 0, assunto).toBeGreaterThan(20);
      // Nenhuma delas vira "decide: fulano" — não há mais o que decidir.
      expect(r.decideQuem, assunto).toBeUndefined();
      expect(r.motivo, assunto).toBeUndefined();
    }
  });

  it("desconto além da tabela é respondido pela MECÂNICA, não por uma alçada", () => {
    // A frase importa: se um dia isto virar "o gerente pode até X%", alguém
    // abriu um caminho de exceção — e aí as três voltam a ser perguntas.
    const r = responderSobrePreco("descontoAlemDaTabela");
    expect(r.resposta).toContain("não existe caminho");
    expect(r.resposta).toContain("tabela publicada");
  });

  it("forma de pagamento sai do que o Mercado Pago aceita na recorrência", () => {
    const r = responderSobrePreco("formaDePagamento");
    expect(r.resposta).toContain("cartão de crédito");
    // Prometer boleto ou PIX numa assinatura recorrente é a promessa que
    // quebra na hora da cobrança.
    expect(r.resposta).toContain("Não há boleto nem PIX");
  });

  it("prazo de implantação CONTINUA sem resposta, e diz quem decide", () => {
    // A que sobrou. Se ela sumir desta lista sem uma decisão registrada,
    // alguém respondeu inventando uma data.
    const r = responderSobrePreco("prazoDeImplantacao");
    expect(r.podeResponder).toBe(false);
    expect(r.decideQuem).toContain("CEO");
    // A recusa carrega o porquê. Recusa sem motivo obriga quem pega o lead a
    // começar a conversa do zero.
    expect(r.motivo?.length ?? 0).toBeGreaterThan(20);
    expect(r.tabela).toBeUndefined();
  });

  it("o motivo de handoff vem escrito só para o que continua em aberto", () => {
    expect(motivoDeHandoffPorPreco("tabela")).toBeNull();
    expect(motivoDeHandoffPorPreco("descontoPublicado")).toBeNull();
    // As três do checkout deixaram de gerar handoff — e é essa a economia real
    // da decisão: três interrupções a menos por conversa.
    expect(motivoDeHandoffPorPreco("descontoAlemDaTabela")).toBeNull();
    expect(motivoDeHandoffPorPreco("formaDePagamento")).toBeNull();
    expect(motivoDeHandoffPorPreco("comoFecha")).toBeNull();

    const m = motivoDeHandoffPorPreco("prazoDeImplantacao");
    expect(m).toBeTruthy();
    expect(m).toContain("Decide:");
  });

  it("`oQueAindaNaoSeSabe` lista o que está aberto, com dono — e nada mais", () => {
    const abertos = oQueAindaNaoSeSabe();
    expect(abertos.length).toBeGreaterThan(0);
    for (const a of abertos) {
      expect(a.motivo, a.assunto).toBeTruthy();
      expect(a.decideQuem, a.assunto).toBeTruthy();
    }

    const nomes = abertos.map((a) => String(a.assunto));
    // Preço de tabela é fechado e publicado (correção do CEO em 25/08).
    expect(nomes).not.toContain("tabela");
    // E as três que o checkout respondeu no mesmo dia. Se voltarem, foi porque
    // apareceu um caminho de exceção — e aí a volta é correta, não regressão.
    expect(nomes).not.toContain("descontoAlemDaTabela");
    expect(nomes).not.toContain("formaDePagamento");
    expect(nomes).not.toContain("quemPodeFechar");
  });

  it("`naoSei` devolve sempre a forma fechada, nunca um valor", () => {
    const r = naoSei<string>("prazoDeImplantacao");
    expect(r.sabe).toBe(false);
    if (!r.sabe) {
      expect(r.decideQuem).toBeTruthy();
      expect(r.motivo).toBeTruthy();
    }
  });
});
