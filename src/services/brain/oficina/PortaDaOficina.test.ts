import { describe, it, expect, vi, beforeEach } from "vitest";

const motor = vi.hoisted(() => ({ callStructuredJson: vi.fn() }));
vi.mock("../engines/OpenAIEngineAdapter", () => motor);
vi.mock("../engines/AIEngineRouter", () => ({ selectEngine: () => ({ provider: "OPENAI", model: "x" }) }));

import { atender, lerMeio } from "./PortaDaOficina";
import { forjarPromptDeTexto, detectarTipoDeTexto } from "./ForjaDeTexto";

beforeEach(() => {
  vi.clearAllMocks();
  motor.callStructuredJson.mockResolvedValue(JSON.stringify({
    conceitos: [{ titulo: "t", assunto: "limpeza de pele sendo feita", tipo: "procedimento", porque: "prova o serviço" }],
  }));
});

describe("a Oficina atende qualquer MEIO", () => {
  it("reconhece pedidos de texto", () => {
    expect(lerMeio("escreve a legenda do post de hoje").meio).toBe("texto");
    expect(lerMeio("mensagem de whatsapp pra quem sumiu").meio).toBe("texto");
    expect(lerMeio("roteiro de reels").meio).toBe("texto");
    expect(lerMeio("anúncio pra impulsionar").meio).toBe("texto");
    expect(lerMeio("resposta pra reclamação do cliente").meio).toBe("texto");
  });

  it("reconhece pedidos de imagem", () => {
    expect(lerMeio("foto do hambúrguer").meio).toBe("imagem");
    expect(lerMeio("uma imagem pro banner").meio).toBe("imagem");
    expect(lerMeio("retrato da equipe").meio).toBe("imagem");
  });

  it("na dúvida vai pra texto — é o mais fácil de redirecionar", () => {
    expect(lerMeio("preciso de alguma coisa").meio).toBe("texto");
  });

  it("dá pra forçar o meio", async () => {
    const r = await atender({ texto: "hambúrguer", meio: "texto" });
    expect(r.meio).toBe("texto");
  });
});

describe("comando de texto", () => {
  it("reconhece o tipo de peça escrita", () => {
    expect(detectarTipoDeTexto("legenda do post")).toBe("legenda");
    expect(detectarTipoDeTexto("mensagem de crm")).toBe("mensagem");
    expect(detectarTipoDeTexto("roteiro do reels")).toBe("roteiro");
    expect(detectarTipoDeTexto("descrição do cardápio")).toBe("descricao");
  });

  it("traz a gramática de redação: missão, abertura, estrutura, tamanho", () => {
    const p = forjarPromptDeTexto({ pedido: "legenda do post do burger" }).prompt;
    expect(p).toMatch(/MISSÃO DA PEÇA:/);
    expect(p).toMatch(/COMO ESCREVER:/);
    expect(p).toMatch(/Tamanho:/);
    expect(p).toMatch(/NUNCA:/);
  });

  it("ancora na verdade quando ela é passada", () => {
    const p = forjarPromptDeTexto({ pedido: "legenda", verdade: ["Burger do Chef R$ 39,90"] }).prompt;
    expect(p).toMatch(/VERDADE \(use só isto/);
    expect(p).toContain("Burger do Chef R$ 39,90");
  });

  it("proíbe o vício típico do tipo E a lista negra geral", () => {
    const m = forjarPromptDeTexto({ pedido: "mensagem de crm" });
    expect(m.negativo).toMatch(/sentimos sua falta/);
    expect(m.negativo).toMatch(/imperdível/);
  });

  it("três opções saem diferentes entre si", () => {
    const [a, b, c] = [0, 1, 2].map((v) => forjarPromptDeTexto({ pedido: "legenda do post", variacao: v }));
    expect(new Set([a?.prompt, b?.prompt, c?.prompt]).size).toBe(3);
    expect(a?.receita.abertura).not.toBe(b?.receita.abertura);
  });

  it("todo tipo tem receita — nenhum cai no vazio", () => {
    const tipos = ["legenda","mensagem","anuncio","roteiro","email","titulo","resposta","descricao","generico"] as const;
    for (const tipo of tipos) {
      const r = forjarPromptDeTexto({ pedido: "assunto", tipo });
      expect(r.receita.abertura).toBeTruthy();
      expect(r.prompt.length).toBeGreaterThan(150);
    }
  });
});

describe("atender", () => {
  it("pedido de texto devolve comandos, sem gastar IA", async () => {
    const r = await atender({ texto: "legenda do post de hoje" });
    expect(r.meio).toBe("texto");
    expect(r.textos).toHaveLength(3);
    expect(motor.callStructuredJson).not.toHaveBeenCalled();
  });

  it("pedido de imagem cai na trilha de foto", async () => {
    const r = await atender({ texto: "foto do hambúrguer" });
    expect(r.meio).toBe("imagem");
    expect(r.imagem?.opcoes?.length).toBeGreaterThan(0);
  });

  it("sempre explica a leitura do meio", async () => {
    expect((await atender({ texto: "legenda" })).leitura).toBeTruthy();
  });
});
