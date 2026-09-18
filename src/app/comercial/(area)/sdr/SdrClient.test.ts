/**
 * A CENTRAL SDR NÃO ESCREVE ZERO NO LUGAR DE "NÃO MEDIDO".
 *
 * ── O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR ────────────────────────────
 *
 * Na base de hoje, a classificação de porteiro e a captura de decisor moram em
 * `Contato`, que pende de `Empresa`, e a maioria dos leads antigos não tem
 * empresa ligada. O raio-X devolve, honestamente, `medido: false` com o motivo.
 * A tentação óbvia na tela é `?? 0` — e um zero ali afirma "medimos, e não há
 * nenhum porteiro", que é falso, e pior que falso: é uma afirmação que encerra
 * a investigação.
 *
 * Então o teste confere as duas metades: que o MOTIVO aparece, e que o zero
 * NÃO aparece. Só a primeira metade deixaria passar uma tela que mostra as duas
 * coisas ao mesmo tempo.
 *
 * A contagem da fila é conferida pelo caminho inteiro: banco falso →
 * `contarFilaDoSdr`, o serviço de verdade → a seção que o usuário vê.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { contarFilaDoSdr, ESTADOS_DA_FILA } from "@/services/salaDeVendas/prospeccao/filaDoSdr";
import { ROTULO_DO_TIPO, TIPOS_DE_GATEKEEPER, ehPorteiroHumano } from "@/services/foocci-sdr/gatekeeper/rotulos";

import {
  CopilotoDoSdr,
  SecaoFilaDoSdr,
  SecaoNumerosDoSdr,
  SecaoTiposDeGatekeeper,
  SecaoPistasSemTelefone,
  type DadosDoSdr,
} from "./SdrClient";

const AGORA = new Date("2026-09-17T12:00:00.000Z");

const TIPOS_NA_TELA = TIPOS_DE_GATEKEEPER.map((tipo) => ({
  tipo,
  rotulo: ROTULO_DO_TIPO[tipo],
  humano: ehPorteiroHumano(tipo),
}));

function dados(p: Partial<DadosDoSdr> = {}): DadosDoSdr {
  return {
    periodo: { de: "2026-08-18", ate: "2026-09-17", agora: AGORA.toISOString() },
    fila: [],
    tiposDeGatekeeper: TIPOS_NA_TELA,
    gatekeepers: { medido: false, motivo: "MOTIVO_DE_TESTE_DO_PORTEIRO" },
    decisores: { medido: false, motivo: "MOTIVO_DE_TESTE_DO_DECISOR" },
    abordagem: { medido: false, motivo: "MOTIVO_DE_TESTE_DA_ABORDAGEM" },
    reabordagem: { medido: false, motivo: "MOTIVO_DE_TESTE_DA_REABORDAGEM" },
    ...p,
  };
}

/** O HTML de um cartão, a partir do rótulo dele até o próximo cartão. */
function cartao(html: string, rotulo: string): string {
  const i = html.indexOf(rotulo);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, i + 900);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("porteiro e decisor não medidos: motivo na cara, nunca zero", () => {
  const html = renderToStaticMarkup(React.createElement(SecaoNumerosDoSdr, { dados: dados() }));

  it("o cartão de porteiro mostra 'não medido' e o motivo do serviço", () => {
    const c = cartao(html, "Caíram em porteiro");
    expect(c).toContain("não medido");
    expect(c).toContain("MOTIVO_DE_TESTE_DO_PORTEIRO");
  });

  it("o cartão de porteiro NÃO imprime um zero", () => {
    const c = cartao(html, "Caíram em porteiro");
    expect(c).not.toMatch(/>0</);
  });

  it("o cartão de decisor mostra 'não medido' e o motivo, e não zero", () => {
    const c = cartao(html, "Decisores capturados");
    expect(c).toContain("não medido");
    expect(c).toContain("MOTIVO_DE_TESTE_DO_DECISOR");
    expect(c).not.toMatch(/>0</);
  });

  it("a seção de tipos explica por que os nove baldes estão vazios", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoTiposDeGatekeeper, { dados: dados() }));
    expect(h).toContain("Isto não é zero porteiro");
    expect(h).toContain("MOTIVO_DE_TESTE_DO_PORTEIRO");
  });

  it("os nove tipos continuam desenhados, cada um marcado como não medido", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoTiposDeGatekeeper, { dados: dados() }));
    expect(TIPOS_DE_GATEKEEPER.length).toBe(9);
    for (const t of TIPOS_DE_GATEKEEPER) {
      expect(h).toContain(ROTULO_DO_TIPO[t]);
    }
    // Nove baldes, nove vezes o carimbo de linha — e nenhum zero entre eles.
    const carimboDaLinha = '<span class="text-[12px] font-normal italic text-muted">não medido</span>';
    expect(h.split(carimboDaLinha).length - 1).toBe(TIPOS_DE_GATEKEEPER.length);
    // A lista dos tipos não contém nenhum número: nenhum balde foi zerado.
    const lista = h.slice(h.indexOf(ROTULO_DO_TIPO.BOT_DE_PEDIDOS));
    expect(lista).not.toMatch(/>0</);
  });

  it("a fila de decisores sem telefone também diz o motivo em vez de 'lista vazia'", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoPistasSemTelefone, { dados: dados() }));
    expect(h).toContain("MOTIVO_DE_TESTE_DO_DECISOR");
    expect(h).toContain("não medido");
  });
});

describe("quando o porteiro É medido, a tela mostra a contagem por tipo", () => {
  const medido = dados({
    gatekeepers: {
      medido: true,
      valor: {
        classificados: 7,
        porTipo: [
          { tipo: "ATENDENTE", quantos: 5 },
          { tipo: "BOT_DE_PEDIDOS", quantos: 2 },
        ],
        naoClassificados: {
          total: 3,
          anterioresAoModulo: 2,
          posterioresAoModuloSemSinal: 1,
          observacao: "OBSERVACAO_DO_SERVICO",
        },
      },
    },
  });

  it("o tipo com contagem mostra o número; o tipo sem contagem continua 'não medido'", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoTiposDeGatekeeper, { dados: medido }));
    expect(cartao(h, "Atendente")).toContain(">5<");
    expect(cartao(h, "Bot de pedidos")).toContain(">2<");
    // SAC não veio na resposta: não é zero, é ausência de resposta para ele.
    expect(cartao(h, "SAC")).toContain("não medido");
  });

  it("os não classificados aparecem repartidos, com a observação do serviço", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoTiposDeGatekeeper, { dados: medido }));
    expect(h).toContain("OBSERVACAO_DO_SERVICO");
    expect(h).toContain("anteriores");
  });

  it("o cartão de porteiro passa a mostrar o total classificado pelo serviço", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoNumerosDoSdr, { dados: medido }));
    expect(cartao(h, "Caíram em porteiro")).toContain(">7<");
  });
});

describe("a fila do SDR vem de contarFilaDoSdr, não de constante", () => {
  const empresa = (p: Record<string, unknown>) => ({
    estagio: "PROSPECCAO",
    contatos: [],
    leads: [],
    ...p,
  });

  async function filaDe(empresas: unknown[]) {
    const db = { empresa: { findMany: async () => empresas } } as never;
    return contarFilaDoSdr(db, AGORA);
  }

  it("uma empresa parada em porteiro-bot aparece no balde 'Bot/Gatekeeper'", async () => {
    const fila = await filaDe([
      empresa({ estagio: "GATEKEEPER", contatos: [{ ehDecisor: false, ehGatekeeper: true, tipoDeGatekeeper: "BOT_DE_PEDIDOS" }] }),
    ]);
    expect(fila.find((f) => f.estado === "GATEKEEPER")?.total).toBe(1);

    const h = renderToStaticMarkup(React.createElement(SecaoFilaDoSdr, { dados: dados({ fila }) }));
    expect(cartao(h, "Bot/Gatekeeper")).toContain(">1<");
  });

  it("a contagem muda com a base — se fosse constante, os dois HTML seriam iguais", async () => {
    const uma = await filaDe([empresa({})]);
    const duas = await filaDe([empresa({}), empresa({})]);

    const h1 = renderToStaticMarkup(React.createElement(SecaoFilaDoSdr, { dados: dados({ fila: uma }) }));
    const h2 = renderToStaticMarkup(React.createElement(SecaoFilaDoSdr, { dados: dados({ fila: duas }) }));

    expect(cartao(h1, "Novos prospects")).toContain(">1<");
    expect(cartao(h2, "Novos prospects")).toContain(">2<");
    expect(h1).not.toBe(h2);
  });

  it("todos os oito baldes aparecem, inclusive os zerados", async () => {
    const fila = await filaDe([empresa({})]);
    const h = renderToStaticMarkup(React.createElement(SecaoFilaDoSdr, { dados: dados({ fila }) }));
    for (const e of ESTADOS_DA_FILA) {
      expect(h).toContain(e.rotulo);
    }
  });

  it("sem nenhuma empresa cadastrada, a tela diz que falta cadastro — não 'operação parada'", () => {
    const h = renderToStaticMarkup(React.createElement(SecaoFilaDoSdr, { dados: dados({ fila: [] }) }));
    expect(h).toContain("cadastro faltando, não operação parada");
  });
});

/**
 * O COPILOTO SDR: DIZ O QUE MEDIU, E NÃO OFERECE ATO QUE NÃO EXISTE.
 *
 * O desenho tem quatro botões de ação nesta coluna ("Pedir contato do
 * responsável", "Agendar reunião"...). A frente é só leitura. Botão que não faz
 * nada ensina a operação a contar com um envio que não existe — e este teste
 * renderiza a coluna de verdade para provar que nenhum entrou junto com a cor.
 */
describe("copiloto SDR: leitura, não ato", () => {
  it("não desenha botão nenhum — nem de enviar, nem de agendar", () => {
    const h = renderToStaticMarkup(React.createElement(CopilotoDoSdr, { dados: dados() }));
    expect(h).not.toContain("<button");
    expect(h).not.toContain("Agendar reunião");
    expect(h).not.toContain("Pedir contato");
  });

  it("com porteiro e decisor não medidos, a coluna repete o MOTIVO do serviço", () => {
    const h = renderToStaticMarkup(React.createElement(CopilotoDoSdr, { dados: dados() }));
    expect(h).toContain("MOTIVO_DE_TESTE_DO_PORTEIRO");
    expect(h).toContain("MOTIVO_DE_TESTE_DO_DECISOR");
    expect(h).toContain("ninguém conseguiu perguntar");
    expect(h).not.toMatch(/>0</);
  });
});
