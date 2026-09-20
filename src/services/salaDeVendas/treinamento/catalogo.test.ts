import { describe, expect, it } from "vitest";
import { baseDeVerdade } from "../ta/verdade";
import {
  catalogoDoTreinamento,
  corrigirProva,
  nivelDeDominio,
  provaDoTreinamento,
} from "./catalogo";

describe("Centro de Treinamento Comercial", () => {
  it("tem os três eixos para humanos e agentes", () => {
    const catalogo = catalogoDoTreinamento();
    expect(catalogo.map((t) => t.eixo)).toEqual([
      "PRODUTO",
      "VENDA_CONSULTIVA",
      "SEGURANCA_E_MARCA",
    ]);
    expect(catalogo.every((t) => t.publico === "Humanos e agentes de IA")).toBe(true);
    expect(catalogo.every((t) => t.unidades.length > 0)).toBe(true);
  });

  it("a trilha de produto é derivada integralmente da verdade publicada", () => {
    const produto = catalogoDoTreinamento().find((t) => t.eixo === "PRODUTO")!;
    const verdade = baseDeVerdade();
    expect(produto.unidades).toHaveLength(verdade.length);
    expect(produto.unidades.map((u) => u.id)).toEqual(verdade.map((v) => `produto:${v.id}`));
    expect(produto.unidades.map((u) => u.resumo)).toEqual(verdade.map((v) => v.texto));
  });

  it("a prova pública nunca entrega o gabarito", () => {
    const prova = provaDoTreinamento("PRODUTO");
    expect(prova).toHaveLength(5);
    expect(JSON.stringify(prova)).not.toContain("resposta");
  });

  it("corrige a prova no servidor e mantém denominador", () => {
    const prova = provaDoTreinamento("PRODUTO");
    // Cada pergunta foi construída da unidade de mesmo índice. Descobrimos o
    // gabarito pela fonte, como o servidor — não há campo secreto no payload.
    const respostas = prova.map((q, i) => ({
      questaoId: q.id,
      opcaoId: `produto:${baseDeVerdade()[i]!.id}`,
    }));
    expect(corrigirProva("PRODUTO", respostas)).toMatchObject({ acertos: 5, total: 5, nota: 100 });
  });

  it("não transforma ausência de avaliação em zero", () => {
    expect(nivelDeDominio(null)).toBe("Não avaliado");
    expect(nivelDeDominio(0)).toBe("Em formação");
    expect(nivelDeDominio(50)).toBe("Operacional");
    expect(nivelDeDominio(70)).toBe("Proficiente");
    expect(nivelDeDominio(85)).toBe("Especialista");
  });
});
