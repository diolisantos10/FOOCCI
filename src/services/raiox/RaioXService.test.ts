/**
 * O orquestrador é onde dois guardrails da casa deixam de ser recomendação e
 * viram código. Estes testes existem para que ninguém os "otimize" depois:
 *
 *  • Sonda que não registrou resultado NÃO some e NÃO aprova (guardrail 2).
 *  • Bloco de dado ausente NÃO vira PASS (guardrail 1).
 */

import { describe, it, expect } from "vitest";
import {
  applyComparison,
  computeGlobalStatus,
  flattenMetrics,
  listUnavailableBlocks,
  runProbes,
  getProbes,
} from "./RaioXService";
import { available, unavailable, type RaioXFinding, type RaioXSample } from "./types";

function emptySample(): RaioXSample {
  const u = <T>() => unavailable<T>("banco indisponível neste teste");
  return {
    collectedAt: new Date("2026-08-05T06:00:00Z"),
    ai: u(), messages: u(), print: u(), carts: u(), billing: u(), gates: u(),
    brain: u(), jobs: u(), data: u(), business: u(), source: u(),
  } as RaioXSample;
}

const finding = (over: Partial<RaioXFinding> = {}): RaioXFinding => ({
  probeId: "p", area: "IA", status: "PASS", severity: "INFO",
  title: "t", summary: "s", evidence: [], metrics: {}, recommendation: "r", ...over,
});

describe("veredito global", () => {
  it("PASS só quando tudo registrou resultado e nada acendeu", () => {
    expect(computeGlobalStatus([finding(), finding()])).toBe("PASS");
  });

  it("qualquer UNKNOWN impede PASS — não saber não é estar bem", () => {
    expect(computeGlobalStatus([finding(), finding({ status: "UNKNOWN" })])).toBe("WARNING");
  });

  it("P0 derruba para FAIL", () => {
    expect(computeGlobalStatus([finding(), finding({ severity: "P0" })])).toBe("FAIL");
  });

  it("lista vazia é UNKNOWN, nunca PASS", () => {
    expect(computeGlobalStatus([])).toBe("UNKNOWN");
  });
});

describe("guardrails no orquestrador", () => {
  it("com o banco todo indisponível, NENHUMA sonda devolve PASS", () => {
    const report = runProbes(emptySample());
    expect(report.findings.length).toBe(getProbes().length);
    expect(report.findings.every((f) => f.status === "UNKNOWN")).toBe(true);
    expect(report.globalStatus).toBe("WARNING");
    // e o relatório carrega POR QUE não sabe
    expect(report.unavailableBlocks.length).toBeGreaterThan(0);
    expect(report.unavailableBlocks[0].reason).toContain("banco indisponível");
  });

  it("cada sonda aparece exatamente uma vez, mesmo tendo falhado", () => {
    const report = runProbes(emptySample());
    const ids = new Set(report.findings.map((f) => f.probeId));
    for (const p of getProbes()) expect(ids.has(p.id)).toBe(true);
  });

  it("o texto do UNKNOWN proíbe a leitura de 'aprovado'", () => {
    const report = runProbes(emptySample());
    expect(report.findings[0].recommendation).toContain("Não trate como aprovado");
  });

  it("listUnavailableBlocks nomeia o bloco e preserva o motivo", () => {
    const s = emptySample();
    const blocks = listUnavailableBlocks({ ...s, gates: available({} as never) });
    expect(blocks.some((b) => b.block === "ai")).toBe(true);
    expect(blocks.some((b) => b.block === "gates")).toBe(false);
  });
});

describe("comparação com ontem", () => {
  it("sem base anterior, o delta é null — e não zero, que significaria 'estável'", () => {
    const [f] = applyComparison([finding({ metrics: { presas: 37 } })], null);
    expect(f.deltas).toEqual({ presas: null });
  });

  it("com base anterior, o delta é a variação", () => {
    const [f] = applyComparison([finding({ metrics: { presas: 37 } })], { "p.presas": 4 });
    expect(f.deltas).toEqual({ presas: 33 });
  });

  it("métrica nova numa execução antiga também vira null, não zero", () => {
    const [f] = applyComparison([finding({ metrics: { novaMetrica: 5 } })], { "p.outra": 1 });
    expect(f.deltas).toEqual({ novaMetrica: null });
  });

  it("achatamento usa probeId.metrica como chave estável", () => {
    expect(flattenMetrics([finding({ probeId: "ia-custo", metrics: { chamadas: 10 } })])).toEqual({
      "ia-custo.chamadas": 10,
    });
  });
});

describe("determinismo", () => {
  it("a mesma amostra produz o mesmo conjunto de achados", () => {
    const s = emptySample();
    const a = runProbes(s, { runId: "fixo", now: new Date("2026-08-05T06:00:00Z") });
    const b = runProbes(s, { runId: "fixo", now: new Date("2026-08-05T06:00:00Z") });
    expect(JSON.stringify(a.findings)).toBe(JSON.stringify(b.findings));
  });
});
