/**
 * A ESCADA DA JORNADA, PROVADA — não afirmada.
 *
 * Estes testes existem porque o Diretor Geral afirmou ao CEO que "as campanhas
 * disputam os mesmos clientes" sem ter medido nada, e foi corrigido. A resposta
 * a isso não é afirmar o contrário: é deixar o número provar.
 *
 * O teste que era central aqui — `recuperar-perdidos ⊆ recuperar-frios`, um
 * cliente de 200 dias caindo nos DOIS estágios — media um DEFEITO: o segmento
 * frio não tinha piso. O piso entrou em 19/09/2026 e os testes abaixo agora
 * provam a exclusividade, não a sobreposição. A prova completa do piso está em
 * `src/services/crm/tests/CrmPisoDoFrio.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { buildCutoffs, DEFAULT_SEGMENT_CONFIG } from "@/lib/crm-segments";
import {
  estagiosDoCliente,
  medirJornadaDeEstagios,
  ultimoPedidoEfetivo,
  jaComprou,
  podeReceber,
  ESTAGIOS_DO_FLUXO_PRINCIPAL,
  GATILHOS_INDEPENDENTES,
  type ClienteParaClassificar,
} from "./jornadaDeEstagios";

const AGORA = new Date("2026-09-18T12:00:00.000Z");
const CORTES = buildCutoffs(DEFAULT_SEGMENT_CONFIG, AGORA);
const DIA = 86_400_000;

/** Um cliente elegível, sem pedido nenhum. Os testes mudam só o que importa. */
function cliente(over: Partial<ClienteParaClassificar> = {}): ClienteParaClassificar {
  return {
    id: "c1",
    totalOrders: 0,
    importedOrderCount: null,
    lastOrderAt: null,
    importedLastOrderAt: null,
    isGuest: false,
    isActive: true,
    crmContactable: true,
    phone: "+5511999999999",
    ...over,
  };
}

/** Um cliente cujo último pedido foi há `dias` dias. */
function pediuHa(dias: number, over: Partial<ClienteParaClassificar> = {}) {
  return cliente({
    totalOrders: 3,
    lastOrderAt: new Date(AGORA.getTime() - dias * DIA),
    ...over,
  });
}

const estagios = (c: ClienteParaClassificar) =>
  estagiosDoCliente(c, CORTES, DEFAULT_SEGMENT_CONFIG, AGORA);

describe("os gatilhos independentes ficam fora da conta", () => {
  it("nenhum gatilho independente é contado como estágio do fluxo principal", () => {
    for (const gatilho of GATILHOS_INDEPENDENTES) {
      expect(ESTAGIOS_DO_FLUXO_PRINCIPAL).not.toContain(gatilho as never);
    }
  });
});

describe("item 3 do desenho: quem comprou SAI da jornada de conversão", () => {
  it("quem nunca pediu está em 'Converter 1º pedido'", () => {
    expect(estagios(cliente())).toContain("cadastro-sem-compra");
  });

  it("quem tem UM pedido nativo sai de 'Converter 1º pedido'", () => {
    expect(estagios(cliente({ totalOrders: 1 }))).not.toContain("cadastro-sem-compra");
  });

  it("quem só tem histórico IMPORTADO também sai de 'Converter 1º pedido'", () => {
    // A perna importada existe justamente para a base migrada não ser tratada
    // como gente que nunca comprou.
    expect(estagios(cliente({ importedOrderCount: 4 }))).not.toContain("cadastro-sem-compra");
  });

  it("importedOrderCount = 0 NÃO tira ninguém da conversão (zero é zero, não é compra)", () => {
    expect(estagios(cliente({ importedOrderCount: 0 }))).toContain("cadastro-sem-compra");
  });
});

describe("O PISO: perdido não é mais frio ao mesmo tempo", () => {
  it("quem pediu há 200 dias cai SÓ em perdido", () => {
    const e = estagios(pediuHa(200));
    expect(e).not.toContain("recuperar-frios");
    expect(e).toContain("recuperar-perdidos");
  });

  it("vale para QUALQUER data além do corte de perdido — não é caso de borda", () => {
    for (const dias of [121, 150, 200, 365, 1000]) {
      const e = estagios(pediuHa(dias));
      expect(e, `cliente de ${dias} dias`).toContain("recuperar-perdidos");
      expect(e, `cliente de ${dias} dias`).not.toContain("recuperar-frios");
    }
  });

  it("a faixa de 60 a 120 dias continua sendo frio", () => {
    const e = estagios(pediuHa(90));
    expect(e).toContain("recuperar-frios");
    expect(e).not.toContain("recuperar-perdidos");
  });
});

describe("os estágios que DE FATO se excluem continuam se excluindo", () => {
  it("quem nunca pediu não entra em frio nem em perdido", () => {
    // As duas colunas de data são nulas e não casam com nenhuma perna do OR.
    const e = estagios(cliente());
    expect(e).not.toContain("recuperar-frios");
    expect(e).not.toContain("recuperar-perdidos");
    expect(e).not.toContain("reativar-mornos");
  });

  it("morno e frio são mutuamente exclusivos", () => {
    const morno = estagios(pediuHa(45));
    expect(morno).toContain("reativar-mornos");
    expect(morno).not.toContain("recuperar-frios");
  });

  it("quente esfriando cai só na janela dos 7 dias finais do quente", () => {
    expect(estagios(pediuHa(25))).toContain("quente-esfriando");  // dentro de [30d, 23d]
    expect(estagios(pediuHa(10))).not.toContain("quente-esfriando"); // quente ainda, não esfriando
  });
});

describe("'Indique um amigo' atravessa a jornada de reativação", () => {
  it("um comprador antigo é, ao mesmo tempo, indicação + perdido", () => {
    // "Indique um amigo" é da jornada de RELACIONAMENTO (pós-compra) e atravessa
    // a de REATIVAÇÃO. Frio e perdido, esses sim, já não coexistem mais.
    const e = estagios(pediuHa(200, { totalOrders: 5 }));
    expect(e).toEqual(expect.arrayContaining(["indique-amigo", "recuperar-perdidos"]));
    expect(e).not.toContain("recuperar-frios");
    expect(e.length).toBeGreaterThanOrEqual(2);
  });
});

describe("os filtros de elegibilidade são respeitados", () => {
  it("quem não pode receber não entra em estágio nenhum", () => {
    expect(estagios(cliente({ phone: null }))).toEqual([]);
    expect(estagios(cliente({ crmContactable: false }))).toEqual([]);
    expect(estagios(cliente({ isGuest: true }))).toEqual([]);
    expect(estagios(cliente({ isActive: false }))).toEqual([]);
  });

  it("podeReceber / jaComprou / ultimoPedidoEfetivo respondem o combinado", () => {
    expect(podeReceber(cliente())).toBe(true);
    expect(jaComprou(cliente({ importedOrderCount: 2 }))).toBe(true);
    expect(jaComprou(cliente())).toBe(false);
    expect(ultimoPedidoEfetivo(cliente())).toBeNull();
    // COALESCE: a coluna importada só vale quando a nativa é nula.
    const so_importado = new Date("2026-01-01T00:00:00.000Z");
    expect(ultimoPedidoEfetivo(cliente({ importedLastOrderAt: so_importado }))).toEqual(so_importado);
  });
});

describe("a medição no banco devolve a distribuição", () => {
  const base: ClienteParaClassificar[] = [
    cliente({ id: "nunca-pediu" }),                          // 1 estágio
    pediuHa(45, { id: "morno" }),                            // morno + indique = 2
    pediuHa(200, { id: "perdido" }),                         // perdido + indique = 2
    pediuHa(200, { id: "perdido-2", totalOrders: 1 }),        // + 2ª compra = 3
    cliente({ id: "sem-telefone", phone: null }),            // fora
  ];

  const db = {
    customer: {
      findMany: async () => base,
    },
  } as unknown as Parameters<typeof medirJornadaDeEstagios>[0];

  it("conta só quem é elegível e classifica cada um", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    expect(r.clientesElegiveis).toBe(4); // o sem telefone ficou de fora
    expect(r.distribuicao.um).toBe(1);
    expect(r.distribuicao.dois).toBe(2);   // morno e perdido: 2 estágios cada
    expect(r.distribuicao.tres).toBe(1);
    expect(r.distribuicao.quatroOuMais).toBe(0);
  });

  it("nenhum comprador continua elegível em 'Converter 1º pedido' (item 3 de pé)", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    expect(r.compradoresAindaEmConversao).toBe(0);
  });

  it("a soma das audiências passa do número de clientes — é isso que o CEO viu na tela", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    expect(r.somaDasAudiencias).toBeGreaterThan(r.clientesElegiveis);
  });

  it("o par frio+perdido NÃO aparece mais na lista de colisões", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    const par = r.paresQueColidem.find(
      (p) =>
        (p.a === "recuperar-frios" && p.b === "recuperar-perdidos") ||
        (p.a === "recuperar-perdidos" && p.b === "recuperar-frios"),
    );
    expect(par).toBeUndefined();
  });
});
