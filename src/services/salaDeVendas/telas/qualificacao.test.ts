/**
 * O TERMÔMETRO — e os dois jeitos de ele mentir.
 *
 * Um painel de qualificação erra de duas maneiras, e só uma aparece:
 *
 *  · **conta errado** — alguém percebe, porque conhece a própria fila;
 *  · **conta o não sabido como sabido** — o lead que ninguém pontuou entra em
 *    FRIO, o número fica plausível, e a fila de quem falta qualificar
 *    desaparece dentro da fila de quem já foi descartado. Ninguém percebe.
 *
 * A maioria destes casos mede o segundo.
 */

import { describe, it, expect, vi } from "vitest";
import {
  faixasDaRegua,
  panoramaDaQualificacao,
  COMO_O_DESENHO_CHAMA,
} from "./qualificacao";
import { temperaturaDe, VERSAO_DA_REGUA } from "../score";

/**
 * Um banco que devolve o que se mandar e GUARDA o que foi perguntado.
 *
 * Guardar é metade do ponto: uma tela que devolve o número certo tendo
 * perguntado errado passa em qualquer teste de resultado.
 */
function banco(resp: {
  counts?: number[];
  porTemperatura?: { temperatura: string | null; _count: { _all: number } }[];
  fatores?: { fator: string; _count: { _all: number }; _sum: { pontos: number } }[];
  exemplo?: string | null;
}) {
  const fila = [...(resp.counts ?? [])];
  const leadWheres: unknown[] = [];
  const groupBys: unknown[] = [];

  return {
    leadWheres,
    groupBys,
    siteLead: {
      count: vi.fn(async (args: { where: unknown }) => {
        leadWheres.push(args.where);
        return fila.shift() ?? 0;
      }),
      groupBy: vi.fn(async (args: unknown) => {
        groupBys.push(args);
        return resp.porTemperatura ?? [];
      }),
    },
    leadScoreFator: {
      groupBy: vi.fn(async (args: unknown) => {
        groupBys.push(args);
        return resp.fatores ?? [];
      }),
      findFirst: vi.fn(async () => (resp.exemplo === undefined ? null : { observado: resp.exemplo })),
    },
  };
}

describe("a régua é LIDA do código, não digitada na tela", () => {
  it("cada faixa devolvida bate com `temperaturaDe` em toda a sua extensão", () => {
    // O caso que carrega o arquivo. Se alguém trocar o corte de QUENTE em
    // `score.ts`, este teste só continua passando se a tela tiver mudado junto
    // — porque as faixas são derivadas, e não copiadas.
    for (const faixa of faixasDaRegua()) {
      for (let ponto = faixa.de; ponto <= faixa.ate; ponto += 1) {
        expect(temperaturaDe(ponto), `ponto ${ponto} caiu fora da faixa ${faixa.temperatura}`).toBe(
          faixa.temperatura,
        );
      }
    }
  });

  it("as faixas cobrem 0 a 100 sem buraco e sem sobreposição", () => {
    const faixas = [...faixasDaRegua()].sort((a, b) => a.de - b.de);
    expect(faixas[0]!.de).toBe(0);
    expect(faixas[faixas.length - 1]!.ate).toBe(100);
    for (let i = 1; i < faixas.length; i += 1) {
      expect(faixas[i]!.de, "há um buraco ou uma sobreposição entre as faixas").toBe(
        faixas[i - 1]!.ate + 1,
      );
    }
  });

  it("vêm da mais quente para a mais fria — é a ordem de trabalhar a fila", () => {
    const f = faixasDaRegua();
    expect(f[0]!.temperatura).toBe(temperaturaDe(100));
    expect(f[f.length - 1]!.temperatura).toBe(temperaturaDe(0));
  });

  it("o nome do desenho do CEO aponta para o nome que existe no banco", () => {
    // O desenho chama o topo de "PRONTO PARA COMPRAR"; o enum chama de
    // PRIORIDADE_MAXIMA. A tela mostra os dois — renomear o enum quebraria dado
    // gravado, e esconder a diferença faria o CEO procurar uma tela que não existe.
    expect(COMO_O_DESENHO_CHAMA.PRIORIDADE_MAXIMA).toBe("PRONTO PARA COMPRAR");
    expect(COMO_O_DESENHO_CHAMA[temperaturaDe(100)]).toBe("PRONTO PARA COMPRAR");
  });
});

describe("⭐ o não pontuado NUNCA vira FRIO", () => {
  it("lead com temperatura nula fica fora do termômetro e conta em naoClassificados", async () => {
    const db = banco({
      // emAberto = 10, naoClassificados = 4, depois as 7 lacunas
      counts: [10, 4, 0, 0, 0, 0, 0, 0, 0],
      porTemperatura: [
        { temperatura: "QUENTE", _count: { _all: 3 } },
        { temperatura: null, _count: { _all: 4 } },
        { temperatura: "FRIO", _count: { _all: 3 } },
      ],
    });

    const p = await panoramaDaQualificacao(db as never, { escopo: {} });

    const frio = p.termometro.find((d) => d.temperatura === "FRIO")!;
    expect(frio.total, "o lead sem temperatura foi jogado em FRIO").toBe(3);
    expect(p.naoClassificados).toBe(4);
    expect(
      p.termometro.some((d) => d.temperatura === null as never),
      "a temperatura nula virou um degrau do termômetro",
    ).toBe(false);
  });

  it("a soma dos degraus mais os não classificados fecha com os leads em aberto", async () => {
    const db = banco({
      counts: [10, 4, 0, 0, 0, 0, 0, 0, 0],
      porTemperatura: [
        { temperatura: "QUENTE", _count: { _all: 3 } },
        { temperatura: null, _count: { _all: 4 } },
        { temperatura: "FRIO", _count: { _all: 3 } },
      ],
    });

    const p = await panoramaDaQualificacao(db as never, { escopo: {} });
    const somaDosDegraus = p.termometro.reduce((t, d) => t + d.total, 0);
    expect(somaDosDegraus + p.naoClassificados).toBe(p.emAberto);
  });

  it("temperatura que a régua de hoje não produz aparece mesmo assim, sem faixa", async () => {
    // DESQUALIFICADO não sai de `temperaturaDe`. Escondê-lo faria a soma da tela
    // ficar menor que a base, sem nenhuma explicação na tela.
    const db = banco({
      counts: [5, 0, 0, 0, 0, 0, 0, 0, 0],
      porTemperatura: [{ temperatura: "DESQUALIFICADO", _count: { _all: 5 } }],
    });

    const p = await panoramaDaQualificacao(db as never, { escopo: {} });
    const d = p.termometro.find((x) => x.temperatura === "DESQUALIFICADO")!;
    expect(d.total).toBe(5);
    expect(d.faixa, "a régua de hoje não produz DESQUALIFICADO — não pode ter faixa").toBeNull();
  });
});

describe("⭐ todo número vem do banco", () => {
  it("os fatores são a soma gravada, não um peso teórico da régua", async () => {
    const db = banco({
      counts: [4, 0, 0, 0, 0, 0, 0, 0, 0],
      fatores: [
        { fator: "marketplace", _count: { _all: 3 }, _sum: { pontos: 66 } },
        { fator: "dor", _count: { _all: 2 }, _sum: { pontos: 30 } },
      ],
      exemplo: "depende de marketplace",
    });

    const p = await panoramaDaQualificacao(db as never, { escopo: {} });

    expect(p.fatores.map((f) => [f.fator, f.pontos, f.leads, f.mediaPorLead])).toEqual([
      ["marketplace", 66, 3, 22],
      ["dor", 30, 2, 15],
    ]);
    expect(p.fatores[0]!.exemplo).toBe("depende de marketplace");
  });

  it("só conta fator da régua CORRENTE — misturar gerações somaria acima de 100", async () => {
    const db = banco({ counts: [1, 0, 0, 0, 0, 0, 0, 0, 0] });
    await panoramaDaQualificacao(db as never, { escopo: {} });

    const pedido = db.leadScoreFator.groupBy.mock.calls[0]![0] as {
      where: { reguaVersao?: number };
    };
    expect(pedido.where.reguaVersao).toBe(VERSAO_DA_REGUA);
  });

  it("sem fator gravado, a tela DIZ por que — e não mostra zero calado", async () => {
    const db = banco({ counts: [3, 3, 0, 0, 0, 0, 0, 0, 0], fatores: [] });
    const p = await panoramaDaQualificacao(db as never, { escopo: {} });

    expect(p.fatores).toEqual([]);
    expect(p.naoMedido.join(" ")).toContain("Nenhum fator de score gravado");
  });

  it("base vazia é explicada, não apresentada como termômetro zerado", async () => {
    const db = banco({ counts: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const p = await panoramaDaQualificacao(db as never, { escopo: {} });
    expect(p.naoMedido.join(" ")).toContain("Não há lead em aberto");
  });
});

describe("⭐ o escopo entra em TODA consulta", () => {
  it("nenhuma contagem escapa do recorte de quem perguntou", async () => {
    // O erro tentador: esquecer o escopo numa das lacunas. O número continuaria
    // plausível e o SDR passaria a ver o tamanho da fila alheia.
    const escopo = { atendenteUserId: "user-diego" };
    const db = banco({ counts: [1, 0, 0, 0, 0, 0, 0, 0, 0] });
    await panoramaDaQualificacao(db as never, { escopo });

    expect(db.leadWheres.length, "menos consultas do que o esperado").toBeGreaterThanOrEqual(9);
    for (const [i, w] of db.leadWheres.entries()) {
      expect(
        JSON.stringify(w),
        `a consulta ${i} não carrega o escopo: ${JSON.stringify(w)}`,
      ).toContain("user-diego");
    }
  });

  it("o termômetro só olha lead EM ABERTO — encerrado inflaria a base", async () => {
    const db = banco({ counts: [1, 0, 0, 0, 0, 0, 0, 0, 0] });
    await panoramaDaQualificacao(db as never, { escopo: {} });

    const primeiro = JSON.stringify(db.leadWheres[0]);
    for (const encerrada of ["GANHO", "PERDIDO", "NUTRICAO"]) {
      expect(primeiro, `${encerrada} não foi excluído do termômetro`).toContain(encerrada);
    }
  });
});

describe("⭐ a lacuna inclui quem NUNCA foi sondado", () => {
  it("conta lead sem ficha de qualificação, e não só o campo vazio", async () => {
    // Contar só o campo vazio deixaria de fora justamente quem nunca foi
    // perguntado — que é a maioria da fila e o motivo desta lista existir.
    const db = banco({ counts: [10, 0, 0, 0, 0, 0, 0, 0, 0] });
    await panoramaDaQualificacao(db as never, { escopo: {} });

    const daLacuna = db.leadWheres.slice(2);
    expect(daLacuna.length).toBe(7);
    for (const w of daLacuna) {
      expect(JSON.stringify(w), "a lacuna não considerou lead sem ficha nenhuma").toContain(
        '"qualificacao":{"is":null}',
      );
    }
  });

  it("a faixa de orçamento NÃO é cobrada — perguntar preço cedo queima a conversa", async () => {
    const db = banco({ counts: [10, 0, 0, 0, 0, 0, 0, 0, 0] });
    const p = await panoramaDaQualificacao(db as never, { escopo: {} });
    expect(p.lacunas.map((l) => l.lacuna)).not.toContain("faixa de orçamento");
  });

  it("as lacunas vêm da maior para a menor — é a ordem de atacar", async () => {
    const db = banco({ counts: [10, 0, 1, 9, 2, 3, 4, 5, 6] });
    const p = await panoramaDaQualificacao(db as never, { escopo: {} });
    const totais = p.lacunas.map((l) => l.leads);
    expect([...totais].sort((a, b) => b - a)).toEqual(totais);
  });
});
