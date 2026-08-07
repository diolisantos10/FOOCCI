/**
 * Portão de FIAÇÃO: prova que a regra pura chega mesmo ao payload gravado.
 *
 * Mockamos SÓ o prisma. O módulo de preço NÃO é mockado de propósito — a lição
 * da vitrine é que uma regra correta ficou invisível porque o teste mockava o
 * módulo inteiro que a continha. Aqui o preço é calculado de verdade.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { aIInteractionLog: { create: (...a: unknown[]) => create(...a) } },
}));

import { AIInteractionLogger } from "./AIInteractionLogger";

const base = {
  restaurantId: "r1",
  conversationId: "c1",
  promptTokens: 10_000,
  completionTokens: 5_000,
  latencyMs: 120,
  turnNumber: 1,
  toolCalls: [],
  success: true,
};

const payload = () => create.mock.calls[0][0].data;

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({});
});

describe("custo gravado", () => {
  // METADE 1 — modelo desconhecido grava NULL, não o preço do gpt-4o.
  it("modelo desconhecido grava estimatedCostUsd = null", async () => {
    await AIInteractionLogger.log({ ...base, model: "deepseek-chat" });

    const gpt4oCost = (10_000 / 1000) * 0.0025 + (5_000 / 1000) * 0.01;
    expect(payload().estimatedCostUsd).toBeNull();
    expect(payload().estimatedCostUsd).not.toBe(gpt4oCost);
  });

  // METADE 2 — modelo conhecido continua gravando o número certo.
  it("modelo conhecido grava o custo calculado", async () => {
    await AIInteractionLogger.log({ ...base, model: "gpt-4o-mini" });

    expect(payload().estimatedCostUsd).toBeCloseTo(
      (10_000 / 1000) * 0.00015 + (5_000 / 1000) * 0.0006,
      10,
    );
  });
});

describe("agentSlug gravado", () => {
  // METADE 1 — ausente/vazio grava NULL, nunca um agente chutado.
  it.each([undefined, null, "", "   "])("agentSlug %j grava null", async (slug) => {
    await AIInteractionLogger.log({
      ...base,
      model: "gpt-4o-mini",
      agentSlug: slug as string | null | undefined,
    });

    expect(payload().agentSlug).toBeNull();
  });

  // METADE 2 — slug conhecido é gravado (e normalizado).
  it("agentSlug conhecido é gravado", async () => {
    await AIInteractionLogger.log({ ...base, model: "gpt-4o-mini", agentSlug: "  waiter " });
    expect(payload().agentSlug).toBe("waiter");
  });
});

describe("falha de log nunca quebra o fluxo do cliente", () => {
  it("erro do prisma é engolido", async () => {
    create.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      AIInteractionLogger.log({ ...base, model: "gpt-4o-mini" }),
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });
});
