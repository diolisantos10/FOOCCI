/**
 * O GASTO DE IA, DIA A DIA — a conta que o CEO abre de manhã.
 *
 * O que estes testes protegem, em uma frase: que a tela nunca escreva um zero
 * sobre um gasto que ela não conhece.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece recusando E deixando passar. Um arquivo só com a primeira
 * metade ficaria verde contra um `gastoDeIaPorDia` que devolvesse `NO_USAGE`
 * para tudo — e a tela diria "sem uso" todo dia, com ar de rigor.
 *
 * ── OS TRÊS DEFEITOS QUE DOEM MAIS ──────────────────────────────────────────
 *
 *   · **Ausência virando zero.** "Não usou", "usou e não sabemos quanto" e
 *     "custou zero" são três coisas diferentes. Somadas como zero, o CEO lê
 *     "US$ 0,00" e conclui que não se gastou nada — a conclusão mais cara
 *     possível numa empresa que está queimando caixa sem cliente.
 *   · **Cortar o dia pelo UTC.** O gasto das 22h de terça iria para quarta, e a
 *     conta de "ontem" chegaria sem o pico da noite. Os totais fecham; o dia é
 *     que está errado.
 *   · **Somar um custo ao agente errado.** Chamada sem `agentSlug` atribuída a
 *     um agente real leva alguém a desligar o agente errado. Ela tem balde
 *     próprio, e ele nunca se mistura.
 */

import { describe, it, expect, vi } from "vitest";
import { UNATTRIBUTED, UNATTRIBUTED_LABEL } from "@/services/ai/pricing/costAggregation";
import { fraseDoGasto, gastoDeIaPorAgente, gastoDeIaPorDia } from "./gastoDiario";

/**
 * Um banco de mentira com as linhas que a consulta devolveria.
 *
 * ⚠️ Ele devolve as linhas SEM filtrar por data. É de propósito: assim o teste
 * exercita o balde de verdade — se o corte por dia estiver errado, a linha
 * aparece no dia errado em vez de simplesmente sumir.
 */
function bancoFalso(linhas: Array<{
  model: string;
  agentSlug?: string | null;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
}>) {
  const findMany = vi.fn().mockResolvedValue(
    linhas.map((l) => ({
      model: l.model,
      agentSlug: l.agentSlug ?? null,
      promptTokens: l.promptTokens,
      completionTokens: l.completionTokens,
      createdAt: new Date(l.createdAt),
    })),
  );
  return { aIInteractionLog: { findMany }, findMany };
}

/**
 * gpt-4o cobra US$ 0,0025 por mil de entrada e US$ 0,01 por mil de saída.
 * 4.000 + 2.000 = US$ 0,01 + US$ 0,02 = US$ 0,03 — três centavos redondos.
 */
const UMA_CHAMADA_DE_TRES_CENTAVOS = {
  model: "gpt-4o",
  promptTokens: 4_000,
  completionTokens: 2_000,
};

/**
 * gpt-4o-mini custa US$ 0,00015 e US$ 0,0006 por mil.
 * 1.000 + 1.000 = US$ 0,00075 — 750 microdólares, que é MENOS de um centavo.
 */
const UMA_CHAMADA_MIUDA = {
  model: "gpt-4o-mini",
  promptTokens: 1_000,
  completionTokens: 1_000,
};

// ═══════════════════════════════════════════════════════════════════════════
// A CONTA DE UM DIA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o gasto de um dia", () => {
  it("⭐ a chamada precificada vira centavos inteiros, e o estado é PRICED", async () => {
    // A metade que PASSA, e a mais importante do arquivo: sem ela, tudo abaixo
    // ficaria verde contra um serviço que não contasse nada.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, agentSlug: "ta", createdAt: "2026-08-29T12:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    const dia = r.dias[0]!;

    expect(dia.chave).toBe("2026-08-29");
    expect(dia.estado).toBe("PRICED");
    expect(dia.chamadas).toBe(1);
    expect(dia.tokensTotais).toBe(6_000);
    // US$ 0,03 = 30.000 microdólares = 3 centavos. Inteiros os dois.
    expect(dia.microUsd).toBe(30_000);
    expect(dia.centavosUsd).toBe(3);
    expect(Number.isInteger(dia.centavosUsd)).toBe(true);
    expect(dia.abaixoDeUmCentavo).toBe(false);
  });

  it("⭐ dia SEM chamada nenhuma é NO_USAGE — e não custo zero", async () => {
    /*
      O defeito central do financeiro inteiro. "Não usou IA" e "usou e custou
      zero" são fatos diferentes, e só o primeiro é verdade quando não há linha.

      Um serviço que devolvesse `{ centavos: 0, estado: "PRICED" }` faria a tela
      escrever "US$ 0,00" com ar de medição — e o CEO tomaria decisão sobre um
      número que ninguém mediu.
    */
    const db = bancoFalso([]);
    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.dias[0]!.estado).toBe("NO_USAGE");
    expect(r.total.estado).toBe("NO_USAGE");
    expect(fraseDoGasto(r.dias[0]!)).toContain("Sem uso");
    expect(fraseDoGasto(r.dias[0]!)).not.toContain("0,00");
  });

  it("⭐ modelo fora da tabela de preços é UNPRICED — nunca cobrado como outro", async () => {
    // O fallback silencioso que existia antes precificava QUALQUER modelo
    // desconhecido ao preço do gpt-4o. Um modelo caro entrando sob esse preço
    // daria um número plausível e errado, e ninguém teria como desconfiar.
    const db = bancoFalso([
      {
        model: "gpt-5-turbo-que-ninguem-cadastrou",
        promptTokens: 10_000,
        completionTokens: 10_000,
        createdAt: "2026-08-29T12:00:00Z",
      },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    const dia = r.dias[0]!;

    expect(dia.estado).toBe("UNPRICED");
    expect(dia.microUsd).toBe(0);
    expect(dia.chamadasSemPreco).toBe(1);
    expect(dia.modelosSemPreco).toEqual(["gpt-5-turbo-que-ninguem-cadastrou"]);

    // ⚠️ O microUsd é zero, mas a FRASE não pode dizer zero: houve gasto e não
    // sabemos quanto. É aqui que a diferença chega à tela.
    const frase = fraseDoGasto(dia);
    expect(frase).toContain("não sabemos quanto");
    expect(frase).not.toContain("US$ 0,00");
    expect(frase).toContain("gpt-5-turbo-que-ninguem-cadastrou");
  });

  it("⭐ dia com parte precificada e parte não é PARTIAL, e a frase avisa que o real é maior", async () => {
    // O estado mais perigoso de todos, porque ele TEM um número — e o número
    // está certo e incompleto ao mesmo tempo. Mostrado sozinho, ele vira um
    // piso apresentado como total.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-29T12:00:00Z" },
      {
        model: "modelo-novo-sem-preco",
        promptTokens: 5_000,
        completionTokens: 5_000,
        createdAt: "2026-08-29T13:00:00Z",
      },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    const dia = r.dias[0]!;

    expect(dia.estado).toBe("PARTIAL");
    expect(dia.microUsd).toBe(30_000); // só o que se sabe
    expect(dia.chamadasSemPreco).toBe(1);
    expect(fraseDoGasto(dia)).toContain("MAIOR");
  });

  it("⭐ gasto miúdo NÃO some no arredondamento para centavo", async () => {
    /*
      Mil tokens de gpt-4o-mini custam 0,075 centavo. Se a unidade de conta fosse
      o centavo, CADA chamada arredondaria para zero e a soma do dia seria zero
      depois de dez mil chamadas — e esse é justamente o formato do gasto da
      Foocci: miúdo, constante e somado aos milhares.

      A conta é em microdólares; o centavo é derivado no fim, com a bandeira que
      impede a tela de escrever "US$ 0,00".
    */
    const db = bancoFalso([
      { ...UMA_CHAMADA_MIUDA, createdAt: "2026-08-29T12:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    const dia = r.dias[0]!;

    expect(dia.microUsd).toBe(750);
    expect(dia.centavosUsd).toBe(0);
    expect(dia.abaixoDeUmCentavo).toBe(true);
    expect(fraseDoGasto(dia)).toContain("não é zero");
  });

  it("mil chamadas miúdas somam de verdade, em vez de somarem mil zeros", async () => {
    // A metade que passa da regra acima, e a prova de que a unidade interna
    // resolve o problema em vez de só rotulá-lo.
    const db = bancoFalso(
      Array.from({ length: 1_000 }, () => ({
        ...UMA_CHAMADA_MIUDA,
        createdAt: "2026-08-29T12:00:00Z",
      })),
    );

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.dias[0]!.microUsd).toBe(750_000); // US$ 0,75
    expect(r.dias[0]!.centavosUsd).toBe(75);
    expect(r.dias[0]!.abaixoDeUmCentavo).toBe(false);
  });

  it("motor interno tem custo ZERO CONHECIDO, e isso é PRICED — não UNPRICED", async () => {
    // "mock" e "local" não chamam API paga. Zero aqui é um fato medido, e não
    // uma ausência: o estado precisa ser diferente do modelo desconhecido.
    const db = bancoFalso([
      { model: "mock", promptTokens: 100, completionTokens: 100, createdAt: "2026-08-29T12:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.dias[0]!.estado).toBe("PRICED");
    expect(r.dias[0]!.microUsd).toBe(0);
    expect(r.dias[0]!.chamadasSemPreco).toBe(0);
  });

  it("whisper é cobrado por minuto de áudio: entra como sem preço, e não como zero", async () => {
    // Estimar por token um modelo cobrado por minuto daria um número errado com
    // cara de certo — pior que a ausência do número.
    const db = bancoFalso([
      { model: "whisper-1", promptTokens: 0, completionTokens: 0, createdAt: "2026-08-29T12:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.dias[0]!.estado).toBe("UNPRICED");
    expect(r.dias[0]!.chamadasSemPreco).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O CORTE DO DIA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o dia é o de São Paulo", () => {
  it("⭐ a chamada das 23h30 de 28/08 fica no dia 28 — e não no 29", async () => {
    /*
      `2026-08-29T02:30:00Z` é 28/08 23:30 no Brasil. Cortando por UTC, ela
      cairia no dia 29 — e o CEO abriria a conta de ontem sem o gasto da noite,
      que é justamente quando o atendimento por IA mais trabalha.

      Repare que o banco de mentira devolve a linha sem filtrar: se o corte
      estivesse errado, ela apareceria no dia 29 em vez de sumir.
    */
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-29T02:30:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-28", ate: "2026-08-29" });

    expect(r.dias.map((d) => [d.chave, d.chamadas])).toEqual([
      ["2026-08-28", 1],
      ["2026-08-29", 0],
    ]);
    expect(r.dias[1]!.estado).toBe("NO_USAGE");
  });

  it("a chamada da manhã do dia 29 fica no 29 — a metade que passa", async () => {
    // Sem este caso, um corte que subtraísse um dia de tudo passaria acima e
    // erraria o dia inteiro em todas as manhãs.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-29T13:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-28", ate: "2026-08-29" });

    expect(r.dias.map((d) => [d.chave, d.chamadas])).toEqual([
      ["2026-08-28", 0],
      ["2026-08-29", 1],
    ]);
  });

  it("⭐ a consulta pede uma folga de um dia em cada ponta", async () => {
    // A folga é o que garante que a linha das 23h do último dia — já no dia
    // seguinte em UTC — seja lida. Sem ela, o gasto da beirada some sem erro.
    const db = bancoFalso([]);
    await gastoDeIaPorDia(db as never, { de: "2026-08-28", ate: "2026-08-29" });

    const where = db.findMany.mock.calls[0]![0].where as {
      createdAt: { gte: Date; lt: Date };
    };
    expect(where.createdAt.gte.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(where.createdAt.lt.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("⭐ a linha que caiu fora da faixa pedida NÃO entra na conta", async () => {
    // A outra metade da folga: ela existe para não perder linha, e não para
    // trazer linha a mais. O gasto do dia 27 não pode aparecer numa faixa que
    // começa no 28 — o total do período ficaria maior que a soma dos dias.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-27T15:00:00Z" },
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-28T15:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-28", ate: "2026-08-28" });

    expect(r.dias).toHaveLength(1);
    expect(r.dias[0]!.chamadas).toBe(1);
    expect(r.total.chamadas).toBe(1);
  });

  it("⭐ TODO dia da faixa aparece, inclusive os sem uso no meio", async () => {
    // Se a lista viesse do banco, um dia sem uso simplesmente não apareceria — e
    // "não apareceu" é lido por qualquer pessoa como "não gastou". A lista vem
    // do calendário justamente por isso.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-27T15:00:00Z" },
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-29T15:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-27", ate: "2026-08-29" });

    expect(r.dias.map((d) => d.chave)).toEqual(["2026-08-27", "2026-08-28", "2026-08-29"]);
    expect(r.dias[1]!.estado).toBe("NO_USAGE");
  });

  it("o total da faixa é a soma dos dias — a invariante que não pode quebrar", async () => {
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-27T15:00:00Z" },
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-29T15:00:00Z" },
    ]);

    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-27", ate: "2026-08-29" });

    expect(r.total.microUsd).toBe(r.dias.reduce((s, d) => s + d.microUsd, 0));
    expect(r.total.chamadas).toBe(2);
    expect(r.total.microUsd).toBe(60_000);
  });

  it("faixa invertida estoura antes de consultar o banco", async () => {
    // Recusar cedo é o que impede um bug de quem chamou de virar um fato sobre
    // o gasto da empresa — e evita uma consulta que já se sabia inútil.
    const db = bancoFalso([]);

    await expect(
      gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-27" }),
    ).rejects.toThrow(RangeError);
    expect(db.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POR AGENTE
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o gasto por agente", () => {
  it("cada agente leva o que consumiu", async () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra um serviço
    // que devolvesse lista vazia sempre.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, agentSlug: "ta", createdAt: "2026-08-29T12:00:00Z" },
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, agentSlug: "ta", createdAt: "2026-08-29T13:00:00Z" },
      { ...UMA_CHAMADA_MIUDA, agentSlug: "recepcao", createdAt: "2026-08-29T14:00:00Z" },
    ]);

    const r = await gastoDeIaPorAgente(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    const ta = r.agentes.find((a) => a.chave === "ta")!;
    const recepcao = r.agentes.find((a) => a.chave === "recepcao")!;

    expect(ta.chamadas).toBe(2);
    expect(ta.microUsd).toBe(60_000);
    expect(recepcao.chamadas).toBe(1);
    expect(recepcao.microUsd).toBe(750);
    expect(r.total.microUsd).toBe(60_750);
  });

  it("⭐ chamada SEM agente vai para um balde próprio — nunca para um agente real", async () => {
    /*
      O defeito mais caro deste bloco: um custo atribuído ao agente errado leva
      alguém a desligar o agente errado. Log antigo e chamador que não sabe de
      onde veio ficam nulos, e o nulo tem nome próprio na tela.
    */
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, agentSlug: null, createdAt: "2026-08-29T12:00:00Z" },
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, agentSlug: "ta", createdAt: "2026-08-29T13:00:00Z" },
    ]);

    const r = await gastoDeIaPorAgente(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    const semDono = r.agentes.find((a) => a.chave === UNATTRIBUTED)!;

    expect(semDono).toBeDefined();
    expect(semDono.chamadas).toBe(1);
    // ⚠️ O rótulo é legível: um `__unattributed__` na tela seria lido como um
    // agente chamado assim, e alguém iria procurá-lo na Sala dos Agentes.
    expect(semDono.rotulo).toBe(UNATTRIBUTED_LABEL);
    expect(r.agentes.find((a) => a.chave === "ta")!.chamadas).toBe(1);
  });

  it("período sem nenhuma chamada devolve lista VAZIA e total NO_USAGE", async () => {
    // Lista vazia aqui é o certo — não existe agente a listar. O que não pode é
    // o total virar "US$ 0,00 medido": a tela precisa dizer que não houve uso.
    const db = bancoFalso([]);
    const r = await gastoDeIaPorAgente(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(r.agentes).toEqual([]);
    expect(r.total.estado).toBe("NO_USAGE");
  });

  it("o agente também respeita o corte do dia de São Paulo", async () => {
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, agentSlug: "ta", createdAt: "2026-08-29T02:30:00Z" },
    ]);

    // 28/08 23:30 no Brasil: está DENTRO de uma faixa que termina no 28…
    const dentro = await gastoDeIaPorAgente(db as never, { de: "2026-08-28", ate: "2026-08-28" });
    expect(dentro.agentes).toHaveLength(1);

    // …e FORA de uma faixa que só cobre o 29.
    const fora = await gastoDeIaPorAgente(db as never, { de: "2026-08-29", ate: "2026-08-29" });
    expect(fora.agentes).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A FRASE
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ nenhuma frase de ausência contém um valor", () => {
  it("⭐ NO_USAGE e UNPRICED não escrevem número nenhum", async () => {
    /*
      A trava final, e a que a tela depende: é a FRASE que aparece nos cartões,
      não o campo `centavosUsd`. Se um desses estados devolvesse um valor
      escrito, o cartão diria "US$ 0,00" sobre algo que não foi medido — e um
      cartão assim não se confere, porque parece certo.
    */
    const semUso = bancoFalso([]);
    const r1 = await gastoDeIaPorDia(semUso as never, { de: "2026-08-29", ate: "2026-08-29" });
    expect(fraseDoGasto(r1.dias[0]!)).not.toMatch(/US\$|R\$|\d+,\d\d/);

    const semPreco = bancoFalso([
      { model: "modelo-fantasma", promptTokens: 9, completionTokens: 9, createdAt: "2026-08-29T12:00:00Z" },
    ]);
    const r2 = await gastoDeIaPorDia(semPreco as never, { de: "2026-08-29", ate: "2026-08-29" });
    expect(fraseDoGasto(r2.dias[0]!)).not.toMatch(/US\$ 0,00/);
  });

  it("PRICED escreve o valor — a metade que passa", async () => {
    // Sem este caso, um `fraseDoGasto` que nunca escrevesse número passaria em
    // tudo acima, e a tela não mostraria gasto nenhum.
    const db = bancoFalso([
      { ...UMA_CHAMADA_DE_TRES_CENTAVOS, createdAt: "2026-08-29T12:00:00Z" },
    ]);
    const r = await gastoDeIaPorDia(db as never, { de: "2026-08-29", ate: "2026-08-29" });

    expect(fraseDoGasto(r.dias[0]!)).toBe("US$ 0,03");
  });

  it("cada estado tem uma frase própria — nenhuma se repete", () => {
    // Duas frases iguais para estados diferentes apagariam na tela a distinção
    // que o serviço inteiro existe para preservar.
    const base = {
      chave: "x", rotulo: "x", chamadas: 2, tokensDeEntrada: 1, tokensDeSaida: 1,
      tokensTotais: 2, centavosUsd: 0, abaixoDeUmCentavo: false, chamadasSemPreco: 0,
      modelosSemPreco: [] as string[],
    };
    const frases = new Set([
      fraseDoGasto({ ...base, microUsd: 0, estado: "NO_USAGE", chamadas: 0 }),
      fraseDoGasto({ ...base, microUsd: 0, estado: "UNPRICED", chamadasSemPreco: 2, modelosSemPreco: ["x"] }),
      fraseDoGasto({ ...base, microUsd: 30_000, estado: "PARTIAL", chamadasSemPreco: 1, modelosSemPreco: ["x"] }),
      fraseDoGasto({ ...base, microUsd: 30_000, estado: "PRICED" }),
    ]);

    expect(frases.size).toBe(4);
  });
});
