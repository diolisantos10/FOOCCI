/**
 * A trava, unidade por unidade: em que condições um degrau alto sobrevive.
 *
 * A lista de casos aqui é a definição operacional de "falha fechada": TUDO que
 * não for veredito positivo, fresco e com prova no dado tem que derrubar.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getAgentQualityVerdict,
  guardStoredStage,
  VERDICT_MAX_AGE_HOURS,
  __clearVerdictCache,
} from "./LiveStageGuard";

const AGORA = new Date("2026-08-24T12:00:00.000Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

type Row = Awaited<ReturnType<typeof import("@/services/quality/persistence/QualityAuditStore").getLatestAgentVerdictRow>>;
const loader = (row: Row | (() => never)) => async () => (typeof row === "function" ? row() : row);

const achado = (severity = "P2", status = "PASS") => ({ severity, status });
const runVerde = (idadeHoras = 1): Row => ({
  runId: "run_ok",
  finishedAt: horasAtras(idadeHoras),
  findings: [achado(), achado("INFO", "PASS")],
});

beforeEach(() => __clearVerdictCache());

describe("veredito de qualidade — só verde de verdade é verde", () => {
  const casos: [string, Row | (() => never)][] = [
    ["sem run persistida", null],
    ["run sem achado nenhum do agente (não estourou ≠ verde)", { runId: "r", finishedAt: horasAtras(1), findings: [] }],
    ["achado P0", { runId: "r", finishedAt: horasAtras(1), findings: [achado("P0", "FAIL")] }],
    ["achado FAIL sem P0", { runId: "r", finishedAt: horasAtras(1), findings: [achado("P1", "FAIL")] }],
    ["veredito vencido", { runId: "r", finishedAt: horasAtras(VERDICT_MAX_AGE_HOURS + 0.5), findings: [achado()] }],
    ["data ilegível", { runId: "r", finishedAt: new Date("não-é-data"), findings: [achado()] }],
    ["data no futuro", { runId: "r", finishedAt: new Date(AGORA.getTime() + 5 * 3_600_000), findings: [achado()] }],
    ["serviço de qualidade fora do ar", () => { throw new Error("connection refused"); }],
  ];

  it.each(casos)("%s ⇒ VERMELHO", async (_nome, row) => {
    const v = await getAgentQualityVerdict("waiter", { now: AGORA, loadRow: loader(row) });
    expect(v.green).toBe(false);
    expect(v.reason).toBeTruthy();
  });

  it("veredito positivo, fresco e com achado ⇒ VERDE", async () => {
    const v = await getAgentQualityVerdict("waiter", { now: AGORA, loadRow: loader(runVerde()) });
    expect(v.green).toBe(true);
  });

  it("na fronteira da validade ainda vale; um passo além, não", async () => {
    const dentro = await getAgentQualityVerdict("waiter", { now: AGORA, loadRow: loader(runVerde(VERDICT_MAX_AGE_HOURS - 0.1)) });
    const fora = await getAgentQualityVerdict("waiter", { now: AGORA, loadRow: loader(runVerde(VERDICT_MAX_AGE_HOURS + 0.1)) });
    expect(dentro.green).toBe(true);
    expect(fora.green).toBe(false);
  });
});

describe("guardStoredStage — a queda automática", () => {
  it("degrau alto com portão vermelho cai para o seguro, sem humano no meio", async () => {
    const g = await guardStoredStage({
      agentId: "waiter",
      stored: "RESTAURANT_WIDE",
      safe: "SHADOW_ONLY",
      isElevated: (m) => m !== "SHADOW_ONLY",
      now: AGORA,
      loadRow: loader(null),
    });
    expect(g.effective).toBe("SHADOW_ONLY");
    expect(g.demoted).toBe(true);
    expect(g.reason).toContain("QUEDA AUTOMÁTICA");
  });

  it("degrau alto com portão verde permanece", async () => {
    const g = await guardStoredStage({
      agentId: "waiter",
      stored: "RESTAURANT_WIDE",
      safe: "SHADOW_ONLY",
      isElevated: (m) => m !== "SHADOW_ONLY",
      now: AGORA,
      loadRow: loader(runVerde()),
    });
    expect(g.effective).toBe("RESTAURANT_WIDE");
    expect(g.demoted).toBe(false);
  });

  it("degrau já seguro não consulta veredito nenhum (a trava só segura o alto)", async () => {
    let consultou = false;
    const g = await guardStoredStage({
      agentId: "waiter",
      stored: "SHADOW_ONLY",
      safe: "SHADOW_ONLY",
      isElevated: (m) => m !== "SHADOW_ONLY",
      now: AGORA,
      loadRow: async () => { consultou = true; return null; },
    });
    expect(consultou).toBe(false);
    expect(g.effective).toBe("SHADOW_ONLY");
  });
});
