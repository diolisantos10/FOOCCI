import { describe, it, expect } from "vitest";

import {
  detectarTipo,
  forjarOpcoesDeFoto,
  forjarPromptDeFoto,
  limparPedido,
} from "./ForjaDeFoto";

describe("detectarTipo", () => {
  it("reconhece o assunto pelo pedido em linguagem solta", () => {
    expect(detectarTipo("foto do nosso hambúrguer")).toBe("comida");
    expect(detectarTipo("uma foto do chopp gelado")).toBe("bebida");
    expect(detectarTipo("retrato do chef")).toBe("retrato");
    expect(detectarTipo("foto do salão cheio")).toBe("ambiente");
    expect(detectarTipo("a fachada da loja")).toBe("fachada");
    expect(detectarTipo("a cozinha em produção")).toBe("bastidor");
    expect(detectarTipo("nosso cachorro mascote")).toBe("animal");
  });

  it("funciona sem acento e com caixa alta", () => {
    expect(detectarTipo("FOTO DO HAMBURGUER")).toBe("comida");
    expect(detectarTipo("SALAO decorado")).toBe("ambiente");
  });

  it("pedido desconhecido cai no genérico em vez de errar o assunto", () => {
    expect(detectarTipo("uma coisa bonita qualquer")).toBe("generico");
  });
});

describe("limparPedido", () => {
  it("tira o 'quero uma foto do' da frente", () => {
    expect(limparPedido("quero uma foto do hambúrguer")).toBe("hambúrguer");
    expect(limparPedido("me faz uma imagem da pizza")).toBe("pizza");
    expect(limparPedido("foto do salão")).toBe("salão");
  });

  it("pedido degenerado nunca volta vazio — o prompt não pode sair sem assunto", () => {
    for (const degenerado of ["uma foto", "foto", "de", "  ", "quero"]) {
      expect(limparPedido(degenerado).trim().length).toBeGreaterThan(0);
    }
  });

  it("deixa em paz um pedido que já vem direto", () => {
    expect(limparPedido("hambúrguer artesanal no balcão")).toBe("hambúrguer artesanal no balcão");
  });
});

describe("forjarPromptDeFoto", () => {
  const burger = {
    pedido: "quero uma foto do nosso hambúrguer",
    detalhes: "pão australiano, cheddar inglês",
    cenario: "o balcão de granito do salão",
    formato: "4:5",
  };

  it("não escreve 'foto de foto' — o acabamento é parte da qualidade", () => {
    expect(forjarPromptDeFoto(burger).prompt).not.toMatch(/de foto/i);
  });

  it("traz a gramática de fotógrafo: lente, luz, profundidade", () => {
    const p = forjarPromptDeFoto(burger).prompt;
    expect(p).toMatch(/lente \d+ mm|lente macro/);
    expect(p).toMatch(/Luz: /);
    expect(p).toMatch(/profundidade/i);
  });

  it("pede imperfeição real — é o que tira a cara de IA", () => {
    expect(forjarPromptDeFoto(burger).prompt).toMatch(/Detalhe que faz parecer real/);
  });

  it("NUNCA empilha as etiquetas que deixam todo mundo igual", () => {
    const { prompt } = forjarPromptDeFoto(burger);
    // aparecem só depois de "Evite:", nunca como instrução
    const instrucao = prompt.split("Evite:")[0] ?? "";
    for (const proibido of ["hiper-realista", "8K", "obra-prima", "ultra detalhado"]) {
      expect(instrucao).not.toContain(proibido);
    }
  });

  it("proíbe o clichê específico do assunto", () => {
    expect(forjarPromptDeFoto(burger).negativo).toMatch(/tábua de madeira rústica/);
    expect(forjarPromptDeFoto({ pedido: "retrato da atendente" }).negativo).toMatch(/pele alisada como cera/);
  });

  it("carrega os detalhes verdadeiros que o cliente deu", () => {
    expect(forjarPromptDeFoto(burger).prompt).toContain("pão australiano, cheddar inglês");
  });

  it("escreve o cenário em português correto, sem 'em o'", () => {
    const p = forjarPromptDeFoto(burger).prompt;
    expect(p).toContain("Cenário: o balcão de granito do salão");
    expect(p).not.toMatch(/\bem o\b/);
  });

  it("respeita a proporção pedida", () => {
    expect(forjarPromptDeFoto(burger).prompt).toContain("Proporção 4:5");
  });

  it("omite cenário e proporção quando não foram informados", () => {
    const p = forjarPromptDeFoto({ pedido: "foto da pizza" }).prompt;
    expect(p).not.toMatch(/Cenário:/);
    expect(p).not.toMatch(/Proporção/);
  });

  it("é determinístico: mesma variação, mesmo prompt", () => {
    expect(forjarPromptDeFoto({ ...burger, variacao: 2 }).prompt)
      .toBe(forjarPromptDeFoto({ ...burger, variacao: 2 }).prompt);
  });

  it("dá pra forçar o tipo quando a detecção não serve", () => {
    expect(forjarPromptDeFoto({ pedido: "algo indefinido", tipo: "comida" }).tipo).toBe("comida");
  });
});

describe("forjarOpcoesDeFoto — o anti-mesmice", () => {
  it("três opções do MESMO pedido saem diferentes entre si", () => {
    const opcoes = forjarOpcoesDeFoto({ pedido: "foto da pizza margherita" }, 3);
    const textos = new Set(opcoes.map((o) => o.prompt));
    expect(textos.size).toBe(3);
  });

  it("cada opção muda luz, ângulo e lente — não só uma palavra", () => {
    const [a, b] = forjarOpcoesDeFoto({ pedido: "foto do hambúrguer" }, 2);
    expect(a?.receita.luz).not.toBe(b?.receita.luz);
    expect(a?.receita.enquadramento).not.toBe(b?.receita.enquadramento);
    expect(a?.receita.lente).not.toBe(b?.receita.lente);
  });

  it("pede 1, recebe 1; pede absurdo, recebe teto", () => {
    expect(forjarOpcoesDeFoto({ pedido: "foto da pizza" }, 1)).toHaveLength(1);
    expect(forjarOpcoesDeFoto({ pedido: "foto da pizza" }, 99)).toHaveLength(10);
    expect(forjarOpcoesDeFoto({ pedido: "foto da pizza" }, 0)).toHaveLength(1);
  });

  it("todo tipo de foto tem receita — nenhum cai no vazio", () => {
    const tipos = ["comida", "bebida", "produto", "retrato", "ambiente",
                   "fachada", "paisagem", "urbano", "animal", "bastidor", "generico"] as const;
    for (const tipo of tipos) {
      const r = forjarPromptDeFoto({ pedido: "assunto", tipo });
      expect(r.receita.luz).toBeTruthy();
      expect(r.receita.lente).toBeTruthy();
      expect(r.receita.textura).toBeTruthy();
      expect(r.prompt.length).toBeGreaterThan(150);
    }
  });
});
