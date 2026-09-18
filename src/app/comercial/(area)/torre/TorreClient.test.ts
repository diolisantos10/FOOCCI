/**
 * A CONTROL TOWER: ALERTA COM CAUSA, COMPARAÇÃO SEM CHUTE, AUSÊNCIA DECLARADA.
 *
 * ── AS TRÊS COISAS QUE ESTE TESTE SEGURA ────────────────────────────────────
 *
 * 1. **Nenhum limiar inventado.** Um alerta acende quando a contagem que o
 *    serviço devolveu é maior que zero, e só por isso. Se alguém enfiar um
 *    "só alerta acima de 5" aqui, o teste cai.
 * 2. **Base zero não vira +100%.** Crescer de 0 para 3 não tem porcentagem.
 *    Inventar uma faz um dia comum parecer um recorde — e recorde falso é a
 *    forma mais rápida de um painel perder a confiança de quem o lê.
 * 3. **Porteiro e decisor não medidos saem com o motivo, nunca com zero.** É o
 *    fato medido na base de hoje, e a tela tem que contá-lo.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { textoDaVariacao } from "../_pecas/Pecas";
import { alertasDoAgora, RESSALVA_DO_PRAZO, SecaoAlertas, SecaoOntem, SecaoRaioX, SecaoTravado, type DadosDaTorre } from "./TorreClient";

const SEM_TRAVA: DadosDaTorre["painel"]["agora"] = {
  semResponsavel: 0,
  aguardandoHumano: 0,
  comIA: 0,
  slaEstourado: 0,
  followUpVencido: 0,
  semProximaAcao: 0,
  entrandoAgora: 0,
};

function dados(p: {
  agora?: Partial<DadosDaTorre["painel"]["agora"]>;
  raioX?: Partial<DadosDaTorre["raioX"]>;
  hoje?: Array<{ etapa: string; rotulo: string; total: number }>;
  ontem?: Array<{ etapa: string; rotulo: string; total: number }>;
} = {}): DadosDaTorre {
  return {
    periodo: { de: "2026-08-18", ate: "2026-09-17", agora: "2026-09-17T12:00:00.000Z" },
    painel: {
      agora: { ...SEM_TRAVA, ...p.agora },
      time: { sdrs: [], porEstado: {}, semCadastro: true },
      conversao: { degraus: [], pontaAPonta: { medido: false, motivo: "semDados" }, ganhos: 0, perdidos: 0, emNutricao: 0 },
    },
    supervisora: {
      conversasAcompanhadas: 0,
      mensagensAvaliadas: 0,
      mensagensCorrigidas: 0,
      mensagensBloqueadas: 0,
      escaladasParaGente: 0,
      falhasTecnicas: 0,
      optOuts: 0,
      principaisRiscos: [],
    },
    comparacao: {
      janelaHoras: 24,
      hoje: { funil: { degraus: p.hoje ?? [], ganhos: 0 } },
      ontem: { funil: { degraus: p.ontem ?? [], ganhos: 0 } },
    },
    raioX: {
      mensagensNaJanela: 0,
      abordadosSemFicha: 0,
      abordagem: { medido: false, motivo: "MOTIVO_DA_ABORDAGEM" },
      ondeMorreu: { medido: false, motivo: "MOTIVO_DO_ONDE_MORREU" },
      gatekeepers: { medido: false, motivo: "MOTIVO_DO_PORTEIRO" },
      decisores: { medido: false, motivo: "MOTIVO_DO_DECISOR" },
      ...p.raioX,
    },
  };
}

function cartao(html: string, rotulo: string): string {
  const i = html.indexOf(rotulo);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, i + 900);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("alertas: acendem pela contagem do serviço, e cada um traz a causa", () => {
  it("nenhuma fila acima de zero: nenhum alerta, e a tela diz que isso foi MEDIDO", () => {
    expect(alertasDoAgora(SEM_TRAVA)).toEqual([]);
    const h = renderToStaticMarkup(React.createElement(SecaoAlertas, { dados: dados() }));
    expect(h).toContain("Isto é uma");
    expect(h).toContain("vieram do banco");
  });

  it("uma única conversa sem dono já acende — não existe limiar escondido", () => {
    const a = alertasDoAgora({ ...SEM_TRAVA, semResponsavel: 1 });
    expect(a.map((x) => x.chave)).toEqual(["semResponsavel"]);
    expect(a[0].quantos).toBe(1);
    expect(a[0].causa.length).toBeGreaterThan(0);
  });

  it("os alertas saem do maior para o menor, e cada linha imprime a causa", () => {
    const d = dados({ agora: { semResponsavel: 2, slaEstourado: 9, followUpVencido: 4 } });
    const a = alertasDoAgora(d.painel.agora);
    expect(a.map((x) => x.chave)).toEqual(["slaEstourado", "followUpVencido", "semResponsavel"]);

    const h = renderToStaticMarkup(React.createElement(SecaoAlertas, { dados: d }));
    for (const alerta of a) {
      expect(h).toContain(alerta.titulo);
      expect(h).toContain(alerta.causa);
    }
  });

  it("os números de 'travado agora' são os do serviço, e mudam com ele", () => {
    const h1 = renderToStaticMarkup(React.createElement(SecaoTravado, { dados: dados({ agora: { slaEstourado: 3 } }) }));
    const h2 = renderToStaticMarkup(React.createElement(SecaoTravado, { dados: dados({ agora: { slaEstourado: 8 } }) }));
    expect(cartao(h1, "Prazo estourado")).toContain(">3<");
    expect(cartao(h2, "Prazo estourado")).toContain(">8<");
  });
});

describe("hoje contra ontem: nenhuma porcentagem inventada", () => {
  it("base zero não vira porcentagem", () => {
    expect(textoDaVariacao(0, 3)).toBe("sem base ontem para comparar (hoje: 3)");
    expect(textoDaVariacao(0, 0)).toBe("zero nos dois dias");
  });

  it("com base, a variação é a conta de verdade", () => {
    expect(textoDaVariacao(10, 15)).toBe("+50% vs. ontem (10 → 15)");
    expect(textoDaVariacao(10, 5)).toBe("-50% vs. ontem (10 → 5)");
  });

  it("a seção imprime a variação de cada etapa a partir das duas janelas", () => {
    const h = renderToStaticMarkup(
      React.createElement(SecaoOntem, {
        dados: dados({
          hoje: [{ etapa: "NOVO", rotulo: "Novo", total: 12 }],
          ontem: [{ etapa: "NOVO", rotulo: "Novo", total: 8 }],
        }),
      }),
    );
    expect(h).toContain("+50% vs. ontem (8 → 12)");
  });

  it("etapa que não existia ontem é declarada como sem base, não como crescimento", () => {
    const h = renderToStaticMarkup(
      React.createElement(SecaoOntem, {
        dados: dados({ hoje: [{ etapa: "NOVO", rotulo: "Novo", total: 4 }], ontem: [] }),
      }),
    );
    expect(h).toContain("sem base ontem para comparar (hoje: 4)");
    expect(h).not.toContain("%");
  });
});

describe("o raio-X: o que a base não responde sai com motivo, não com zero", () => {
  const h = renderToStaticMarkup(React.createElement(SecaoRaioX, { dados: dados() }));

  it("porteiro e decisor mostram 'não medido' e o motivo do serviço", () => {
    expect(cartao(h, "Porteiros classificados")).toContain("MOTIVO_DO_PORTEIRO");
    expect(cartao(h, "Decisores com telefone")).toContain("MOTIVO_DO_DECISOR");
  });

  it("nenhum dos dois cartões imprime um zero", () => {
    expect(cartao(h, "Porteiros classificados")).not.toMatch(/>0</);
    expect(cartao(h, "Decisores com telefone")).not.toMatch(/>0</);
  });

  it("a tela explica, na cara, POR QUE esses dois não têm resposta hoje", () => {
    expect(h).toContain("não têm resposta na base de hoje");
    expect(h).toContain("Contato");
    expect(h).toContain("Empresa");
    expect(h).toContain("ninguém conseguiu perguntar");
  });

  it("quando o raio-X mede, o número que aparece é o dele", () => {
    const medido = dados({
      raioX: {
        gatekeepers: { medido: true, valor: { classificados: 41 } },
        decisores: { medido: true, valor: { comTelefone: 6, semTelefone: 19 } },
      },
    });
    const hm = renderToStaticMarkup(React.createElement(SecaoRaioX, { dados: medido }));
    expect(cartao(hm, "Porteiros classificados")).toContain(">41<");
    expect(cartao(hm, "Decisores com telefone")).toContain(">6<");
    expect(cartao(hm, "Decisores com telefone")).toContain("19 identificados sem telefone");
    // Com os dois medidos, o aviso de ausência some — ele não é decoração.
    expect(hm).not.toContain("não têm resposta na base de hoje");
  });

  it("'onde a conversa morreu' não medido também aparece com o motivo", () => {
    expect(h).toContain("MOTIVO_DO_ONDE_MORREU");
  });
});

/**
 * A COLUNA DE PRAZO DO DESENHO, COM A RESSALVA QUE ELA EXIGE.
 *
 * `slaVenceEm` só passou a ser gravado em 18/09/2026, e `filasDoAgora` conta
 * como "estourado" apenas quem TEM prazo e o perdeu. Um "0 atrasados" ali
 * afirmaria "ninguém está atrasado", quando o que existe é "a maioria dos leads
 * nem tem prazo para perder". Se alguém tirar a ressalva do cartão, este teste
 * cai — e ele lê o HTML da seção que o supervisor vê, não uma constante solta.
 */
describe("prazo: ausência de prazo não é ausência de atraso", () => {
  it("o cartão de prazo estourado carrega a ressalva, mesmo quando marca zero", () => {
    const h = renderToStaticMarkup(
      React.createElement(SecaoTravado, { dados: dados({ agora: { slaEstourado: 0 } }) }),
    );
    const c = cartao(h, "Prazo estourado");
    expect(c).toContain("18/09/2026");
    expect(c).toContain("ausência de prazo não é ausência de atraso");
  });

  it("com prazo estourado acima de zero, a ressalva continua ao lado do número", () => {
    const h = renderToStaticMarkup(
      React.createElement(SecaoTravado, { dados: dados({ agora: { slaEstourado: 7 } }) }),
    );
    const c = cartao(h, "Prazo estourado");
    expect(c).toContain(">7<");
    expect(c).toContain("ausência de prazo não é ausência de atraso");
  });

  it("a ressalva é a mesma frase que o módulo exporta — não há duas versões do aviso", () => {
    expect(RESSALVA_DO_PRAZO).toContain("ausência de prazo não é ausência de atraso");
    const h = renderToStaticMarkup(React.createElement(SecaoTravado, { dados: dados() }));
    expect(h).toContain(RESSALVA_DO_PRAZO);
  });
});
