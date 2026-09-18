/**
 * O REVENUE SUPERVISOR: A COLUNA SLA NÃO INVENTA TEMPO, E O DEGRAU SEM FONTE
 * NÃO VIRA ZERO.
 *
 * ── POR QUE ESTE TESTE RENDERIZA A TELA INTEIRA ─────────────────────────────
 *
 * Régua verde sobre o componente errado é pior que régua nenhuma. Por isso aqui
 * se renderiza `PainelDoSupervisor` — o MESMO componente que `SupervisorClient`
 * devolve quando a busca dá certo — com a visão que o serviço devolveria. Se a
 * tabela do desenho voltar a estampar um tempo estimado, ou se um degrau sem
 * fonte voltar a sair como 0, isto cai.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MOTIVO_DO_PRAZO_AUSENTE, PainelDoSupervisor, type Visao } from "./SupervisorClient";

function visao(p: { volumeMedido?: boolean; duracaoMedida?: boolean } = {}): Visao {
  const volume: Visao["funil"]["degraus"][number]["volume"] = p.volumeMedido
    ? { medido: true, total: 37 }
    : { medido: false, motivo: "semFonte" };

  return {
    funil: {
      degraus: [
        {
          etapa: "EMPRESAS",
          rotulo: "Empresas encontradas",
          comoSeMede: "empresas cadastradas no período",
          ehRetrato: false,
          volume: { medido: true, total: 120 },
          conversao: null,
          tendencia: { medido: false, motivo: "semComparacao" },
        },
        {
          etapa: "DECISORES",
          rotulo: "Decisores encontrados",
          comoSeMede: "contatos marcados como decisor",
          ehRetrato: false,
          volume,
          conversao: { medido: true, valor: 0.3, base: 120 },
          tendencia: { medido: false, motivo: "baseZero", para: 3 },
        },
      ],
      pontaAPonta: { medido: true, valor: 0.1, base: 120 },
    },
    eficiencia: {
      etapas: [
        {
          etapa: "PRIMEIRA_RESPOSTA",
          rotulo: "Primeira resposta",
          oQuePrazoMede: "do lead falar até alguém responder",
          slaMinutos: 15,
          duracao: p.duracaoMedida ? { medido: true, minutos: 9, base: 12 } : { medido: false, motivo: "semDados" },
          dentroDoSla: { medido: false, motivo: "semDados" },
          conversao: null,
          volume: { medido: false, motivo: "semFonte" },
          tendencia: { medido: false, motivo: "semComparacao" },
          gravidade: { medido: false, motivo: "semMedicao" },
        },
      ],
      gargalos: [],
      cegas: ["Primeira resposta"],
    },
    saude: { medido: false, motivo: "nenhuma parcela apurada", pesoTotal: 100 },
    diagnostico: { medido: false, motivo: "semQueda", detalhe: "nenhuma etapa caiu o bastante" },
    acoes: [],
    cegas: ["Primeira resposta"],
  };
}

function trecho(html: string, rotulo: string): string {
  const i = html.indexOf(rotulo);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, i + 1200);
}

describe("a coluna SLA do desenho, sem tempo inventado", () => {
  it("etapa sem duração medida escreve 'não medido' e o motivo, nunca um tempo", () => {
    const h = renderToStaticMarkup(React.createElement(PainelDoSupervisor, { v: visao() }));
    const linha = trecho(h, "Primeira resposta");
    expect(linha).toContain("não medido");
    expect(linha).toContain(MOTIVO_DO_PRAZO_AUSENTE);
    // Nenhum tempo estimado entrou no lugar: nem "0 min", nem o próprio SLA.
    expect(linha).not.toContain("0 min");
    expect(linha).not.toContain("prazo 15 min");
  });

  it("o motivo explica que ausência de prazo não é ausência de atraso", () => {
    expect(MOTIVO_DO_PRAZO_AUSENTE).toContain("18/09/2026");
    expect(MOTIVO_DO_PRAZO_AUSENTE).toContain("ausência de prazo não é ausência de atraso");
  });

  it("quando a duração É medida, o tempo que aparece é o do serviço", () => {
    const h = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, { v: visao({ duracaoMedida: true }) }),
    );
    const linha = trecho(h, "Primeira resposta");
    expect(linha).toContain("9 min / prazo 15 min");
    expect(linha).not.toContain(MOTIVO_DO_PRAZO_AUSENTE);
  });

  it("etapa cega é carimbada como cega, não como saudável", () => {
    const h = renderToStaticMarkup(React.createElement(PainelDoSupervisor, { v: visao() }));
    expect(trecho(h, "Primeira resposta")).toContain("etapa cega");
  });
});

describe("a fila de indicadores sai do funil medido, e não de zero", () => {
  it("degrau sem fonte vira 'não medido' com motivo — e não imprime zero", () => {
    const h = renderToStaticMarkup(React.createElement(PainelDoSupervisor, { v: visao() }));
    const cartao = trecho(h, "Decisores encontrados");
    expect(cartao).toContain("não medido");
    expect(cartao).toContain("nenhuma fonte grava esta etapa hoje");
    expect(cartao).not.toMatch(/>0</);
  });

  it("degrau medido mostra o número do serviço", () => {
    const h = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, { v: visao({ volumeMedido: true }) }),
    );
    expect(trecho(h, "Decisores encontrados")).toContain(">37<");
  });

  it("base zero não vira porcentagem na linha de variação", () => {
    const h = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, { v: visao({ volumeMedido: true }) }),
    );
    expect(trecho(h, "Decisores encontrados")).toContain("sem base anterior para comparar (agora: 3)");
  });
});
