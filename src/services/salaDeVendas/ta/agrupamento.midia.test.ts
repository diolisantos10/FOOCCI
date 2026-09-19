/**
 * ⛔ AS TRÊS CAIXAS VAZIAS — o lado do turno consolidado.
 *
 * Em 19/09/2026 um lead mandou três mensagens de mídia seguidas e a empresa
 * ficou muda. Havia DOIS pontos onde a mídia era apagada, e consertar só um
 * deixaria o defeito de pé:
 *
 *   1. `chamarOTA` desistia do turno quando `msg.text` era nulo;
 *   2. **aqui**, `juntarEntradasDoTurno` montava cada pedaço com
 *      `(texto ?? legenda ?? "")` e filtrava os vazios — então três fotos sem
 *      legenda viravam zero pedaços, a função devolvia `null`, e o turno
 *      inteiro era descartado como "ninguém está sem resposta".
 *
 * O segundo é o mais traiçoeiro porque `null` ali significa "está tudo
 * respondido". O sistema não registrava falha nenhuma: ele concluía que não
 * havia nada a fazer.
 */

import { describe, it, expect } from "vitest";
import { juntarEntradasDoTurno } from "./agrupamento";

type Linha = {
  id: string;
  tipo: string;
  tipoCru: string | null;
  texto: string | null;
  legenda: string | null;
  midiaNome: string | null;
  ocorreuEm: Date;
};

/** Um cliente de banco de mentira: só o suficiente para as duas consultas. */
function bancoCom(entradas: Linha[]) {
  return {
    leadMensagem: {
      findFirst: async () => null, // nunca houve saída: tudo é turno atual
      findMany: async () => entradas,
    },
  } as never;
}

const T = new Date("2026-09-19T21:58:00Z");

function foto(id: string, legenda: string | null = null): Linha {
  return { id, tipo: "IMAGEM", tipoCru: null, texto: null, legenda, midiaNome: null, ocorreuEm: T };
}

describe("mídia do cliente no turno consolidado", () => {
  it("três fotos sem legenda NÃO viram turno vazio", async () => {
    // Este é literalmente o caso do Lanchonete Almir às 21:58.
    const r = await juntarEntradasDoTurno(bancoCom([foto("a"), foto("b"), foto("c")]), "lead-1");

    expect(r).not.toBeNull();
    expect(r!.ids).toEqual(["a", "b", "c"]);
    expect(r!.texto.trim()).not.toBe("");
  });

  it("a legenda do cliente entra no texto que a IA recebe", async () => {
    const r = await juntarEntradasDoTurno(
      bancoCom([foto("a", "olha meu cardápio"), foto("b")]),
      "lead-1",
    );

    expect(r!.texto).toContain("olha meu cardápio");
  });

  it("cada mensagem vira UMA linha — três fotos, três linhas", async () => {
    // Juntar com espaço faria o modelo ler uma frase sem sentido; em linhas
    // ele lê três fatos, que é o que são.
    const r = await juntarEntradasDoTurno(bancoCom([foto("a"), foto("b"), foto("c")]), "lead-1");

    expect(r!.texto.split("\n")).toHaveLength(3);
  });

  it("texto de verdade continua passando limpo, sem moldura", async () => {
    const r = await juntarEntradasDoTurno(
      bancoCom([
        { id: "a", tipo: "TEXTO", tipoCru: null, texto: "é padaria", legenda: null, midiaNome: null, ocorreuEm: T },
        { id: "b", tipo: "TEXTO", tipoCru: null, texto: "só pelo iFood", legenda: null, midiaNome: null, ocorreuEm: T },
      ]),
      "lead-1",
    );

    expect(r!.texto).toBe("é padaria\nsó pelo iFood");
  });

  it("sem entrada nenhuma continua devolvendo null", async () => {
    // `null` segue significando "ninguém está sem resposta" — e agora só isso.
    expect(await juntarEntradasDoTurno(bancoCom([]), "lead-1")).toBeNull();
  });
});
