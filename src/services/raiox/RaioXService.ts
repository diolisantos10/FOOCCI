/**
 * Raio-X — orquestrador (módulo PURO: amostra entra, relatório sai).
 *
 * Não lê banco, não lê arquivo, não chama IA. Recebe a amostra já coletada e
 * roda as sondas sobre ela. Essa separação é o que torna a coleta reproduzível:
 * a mesma amostra produz sempre o mesmo relatório, e é por isso que "piorou
 * desde ontem" significa alguma coisa.
 *
 * Duas regras da casa viram código aqui, não recomendação:
 *
 *  • Sonda que explode ou devolve lista vazia NÃO some do relatório: vira
 *    UNKNOWN com o motivo. Esquecer nunca pode significar "aprovado"
 *    (guardrail 2).
 *  • Qualquer UNKNOWN impede o veredito global de ser PASS. "Não consegui
 *    olhar" não é "está tudo bem" (guardrail 1).
 */

import type {
  PreviousMetrics,
  RaioXContext,
  RaioXFinding,
  RaioXProbe,
  RaioXReport,
  RaioXSample,
  RaioXSeverity,
  RaioXStatus,
} from "./types";
import { DataUnavailableError } from "./types";
import { SOURCE_PROBES } from "./probes/sourceProbes";
import { RUNTIME_PROBES } from "./probes/runtimeProbes";

/** Registro em código. A ordem é estável e intencional: dinheiro, depois risco. */
const REGISTRY: readonly RaioXProbe[] = [...RUNTIME_PROBES, ...SOURCE_PROBES];

export function getProbes(): RaioXProbe[] {
  return [...REGISTRY];
}

export function countByStatus(findings: readonly RaioXFinding[]): Record<RaioXStatus, number> {
  const out: Record<RaioXStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0, UNKNOWN: 0 };
  for (const f of findings) out[f.status] += 1;
  return out;
}

export function countBySeverity(findings: readonly RaioXFinding[]): Record<RaioXSeverity, number> {
  const out: Record<RaioXSeverity, number> = { P0: 0, P1: 0, P2: 0, INFO: 0 };
  for (const f of findings) out[f.severity] += 1;
  return out;
}

/**
 * FAIL  se houver P0 ou FAIL
 * WARNING se houver P1/P2/WARNING **ou qualquer UNKNOWN**
 * PASS  só quando todas as sondas registraram resultado e nada acendeu.
 */
export function computeGlobalStatus(findings: readonly RaioXFinding[]): RaioXStatus {
  if (findings.length === 0) return "UNKNOWN"; // nenhuma sonda registrou nada
  let warning = false;
  for (const f of findings) {
    if (f.severity === "P0" || f.status === "FAIL") return "FAIL";
    if (f.status === "UNKNOWN" || f.status === "WARNING" || f.severity === "P1" || f.severity === "P2") {
      warning = true;
    }
  }
  return warning ? "WARNING" : "PASS";
}

/** Achado de "não sei", com o motivo preservado. Nunca é PASS. */
function unknownFinding(probe: RaioXProbe, reason: string, severity: RaioXSeverity): RaioXFinding {
  return {
    probeId: probe.id,
    area: probe.area,
    status: "UNKNOWN",
    severity,
    title: `Não consegui verificar: ${probe.question}`,
    summary: reason,
    evidence: [`sonda "${probe.id}" não concluiu`],
    metrics: {},
    recommendation:
      "Este item ficou SEM RESPOSTA nesta madrugada. Não trate como aprovado — a coleta não olhou.",
  };
}

/** Achatamento `probeId.metrica` usado para comparar com a execução anterior. */
export function flattenMetrics(findings: readonly RaioXFinding[]): PreviousMetrics {
  const out: PreviousMetrics = {};
  for (const f of findings) {
    for (const [k, v] of Object.entries(f.metrics)) out[`${f.probeId}.${k}`] = v;
  }
  return out;
}

/**
 * Preenche `deltas`. Métrica sem base anterior recebe `null` — e não zero, que
 * seria lido como "estável".
 */
export function applyComparison(
  findings: readonly RaioXFinding[],
  previous: PreviousMetrics | null,
): RaioXFinding[] {
  return findings.map((f) => {
    const deltas: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(f.metrics)) {
      const before = previous?.[`${f.probeId}.${k}`];
      deltas[k] = previous && typeof before === "number" ? v - before : null;
    }
    return { ...f, deltas };
  });
}

export interface RunOptions {
  runId?: string;
  now?: Date;
  /** Métricas da última execução persistida, para o cálculo de variação. */
  previous?: { runId: string; at: Date; metrics: PreviousMetrics } | null;
}

function newRunId(now: Date): string {
  return `rx_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Blocos da amostra que não vieram — vão inteiros para o relatório. */
export function listUnavailableBlocks(sample: RaioXSample): { block: string; reason: string }[] {
  const out: { block: string; reason: string }[] = [];
  for (const [name, value] of Object.entries(sample)) {
    if (value && typeof value === "object" && "ok" in value && value.ok === false) {
      out.push({ block: name, reason: String((value as { reason: string }).reason) });
    }
  }
  return out;
}

/** Roda todas as sondas sobre a amostra. Nunca lança. */
export function runProbes(sample: RaioXSample, opts: RunOptions = {}): RaioXReport {
  const now = opts.now ?? new Date();
  const ctx: RaioXContext = { runId: opts.runId ?? newRunId(now), now };
  const startedAt = new Date(now);

  const findings: RaioXFinding[] = [];
  for (const probe of REGISTRY) {
    let out: RaioXFinding[];
    try {
      out = probe.run(sample, ctx);
    } catch (err) {
      // "Não sei porque o dado não veio" e "não sei porque a sonda quebrou" são
      // coisas diferentes, e a segunda é mais grave: significa que o
      // instrumento está com defeito.
      out =
        err instanceof DataUnavailableError
          ? [unknownFinding(probe, err.reason, "P2")]
          : [
              unknownFinding(
                probe,
                `a sonda falhou: ${err instanceof Error ? err.message : String(err)}`,
                "P1",
              ),
            ];
    }
    if (out.length === 0) {
      out = [
        unknownFinding(
          probe,
          "a sonda rodou e não registrou nenhum resultado — portão que não registra resultado não aprova",
          "P1",
        ),
      ];
    }
    findings.push(...out);
  }

  const compared = applyComparison(findings, opts.previous?.metrics ?? null);

  return {
    runId: ctx.runId,
    startedAt,
    finishedAt: new Date(),
    probeIds: REGISTRY.map((p) => p.id),
    findings: compared,
    countsByStatus: countByStatus(compared),
    countsBySeverity: countBySeverity(compared),
    globalStatus: computeGlobalStatus(compared),
    comparedToRunId: opts.previous?.runId ?? null,
    comparedToAt: opts.previous?.at ?? null,
    unavailableBlocks: listUnavailableBlocks(sample),
  };
}
