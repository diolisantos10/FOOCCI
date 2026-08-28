/**
 * O MODELO DE ABORDAGEM.
 *
 * Este modelo é aprovado UMA vez e disparado milhares. O que estiver errado
 * aqui fica errado em escala, e sem ninguém relendo — por isso as regras da
 * Meta e as regras da casa viram teste, e não recomendação em comentário.
 */

import { describe, it, expect } from "vitest";
import {
  MODELO_DE_ABORDAGEM,
  problemasDoModelo,
  CORPO,
  VARIAVEIS,
  NOME_DO_MODELO,
} from "./modeloDeAbordagem";

describe("⭐⭐ o modelo que vai para a Meta está pronto para submeter", () => {
  it("⭐⭐ não tem nenhum problema conhecido", () => {
    const problemas = problemasDoModelo();
    expect(problemas, `reprovaria por: ${problemas.join(", ")}`).toEqual([]);
  });

  it("fala de restaurante E de bar — os dois são o público", () => {
    // O erro que o site cometeu por nove respostas seguidas. Não se repete no
    // texto que vai para milhares de pessoas.
    expect(CORPO.toLowerCase()).toContain("restaurante");
    expect(CORPO.toLowerCase()).toContain("bar");
  });

  it("diz quem está falando antes de pedir qualquer coisa", () => {
    // Mensagem de origem desconhecida é denunciada, e denúncia derruba a
    // qualidade do número — que é o ativo mais caro da operação.
    const antesDoPedido = CORPO.split("?")[0]!.toLowerCase();
    expect(antesDoPedido).toContain("foocci");
  });

  it("o nome tem o prefixo que separa os dois CRMs", () => {
    // A conta pode hospedar os modelos dos dois lados. O prefixo é o que
    // impede disparar "aniversário do cliente" para um dono de restaurante.
    expect(NOME_DO_MODELO.startsWith("foocci_")).toBe(true);
  });
});

describe("⭐ a conferência REPROVA de verdade — cada regra tem mordida", () => {
  /*
    A metade que faz a conferência valer alguma coisa. Sem estes casos,
    `problemasDoModelo` poderia devolver `[]` sempre e o teste de cima ficaria
    verde para qualquer texto.
  */

  const base = MODELO_DE_ABORDAGEM;

  it("pega texto que COMEÇA com variável", () => {
    expect(problemasDoModelo({ ...base, body: "{{1}}, aqui é do Foocci. Posso falar?" }))
      .toContain("comecaComVariavel");
  });

  it("pega texto que TERMINA com variável", () => {
    expect(problemasDoModelo({ ...base, body: "Olá! Aqui é do Foocci, falando com {{1}}" }))
      .toContain("terminaComVariavel");
  });

  it("pega duas variáveis coladas", () => {
    expect(problemasDoModelo({ ...base, body: "Olá {{1}} {{2}}, aqui é do Foocci!" }))
      .toContain("variaveisColadas");
  });

  it("⭐ pega numeração com buraco — o parâmetro errado chega ao cliente", () => {
    // {{3}} sem {{2}}: a Meta casa por posição, então o nome do bar iria para
    // onde deveria estar o nome da pessoa.
    expect(problemasDoModelo({ ...base, body: "Olá, {{1}}! Vi o {{3}} e queria conversar." }))
      .toContain("numeracaoQuebrada");
  });

  it("pega variável sem exemplo", () => {
    expect(
      problemasDoModelo({
        ...base,
        examples: { ...base.examples, estabelecimento: "  " },
      }),
    ).toContain("exemploFaltando");
  });

  it("pega modelo de marketing sem saída", () => {
    expect(problemasDoModelo({ ...base, footer: null })).toContain("semSaida");
  });

  it("⭐⭐ pega promessa de resultado — é a que entra quando alguém 'melhora' o texto", () => {
    // A regra mais importante daqui, e a única que não é de formato. Um número
    // inventado num modelo aprovado é uma mentira disparada em escala.
    const promessas = [
      "Olá, {{1}}! O Foocci aumenta as vendas do {{2}} em 30%. Posso mostrar?",
      "Olá, {{1}}! A gente garante mais pedidos no {{2}}. Topa ver?",
      "Olá, {{1}}! Dobre o faturamento do {{2}} com a gente. Posso explicar?",
    ];

    for (const body of promessas) {
      expect(problemasDoModelo({ ...base, body }), `passou: "${body}"`)
        .toContain("prometeResultado");
    }
  });

  it("⭐ mas texto honesto com número NÃO é confundido com promessa", () => {
    // A outra metade: "leva cinco minutos" é informação, não promessa de
    // resultado. Uma regra que barrasse todo número deixaria o texto vago.
    expect(problemasDoModelo()).not.toContain("prometeResultado");
  });
});

describe("as variáveis são um contrato com quem envia", () => {
  it("a ordem declarada bate com a ordem numerada no texto", () => {
    // Trocar a ordem aqui sem trocar no envio manda o nome do bar no lugar do
    // nome da pessoa.
    const numeros = [...CORPO.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
    expect(numeros).toEqual(VARIAVEIS.map((_, i) => i + 1));
  });

  it("todas têm exemplo, e o exemplo parece o dado real", () => {
    expect(MODELO_DE_ABORDAGEM.examples.nome).toBeTruthy();
    expect(MODELO_DE_ABORDAGEM.examples.estabelecimento).toBeTruthy();
  });
});
