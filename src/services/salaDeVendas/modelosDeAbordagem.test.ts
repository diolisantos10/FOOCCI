/**
 * OS MODELOS DE ABORDAGEM.
 *
 * Cada um é aprovado UMA vez pela Meta e disparado milhares de vezes. O que
 * estiver errado aqui fica errado em escala, e sem ninguém relendo — por isso
 * as regras da Meta e as regras do CEO viram teste, não recomendação.
 *
 * ⚠️ A regra mais importante deste arquivo não é da Meta: é do CEO. Ele
 * reprovou a primeira versão porque ela pedia cinco minutos no primeiro "oi".
 * `pedeCompromisso` existe para essa frase não voltar — e ela volta, porque é
 * o que todo vendedor escreve por instinto.
 */

import { describe, it, expect } from "vitest";
import {
  MODELOS_DE_ABORDAGEM,
  problemasDoModelo,
  modeloDoPasso,
  SITE,
  RODAPE,
  type ModeloDeAbordagem,
} from "./modelosDeAbordagem";

const PASSO_1 = modeloDoPasso(1)!;

describe("⭐⭐ o funil inteiro está pronto para submeter", () => {
  it("⭐⭐ nenhum modelo tem problema conhecido", () => {
    for (const m of MODELOS_DE_ABORDAGEM) {
      const problemas = problemasDoModelo(m);
      expect(problemas, `"${m.name}" reprovaria por: ${problemas.join(", ")}`).toEqual([]);
    }
  });

  it("são quatro passos, em ordem, sem buraco e sem nome repetido", () => {
    expect(MODELOS_DE_ABORDAGEM.map((m) => m.passo)).toEqual([1, 2, 3, 4]);

    const nomes = MODELOS_DE_ABORDAGEM.map((m) => m.name);
    expect(new Set(nomes).size, "dois modelos com o mesmo nome na Meta").toBe(nomes.length);
  });

  it("todo modelo diz QUANDO é usado — senão não é funil, é lista", () => {
    // A diferença entre quatro mensagens e um funil é saber qual mandar
    // quando. Sem esta regra, alguém dispara o passo 4 num lead novo.
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(m.quando.length, `"${m.name}" não diz quando é usado`).toBeGreaterThan(20);
    }
  });

  it("todos têm o prefixo que separa dos modelos dos restaurantes", () => {
    // A conta hospeda os modelos dos dois lados. O prefixo impede disparar
    // "aniversário do cliente" para um dono de restaurante.
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(m.name.startsWith("foocci_"), `"${m.name}" sem prefixo`).toBe(true);
    }
  });

  it("todos oferecem a saída, no rodapé", () => {
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(m.footer, `"${m.name}" sem rodapé de saída`).toBe(RODAPE);
    }
  });
});

describe("⭐⭐ a régua do CEO: convidar para o site, nunca pedir compromisso", () => {
  it("⭐⭐ NENHUM modelo pede reunião, ligação ou 'uns minutinhos'", () => {
    /*
      A frase reprovada, na íntegra:
        "queria te mostrar como funciona — leva cinco minutos.
         Posso te contar por aqui mesmo?"

      Palavras do CEO: *"essa abordagem 'deixa eu te mostrar cinco minutinhos'
      isso não existe (…) é muito evasivo."*
    */
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(
        problemasDoModelo(m),
        `"${m.name}" voltou a pedir compromisso`,
      ).not.toContain("pedeCompromisso");
    }
  });

  it("⭐⭐ e TODOS levam ao site", () => {
    // É o funil inteiro: o site apresenta o produto 24h por dia sem consumir o
    // tempo de ninguém, e quem se interessa volta escrevendo primeiro — o que
    // abre a janela de 24h e libera a conversa livre.
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(m.body, `"${m.name}" não leva ao site`).toContain(SITE);
    }
  });

  it("⭐ e todos deixam a porta aberta para depois", () => {
    // O pedido do CEO, literal: *"vai ter hora que ele não vai querer. Ele vai
    // querer conversar depois."* Uma mensagem que não oferece o depois só
    // funciona com quem estava livre naquele minuto.
    const depois = /estou por aqui|é só me chamar|continua no ar|não insisto|me dizer/i;
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(depois.test(m.body), `"${m.name}" não deixa porta para depois`).toBe(true);
    }
  });

  it("⭐ o primeiro contato não pergunta nada que exija decisão", () => {
    // Pergunta no primeiro "oi" é onde o "não" nasce. O passo 1 pode oferecer,
    // não pode cobrar resposta.
    expect(PASSO_1.body).not.toMatch(/\bposso\b|\btopa\b|\bpodemos\b|que tal/i);
  });
});

describe("⭐ a conferência REPROVA de verdade — cada regra tem mordida", () => {
  /*
    A metade que faz a conferência valer alguma coisa. Sem estes casos,
    `problemasDoModelo` poderia devolver `[]` sempre e o teste do topo ficaria
    verde para qualquer texto.
  */

  const com = (body: string): ModeloDeAbordagem => ({ ...PASSO_1, body });

  it("pega texto que COMEÇA com variável", () => {
    expect(problemasDoModelo(com(`{{1}}, aqui é do Foocci. Veja no ${SITE} o {{2}}.`)))
      .toContain("comecaComVariavel");
  });

  it("pega texto que TERMINA com variável", () => {
    expect(problemasDoModelo(com(`Olá! Foocci no ${SITE}. Falando com {{1}} do {{2}}`)))
      .toContain("terminaComVariavel");
  });

  it("pega duas variáveis coladas", () => {
    expect(problemasDoModelo(com(`Olá {{1}} {{2}}, veja o Foocci no ${SITE}.`)))
      .toContain("variaveisColadas");
  });

  it("⭐ pega numeração com buraco — o parâmetro errado chega ao cliente", () => {
    expect(problemasDoModelo(com(`Olá, {{1}}! Vi o {{3}} e deixo o ${SITE}.`)))
      .toContain("numeracaoQuebrada");
  });

  it("pega variável sem exemplo", () => {
    expect(
      problemasDoModelo({ ...PASSO_1, examples: { ...PASSO_1.examples, estabelecimento: "  " } }),
    ).toContain("exemploFaltando");
  });

  it("pega modelo de marketing sem saída", () => {
    expect(problemasDoModelo({ ...PASSO_1, footer: "" })).toContain("semSaida");
  });

  it("⭐⭐ pega promessa de resultado — a que entra quando alguém 'melhora' o texto", () => {
    const promessas = [
      `Olá, {{1}}! O Foocci aumenta as vendas do {{2}} em 30%. Veja no ${SITE}.`,
      `Olá, {{1}}! A gente garante mais pedidos no {{2}}. Veja no ${SITE}.`,
      `Olá, {{1}}! Dobre o faturamento do {{2}} com a gente. Veja no ${SITE}.`,
    ];

    for (const body of promessas) {
      expect(problemasDoModelo(com(body)), `passou: "${body}"`).toContain("prometeResultado");
    }
  });

  it("⭐⭐ pega o pedido de compromisso, em todas as formas que ele aparece", () => {
    // A regra que nasceu da reprovação do CEO. As variações são as que um
    // vendedor escreve sem pensar.
    const pedidos = [
      `Oi, {{1}}! Do {{2}}: me dá cinco minutinhos? Veja o ${SITE}.`,
      `Oi, {{1}}! Do {{2}}: leva 5 minutos. Tudo no ${SITE}.`,
      `Oi, {{1}}! Marcamos uma reunião sobre o {{2}}? Veja o ${SITE}.`,
      `Oi, {{1}}! Faço uma demonstração para o {{2}}. Veja o ${SITE}.`,
      `Oi, {{1}}! Quer agendar um horário para o {{2}}? Veja o ${SITE}.`,
      `Oi, {{1}}! Me liga sobre o {{2}}? Ou veja no ${SITE}.`,
    ];

    for (const body of pedidos) {
      expect(problemasDoModelo(com(body)), `passou: "${body}"`).toContain("pedeCompromisso");
    }
  });

  it("⭐ mas convite honesto ao site NÃO é confundido com pedido", () => {
    // A outra metade: uma regra que barrasse todo verbo deixaria o texto mudo.
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(problemasDoModelo(m)).not.toContain("pedeCompromisso");
    }
  });

  it("⭐⭐ pega modelo que NÃO leva ao site", () => {
    expect(problemasDoModelo(com("Olá, {{1}}! Aqui é do Foocci, sobre o {{2}}. Me chama.")))
      .toContain("naoLevaAoSite");
  });
});

describe("o funil se lê por passo", () => {
  it("cada passo é encontrável pelo número", () => {
    for (const m of MODELOS_DE_ABORDAGEM) {
      expect(modeloDoPasso(m.passo)?.name).toBe(m.name);
    }
  });

  it("passo que não existe devolve indefinido, e não o primeiro", () => {
    // Devolver o passo 1 por engano dispararia um primeiro contato em quem já
    // conversou com a gente — a mensagem que faz o cliente perguntar se
    // ninguém aí se fala.
    expect(modeloDoPasso(9)).toBeUndefined();
    expect(modeloDoPasso(0)).toBeUndefined();
  });
});
