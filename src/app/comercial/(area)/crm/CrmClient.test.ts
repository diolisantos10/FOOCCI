/**
 * A TELA DA CRM IA MOSTRA O QUE O SERVIÇO MEDIU — E NADA ALÉM DISSO.
 *
 * ── O QUE ESTE TESTE PROVA, E POR QUE ASSIM ─────────────────────────────────
 *
 * Um teste que monta um objeto `DadosDoCrm` à mão e confere que a tela imprime
 * os números daquele objeto prova pouco: ele prova que o React funciona. O
 * número podia vir de uma constante no meio do caminho e o teste passaria
 * igual — régua verde sobre o componente errado.
 *
 * Então aqui o caminho é o inteiro: banco falso → `montarPlanoDoDia`, que é o
 * serviço de verdade → o mesmo empacotamento que a rota faz → a seção
 * EXPORTADA que o usuário vê. E, para fechar a porta de vez, cada número é
 * conferido DUAS vezes com bases diferentes: se a tela tivesse um valor fixo,
 * ela acertaria uma e erraria a outra.
 *
 * ⚠️ `.test.ts` e `React.createElement`: a bateria só coleta `src/**‍/*.test.ts`
 * (`vitest.config.ts`), o mesmo motivo de `SupervisoraClient.test.ts`.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { montarPlanoDoDia, CADENCIA_POR_ESTADO } from "@/services/salaDeVendas/crm/planoDoDia";
import {
  ESTADOS_DE_FOLLOW_UP,
  EXPLICACAO_DO_ESTADO,
  ROTULO_DO_ESTADO,
} from "@/services/salaDeVendas/crm/rotulosDoFollowUp";
import { SINAIS_DE_CHURN, REGUA_DO_POS_VENDA, REGUA_DE_CHURN } from "@/services/salaDeVendas/crm/posVenda";
import { PARADAS, CATALOGO_DE_CONDICOES } from "@/services/salaDeVendas/crm/cadenciaPorComportamento";
import { ROTULO_DO_MARCO } from "@/services/salaDeVendas/crm/rotulosDoFollowUp";

import { SecaoPlanoDoDia, SecaoEstados, SecaoPosVenda, SecaoCadencia, type DadosDoCrm } from "./CrmClient";

const AGORA = new Date("2026-09-17T12:00:00.000Z");
const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);

type Linha = Record<string, unknown>;

function lead(p: Linha = {}): Linha {
  return {
    id: "lead-x",
    nome: "Restaurante",
    stage: "EM_QUALIFICACAO",
    temperatura: null,
    score: null,
    optOutAt: null,
    lastContactedAt: null,
    primeiraRespostaEm: null,
    ultimaMensagemEm: null,
    ultimaMensagemDeQuem: null,
    propostas: [],
    compromissos: [],
    oportunidades: [],
    ...p,
  };
}

function bancoFalso(leads: Linha[], clientes: Linha[] = []) {
  return { siteLead: { findMany: async () => leads }, cliente: { findMany: async () => clientes } } as never;
}

/** O MESMO empacotamento que `api/admin/sala-de-vendas/crm/route.ts` faz. */
function comoARotaMonta(plano: Awaited<ReturnType<typeof montarPlanoDoDia>>): DadosDoCrm {
  return {
    plano: JSON.parse(JSON.stringify(plano)),
    estados: ESTADOS_DE_FOLLOW_UP.map((estado) => ({
      estado,
      rotulo: ROTULO_DO_ESTADO[estado],
      explicacao: EXPLICACAO_DO_ESTADO[estado],
      quantos: plano.porEstado[estado],
      cadencia: CADENCIA_POR_ESTADO[estado] ?? null,
    })),
    cadencia: {
      paradas: PARADAS.map((p) => ({ motivo: p.motivo, explicacao: p.explicacao })),
      condicoes: Object.entries(CATALOGO_DE_CONDICOES).map(([chave, c]) => ({
        chave,
        descricao: c.descricao,
        estados: c.estados,
        temFiltroExtra: c.extra !== undefined,
      })),
    },
    posVenda: {
      marcos: Object.entries(ROTULO_DO_MARCO).map(([marco, rotulo]) => ({ marco, rotulo })),
      regua: REGUA_DO_POS_VENDA as unknown as Record<string, number>,
      reguaDeChurn: REGUA_DE_CHURN as unknown as Record<string, number>,
      sinaisDeChurn: SINAIS_DE_CHURN.map((s) => ({ codigo: s.codigo, peso: s.peso, descricao: s.descricao })),
    },
  };
}

/** Quantas vezes um trecho aparece no HTML. Contar evita o falso positivo do `toContain`. */
function vezes(html: string, trecho: string): number {
  return html.split(trecho).length - 1;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("o plano do dia na tela vem de montarPlanoDoDia, não de constante", () => {
  /** Uma base com 2 propostas paradas e 1 carrinho abandonado. */
  const baseA = [
    lead({ id: "p1", stage: "PROPOSTA_ENVIADA", propostas: [{ situacao: "ENVIADA", valorMensalCent: 50_000, enviadaEm: diasAtras(10), respondidaEm: null, updatedAt: diasAtras(10) }] }),
    lead({ id: "p2", stage: "PROPOSTA_ENVIADA", propostas: [{ situacao: "ENVIADA", valorMensalCent: null, enviadaEm: diasAtras(9), respondidaEm: null, updatedAt: diasAtras(9) }] }),
    lead({ id: "c1", stage: "EM_NEGOCIACAO", propostas: [{ situacao: "RASCUNHO", valorMensalCent: 30_000, enviadaEm: null, respondidaEm: null, updatedAt: diasAtras(2) }], ultimaMensagemEm: diasAtras(1) }),
  ];

  /** A MESMA forma, com uma proposta parada a menos. */
  const baseB = baseA.slice(1);

  it("a contagem da fila 'Propostas sem retorno' muda quando a base muda", async () => {
    const planoA = await montarPlanoDoDia(bancoFalso(baseA), { agora: AGORA });
    const planoB = await montarPlanoDoDia(bancoFalso(baseB), { agora: AGORA });

    // O serviço mediu duas coisas diferentes — senão o teste abaixo não vale nada.
    expect(planoA.filas.propostasSemRetorno.length).toBe(2);
    expect(planoB.filas.propostasSemRetorno.length).toBe(1);

    const htmlA = renderToStaticMarkup(React.createElement(SecaoPlanoDoDia, { dados: comoARotaMonta(planoA) }));
    const htmlB = renderToStaticMarkup(React.createElement(SecaoPlanoDoDia, { dados: comoARotaMonta(planoB) }));

    expect(htmlA).toContain("Propostas sem retorno");
    expect(htmlB).toContain("Propostas sem retorno");
    // Se a tela tivesse o número chumbado, os dois HTML seriam iguais.
    expect(htmlA).not.toBe(htmlB);

    // E o número impresso no cartão daquela fila é o do serviço, nos dois casos.
    const cartao = (html: string) => html.slice(html.indexOf("Propostas sem retorno"));
    expect(cartao(htmlA)).toContain(">2<");
    expect(cartao(htmlB)).toContain(">1<");
  });

  it("o número de contatos analisados é o que o serviço contou", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(baseA), { agora: AGORA });
    const html = renderToStaticMarkup(React.createElement(SecaoPlanoDoDia, { dados: comoARotaMonta(plano) }));
    expect(plano.contatosAnalisados).toBe(3);
    expect(html).toContain(">3</strong> contatos");
  });

  it("a receita potencial é declarada como PISO quando há item sem estimativa", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(baseA), { agora: AGORA });
    expect(plano.receitaPotencial.semEstimativa).toBeGreaterThan(0);
    const html = renderToStaticMarkup(React.createElement(SecaoPlanoDoDia, { dados: comoARotaMonta(plano) }));
    expect(html).toContain("piso, não um total");
  });

  it("quando a leitura bate no teto, a tela avisa que tudo ali é piso", async () => {
    const plano = await montarPlanoDoDia(bancoFalso(baseA), { agora: AGORA, limite: 3 });
    expect(plano.limiteAtingido).toBe(true);
    const html = renderToStaticMarkup(React.createElement(SecaoPlanoDoDia, { dados: comoARotaMonta(plano) }));
    expect(html).toContain("bateu no teto");
  });
});

describe("os 14 estados aparecem sempre, com a contagem do serviço", () => {
  it("desenha os catorze baldes inclusive os zerados", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([lead({ id: "so-um", optOutAt: diasAtras(1) })]), { agora: AGORA });
    const html = renderToStaticMarkup(React.createElement(SecaoEstados, { dados: comoARotaMonta(plano) }));

    for (const estado of ESTADOS_DE_FOLLOW_UP) {
      expect(html).toContain(ROTULO_DO_ESTADO[estado]);
    }
    expect(ESTADOS_DE_FOLLOW_UP.length).toBe(14);
  });

  it("o contato que pediu silêncio é contado em PEDIU_SILENCIO, e a tela mostra 1 ali", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([lead({ id: "calou", optOutAt: diasAtras(1) })]), { agora: AGORA });
    expect(plano.porEstado.PEDIU_SILENCIO).toBe(1);

    const html = renderToStaticMarkup(React.createElement(SecaoEstados, { dados: comoARotaMonta(plano) }));
    const depoisDoRotulo = html.slice(html.indexOf("Pediu silêncio"));
    expect(depoisDoRotulo).toContain(">1<");
  });

  it("estado sem cadência automática diz isso, em vez de ficar mudo", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([]), { agora: AGORA });
    const html = renderToStaticMarkup(React.createElement(SecaoEstados, { dados: comoARotaMonta(plano) }));
    expect(html).toContain("nenhuma cadência automática atende este estado");
    // E os que TÊM cadência mostram o slug real do serviço.
    expect(html).toContain("proposta-sem-retorno");
  });
});

describe("cadência e pós-venda vêm dos catálogos do serviço", () => {
  it("toda parada declarada em PARADAS aparece com a explicação dela", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([]), { agora: AGORA });
    const html = renderToStaticMarkup(React.createElement(SecaoCadencia, { dados: comoARotaMonta(plano) }));
    for (const p of PARADAS) {
      expect(html).toContain(p.motivo);
      expect(html).toContain(p.explicacao);
    }
  });

  it("todo sinal de churn aparece com o peso que o serviço declara", async () => {
    const plano = await montarPlanoDoDia(bancoFalso([]), { agora: AGORA });
    const html = renderToStaticMarkup(React.createElement(SecaoPosVenda, { dados: comoARotaMonta(plano) }));
    for (const s of SINAIS_DE_CHURN) {
      expect(html).toContain(s.descricao);
      expect(vezes(html, `peso ${s.peso}`)).toBeGreaterThan(0);
    }
    expect(html).toContain("NUNCA dispara");
  });
});
