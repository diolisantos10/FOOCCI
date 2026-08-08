/**
 * Portão: o raio-x distingue "custo indeterminado" de "custo zero".
 *
 * Antes, `estimatedCostUsd` null virava 0 (RaioXCollector.ts:126) e o total saía
 * menor que a realidade, calado. Com a coluna passando a gravar null para modelo
 * não precificado, esse consumidor viraria a fonte do defeito velho.
 *
 * Duas metades em toda regra: barra o caso ruim E deixa o caso legítimo passar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const aiLogs = vi.fn();

// Prisma inteiro vira um stub tolerante: qualquer modelo/método devolve vazio.
// Só `aIInteractionLog.findMany` é controlado pelo teste. Os outros blocos da
// coleta ficam indisponíveis, o que não afeta o bloco `ai`.
vi.mock("@/lib/prisma", () => {
  const anyModel: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, method) => {
        if (method === "then") return undefined;
        return async () => (String(method).includes("ount") ? 0 : []);
      },
    },
  );
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, model) => {
        if (model === "then") return undefined;
        if (model === "aIInteractionLog") {
          return { findMany: (...a: unknown[]) => aiLogs(...a), count: async () => 0 };
        }
        if (model === "$queryRaw" || model === "$queryRawUnsafe") return async () => [];
        return anyModel;
      },
    },
  );
  return { prisma };
});

import { collectSample } from "./RaioXCollector";
import type { AiSample } from "../types";

const log = (over: Record<string, unknown> = {}) => ({
  model: "gpt-4o-mini",
  success: true,
  totalTokens: 1_000,
  estimatedCostUsd: 0.25,
  errorMessage: null,
  restaurantId: "r1",
  conversationId: "c1",
  ...over,
});

async function aiBlock(rows: unknown[]): Promise<AiSample> {
  aiLogs.mockResolvedValue(rows);
  const sample = await collectSample();
  expect(sample.ai.ok, `bloco ai indisponível: ${sample.ai.ok ? "" : sample.ai.reason}`).toBe(true);
  return (sample.ai as { ok: true; data: AiSample }).data;
}

beforeEach(() => {
  aiLogs.mockReset();
});

describe("custo indeterminado não vira custo zero", () => {
  // METADE 1 — o caso ruim é barrado.
  it("linha com estimatedCostUsd null é contada como SEM PREÇO, não como zero", async () => {
    const ai = await aiBlock([
      log({ estimatedCostUsd: 0.25 }),
      log({ model: "modelo-novo", estimatedCostUsd: null }),
    ]);

    expect(ai.totalCalls).toBe(2);
    expect(ai.unpricedCalls).toBe(1);
    expect(ai.unpricedModels).toContain("modelo-novo");
    // O custo conhecido é só o da linha precificada — a nula não virou 0 somado.
    expect(ai.knownCostMicroUsd).toBe(250_000);
  });

  it("janela inteira sem preço não devolve custo zero disfarçado", async () => {
    const ai = await aiBlock([
      log({ model: "modelo-novo", estimatedCostUsd: null }),
      log({ model: "modelo-novo", estimatedCostUsd: null }),
    ]);

    expect(ai.knownCostMicroUsd).toBe(0);
    // ...mas a lacuna está declarada, e é ela que separa de "não gastou nada".
    expect(ai.unpricedCalls).toBe(2);
    expect(ai.totalCalls).toBe(2);
  });

  it("a lacuna aparece também no grupo por modelo e na conversa", async () => {
    const ai = await aiBlock([
      log({ model: "modelo-novo", estimatedCostUsd: null, conversationId: "c9" }),
    ]);

    expect(ai.byModel[0].unpricedCalls).toBe(1);
    expect(ai.byModel[0].knownCostMicroUsd).toBe(0);
    expect(ai.heaviestConversations[0].unpricedCalls).toBe(1);
  });

  // METADE 2 — o caso legítimo passa: sem lacuna, o número continua o de sempre.
  it("sem nenhuma linha nula, custo e lacuna se comportam como antes", async () => {
    const ai = await aiBlock([log({ estimatedCostUsd: 0.25 }), log({ estimatedCostUsd: 0.75 })]);

    expect(ai.knownCostMicroUsd).toBe(1_000_000);
    expect(ai.unpricedCalls).toBe(0);
    expect(ai.unpricedModels).toEqual([]);
  });

  it("custo zero REAL continua sendo zero (motor gratuito), sem virar lacuna", async () => {
    const ai = await aiBlock([log({ model: "mock", estimatedCostUsd: 0 })]);

    expect(ai.knownCostMicroUsd).toBe(0);
    expect(ai.unpricedCalls).toBe(0); // zero conhecido ≠ desconhecido
  });

  it("janela vazia: sem chamadas, sem lacuna", async () => {
    const ai = await aiBlock([]);

    expect(ai.totalCalls).toBe(0);
    expect(ai.knownCostMicroUsd).toBe(0);
    expect(ai.unpricedCalls).toBe(0);
  });
});
