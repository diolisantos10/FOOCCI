/**
 * As três cegueiras que a auditoria achou no Entrevistador — fechadas.
 *
 * Contra o código antigo os quatro testes abaixo REPROVAM: `motivoSemIA` não
 * existia (o `catch` era vazio), `origem` não existia no campo entendido (a
 * queda para o motor de regras era invisível) e `travou` não existia.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const motor = vi.hoisted(() => ({ callStructuredJson: vi.fn() }));
vi.mock("../../engines/OpenAIEngineAdapter", () => motor);
vi.mock("../../engines/AIEngineRouter", () => ({
  selectEngine: () => ({ provider: "OPENAI", model: "gpt-4o-mini" }),
}));

import { ouvir } from "../Entrevistador";
import { FalhaDeMotor } from "../../engines/FalhaDeMotor";

beforeEach(() => vi.clearAllMocks());

describe("o motivo de a IA não ter respondido fica registrado", () => {
  it("JSON inválido é nomeado como JSON inválido, não como 'não entendeu'", async () => {
    motor.callStructuredJson.mockResolvedValue("{isso não é json");
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "quero vender mais" });
    expect(r.semIA).toBe(true);
    expect(r.motivoSemIA).toBe("json_invalido");
  });

  it("resposta cortada pelo teto de tokens não se confunde com erro de rede", async () => {
    motor.callStructuredJson.mockRejectedValue(new FalhaDeMotor("cortado_por_limite", "700 tokens"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "texto longo" });
    expect(r.motivoSemIA).toBe("cortado_por_limite");
  });

  it("chave ausente é 'sem chave', não 'desconhecido'", async () => {
    motor.callStructuredJson.mockRejectedValue(new FalhaDeMotor("sem_chave", "OPENAI_API_KEY ausente"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "oi" });
    expect(r.motivoSemIA).toBe("sem_chave");
  });

  it("timeout de rede é classificado como timeout", async () => {
    motor.callStructuredJson.mockRejectedValue(new Error("Request timed out"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "oi" });
    expect(r.motivoSemIA).toBe("timeout");
  });

  it("quando a IA responde, não existe motivo nenhum pendurado", async () => {
    motor.callStructuredJson.mockResolvedValue(
      JSON.stringify({ respostas: { objetivo: "vender mais no delivery" }, servicos: [], semResposta: [] }),
    );
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "vender mais no delivery" });
    expect(r.semIA).toBe(false);
    expect(r.motivoSemIA).toBeUndefined();
  });
});

describe("a queda para o motor de regras deixa de ser invisível", () => {
  it("campo preenchido sem IA é marcado como vindo do motor", async () => {
    motor.callStructuredJson.mockRejectedValue(new Error("fetch failed"));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["objetivo"], resposta: "quero encher a casa na terça" });
    expect(r.entendido).toHaveLength(1);
    expect(r.entendido[0]).toMatchObject({ chave: "objetivo", origem: "motor" });
  });

  it("campo lido pela IA é marcado como vindo da IA", async () => {
    motor.callStructuredJson.mockResolvedValue(
      JSON.stringify({ respostas: { publico: "familia do bairro" }, servicos: [], semResposta: [] }),
    );
    const r = await ouvir({ estado: {}, perguntadasAgora: ["publico"], resposta: "familia do bairro" });
    expect(r.entendido[0]).toMatchObject({ chave: "publico", origem: "ia" });
  });
});

describe("a conversa que não anda fica declarada", () => {
  it("pergunta no ar e nada entendido = travou", async () => {
    motor.callStructuredJson.mockResolvedValue(JSON.stringify({ respostas: {}, servicos: [], semResposta: [] }));
    const r = await ouvir({ estado: {}, perguntadasAgora: ["publico", "objetivo"], resposta: "sei la" });
    expect(r.travou).toBe(true);
  });

  it("turno que preencheu alguma coisa não travou", async () => {
    motor.callStructuredJson.mockResolvedValue(
      JSON.stringify({ respostas: { publico: "familia do bairro" }, servicos: [], semResposta: [] }),
    );
    const r = await ouvir({ estado: {}, perguntadasAgora: ["publico"], resposta: "familia do bairro" });
    expect(r.travou).toBe(false);
  });
});
