/**
 * Portões da agregação de custo. Duas metades por regra.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateCost,
  agentBucket,
  providerOf,
  UNATTRIBUTED,
  UNKNOWN_PROVIDER,
  type UsageRow,
} from "./costAggregation";
import { estimateCostUsd } from "./modelPricing";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  model: "gpt-4o-mini",
  agentSlug: "waiter",
  promptTokens: 1_000,
  completionTokens: 500,
  ...over,
});

describe("soma por provedor bate com a soma das linhas", () => {
  // METADE 1 — com linhas de vários provedores, o total tem de fechar.
  it("total por provedor === soma linha a linha === total geral", () => {
    const rows: UsageRow[] = [
      row({ model: "gpt-4o-mini" }),
      row({ model: "gpt-4o", promptTokens: 3_000, completionTokens: 900 }),
      row({ model: "claude-haiku-4-5-20251001", promptTokens: 2_000, completionTokens: 400 }),
      row({ model: "gemini-2.5-flash", promptTokens: 700, completionTokens: 100 }),
      row({ model: "text-embedding-3-small", promptTokens: 50_000, completionTokens: 0 }),
    ];

    const somaLinhaALinha = rows.reduce((acc, r) => {
      const c = estimateCostUsd(r.model, r.promptTokens, r.completionTokens);
      return acc + (c.costUsd ?? 0);
    }, 0);

    const report = aggregateCost(rows);
    const somaProvedores = report.byProvider.reduce((a, b) => a + b.knownCostUsd, 0);
    const somaModelos = report.byModel.reduce((a, b) => a + b.knownCostUsd, 0);

    expect(somaProvedores).toBeCloseTo(somaLinhaALinha, 6);
    expect(somaModelos).toBeCloseTo(somaLinhaALinha, 6);
    expect(report.total.knownCostUsd).toBeCloseTo(somaLinhaALinha, 6);
    expect(report.total.calls).toBe(rows.length);
  });

  // METADE 2 — linha não precificada não some nem vira zero somado.
  it("linha não precificada fica FORA do custo e visível como unpriced", () => {
    const rows: UsageRow[] = [
      row({ model: "gpt-4o-mini" }),
      row({ model: "modelo-fantasma", promptTokens: 999_999, completionTokens: 999_999 }),
    ];

    const report = aggregateCost(rows);
    const soPrecificado = estimateCostUsd("gpt-4o-mini", 1_000, 500).costUsd!;

    // O gasto conhecido é SÓ o da linha precificada — a fantasma não inflou nada.
    expect(report.total.knownCostUsd).toBeCloseTo(soPrecificado, 6);
    // Mas ela NÃO sumiu: aparece contada e nomeada.
    expect(report.total.calls).toBe(2);
    expect(report.total.unpricedCalls).toBe(1);
    expect(report.total.unpricedModels).toContain("modelo-fantasma");
    expect(report.total.status).toBe("PARTIAL");
  });

  it("modelo desconhecido não é atribuído ao provedor OpenAI", () => {
    expect(providerOf("modelo-fantasma")).toBe(UNKNOWN_PROVIDER);
    expect(providerOf("gpt-4o-mini")).toBe("OPENAI");

    const report = aggregateCost([row({ model: "modelo-fantasma" })]);
    expect(report.byProvider.map((b) => b.key)).toEqual([UNKNOWN_PROVIDER]);
    expect(report.byProvider.map((b) => b.key)).not.toContain("OPENAI");
  });
});

describe("log sem agentSlug não é atribuído a nenhum agente", () => {
  // METADE 1 — o caso ruim é barrado: nulo/vazio nunca cai num agente real.
  it.each([undefined, null, "", "   "])("agentSlug %j vai para o balde não atribuído", (slug) => {
    const report = aggregateCost([
      row({ agentSlug: slug as string | null | undefined, model: "gpt-4o-mini" }),
    ]);

    expect(report.byAgent.map((b) => b.key)).toEqual([UNATTRIBUTED]);
    expect(agentBucket(report, "waiter").calls).toBe(0);
    expect(agentBucket(report, "waiter").knownCostUsd).toBe(0);
    expect(agentBucket(report, "waiter").status).toBe("NO_USAGE");
  });

  it("custo de log sem agente NÃO entra no total de nenhum agente nomeado", () => {
    const report = aggregateCost([
      row({ agentSlug: "waiter", promptTokens: 1_000, completionTokens: 0 }),
      row({ agentSlug: null, promptTokens: 9_000, completionTokens: 0 }),
    ]);

    const waiter = agentBucket(report, "waiter");
    const naoAtribuido = agentBucket(report, UNATTRIBUTED);

    expect(waiter.promptTokens).toBe(1_000);
    expect(naoAtribuido.promptTokens).toBe(9_000);
    // Somados, fecham o total — nada se perde, nada é misturado.
    expect(waiter.knownCostUsd + naoAtribuido.knownCostUsd).toBeCloseTo(report.total.knownCostUsd, 6);
  });

  // METADE 2 — o caso legítimo passa: slug preenchido É atribuído.
  it("agentSlug preenchido é atribuído ao agente certo", () => {
    const report = aggregateCost([
      row({ agentSlug: "waiter" }),
      row({ agentSlug: "crm" }),
      row({ agentSlug: "  waiter  " }), // com espaço, mesmo agente
    ]);

    expect(agentBucket(report, "waiter").calls).toBe(2);
    expect(agentBucket(report, "crm").calls).toBe(1);
    expect(agentBucket(report, UNATTRIBUTED).calls).toBe(0);
  });
});

describe("os três estados que a tela precisa distinguir", () => {
  it("PRICED — usou e sabemos quanto", () => {
    const b = agentBucket(aggregateCost([row({ agentSlug: "waiter" })]), "waiter");
    expect(b.status).toBe("PRICED");
    expect(b.knownCostUsd).toBeGreaterThan(0);
  });

  it("UNPRICED — usou e NÃO sabemos quanto (diferente de zero)", () => {
    const b = agentBucket(
      aggregateCost([row({ agentSlug: "waiter", model: "modelo-fantasma" })]),
      "waiter",
    );
    expect(b.status).toBe("UNPRICED");
    expect(b.calls).toBe(1);
    expect(b.unpricedCalls).toBe(1);
  });

  it("NO_USAGE — não usou (diferente de usou-e-não-sabemos)", () => {
    const b = agentBucket(aggregateCost([]), "crm");
    expect(b.status).toBe("NO_USAGE");
    expect(b.calls).toBe(0);
  });

  it("os três estados são distinguíveis entre si", () => {
    const naoUsou = agentBucket(aggregateCost([]), "crm");
    const usouSemPreco = agentBucket(
      aggregateCost([row({ agentSlug: "crm", model: "modelo-fantasma" })]),
      "crm",
    );
    // Ambos têm knownCostUsd === 0. Se a tela olhasse só o número, seriam iguais.
    expect(naoUsou.knownCostUsd).toBe(usouSemPreco.knownCostUsd);
    // O status é o que os separa — e é por isso que ele existe.
    expect(naoUsou.status).not.toBe(usouSemPreco.status);
  });
});
