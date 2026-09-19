/**
 * A ESCADA DA JORNADA, PROVADA — não afirmada.
 *
 * Estes testes existem porque o Diretor Geral afirmou ao CEO que "as campanhas
 * disputam os mesmos clientes" sem ter medido nada, e foi corrigido. A resposta
 * a isso não é afirmar o contrário: é deixar o número provar.
 *
 * O teste central é `recuperar-perdidos ⊆ recuperar-frios`: um cliente que
 * pediu há 200 dias cai nos DOIS estágios ao mesmo tempo, e isso não é azar de
 * dado — é a definição dos predicados. Enquanto este teste passar acusando dois
 * estágios, a exclusividade do desenho do CEO NÃO está de pé no código.
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

describe("⚠️ O DEFEITO: todo PERDIDO é também FRIO, por construção", () => {
  it("quem pediu há 200 dias cai em DOIS estágios do fluxo principal ao mesmo tempo", () => {
    const e = estagios(pediuHa(200));
    expect(e).toContain("recuperar-frios");
    expect(e).toContain("recuperar-perdidos");
  });

  it("a sobreposição vale para QUALQUER data além do corte de perdido — não é caso de borda", () => {
    // `lostCutoff` (120d) é mais antigo que `warmCutoff` (60d), então
    // `eff < lostCutoff` IMPLICA `eff < warmCutoff`. Sempre.
    for (const dias of [121, 150, 200, 365, 1000]) {
      const e = estagios(pediuHa(dias));
      expect(e, `cliente de ${dias} dias`).toContain("recuperar-perdidos");
      expect(e, `cliente de ${dias} dias`).toContain("recuperar-frios");
    }
  });

  it("o cabeçalho de crm-segments promete um PISO para FRIO que o código não aplica", () => {
    // A documentação diz: "FRIO — ordered warmMaxDays+1 days ago or more (up to
    // lostMinDays)". Se o piso existisse, um cliente de 200 dias seria SÓ
    // perdido. Este teste falha no dia em que o piso for implementado — e aí é
    // ele que deve ser atualizado, porque o defeito terá sido corrigido.
    expect(estagios(pediuHa(200))).toContain("recuperar-frios");
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
  it("um comprador antigo é, ao mesmo tempo, indicação + frio + perdido", () => {
    // Três estágios do fluxo principal na mesma pessoa. O desenho do CEO põe
    // "Indique um amigo" na jornada de RELACIONAMENTO (pós-compra) e "frio"/
    // "perdido" na de REATIVAÇÃO — que, pelo item 3, deveriam ser excludentes.
    const e = estagios(pediuHa(200, { totalOrders: 5 }));
    expect(e).toEqual(
      expect.arrayContaining(["indique-amigo", "recuperar-frios", "recuperar-perdidos"]),
    );
    expect(e.length).toBeGreaterThanOrEqual(3);
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
    pediuHa(200, { id: "perdido" }),                         // frio + perdido + indique = 3
    pediuHa(200, { id: "perdido-2", totalOrders: 1 }),        // + 2ª compra = 4
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
    expect(r.distribuicao.dois).toBe(1);
    expect(r.distribuicao.tres).toBe(1);
    expect(r.distribuicao.quatroOuMais).toBe(1);
  });

  it("nenhum comprador continua elegível em 'Converter 1º pedido' (item 3 de pé)", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    expect(r.compradoresAindaEmConversao).toBe(0);
  });

  it("a soma das audiências passa do número de clientes — é isso que o CEO viu na tela", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    expect(r.somaDasAudiencias).toBeGreaterThan(r.clientesElegiveis);
  });

  it("o par frio+perdido aparece na lista de colisões", async () => {
    const r = await medirJornadaDeEstagios(db, "r1", { agora: AGORA });
    const par = r.paresQueColidem.find(
      (p) =>
        (p.a === "recuperar-frios" && p.b === "recuperar-perdidos") ||
        (p.a === "recuperar-perdidos" && p.b === "recuperar-frios"),
    );
    expect(par?.clientes).toBe(2);
  });
});
