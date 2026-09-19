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

function metaDoMes(p: {
  meta?: number | null;
  receita?: number | null;
} = {}): Visao["metaDoMes"] {
  const centavos = p.meta === undefined ? 10_000_000 : p.meta;
  const rec = p.receita === undefined ? 8_000_000 : p.receita;

  const meta: Visao["metaDoMes"]["meta"] =
    centavos === null
      ? { definida: false, competencia: "2026-09", motivo: "semMeta" }
      : { definida: true, competencia: "2026-09", centavos, definidoPorNome: "Diego" };

  const receita: Visao["metaDoMes"]["receita"] =
    rec === null ? { medido: false, motivo: "semPropostas" } : { medido: true, centavos: rec, propostas: 4 };

  const progresso: Visao["metaDoMes"]["progresso"] =
    centavos === null
      ? { medido: false, motivo: "semMeta", detalhe: "nenhuma meta cadastrada para 2026-09" }
      : rec === null
        ? { medido: false, motivo: "receitaNaoMedida", detalhe: "a receita do mês não foi medida" }
        : { medido: true, fracao: rec / centavos, metaCentavos: centavos, receitaCentavos: rec };

  return { competencia: "2026-09", meta, receita, progresso };
}

function visao(p: { volumeMedido?: boolean; duracaoMedida?: boolean } = {}): Visao {
  const volume: Visao["funil"]["degraus"][number]["volume"] = p.volumeMedido
    ? { medido: true, total: 37 }
    : { medido: false, motivo: "semFonte" };

  return {
    funil: {
      degraus: [
        {
          etapa: "EMPRESAS_ENCONTRADAS",
          rotulo: "Empresas encontradas",
          comoSeMede: "empresas cadastradas no período",
          ehRetrato: false,
          volume: { medido: true, total: 120 },
          conversao: null,
          tendencia: { medido: false, motivo: "semComparacao" },
        },
        {
          etapa: "DECISORES_ENCONTRADOS",
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
    // ── A receita e os quatro extras da peça 13 ──────────────────────────
    // Todos saem NÃO MEDIDOS nesta visão de propósito: é o estado em que a
    // tela tem mais chance de mentir, e é o que estes testes vigiam.
    receita: { medido: false, motivo: "semPropostas" },
    extras: {
      // ⚠️ Os vizinhos levam número MEDIDO (12, 3) de propósito. A janela de
      // 1200 caracteres de `trecho` atravessa o cartão seguinte, e um vizinho
      // valendo zero faria o `not.toMatch(/>0</)` acusar o cartão errado — a
      // régua verde sobre o componente errado, ao contrário. O zero que este
      // teste proíbe é o do cartão SEM FONTE, e esse continua vigiado.
      reunioes: { marcadas: 12, realizadas: 8, naoCompareceram: 3, semDesfecho: 1 },
      reativacao: { reativados: { medido: false, motivo: "não há trilha da transição" }, aReativar: 4 },
      risco: { emRisco: 3, limiar: 50, semAvaliacao: 2, total: 9 },
      receitaNoTempo: {
        pontos: [],
        aceitasSemValor: 0,
        meta: { medido: false, motivo: "não existe cadastro de meta de receita neste sistema" },
        previsao: { medido: false, motivo: "previsão é projeção CONTRA uma meta" },
      },
    },
    metaDoMes: metaDoMes(),
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


/**
 * ⭐ A META, NA TELA — e a barra que só acende com alvo.
 *
 * O agente que construiu esta tela se recusou a desenhar a barra de progresso
 * enquanto a meta não existisse no banco, e a razão era a certa: barra sem alvo
 * é a forma mais convincente de inventar um alvo. Estes casos guardam as duas
 * pontas da decisão — a barra existe porque o alvo é digitado, e ela some onde
 * o alvo não foi digitado.
 */
describe("⭐ a meta do mês na tela 13", () => {
  it("mês SEM meta não vira 0% — escreve que não há meta e não desenha barra", () => {
    const html = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, { v: { ...visao({ volumeMedido: true }), metaDoMes: metaDoMes({ meta: null }) } }),
    );
    const t = trecho(html, "Meta do mês");
    expect(t).toContain("Sem meta cadastrada");
    expect(t).not.toContain("0%");
    expect(t).not.toContain('role="progressbar"');
  });

  it("com meta cadastrada, mostra a cifra, a porcentagem certa e a barra", () => {
    const html = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, {
        v: { ...visao({ volumeMedido: true }), metaDoMes: metaDoMes({ meta: 10_000_000, receita: 8_000_000 }) },
      }),
    );
    const t = trecho(html, "Meta do mês");
    expect(t).toContain("100.000,00");
    expect(t).toContain("80%");
    expect(t).toContain('role="progressbar"');
  });

  it("meta cadastrada e receita NÃO medida também não vira 0%", () => {
    const html = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, {
        v: { ...visao({ volumeMedido: true }), metaDoMes: metaDoMes({ receita: null }) },
      }),
    );
    const t = trecho(html, "% da meta atingida");
    expect(t).toContain("não medido");
    expect(t).not.toContain('role="progressbar"');
  });

  it("⛔ a tela não estampa previsão de receita", () => {
    const html = renderToStaticMarkup(
      React.createElement(PainelDoSupervisor, { v: visao({ volumeMedido: true }) }),
    ).toLowerCase();
    expect(html).not.toContain("previsão");
    expect(html).not.toContain("previsao");
    expect(html).not.toContain("projeção");
  });
});
