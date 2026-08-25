/**
 * A leitura do silêncio — e a distinção que ela existe para manter.
 *
 * "Ninguém falou com ele" e "ele chegou antes de a gente ter onde falar"
 * produzem exatamente a mesma tela vazia, e cobram coisas opostas do vendedor.
 * O primeiro é fila parada; o segundo é história.
 *
 * Sem esta distinção o time trata os dois igual — e trata pelo mais barato dos
 * dois, que é ignorar.
 */

import { describe, it, expect } from "vitest";
import {
  lerOSilencio,
  avisoDoSilencio,
  A_SALA_COMECOU_EM,
} from "./anterioresASala";

const AGORA = new Date("2026-09-01T12:00:00Z");
const ANTES = new Date("2026-07-10T09:00:00Z"); // bem antes da Sala
const DEPOIS = new Date("2026-08-28T09:00:00Z"); // depois da Sala

describe("por que o cartão está vazio", () => {
  it("ter mensagem encerra o assunto — mesmo em lead antigo", () => {
    // A ordem das perguntas é o desenho. Um lead anterior à Sala com quem
    // alguém já conversou depois NÃO é arquivo: é atendimento em andamento, e
    // rotulá-lo de "antigo" mandaria o vendedor tratar como morto o que vive.
    const r = lerOSilencio({ criadoEm: ANTES, mensagens: 3, score: null }, AGORA);
    expect(r.tipo).toBe("temHistorico");
  });

  it("sem mensagem e anterior à Sala → é história", () => {
    const r = lerOSilencio({ criadoEm: ANTES, mensagens: 0, score: null }, AGORA);
    expect(r.tipo).toBe("anteriorASala");
  });

  it("sem mensagem e posterior à Sala → é fila parada", () => {
    // A metade que dói: depois que a Sala existe, silêncio é falha nossa.
    const r = lerOSilencio({ criadoEm: DEPOIS, mensagens: 0, score: null }, AGORA);
    expect(r.tipo).toBe("semAtendimento");
  });

  it("a fronteira é o instante em que a tabela de mensagens passou a existir", () => {
    const umSegundoAntes = new Date(A_SALA_COMECOU_EM.getTime() - 1000);
    const umSegundoDepois = new Date(A_SALA_COMECOU_EM.getTime() + 1000);

    expect(lerOSilencio({ criadoEm: umSegundoAntes, mensagens: 0, score: null }, AGORA).tipo)
      .toBe("anteriorASala");
    expect(lerOSilencio({ criadoEm: umSegundoDepois, mensagens: 0, score: null }, AGORA).tipo)
      .toBe("semAtendimento");
  });

  it("score não muda a leitura — quem decide é a conversa", () => {
    // Um lead pode ter nota e nenhuma mensagem (alguém preencheu a ficha à mão).
    // Continua sendo silêncio de conversa, e é isso que a tela explica.
    const r = lerOSilencio({ criadoEm: ANTES, mensagens: 0, score: 74 }, AGORA);
    expect(r.tipo).toBe("anteriorASala");
  });

  it("dias na base nunca é negativo, nem com relógio torto", () => {
    // Data de criação no futuro acontece com fuso mal configurado na importação.
    // "-3 dias na base" na tela do vendedor é pior que zero.
    const futuro = new Date(AGORA.getTime() + 5 * 86_400_000);
    const r = lerOSilencio({ criadoEm: futuro, mensagens: 0, score: null }, AGORA);
    expect(r.tipo === "semAtendimento" && r.diasNaBase).toBe(0);
  });
});

describe("o aviso que o vendedor lê", () => {
  it("quem tem conversa NÃO recebe aviso nenhum", () => {
    // Aviso que aparece sempre é aviso que ninguém lê.
    expect(avisoDoSilencio({ tipo: "temHistorico" })).toBeNull();
  });

  it("o antigo é apresentado como história, e promete não inventar número", () => {
    const a = avisoDoSilencio(lerOSilencio({ criadoEm: ANTES, mensagens: 0, score: null }, AGORA));
    expect(a?.tom).toBe("historico");
    expect(a?.texto).toContain("história");
    expect(a?.texto).toContain("inventado");
    // E diz onde ESTÁ o que se sabe, em vez de só dizer o que falta.
    expect(a?.texto).toContain("Origem");
  });

  it("o abandonado é apresentado como fila parada, com a conta dos dias", () => {
    const a = avisoDoSilencio(lerOSilencio({ criadoEm: DEPOIS, mensagens: 0, score: null }, AGORA));
    expect(a?.tom).toBe("alerta");
    expect(a?.texto).toContain("fila parada");
    expect(a?.texto).toContain("4 dias");
  });

  it("um dia é 'dia', não '1 dias'", () => {
    const ontem = new Date(AGORA.getTime() - 86_400_000);
    const a = avisoDoSilencio(lerOSilencio({ criadoEm: ontem, mensagens: 0, score: null }, AGORA));
    expect(a?.texto).toContain("1 dia ");
    expect(a?.texto).not.toContain("1 dias");
  });

  it("os dois avisos NÃO dizem a mesma coisa", () => {
    // O teste que guarda a razão de este arquivo existir. Se um dia os dois
    // textos convergirem, a distinção morreu e a tela voltou a ser uma só.
    const antigo = avisoDoSilencio(lerOSilencio({ criadoEm: ANTES, mensagens: 0, score: null }, AGORA));
    const parado = avisoDoSilencio(lerOSilencio({ criadoEm: DEPOIS, mensagens: 0, score: null }, AGORA));

    expect(antigo!.titulo).not.toBe(parado!.titulo);
    expect(antigo!.tom).not.toBe(parado!.tom);
  });
});
