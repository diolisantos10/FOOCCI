import { describe, it, expect, vi } from "vitest";

/*
  PRAZO PRÓPRIO PARA O ARQUIVO INTEIRO, e a causa é uma só.

  Todo caso deste arquivo passa por `runAll()`, que executa TODOS os auditores —
  inclusive os que rodam baterias de cenário. Isso leva vários segundos por
  natureza, contra o limite padrão de 5s do vitest. Rodando sozinho ele passa;
  na bateria completa, disputando CPU, reprova por CARGA — e a falha não tem
  relação nenhuma com o que mudou no commit.

  Este é o TERCEIRO teste desta pasta a reprovar assim em um único dia (os outros
  dois foram `noSideEffects` e `runRequest`, corrigidos hoje um a um). Três
  ocorrências não são azar: é a família inteira medindo determinismo com um
  cronômetro pensado para teste unitário. Portão que reprova por sorte ensina a
  rodar de novo até passar — e aí deixou de ser portão.

  Nenhuma asserção foi afrouxada. O que se mede aqui é CONTEÚDO, nunca velocidade.
  Se um dia estourar 60s, aí sim é sinal de verdade: algum auditor ficou lento.
*/
vi.setConfig({ testTimeout: 60_000 });

import {
  buildExecutiveSummary,
  emptyExecutiveSummary,
  statusLabel,
  buildAuditJson,
  buildAuditTxt,
  sortFindings,
} from "./dashboardModel";
import { getAuditors, runAll } from "./QualityControlService";
import type { AuditFinding, AuditRunResult } from "./types";

function finding(p: Partial<AuditFinding>): AuditFinding {
  return {
    runId: "r", auditorId: "a", status: "PASS", severity: "INFO",
    title: "t", summary: "s", evidence: [], affectedArea: "area",
    recommendation: "rec", createdAt: new Date(0), ...p,
  };
}

function resultWith(findings: AuditFinding[]): AuditRunResult {
  const countsBySeverity = { P0: 0, P1: 0, P2: 0, INFO: 0 };
  const countsByStatus = { PASS: 0, WARNING: 0, FAIL: 0 };
  for (const f of findings) { countsBySeverity[f.severity]++; countsByStatus[f.status]++; }
  const globalStatus = countsBySeverity.P0 || countsByStatus.FAIL ? "FAIL"
    : countsBySeverity.P1 || countsBySeverity.P2 || countsByStatus.WARNING ? "WARNING" : "PASS";
  return {
    runId: "run_x", startedAt: new Date(0), finishedAt: new Date(0),
    auditorIds: ["waiter"], findings, countsBySeverity, countsByStatus, globalStatus,
  };
}

describe("Quality Control — dashboard model", () => {
  it("page model uses the auditor registry for the 'Auditores' card", () => {
    expect(emptyExecutiveSummary().auditors).toBe(getAuditors().length);
    const res = resultWith([finding({})]);
    expect(buildExecutiveSummary(res).auditors).toBe(getAuditors().length);
  });

  it("empty summary is a clean PASS with zero counts before any run", () => {
    const s = emptyExecutiveSummary();
    expect(s).toMatchObject({ passed: 0, attention: 0, failed: 0, p0Open: 0, auditorsRun: 0, globalStatus: "PASS" });
  });

  it("summary computes status counts from a real result", () => {
    const res = resultWith([
      finding({ status: "WARNING", severity: "P1" }),
      finding({ status: "PASS", severity: "INFO" }),
      finding({ status: "FAIL", severity: "P0" }),
    ]);
    const s = buildExecutiveSummary(res);
    expect(s.passed).toBe(1);
    expect(s.attention).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.p0Open).toBe(1);
    expect(s.globalStatus).toBe("FAIL");
  });

  it("statusLabel maps to PT-BR", () => {
    expect(statusLabel("PASS")).toBe("Verde");
    expect(statusLabel("WARNING")).toBe("Atenção");
    expect(statusLabel("FAIL")).toBe("Falhou");
  });

  it("sortFindings orders worst-first (P0 → INFO)", () => {
    const out = sortFindings([
      finding({ severity: "INFO" }),
      finding({ severity: "P0" }),
      finding({ severity: "P2" }),
      finding({ severity: "P1" }),
    ]);
    expect(out.map((f) => f.severity)).toEqual(["P0", "P1", "P2", "INFO"]);
  });

  it("builds copyable JSON and TXT reports from a real run", async () => {
    const res = await runAll({ runId: "run_copy", now: new Date("2026-06-08T03:00:00Z") });
    const json = buildAuditJson(res);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).runId).toBe("run_copy");

    const txt = buildAuditTxt(res);
    expect(txt).toContain("CONTROLE DE QUALIDADE");
    expect(txt).toContain("run_copy");
    expect(txt).toContain("FINDINGS");
  });
});
