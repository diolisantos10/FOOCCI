/**
 * A régua da vitrine "Novidades".
 *
 * Cada teste aqui reprova uma versão ERRADA do próprio código:
 *   · seção aparecendo vazia;
 *   · produto de meses atrás entrando;
 *   · produto indisponível na vitrine;
 *   · o cardápio inteiro dentro da seção no dia em que o restaurante importou o
 *     cardápio (a armadilha do `createdAt`);
 *   · a janela escolhida pelo dono sendo ignorada;
 *   · um valor inválido de janela sendo aceito.
 */

import { describe, it, expect } from "vitest";
import {
  selecionarNovidades,
  montarCategoriaNovidades,
  resolverJanelaNovidades,
  janelaNovidadesValida,
  NOVIDADES_DIAS_PADRAO,
  NOVIDADES_DIAS_MIN,
  NOVIDADES_DIAS_MAX,
  NOVIDADES_TETO_ITENS,
  NOVIDADES_CATEGORY_ID,
  NOVIDADES_CATEGORY_NAME,
} from "./menuNovidades";

const AGORA = new Date("2026-09-24T12:00:00.000Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);

/** Um cardápio velho (itens de meses atrás) + o que o teste quiser acrescentar. */
function cardapioVelho(qtd = 10) {
  return Array.from({ length: qtd }, (_, i) => ({
    id: `velho-${i}`,
    createdAt: diasAtras(200 + i),
    isAvailable: true,
  }));
}

describe("janela configurável pelo dono", () => {
  it("sem configuração, vale o padrão — a seção funciona para quem nunca mexeu", () => {
    expect(resolverJanelaNovidades(undefined)).toBe(NOVIDADES_DIAS_PADRAO);
    expect(resolverJanelaNovidades(null)).toBe(NOVIDADES_DIAS_PADRAO);
  });

  it("valor inválido NUNCA é aceito — zero, negativo, absurdo, fracionário ou texto", () => {
    for (const ruim of [0, -1, -30, NOVIDADES_DIAS_MAX + 1, 9999, 7.5, NaN, "30", true, {}]) {
      expect(janelaNovidadesValida(ruim as unknown)).toBe(false);
      // e nunca escapa pela porta dos fundos: cai no padrão, não no valor ruim
      expect(resolverJanelaNovidades(ruim as unknown)).toBe(NOVIDADES_DIAS_PADRAO);
    }
  });

  it("valor válido nos limites é aceito como está", () => {
    expect(janelaNovidadesValida(NOVIDADES_DIAS_MIN)).toBe(true);
    expect(janelaNovidadesValida(NOVIDADES_DIAS_MAX)).toBe(true);
    expect(resolverJanelaNovidades(3)).toBe(3);
    expect(resolverJanelaNovidades(NOVIDADES_DIAS_MAX)).toBe(NOVIDADES_DIAS_MAX);
  });

  it("a janela do dono MANDA: 3 dias deixa de fora o produto de 10 dias que o padrão mostraria", () => {
    const itens = [...cardapioVelho(), { id: "novo", createdAt: diasAtras(10), isAvailable: true }];

    const comPadrao = selecionarNovidades(itens, { agora: AGORA });
    expect(comPadrao.map((i) => i.id)).toEqual(["novo"]);

    const comJanelaDoDono = selecionarNovidades(itens, { dias: 3, agora: AGORA });
    expect(comJanelaDoDono).toEqual([]);
  });

  it("aumentar a janela faz efeito na hora, sem republicar nada", () => {
    const itens = [...cardapioVelho(), { id: "novo", createdAt: diasAtras(20), isAvailable: true }];
    expect(selecionarNovidades(itens, { agora: AGORA })).toEqual([]);
    expect(selecionarNovidades(itens, { dias: 30, agora: AGORA }).map((i) => i.id)).toEqual(["novo"]);
  });

  it("janela inválida não vira janela: 0 não zera a vitrine e 9999 não abre o cardápio inteiro", () => {
    const itens = [...cardapioVelho(), { id: "novo", createdAt: diasAtras(2), isAvailable: true }];
    expect(selecionarNovidades(itens, { dias: 0, agora: AGORA }).map((i) => i.id)).toEqual(["novo"]);
    expect(selecionarNovidades(itens, { dias: 9999, agora: AGORA }).map((i) => i.id)).toEqual(["novo"]);
  });
});

describe("quem entra e quem não entra", () => {
  it("produto antigo NÃO entra", () => {
    const itens = [...cardapioVelho(), { id: "antigo", createdAt: diasAtras(90), isAvailable: true }];
    expect(selecionarNovidades(itens, { agora: AGORA })).toEqual([]);
  });

  it("produto indisponível NÃO aparece — vitrine não oferece o que não se vende", () => {
    const itens = [
      ...cardapioVelho(),
      { id: "novo-esgotado", createdAt: diasAtras(1), isAvailable: false },
      { id: "novo-ok", createdAt: diasAtras(2), isAvailable: true },
    ];
    expect(selecionarNovidades(itens, { agora: AGORA }).map((i) => i.id)).toEqual(["novo-ok"]);
  });

  it("produto sem data não é chutado para dentro", () => {
    const itens = [...cardapioVelho(), { id: "sem-data", createdAt: null, isAvailable: true }];
    expect(selecionarNovidades(itens, { agora: AGORA })).toEqual([]);
  });

  it("mais novo primeiro, e o teto segura o tamanho da vitrine", () => {
    const novos = Array.from({ length: NOVIDADES_TETO_ITENS + 5 }, (_, i) => ({
      id: `novo-${i}`,
      createdAt: diasAtras(i * 0.1),
      isAvailable: true,
    }));
    const itens = [...cardapioVelho(100), ...novos];
    const escolhidos = selecionarNovidades(itens, { agora: AGORA });
    expect(escolhidos).toHaveLength(NOVIDADES_TETO_ITENS);
    expect(escolhidos[0].id).toBe("novo-0");
  });

  it("⛔ ARMADILHA DO createdAt: cardápio inteiro importado hoje NÃO vira novidade", () => {
    // É exatamente o que a importação de cardápio faz: cria tudo de uma vez.
    const cardapioImportadoHoje = Array.from({ length: 40 }, (_, i) => ({
      id: `item-${i}`,
      createdAt: diasAtras(1),
      isAvailable: true,
    }));
    expect(selecionarNovidades(cardapioImportadoHoje, { agora: AGORA })).toEqual([]);
    expect(montarCategoriaNovidades(cardapioImportadoHoje, { agora: AGORA })).toBeNull();
  });
});

describe("a seção vazia não existe", () => {
  it("sem lançamento recente, NÃO há categoria (nem vazia, nem ocupando o topo)", () => {
    expect(montarCategoriaNovidades(cardapioVelho(), { agora: AGORA })).toBeNull();
  });

  it("cardápio vazio não produz categoria", () => {
    expect(montarCategoriaNovidades([], { agora: AGORA })).toBeNull();
  });

  it("com lançamento, a categoria vem pronta para ir na frente do cardápio", () => {
    const itens = [...cardapioVelho(), { id: "novo", createdAt: diasAtras(1), isAvailable: true }];
    const cat = montarCategoriaNovidades(itens, { agora: AGORA });
    expect(cat).not.toBeNull();
    expect(cat!.id).toBe(NOVIDADES_CATEGORY_ID);
    expect(cat!.name).toBe(NOVIDADES_CATEGORY_NAME);
    expect(cat!.items.map((i) => i.id)).toEqual(["novo"]);
  });

  it("o produto sai da vitrine sozinho quando deixa de ser novidade", () => {
    const itens = [...cardapioVelho(), { id: "novo", createdAt: diasAtras(1), isAvailable: true }];
    const depois = new Date(AGORA.getTime() + (NOVIDADES_DIAS_PADRAO + 1) * 86_400_000);
    expect(montarCategoriaNovidades(itens, { agora: AGORA })).not.toBeNull();
    expect(montarCategoriaNovidades(itens, { agora: depois })).toBeNull();
  });
});

describe("a tela e o atendente não podem discordar", () => {
  /* O cardápio da tela e o cardápio que o agente lê carregam campos diferentes.
   * O que NÃO pode divergir é o veredito. Aqui os dois formatos passam pelo
   * MESMO cálculo e o resultado tem de ser idêntico — inclusive com a janela
   * escolhida pelo dono. */
  const cru = [
    ...cardapioVelho(),
    { id: "novo-a", createdAt: diasAtras(1), isAvailable: true },
    { id: "novo-b", createdAt: diasAtras(40), isAvailable: true },
    { id: "novo-c", createdAt: diasAtras(2), isAvailable: false },
  ];

  const formatoTela = cru.map((i) => ({ id: i.id, createdAt: i.createdAt, isAvailable: i.isAvailable }));
  // O agente lê o mesmo item por outro caminho (Date em ISO, sem o campo de disponibilidade
  // porque a consulta dele já filtrou indisponíveis).
  const formatoAgente = cru
    .filter((i) => i.isAvailable !== false)
    .map((i) => ({ id: i.id, createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : null }));

  for (const dias of [undefined, 3, 45]) {
    it(`mesmo veredito nos dois caminhos com janela = ${String(dias)}`, () => {
      const tela = selecionarNovidades(formatoTela, { dias, agora: AGORA, totalDoCardapio: cru.length })
        .map((i) => i.id);
      const agente = selecionarNovidades(formatoAgente, { dias, agora: AGORA, totalDoCardapio: cru.length })
        .map((i) => i.id);
      expect(agente).toEqual(tela);
    });
  }

  it("o indisponível fica de fora nos DOIS caminhos", () => {
    expect(selecionarNovidades(formatoTela, { agora: AGORA, totalDoCardapio: cru.length }).map((i) => i.id))
      .not.toContain("novo-c");
    expect(selecionarNovidades(formatoAgente, { agora: AGORA, totalDoCardapio: cru.length }).map((i) => i.id))
      .not.toContain("novo-c");
  });
});
