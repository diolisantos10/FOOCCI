/**
 * Pure report builder for the WA Pedido Texto — Scenario Runner.
 *
 * Turns a WaScenarioRunReport into the paste-ready plain-text report emitted by
 * the "Copiar relatório / Baixar TXT" buttons. Failed scenarios come first, each
 * with its checks and a compact transcript. No DOM, no React — unit-testable.
 */

import { buildDiagnosticReportText, type DiagnosticReportSection } from "./diagnosticReport";
import type {
  WaScenarioRunReport,
  WaScenarioResult,
} from "@/services/whatsapp/ordering/WhatsAppOrderingScenarioRunner";

const ICON: Record<string, string> = { PASS: "✅", WARN: "⚠️", FAIL: "❌" };

function scenarioSection(r: WaScenarioResult): DiagnosticReportSection {
  const rows: DiagnosticReportSection["rows"] = [];

  rows.push({ label: "veredicto", value: `${ICON[r.verdict] ?? ""} ${r.verdict}` });
  rows.push({ label: "categoria", value: r.category });
  rows.push({ label: "stage final", value: r.finalStage });
  rows.push({ label: "status final", value: r.finalStatus });
  if (r.finalItems.length > 0) {
    rows.push({
      label: "itens finais",
      value: r.finalItems.map(i => `${i.quantity}× ${i.name}${i.variant ? ` ${i.variant}` : ""}`).join(", "),
    });
  }

  // Checks
  for (const c of r.checks) {
    rows.push({ label: `  ${ICON[c.severity] ?? ""} ${c.label}`, value: c.detail });
  }

  // Transcript
  for (const s of r.steps) {
    rows.push({ label: `  → cliente (passo ${s.index + 1})`, value: s.message });
    rows.push({ label: `  ← agente [${s.stage}]`, value: s.suggestedReply || "—" });
  }

  if (r.sideEffectsPerformed.length > 0) {
    rows.push({ label: "  efeitos colaterais", value: r.sideEffectsPerformed.join(", ") });
  }

  return { title: `Cenário: ${r.name} (${r.id})`, rows };
}

export function buildScenarioRunnerReport(report: WaScenarioRunReport): string {
  const sections: DiagnosticReportSection[] = [];

  // Overview first
  sections.push({
    title: "Resumo da bateria",
    rows: [
      { label: "suíte",      value: report.suite },
      { label: "total",      value: report.total },
      { label: "✅ pass",    value: report.pass },
      { label: "⚠️ warn",    value: report.warn },
      { label: "❌ fail",    value: report.fail },
      { label: "score",      value: `${report.score}/100` },
    ],
  });

  // Failed first (results are already sorted FAIL → WARN → PASS by the runner)
  for (const r of report.results) {
    sections.push(scenarioSection(r));
  }

  const verdict = report.fail > 0
    ? `❌ ${report.fail} cenário(s) com falha`
    : report.warn > 0
      ? `⚠️ ${report.warn} cenário(s) com alerta`
      : `✅ todos os ${report.total} cenários passaram`;

  return buildDiagnosticReportText({
    tool:       "WA Pedido Texto — Scenario Runner",
    restaurant: report.restaurant.name,
    slug:       report.restaurant.slug,
    verdict,
    inputs: {
      suíte:     report.suite,
      cenários:  report.total,
      score:     `${report.score}/100`,
      "rodado em": report.ranAt,
    },
    sections,
    safetyNotes: [
      "todos os cenários rodaram em DRY_RUN_ONLY com allowSideEffects=false",
      "nenhuma mensagem WhatsApp enviada, nenhum pedido real criado, nenhum Pix real gerado",
      report.fail === 0
        ? "nenhuma violação de segurança detectada"
        : "verifique cenários com FAIL — podem indicar efeito colateral ou regressão",
    ],
  });
}
