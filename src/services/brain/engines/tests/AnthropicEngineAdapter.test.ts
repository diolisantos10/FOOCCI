/**
 * O piloto CLAUDE, nas DUAS gerações de API.
 *
 * Este arquivo reprova a versão errada do adapter: se alguém mandar
 * `temperature` ou o prefill "{" para um modelo da família 5, a API devolve 400,
 * o agente cai no fallback determinístico e a troca de motor vira encenação.
 * Aqui isso quebra a suíte antes de chegar no cliente.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: ai.create };
  },
}));

import { callAnthropic, isGeracao5, __resetAnthropicClient } from "../AnthropicEngineAdapter";
import { FalhaDeMotor } from "../FalhaDeMotor";

function selecao(model: string) {
  return { provider: "CLAUDE" as const, model, reason: "teste" };
}

function responde(texto: string, stop_reason = "end_turn") {
  ai.create.mockResolvedValue({ stop_reason, content: [{ type: "text", text: texto }] });
}

const OLD = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  vi.clearAllMocks();
  __resetAnthropicClient();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});
afterEach(() => {
  __resetAnthropicClient();
  if (OLD === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OLD;
});

describe("isGeracao5", () => {
  it("reconhece a família 5 e as posteriores", () => {
    for (const m of ["claude-opus-5", "claude-opus-5-5", "claude-fable-5-1", "claude-sonnet-5"]) {
      expect(isGeracao5(m), m).toBe(true);
    }
  });
  it("reconhece a geração 4 e anteriores", () => {
    for (const m of ["claude-haiku-4-5", "claude-opus-4-1", "claude-3-5-sonnet"]) {
      expect(isGeracao5(m), m).toBe(false);
    }
  });
});

describe("callAnthropic — família 5", () => {
  it("NÃO manda temperature e NÃO manda prefill de assistente (os dois dão 400)", async () => {
    responde('{"ok":true}');
    await callAnthropic({
      selection: selecao("claude-opus-5"),
      systemPrompt: "seja breve",
      userContent: "oi",
      temperature: 0.2, // o chamador pode mandar; o adapter tem que ENGOLIR
      effort: "low",
    });

    const params = ai.create.mock.calls[0]![0];
    expect(params.temperature).toBeUndefined();
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(params.messages.some((m: { role: string }) => m.role === "assistant")).toBe(false);
  });

  it("leva o botão de latência (effort) para a API", async () => {
    responde('{"ok":true}');
    await callAnthropic({
      selection: selecao("claude-opus-5"),
      systemPrompt: "s",
      userContent: "u",
      effort: "low",
    });
    expect(ai.create.mock.calls[0]![0].output_config).toEqual({ effort: "low" });
  });

  it("devolve o JSON inteiro, e tira a cerca de markdown quando o modelo insiste", async () => {
    responde('```json\n{"intent":"ADD_ITEMS"}\n```');
    const raw = await callAnthropic({ selection: selecao("claude-opus-5"), systemPrompt: "s", userContent: "u" });
    expect(JSON.parse(raw)).toEqual({ intent: "ADD_ITEMS" });
  });

  it("recusa e corte por teto viram falha NOMEADA, não silêncio", async () => {
    responde("", "refusal");
    await expect(
      callAnthropic({ selection: selecao("claude-opus-5"), systemPrompt: "s", userContent: "u" }),
    ).rejects.toMatchObject({ motivo: "recusado" });

    responde("{\"a\":", "max_tokens");
    await expect(
      callAnthropic({ selection: selecao("claude-opus-5"), systemPrompt: "s", userContent: "u" }),
    ).rejects.toMatchObject({ motivo: "cortado_por_limite" });
  });

  it("sem chave, nem chega a ir à rede", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      callAnthropic({ selection: selecao("claude-opus-5"), systemPrompt: "s", userContent: "u" }),
    ).rejects.toBeInstanceOf(FalhaDeMotor);
    expect(ai.create).not.toHaveBeenCalled();
  });
});

describe("callAnthropic — geração 4 (compatibilidade)", () => {
  it("mantém temperature e o prefill que aquela geração aceita", async () => {
    responde('"ok":true}');
    const raw = await callAnthropic({
      selection: selecao("claude-haiku-4-5"),
      systemPrompt: "s",
      userContent: "u",
    });
    const params = ai.create.mock.calls[0]![0];
    expect(params.temperature).toBe(0.2);
    expect(params.messages[1]).toEqual({ role: "assistant", content: "{" });
    expect(JSON.parse(raw)).toEqual({ ok: true });
  });
});
