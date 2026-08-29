/**
 * O DIA CIVIL — onde "ontem" é decidido.
 *
 * O que estes testes protegem, em uma frase: que o gasto da noite fique no dia
 * em que ele aconteceu para quem está no Brasil.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: recusando o que não presta E aceitando o que
 * presta. Um arquivo só com a primeira metade ficaria verde contra um
 * `ehDiaValido` que dissesse "não" para tudo — e nenhuma faixa de dias
 * funcionaria, com o agravante de o módulo parecer rigoroso.
 *
 * ── O DEFEITO QUE DÓI MAIS ──────────────────────────────────────────────────
 *
 * **Cortar o dia pelo UTC.** São Paulo está três horas atrás: uma chamada de IA
 * às 22h de terça tem `createdAt` de quarta em UTC. Um corte por UTC joga TODO
 * o fim de noite — que é quando o atendimento por IA mais trabalha — no dia
 * seguinte. Os totais fecham, e estão no dia errado; ninguém vê erro nenhum.
 */

import { describe, it, expect } from "vitest";
import {
  MAXIMO_DE_DIAS,
  diaAnterior,
  diaEmPortugues,
  diaEmSaoPaulo,
  diasDaFaixa,
  ehDiaValido,
  janelaDeConsulta,
  meiaNoiteUtc,
  ultimosDias,
} from "./dia";

// ═══════════════════════════════════════════════════════════════════════════
// O CORTE DO DIA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o dia é o de São Paulo, e não o do UTC", () => {
  it("⭐ 23h30 de 28/08 no Brasil é dia 28 — mesmo sendo 29 em UTC", () => {
    // O caso que carrega o arquivo. `2026-08-29T02:30:00Z` é 28/08 23:30 em São
    // Paulo. Cortando por UTC, o gasto dessa chamada cairia no dia 29 — e a
    // conta de "ontem" que o CEO abre de manhã chegaria sem o pico da noite.
    expect(diaEmSaoPaulo(new Date("2026-08-29T02:30:00Z"))).toBe("2026-08-28");
  });

  it("00h30 de 28/08 no Brasil também é dia 28 — a metade que passa", () => {
    // Sem este caso, um `diaEmSaoPaulo` que sempre subtraísse um dia passaria no
    // teste acima e erraria o dia inteiro em todas as manhãs.
    expect(diaEmSaoPaulo(new Date("2026-08-28T03:30:00Z"))).toBe("2026-08-28");
  });

  it("a virada do dia acontece às 03:00 UTC, e não à meia-noite UTC", () => {
    // As duas beiradas, uma em cada lado da fronteira real.
    expect(diaEmSaoPaulo(new Date("2026-08-28T02:59:59Z"))).toBe("2026-08-27");
    expect(diaEmSaoPaulo(new Date("2026-08-28T03:00:00Z"))).toBe("2026-08-28");
  });

  it("o formato é YYYY-MM-DD, que é o único que ordena como texto", () => {
    // A lista de dias é ordenada e comparada como string em todo o financeiro.
    // Em `28/08/2026`, "28/08" > "01/09" — e a faixa de datas viraria uma
    // bagunça silenciosa, sem erro nenhum aparecer.
    const dia = diaEmSaoPaulo(new Date("2026-01-05T15:00:00Z"));
    expect(dia).toBe("2026-01-05");
    expect(dia < diaEmSaoPaulo(new Date("2026-01-06T15:00:00Z"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE É UM DIA VÁLIDO
// ═══════════════════════════════════════════════════════════════════════════

describe("um dia de calendário de verdade", () => {
  it("dias que existem passam", () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra um
    // `ehDiaValido` que recusasse tudo, e nenhuma consulta rodaria.
    for (const d of ["2026-08-29", "2026-01-01", "2026-12-31", "2024-02-29"]) {
      expect(ehDiaValido(d), d).toBe(true);
    }
  });

  it("⭐ 31 de fevereiro tem a forma certa e NÃO existe — é recusado", () => {
    // Um regex de forma sozinho aceitaria. A data entraria na faixa, nenhuma
    // linha do banco cairia nela, e a tela diria "sem uso" para um dia que
    // nunca houve — inventar um fato a partir de um erro de digitação.
    expect(ehDiaValido("2026-02-31")).toBe(false);
    expect(ehDiaValido("2026-13-01")).toBe(false);
    expect(ehDiaValido("2025-02-29")).toBe(false); // 2025 não é bissexto
  });

  it("o que não tem a forma de um dia é recusado", () => {
    for (const v of ["", "29/08/2026", "2026-8-9", "hoje", "2026-08-29T00:00:00Z", null, 20260829]) {
      expect(ehDiaValido(v), String(v)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A FAIXA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a faixa vem do calendário, e não do banco", () => {
  it("todos os dias entre as pontas aparecem, INCLUSIVE as duas pontas", () => {
    expect(diasDaFaixa("2026-08-27", "2026-08-29")).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("uma faixa de um dia só devolve esse dia", () => {
    expect(diasDaFaixa("2026-08-29", "2026-08-29")).toEqual(["2026-08-29"]);
  });

  it("a virada de mês e a de ano não têm buraco", () => {
    // Aritmética de dia feita com `+ 1` no campo do dia funciona porque
    // `Date.UTC(2026, 7, 32)` é 1º de setembro. Um cálculo que "consertasse" o
    // mês à mão perderia o dia da virada — e o gasto do dia 1º sumiria.
    expect(diasDaFaixa("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
    ]);
    expect(diasDaFaixa("2026-12-31", "2027-01-01")).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("⭐ faixa invertida ESTOURA — não devolve lista vazia", () => {
    // Lista vazia faria a tela dizer "sem uso" para uma pergunta que ninguém
    // chegou a fazer: um bug de quem chamou viraria um fato sobre o gasto da
    // empresa. Guardrail 1 — ausência de informação não é informação.
    expect(() => diasDaFaixa("2026-08-29", "2026-08-27")).toThrow(RangeError);
  });

  it("faixa com dia inventado estoura em vez de consultar", () => {
    expect(() => diasDaFaixa("2026-02-31", "2026-03-02")).toThrow(RangeError);
    expect(() => diasDaFaixa("ontem", "hoje")).toThrow(RangeError);
  });

  it(`⭐ faixa acima de ${MAXIMO_DE_DIAS} dias é recusada antes de virar consulta`, () => {
    // Uma faixa de dez anos leria a tabela inteira de interações de IA dentro de
    // uma requisição HTTP. O corte cai aqui, com nome, e não no tempo limite do
    // servidor — onde vira uma tela que "não carrega" e ninguém sabe por quê.
    expect(() => diasDaFaixa("2020-01-01", "2026-08-29")).toThrow(/366/);
  });

  it(`exatamente ${MAXIMO_DE_DIAS} dias ainda passa — a metade que não atrapalha`, () => {
    const dias = diasDaFaixa("2026-01-01", "2026-12-31"); // 365 dias
    expect(dias).toHaveLength(365);
    expect(dias[0]).toBe("2026-01-01");
    expect(dias[364]).toBe("2026-12-31");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A JANELA DE CONSULTA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a janela de consulta sobra um dia em cada ponta", () => {
  it("⭐ a sobra existe para o gasto da beirada não sumir", () => {
    /*
      A faixa pedida é em dias de São Paulo; `createdAt` é UTC. A consulta pega
      um dia a mais em cada lado e o BALDE decide quem fica.

      Sem a sobra à direita, o gasto das 21h do último dia da faixa — que já é o
      dia seguinte em UTC — ficaria de fora. Sobra custa algumas linhas lidas a
      mais; falta custa um pedaço do gasto sumindo sem erro nenhum aparecer.
    */
    const { gte, lt } = janelaDeConsulta("2026-08-28", "2026-08-29");

    expect(gte.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-08-31T00:00:00.000Z");

    // A prova concreta: 28/08 23h30 no Brasil (29/08 02:30 UTC) está dentro.
    const noiteDe28 = new Date("2026-08-29T02:30:00Z");
    expect(noiteDe28 >= gte && noiteDe28 < lt).toBe(true);
    expect(diaEmSaoPaulo(noiteDe28)).toBe("2026-08-28");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HOJE, ONTEM E OS ÚLTIMOS N
// ═══════════════════════════════════════════════════════════════════════════

describe("hoje, ontem e a janela de N dias", () => {
  it("⭐ “últimos 30 dias” são 30 dias CONTANDO com hoje — não 31", () => {
    // É o que a expressão quer dizer para quem pergunta. Um dia a mais mudaria
    // o total do período sem ninguém notar, e a conta nunca bateria com a de
    // quem contasse na mão.
    const j = ultimosDias(new Date("2026-08-29T15:00:00Z"), 30);

    expect(j.ate).toBe("2026-08-29");
    expect(j.de).toBe("2026-07-31");
    expect(diasDaFaixa(j.de, j.ate)).toHaveLength(30);
  });

  it("a janela termina no dia de SÃO PAULO, mesmo depois da virada do UTC", () => {
    // 29/08 02:00 UTC ainda é 28/08 no Brasil. Uma janela que terminasse em 29
    // mostraria um cartão "hoje" de um dia que ainda não começou aqui.
    expect(ultimosDias(new Date("2026-08-29T02:00:00Z"), 30).ate).toBe("2026-08-28");
  });

  it("ontem é o dia anterior, e atravessa mês e ano", () => {
    expect(diaAnterior("2026-08-29")).toBe("2026-08-28");
    expect(diaAnterior("2026-09-01")).toBe("2026-08-31");
    expect(diaAnterior("2027-01-01")).toBe("2026-12-31");
  });

  it("a meia-noite de um dia é meia-noite UTC, e não a de São Paulo", () => {
    // Deliberado: a coluna `competencia` é DATE e não tem fuso. Gravar a
    // meia-noite de São Paulo (03:00 UTC) faria a leitura de volta cair no dia
    // anterior em metade dos ambientes.
    expect(meiaNoiteUtc("2026-08-29").toISOString()).toBe("2026-08-29T00:00:00.000Z");
    expect(meiaNoiteUtc("2026-08-29", -1).toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("a data escrita é a que o CEO lê", () => {
    // `2026-08-29` na tela é a data de um sistema; `29/08/2026` é uma data.
    expect(diaEmPortugues("2026-08-29")).toBe("29/08/2026");
  });
});
