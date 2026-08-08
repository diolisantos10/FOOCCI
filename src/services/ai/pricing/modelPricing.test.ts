/**
 * Portões da tabela de preços.
 *
 * Cada regra tem DUAS metades: a que prova que o caso ruim é barrado E a que
 * prova que o caso legítimo passa. Detector que só barra vira carimbo.
 */

import { describe, it, expect } from "vitest";
import {
  MODEL_PRICES,
  estimateCostUsd,
  findModelPrice,
  isKnownModel,
} from "./modelPricing";

// ── A REGRESSÃO DO BLOCO ──────────────────────────────────────────────────────
// O fallback silencioso era `?? [0.0025, 0.01]` — o preço do gpt-4o. Qualquer
// modelo desconhecido saía cobrado como gpt-4o.
const GPT4O_COST_FOR = (p: number, c: number) => (p / 1000) * 0.0025 + (c / 1000) * 0.01;

describe("modelo desconhecido NÃO vira preço de gpt-4o", () => {
  // METADE 1 — o caso ruim é barrado.
  it.each([
    "deepseek-chat",
    "gpt-5-turbo",
    "modelo-que-nao-existe",
    "",
    "   ",
  ])("modelo desconhecido %j sai UNPRICED com custo null", (model) => {
    const r = estimateCostUsd(model, 10_000, 5_000);

    expect(r.status).toBe("UNPRICED");
    expect(r.costUsd).toBeNull();
    // O ponto central: não é zero disfarçado nem preço de outro modelo.
    expect(r.costUsd).not.toBe(0);
    expect(r.costUsd).not.toBe(GPT4O_COST_FOR(10_000, 5_000));
    expect(r.provider).toBeNull();
    // O alerta carrega a própria evidência: a frase diz qual modelo.
    expect(r.reason).toMatch(/não está na tabela|indeterminado/i);
  });

  it("modelo desconhecido NUNCA custa o mesmo que gpt-4o com os mesmos tokens", () => {
    const desconhecido = estimateCostUsd("deepseek-chat", 1_000_000, 1_000_000);
    const gpt4o = estimateCostUsd("gpt-4o", 1_000_000, 1_000_000);

    expect(gpt4o.costUsd).toBeTypeOf("number");
    expect(desconhecido.costUsd).toBeNull();
    expect(desconhecido.costUsd).not.toEqual(gpt4o.costUsd);
  });

  // METADE 2 — o caso legítimo passa. Sem isto, bastaria devolver null sempre.
  it("modelo conhecido continua sendo precificado com o número certo", () => {
    const r = estimateCostUsd("gpt-4o-mini", 10_000, 5_000);

    expect(r.status).toBe("PRICED");
    expect(r.costUsd).toBeCloseTo(10_000 / 1000 * 0.00015 + 5_000 / 1000 * 0.0006, 10);
    expect(r.provider).toBe("OPENAI");
  });

  it("gpt-4o preserva exatamente a tarifa que já era usada em produção", () => {
    const r = estimateCostUsd("gpt-4o", 10_000, 5_000);

    expect(r.status).toBe("PRICED");
    expect(r.costUsd).toBeCloseTo(GPT4O_COST_FOR(10_000, 5_000), 10);
  });
});

describe("unidade de cobrança que não é token não vira custo zero", () => {
  // METADE 1 — whisper e gpt-image-1 são cobrados por minuto/imagem. Estimar por
  // token daria número errado com cara de certo.
  it.each(["whisper-1", "gpt-image-1"])("%s sai NOT_TOKEN_PRICED, não zero", (model) => {
    const r = estimateCostUsd(model, 5_000, 1_000);

    expect(r.status).toBe("NOT_TOKEN_PRICED");
    expect(r.costUsd).toBeNull();
    expect(isKnownModel(model)).toBe(true); // é conhecido, só não é por token
  });

  // METADE 2 — zero CONHECIDO existe e é diferente de desconhecido.
  it.each(["mock", "local"])("%s é FREE com custo zero conhecido", (model) => {
    const r = estimateCostUsd(model, 5_000, 1_000);

    expect(r.status).toBe("FREE");
    expect(r.costUsd).toBe(0);
  });
});

describe("proveniência é obrigatória em toda linha", () => {
  it("toda linha carrega source, data e onde o modelo é chamado", () => {
    expect(MODEL_PRICES.length).toBeGreaterThan(0);
    for (const p of MODEL_PRICES) {
      expect(p.source, `${p.model} sem source`).toBeTruthy();
      expect(p.asOf, `${p.model} sem asOf`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.usedAt, `${p.model} sem usedAt`).toBeTruthy();
    }
  });

  it("linha cobrada por token tem as duas tarifas definidas", () => {
    for (const p of MODEL_PRICES.filter((x) => x.billingUnit === "TOKENS")) {
      expect(p.inputUsdPer1k, `${p.model} sem tarifa de entrada`).toBeTypeOf("number");
      expect(p.outputUsdPer1k, `${p.model} sem tarifa de saída`).toBeTypeOf("number");
    }
  });

  it("cobre os modelos que o projeto realmente chama", () => {
    // Confirmados por leitura do código, não inventados.
    for (const model of [
      "gpt-4o-mini",              // AIEngineRouter.ts:16
      "gpt-4o",                   // AgentTrainingEvaluatorService.ts:15
      "text-embedding-3-small",   // KnowledgeEmbeddingService.ts:22
      "claude-haiku-4-5-20251001",// AIEngineRouter.ts:17
      "gemini-2.5-flash",         // AIEngineRouter.ts:18
      "whisper-1",                // TranscriptionAdapter.ts:135
      "gpt-image-1",              // imageEnhancement/providers/openai.ts:17
    ]) {
      expect(findModelPrice(model), `${model} deveria estar na tabela`).not.toBeNull();
    }
  });

  it("NÃO inventa modelo que o projeto não chama", () => {
    // DeepSeek aparece só num regex de scanner e numa lista de imports proibidos
    // (raiox/noSideEffects.test.ts:35) — o projeto não chama DeepSeek.
    expect(findModelPrice("deepseek-chat")).toBeNull();
  });
});

describe("módulo é puro", () => {
  it("não importa prisma — regra de preço tem de ser testável sozinha", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("./modelPricing.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from ["'].*prisma/);
  });
});
