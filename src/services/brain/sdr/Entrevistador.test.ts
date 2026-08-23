import { describe, it, expect, vi, beforeEach } from "vitest";

const motor = vi.hoisted(() => ({ callStructuredJson: vi.fn() }));
vi.mock("../engines/OpenAIEngineAdapter", () => motor);
vi.mock("../engines/AIEngineRouter", () => ({
  selectEngine: () => ({ provider: "OPENAI", model: "gpt-4o-mini" }),
}));

import { ouvir, lerOrigem, lerServicos, roteiroDoTurno } from "./Entrevistador";
import type { EstadoDaSondagem } from "../oficina/Sondagem";

/** A IA não entendeu nada — o caminho determinístico é quem responde. */
function iaMuda() {
  motor.callStructuredJson.mockResolvedValue(JSON.stringify({ respostas: {}, servicos: [], semResposta: [] }));
}

function iaDiz(respostas: Record<string, string>, servicos: string[] = []) {
  motor.callStructuredJson.mockResolvedValue(JSON.stringify({ respostas, servicos, semResposta: [] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  iaMuda();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("TRAVA 1 — perguntou, ficou registrado", () => {
  it("a pergunta entra em `perguntadas` mesmo sem a resposta cobrir", async () => {
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo", "publico"], resposta: "depois eu penso nisso" });
    expect(r.estado.perguntadas).toEqual(expect.arrayContaining(["objetivo", "publico"]));
  });

  it("registra mesmo quando a IA quebra", async () => {
    motor.callStructuredJson.mockRejectedValue(new Error("timeout"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["redes_sociais"], resposta: "ah sei lá" });
    expect(r.semIA).toBe(true);
    expect(r.estado.perguntadas).toContain("redes_sociais");
  });

  it("registra mesmo com resposta vazia — foi perguntado do mesmo jeito", async () => {
    const r = await ouvir({ estado: {}, perguntadasAgora: ["acesso_contas"], resposta: "   " });
    expect(r.estado.perguntadas).toContain("acesso_contas");
  });

  it("perguntado e sem resposta destrava a proposta, respondido não é exigido", async () => {
    const perguntadas = ["quem_decide", "o_que_vende", "publico", "redes_sociais", "acesso_contas", "objetivo", "data_inicio"];
    const estado: EstadoDaSondagem = {
      perguntadas,
      servicos: [{ chave: "legenda", origemDoInsumo: "agencia", definicoes: { tom: "próximo" } }],
    };
    const r = await ouvir({ estado, resposta: "" });
    expect(r.podePropor).toBe(true);
  });

  it("não duplica chave já registrada", async () => {
    const r = await ouvir({ estado: { perguntadas: ["objetivo"] }, perguntadasAgora: ["objetivo"], resposta: "x" });
    expect(r.estado.perguntadas?.filter((c) => c === "objetivo")).toHaveLength(1);
  });
});

describe("TRAVA 2 — a IA não inventa campo", () => {
  it("chave fora da lista é descartada", async () => {
    iaDiz({ faturamento_secreto: "R$ 200 mil" });
    const r = await ouvir({ estado: {}, resposta: "faturo bem" });
    expect(r.entendido).toHaveLength(0);
    expect(r.estado.ficha).not.toHaveProperty("faturamento_secreto");
  });

  it("campo de serviço não contratado é descartado", async () => {
    iaDiz({ "reels.quantidade": "8" });
    const r = await ouvir({ estado: {}, resposta: "oito por mês" });
    expect(r.estado.servicos?.find((s) => s.chave === "reels")?.definicoes?.quantidade).toBeUndefined();
  });

  it("serviço fora do catálogo não entra", async () => {
    iaDiz({}, ["outdoor"]);
    const r = await ouvir({ estado: {}, resposta: "quero outdoor" });
    expect(r.estado.servicos?.map((s) => s.chave)).not.toContain("outdoor");
  });

  it("valor vazio não conta como resposta", async () => {
    iaDiz({ objetivo: "   " });
    const r = await ouvir({ estado: {}, resposta: "sei lá" });
    expect(r.estado.ficha?.objetivo).toBeUndefined();
  });
});

describe("a leitura determinística", () => {
  it("origem: cliente", () => {
    expect(lerOrigem("eu tenho os vídeos aqui")).toBe("cliente");
    expect(lerOrigem("a gente grava lá na loja")).toBe("cliente");
  });

  it("origem: agência", () => {
    expect(lerOrigem("não tenho nada, vocês fazem")).toBe("agencia");
    expect(lerOrigem("preciso que vocês produzam")).toBe("agencia");
  });

  it("origem: misto", () => {
    expect(lerOrigem("um pouco de cada")).toBe("misto");
  });

  it("origem indefinida continua indefinida — não chuta", () => {
    expect(lerOrigem("ah, depois vejo isso")).toBeNull();
    expect(lerOrigem("")).toBeNull();
  });

  it("serviços citados são reconhecidos, com ou sem acento", () => {
    expect(lerServicos("quero reels e stories")).toEqual(expect.arrayContaining(["reels", "story"]));
    expect(lerServicos("quero tráfego pago")).toContain("trafego");
  });

  it("serviço não citado não é sugerido", () => {
    expect(lerServicos("quero reels")).not.toContain("trafego");
  });
});

describe("a pergunta que faltou, resolvida na conversa", () => {
  it("a resposta de origem preenche o serviço e destrava aquele ponto", async () => {
    const estado: EstadoDaSondagem = { servicos: [{ chave: "reels", origemDoInsumo: null }] };
    const r = await ouvir({
      estado,
      perguntadasAgora: ["reels.origemDoInsumo"],
      resposta: "não tenho nada, vocês produzem",
    });
    expect(r.estado.servicos?.[0]?.origemDoInsumo).toBe("agencia");
    expect(r.entendido.map((e) => e.chave)).toContain("reels.origemDoInsumo");
  });

  it("resposta evasiva NÃO define origem — e o serviço segue travando", async () => {
    const estado: EstadoDaSondagem = { servicos: [{ chave: "reels", origemDoInsumo: null }] };
    const r = await ouvir({ estado, perguntadasAgora: ["reels.origemDoInsumo"], resposta: "a gente vê isso depois" });
    expect(r.estado.servicos?.[0]?.origemDoInsumo).toBeNull();
    expect(r.podePropor).toBe(false);
  });

  it("o determinístico ganha da IA na origem — enum não se inventa", async () => {
    iaDiz({ "reels.origemDoInsumo": "acho que a agência" });
    const estado: EstadoDaSondagem = { servicos: [{ chave: "reels", origemDoInsumo: null }] };
    const r = await ouvir({ estado, perguntadasAgora: ["reels.origemDoInsumo"], resposta: "eu tenho os vídeos" });
    expect(r.estado.servicos?.[0]?.origemDoInsumo).toBe("cliente");
  });

  it("o cliente escolhendo serviço já abre a matriz daquele serviço", async () => {
    const r = await ouvir({ estado: {}, resposta: "quero reels e carrossel" });
    expect(r.servicosDetectados).toEqual(expect.arrayContaining(["reels", "carrossel"]));
    expect(r.proximas.map((p) => p.chave)).toContain("reels.origemDoInsumo");
  });
});

describe("quando a IA cai", () => {
  it("uma pergunta só no ar: a resposta crua vira a resposta", async () => {
    motor.callStructuredJson.mockRejectedValue(new Error("500"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "quero vender mais no almoço" });
    expect(r.estado.ficha?.objetivo).toBe("quero vender mais no almoço");
  });

  it("várias perguntas no ar: não divide no chute", async () => {
    motor.callStructuredJson.mockRejectedValue(new Error("500"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo", "publico"], resposta: "várias coisas" });
    expect(r.entendido).toHaveLength(0);
    expect(r.semResposta).toEqual(expect.arrayContaining(["objetivo", "publico"]));
  });
});

describe("condução", () => {
  it("o roteiro devolve pergunta e chave casadas", () => {
    const { perguntas, chaves } = roteiroDoTurno({}, 3);
    expect(perguntas).toHaveLength(3);
    expect(chaves).toEqual(perguntas.map((p) => p.chave));
  });

  it("o que ficou sem resposta é devolvido declarado", async () => {
    iaDiz({ objetivo: "vender mais no almoço" });
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo", "regiao"], resposta: "quero vender mais no almoço" });
    expect(r.semResposta).toEqual(["regiao"]);
  });

  it("o estado que entra não é mutado", async () => {
    const estado: EstadoDaSondagem = { ficha: {}, perguntadas: [], servicos: [] };
    await ouvir({ estado, perguntadasAgora: ["objetivo"], resposta: "quero reels" });
    expect(estado.perguntadas).toEqual([]);
    expect(estado.servicos).toEqual([]);
  });
});

describe("negação lida como sim — o erro que a casa irmã já pagou", () => {
  it("\"anúncios não\" NÃO vira tráfego pago", () => {
    expect(lerServicos("anúncios não, só quero reels")).toEqual(["reels"]);
  });

  it("\"não quero tráfego pago\" NÃO vira tráfego pago", () => {
    expect(lerServicos("não quero tráfego pago")).not.toContain("trafego");
  });

  it("\"sem stories\" NÃO vira stories", () => {
    expect(lerServicos("sem stories por enquanto")).not.toContain("story");
  });

  it("o pedido de verdade continua sendo lido", () => {
    expect(lerServicos("quero reels e carrossel")).toEqual(["reels", "carrossel"]);
  });

  it("negação numa oração não apaga o pedido da outra", () => {
    expect(lerServicos("não quero anúncio, quero carrossel")).toEqual(["carrossel"]);
  });
});
