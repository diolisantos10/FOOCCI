import { describe, it, expect, vi, beforeEach } from "vitest";

const motor = vi.hoisted(() => ({ callStructuredJson: vi.fn() }));
vi.mock("../engines/OpenAIEngineAdapter", () => motor);
vi.mock("../engines/AIEngineRouter", () => ({
  selectEngine: () => ({ provider: "OPENAI", model: "gpt-4o-mini" }),
}));

import { atenderPedidoDeFoto, lerPedido } from "./AtendenteDeFoto";

beforeEach(() => {
  vi.clearAllMocks();
  motor.callStructuredJson.mockResolvedValue(JSON.stringify({
    conceitos: [
      { titulo: "A limpeza acontecendo", assunto: "limpeza de pele sendo feita", tipo: "procedimento", porque: "mostra o serviço em ação" },
      { titulo: "O detalhe", assunto: "detalhe da pele após o tratamento", tipo: "detalhe", porque: "prova o resultado" },
    ],
  }));
});

describe("lerPedido — o cliente pede de qualquer jeito", () => {
  it("pedido concreto vai direto pra forja", () => {
    expect(lerPedido("traz a foto do meu hambúrguer").modo).toBe("direto");
    expect(lerPedido("foto do salão").modo).toBe("direto");
    expect(lerPedido("retrato da nossa esteticista").modo).toBe("direto");
  });

  it("objetivo de negócio vira pauta", () => {
    expect(lerPedido("preciso divulgar minha clínica de estética").modo).toBe("pauta");
    expect(lerPedido("me ajuda com o instagram desse mês").modo).toBe("pauta");
    expect(lerPedido("quero uma campanha pra vender mais").modo).toBe("pauta");
    expect(lerPedido("não sei o que postar").modo).toBe("pauta");
  });

  it("pedido vazio ou vago cai na pauta em vez de gerar lixo", () => {
    expect(lerPedido("  ").modo).toBe("pauta");
    expect(lerPedido("uma foto").modo).toBe("pauta");
  });

  it("sempre explica a leitura — dá pra conferir se acertou", () => {
    expect(lerPedido("foto do hambúrguer").leitura).toBeTruthy();
    expect(lerPedido("preciso divulgar").leitura).toMatch(/objetivo/);
  });
});

describe("atenderPedidoDeFoto", () => {
  it("pedido concreto devolve opções de comando, sem gastar IA", async () => {
    const r = await atenderPedidoDeFoto({ texto: "traz a foto do meu hambúrguer" });
    expect(r.modo).toBe("direto");
    expect(r.opcoes).toHaveLength(3);
    expect(motor.callStructuredJson).not.toHaveBeenCalled();
  });

  it("objetivo amplo devolve pauta com conceito E comando prontos", async () => {
    const r = await atenderPedidoDeFoto({
      texto: "preciso divulgar minha clínica de estética",
      negocio: "clínica de estética",
      ofertas: ["limpeza de pele"],
    });
    expect(r.modo).toBe("pauta");
    expect(r.pauta?.[0]?.conceito.porque).toBeTruthy();
    expect(r.pauta?.[0]?.comando.prompt).toMatch(/Luz:/);
  });

  it("cada foto da pauta sai com câmera diferente", async () => {
    const r = await atenderPedidoDeFoto({ texto: "campanha pra clínica", negocio: "clínica" });
    const luzes = new Set(r.pauta?.map((i) => i.comando.receita.luz));
    expect(luzes.size).toBeGreaterThan(1);
  });

  it("IA fora do ar NÃO deixa o cliente sem material", async () => {
    motor.callStructuredJson.mockRejectedValue(new Error("529 overloaded"));
    const r = await atenderPedidoDeFoto({ texto: "preciso divulgar minha clínica", negocio: "clínica de estética" });
    expect(r.reserva).toBe(true);
    expect(r.pauta?.length).toBeGreaterThan(0);
    expect(r.pauta?.[0]?.comando.prompt).toBeTruthy();
  });

  it("IA respondendo lixo também cai na reserva", async () => {
    motor.callStructuredJson.mockResolvedValue("isso não é json");
    const r = await atenderPedidoDeFoto({ texto: "campanha", negocio: "padaria" });
    expect(r.reserva).toBe(true);
    expect(r.pauta?.length).toBeGreaterThan(0);
  });

  it("dá pra forçar pauta mesmo com assunto concreto", async () => {
    const r = await atenderPedidoDeFoto({ texto: "foto do hambúrguer", modo: "pauta", negocio: "hamburgueria" });
    expect(r.modo).toBe("pauta");
  });

  it("respeita quantos conceitos foram pedidos", async () => {
    const r = await atenderPedidoDeFoto({ texto: "campanha", negocio: "padaria", quantos: 2 });
    expect(r.pauta?.length).toBeLessThanOrEqual(2);
  });
});
