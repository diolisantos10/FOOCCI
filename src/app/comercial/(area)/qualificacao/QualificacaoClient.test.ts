/**
 * QUALIFICAÇÃO: COR NÃO É AFIRMAÇÃO EMPRESTADA, E SUGESTÃO SEM NÚMERO NÃO SOBE.
 *
 * ── AS DUAS COISAS QUE ESTE TESTE SEGURA ────────────────────────────────────
 *
 * 1. **Os degraus que o desenho não previu não pegam cor de vizinho.** O desenho
 *    tem quatro (chama, chama, termômetro, floco); o banco tem seis. Pintar
 *    DESQUALIFICADO com o azul de MORNO afirmaria que ele é "quase morno", e
 *    ninguém apurou isso. Extra sai em cinza.
 * 2. **A coluna de sugestões da IA só fala com número na mão.** Sem número, ela
 *    diz que não recomenda — sugestão sem número é opinião com cara de sistema.
 *
 * Renderiza a MESMA coluna que a tela monta, não uma cópia escrita para passar.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PanoramaDaQualificacao } from "@/services/salaDeVendas/telas/qualificacao";
import { SugestoesDePriorizacao, tintaDe } from "./QualificacaoClient";

function panorama(p: Partial<PanoramaDaQualificacao> = {}): PanoramaDaQualificacao {
  return {
    versaoDaRegua: 3,
    emAberto: 40,
    naoClassificados: 0,
    termometro: [],
    faixas: [],
    fatores: [],
    lacunas: [],
    naoMedido: [],
    ...p,
  } as PanoramaDaQualificacao;
}

describe("a cor dos degraus", () => {
  it("os quatro do desenho têm ícone e cor próprios", () => {
    expect(tintaDe("PRIORIDADE_MAXIMA")).toEqual({ icone: "chama", tom: "vermelho" });
    expect(tintaDe("QUENTE").icone).toBe("chama");
    expect(tintaDe("MORNO").icone).toBe("termometro");
    expect(tintaDe("FRIO").icone).toBe("floco");
  });

  it("degrau que o desenho não previu sai em cinza, sem cor emprestada do vizinho", () => {
    expect(tintaDe("DESQUALIFICADO").tom).toBe("cinza");
    expect(tintaDe("NUTRICAO").tom).toBe("cinza");
  });
});

describe("as sugestões de priorização saem de números que já estão na tela", () => {
  it("sem nenhum número, a coluna declara que não recomenda por palpite", () => {
    const h = renderToStaticMarkup(
      React.createElement(SugestoesDePriorizacao, { p: panorama() }),
    );
    expect(h).toContain("não recomenda por palpite");
    expect(h).not.toContain("Pronto para Comprar");
  });

  it("a fila de quem ninguém pontuou aparece com o número, e não vira FRIO", () => {
    const h = renderToStaticMarkup(
      React.createElement(SugestoesDePriorizacao, { p: panorama({ naoClassificados: 12 }) }),
    );
    expect(h).toContain(">12<");
    expect(h).toContain("não valem FRIO");
  });

  it("a maior lacuna vira a próxima pergunta, com a contagem que a sustenta", () => {
    const h = renderToStaticMarkup(
      React.createElement(SugestoesDePriorizacao, {
        p: panorama({
          lacunas: [
            { lacuna: "quem decide", pergunta: "Quem decide a contratação?", leads: 9 },
            { lacuna: "para quando", pergunta: "Para quando você precisa disso?", leads: 31 },
          ],
        }),
      }),
    );
    expect(h).toContain("Para quando você precisa disso?");
    expect(h).toContain(">31<");
    expect(h).not.toContain("Quem decide a contratação?");
  });

  it("o que a base não tem é declarado, não estimado", () => {
    const h = renderToStaticMarkup(
      React.createElement(SugestoesDePriorizacao, { p: panorama() }),
    );
    expect(h).toContain("Valor Potencial");
    expect(h).toContain("Probabilidade de Compra");
    expect(h).toContain("não aparecem inventados");
  });
});
