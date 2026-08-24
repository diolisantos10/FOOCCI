/**
 * O adapter passa a olhar `finish_reason`.
 *
 * Contra o código antigo, o primeiro teste REPROVA: a resposta truncada voltava
 * como texto normal, morria no `JSON.parse` do consumidor e era contabilizada
 * como "a IA não entendeu". Diagnóstico errado — o conserto seria mexer no
 * prompt quando o problema é o teto de tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cliente = vi.hoisted(() => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock("@/lib/openai", () => cliente);

import { callStructuredJson } from "../OpenAIEngineAdapter";
import { FalhaDeMotor } from "../FalhaDeMotor";

const selection = { provider: "OPENAI" as const, model: "gpt-4o-mini" };
const chamada = { selection, systemPrompt: "s", userContent: "u", maxTokens: 700 };
const chaveOriginal = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-de-teste";
});
afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = chaveOriginal;
});

function responde(finish_reason: string, content: string | null) {
  cliente.openai.chat.completions.create.mockResolvedValue({
    choices: [{ finish_reason, message: { content } }],
  });
}

describe("finish_reason", () => {
  it("resposta cortada pelo teto vira 'cortado_por_limite', mesmo trazendo texto", async () => {
    responde("length", '{"respostas": {"objetivo": "vender ma');
    await expect(callStructuredJson(chamada)).rejects.toMatchObject({ motivo: "cortado_por_limite" });
  });

  it("resposta completa passa normalmente", async () => {
    responde("stop", '{"respostas":{}}');
    await expect(callStructuredJson(chamada)).resolves.toBe('{"respostas":{}}');
  });

  it("resposta vazia é 'sem_conteudo', não um erro genérico", async () => {
    responde("stop", null);
    await expect(callStructuredJson(chamada)).rejects.toMatchObject({ motivo: "sem_conteudo" });
  });

  it("sem chave configurada o motor nem é chamado — e o motivo é nomeado", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(callStructuredJson(chamada)).rejects.toBeInstanceOf(FalhaDeMotor);
    expect(cliente.openai.chat.completions.create).not.toHaveBeenCalled();
  });
});
