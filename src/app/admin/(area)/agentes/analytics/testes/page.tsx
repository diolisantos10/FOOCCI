"use client";

import { useState, useCallback } from "react";
import {
  getAnalyticsScenarioGroups,
  type AnalyticsScenarioGroup,
  type AnalyticsScenarioGroupId,
} from "@/services/analytics/testing/analyticsScenarios";
import type { AnalyticsEvalReport, AnalyticsScenarioResult, Verdict } from "@/services/analytics/testing/analyticsEvaluator";

type Mode = "quick" | "group" | "full";

// ─── display helpers ────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  return "text-red-400";
}

function verdictBadge(v: Verdict) {
  const map: Record<Verdict, string> = {
    PASS: "bg-green-900/50 text-green-400",
    WARN: "bg-yellow-900/50 text-yellow-400",
    FAIL: "bg-red-900/50 text-red-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[v]}`}>{v}</span>;
}

// ─── export helpers ─────────────────────────────────────────────────────────

function fmtDateForFilename(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function buildFilename(slug: string, ranAt: string, ext: "json" | "txt"): string {
  return `analytics-test-${slug}-${fmtDateForFilename(ranAt)}.${ext}`;
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildJsonExport(report: AnalyticsEvalReport): Record<string, unknown> {
  return {
    exportedAt:     new Date().toISOString(),
    slug:           report.slug,
    restaurantId:   report.restaurantId,
    restaurantName: report.restaurantName,
    mode:           report.mode,
    ranAt:          report.ranAt,
    durationMs:     report.durationMs,
    summary:        report.summary,
    limitations:    report.limitations,
    results: report.results.map((r) => ({
      id:              r.id,
      group:           r.group,
      groupLabel:      r.groupLabel,
      name:            r.name,
      description:     r.description,
      severity:        r.severity,
      verdict:         r.verdict,
      score:           r.score,
      expectedSummary: r.expectedSummary,
      actualSummary:   r.actualSummary,
      failedChecks:    r.failedChecks,
      warnings:        r.warnings,
      checks:          r.checks,
    })),
  };
}

function buildTxtReport(report: AnalyticsEvalReport): string {
  const dateStr = new Date(report.ranAt).toLocaleString("pt-BR");
  const failed = report.results.filter((r) => r.verdict === "FAIL");
  const warned = report.results.filter((r) => r.verdict === "WARN");
  const passed = report.results.filter((r) => r.verdict === "PASS");

  const lines: string[] = [
    "===========================================",
    `ANALYTICS TEST REPORT -- ${report.restaurantName}`,
    "===========================================",
    `Data:     ${dateStr}`,
    `Slug:     ${report.slug}`,
    `Mode:     ${report.mode}`,
    `Score:    ${report.summary.avgScore}%`,
    `Pass:     ${report.summary.passed}`,
    `Warn:     ${report.summary.warned}`,
    `Fail:     ${report.summary.failed}`,
    `Total:    ${report.summary.total}`,
    `Duration: ${report.durationMs}ms`,
    "",
  ];

  lines.push("-------------------------------------------", `FALHAS (${failed.length})`, "-------------------------------------------", "");
  if (failed.length === 0) {
    lines.push("(nenhuma)", "");
  } else {
    for (const r of failed) {
      lines.push(`[FAIL] ${r.id} -- ${r.groupLabel} (${r.severity})`);
      lines.push(`Descricao: ${r.description}`);
      lines.push(`Expected:  ${r.expectedSummary}`);
      lines.push(`Actual:    ${r.actualSummary}`);
      lines.push("Checks:");
      for (const c of r.checks) lines.push(`  [${c.pass ? "OK  " : "FAIL"}] (${c.severity}) ${c.label} -- ${c.detail}`);
      lines.push("");
    }
  }

  lines.push("-------------------------------------------", `WARNINGS (${warned.length})`, "-------------------------------------------", "");
  if (warned.length === 0) {
    lines.push("(nenhum)", "");
  } else {
    for (const r of warned) {
      lines.push(`[WARN] ${r.id} -- ${r.groupLabel}`);
      lines.push(`Descricao: ${r.description}`);
      lines.push(`Avisos:    ${r.warnings.join("; ")}`);
      lines.push(`Actual:    ${r.actualSummary}`);
      lines.push("");
    }
  }

  lines.push("-------------------------------------------", `PASSOU (${passed.length})`, "-------------------------------------------", "");
  for (const r of passed) lines.push(`[OK] ${r.id} -- ${r.name} (${r.groupLabel})`);
  lines.push("");

  lines.push("-------------------------------------------", "LIMITACOES", "-------------------------------------------", "");
  for (const l of report.limitations) lines.push(`- ${l}`);
  lines.push("");

  lines.push("-------------------------------------------", "ACAO RECOMENDADA", "-------------------------------------------");
  if (failed.length === 0 && warned.length === 0) {
    lines.push("- Tudo verde. Logica de Analytics aprovada para QA tela-a-tela.");
  } else {
    if (failed.length > 0) lines.push("- Revisar as falhas P0/P1 acima antes de iniciar o QA tela-a-tela do Analytics.");
    if (warned.length > 0) lines.push("- Avisos nao bloqueiam, mas indicam divergencias (causas/insights/follow-ups) a conferir.");
  }
  lines.push("");

  return lines.join("\n");
}

// ─── result card ────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: AnalyticsScenarioResult }) {
  const [open, setOpen] = useState(false);
  const border = result.verdict === "FAIL" ? "border-red-800/50" : result.verdict === "WARN" ? "border-yellow-800/50" : "border-gray-700";

  return (
    <div className={`rounded-lg border ${border} bg-gray-900 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {verdictBadge(result.verdict)}
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">{result.id}</span>
            <span className="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-300">{result.groupLabel}</span>
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">{result.severity}</span>
          </div>
          <p className="text-sm text-gray-300 truncate">{result.name}</p>
          <p className="mt-0.5 text-xs text-gray-500 truncate">{result.description}</p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {open ? "Fechar" : "Detalhes"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
          <div className="grid grid-cols-1 gap-1 text-xs">
            <p className="text-gray-500"><span className="text-gray-600">Expected:</span> {result.expectedSummary}</p>
            <p className="text-gray-400"><span className="text-gray-600">Actual:</span> {result.actualSummary}</p>
          </div>
          <div className="space-y-1">
            {result.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={c.pass ? "text-green-400 shrink-0" : "text-red-400 shrink-0"}>{c.pass ? "✓" : "✗"}</span>
                <span className="font-mono text-gray-400 shrink-0">[{c.severity}]</span>
                <span className="text-gray-300 shrink-0">{c.label}</span>
                <span className="text-gray-500">— {c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsTestesPage() {
  const [slug, setSlug] = useState("sushi-cazza");
  const [group, setGroup] = useState<AnalyticsScenarioGroupId | "all">("all");
  const [groups] = useState<AnalyticsScenarioGroup[]>(() => getAnalyticsScenarioGroups());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AnalyticsEvalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async (mode: Mode) => {
    if (!slug.trim()) { setError("Informe o slug do restaurante"); return; }
    setLoading(true);
    setError(null);
    setReport(null);
    setServerWarnings([]);

    const body: { slug: string; mode: Mode; scenarioGroup?: string } = { slug: slug.trim(), mode };
    if (mode === "group" && group !== "all") body.scenarioGroup = group;

    try {
      const res = await fetch("/api/admin/ai/analytics-tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; report?: AnalyticsEvalReport; error?: string; warnings?: string[] };
      if (!data.ok || !data.report) {
        setError(data.error ?? "Erro desconhecido");
      } else {
        setReport(data.report);
        setServerWarnings(data.warnings ?? []);
      }
    } catch {
      setError("Falha de rede ao executar testes");
    } finally {
      setLoading(false);
    }
  }, [slug, group]);

  function handleDownloadJson() {
    if (!report) return;
    triggerDownload(JSON.stringify(buildJsonExport(report), null, 2), buildFilename(report.slug, report.ranAt, "json"), "application/json");
  }
  function handleDownloadTxt() {
    if (!report) return;
    triggerDownload(buildTxtReport(report), buildFilename(report.slug, report.ranAt, "txt"), "text/plain;charset=utf-8");
  }
  async function handleCopy() {
    if (!report) return;
    const txt = buildTxtReport(report);
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      triggerDownload(txt, buildFilename(report.slug, report.ranAt, "txt"), "text/plain;charset=utf-8");
    }
  }

  const failed = report?.results.filter((r) => r.verdict === "FAIL") ?? [];
  const warned = report?.results.filter((r) => r.verdict === "WARN") ?? [];
  const passed = report?.results.filter((r) => r.verdict === "PASS") ?? [];

  const btn = "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Analytics Test Center 📊</h1>
        <p className="text-sm text-gray-400 mt-1">
          Avaliação determinística da lógica de Analytics: diagnóstico, anomalias, retenção/cohort, eficiência operacional,
          analista conversacional e dashboard cockpit. Sem LLM. Sem banco. Sem envios. Sem mutação de dados reais.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 mb-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Slug do restaurante</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="sushi-cazza"
            disabled={loading}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Grupo de cenários</label>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as AnalyticsScenarioGroupId | "all")}
            disabled={loading}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">Todos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label} ({g.count})</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run("quick")} disabled={loading} className={`${btn} bg-gray-700 text-white hover:bg-gray-600`}>
            {loading ? "Executando…" : "Rodar teste rápido"}
          </button>
          <button type="button" onClick={() => run("group")} disabled={loading || group === "all"} className={`${btn} bg-sky-800 text-white hover:bg-sky-700`}>
            Rodar grupo selecionado
          </button>
          <button type="button" onClick={() => run("full")} disabled={loading} className={`${btn} bg-sky-700 text-white hover:bg-sky-600`}>
            Rodar suíte completa
          </button>
        </div>
        {group === "all" && <p className="text-xs text-gray-600">Selecione um grupo para habilitar &ldquo;Rodar grupo selecionado&rdquo;. Teste rápido = cenários P0.</p>}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-sm text-red-400">{error}</div>}

      {serverWarnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-800/40 bg-yellow-950/20 p-3 text-xs text-yellow-400 space-y-1">
          {serverWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Score médio</p>
                <p className={`text-3xl font-bold ${scoreColor(report.summary.avgScore)}`}>{report.summary.avgScore}%</p>
              </div>
              <div className="h-10 w-px bg-gray-800" />
              <div><p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Pass</p><p className="text-xl font-semibold text-green-400">{report.summary.passed}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Warn</p><p className="text-xl font-semibold text-yellow-400">{report.summary.warned}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Fail</p><p className="text-xl font-semibold text-red-400">{report.summary.failed}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Total</p><p className="text-xl font-semibold text-gray-300">{report.summary.total}</p></div>
              <div className="ml-auto text-right">
                <p className="text-[10px] text-gray-600">{report.restaurantName} ({report.slug})</p>
                <p className="text-[10px] text-gray-600">modo: {report.mode} · {report.durationMs}ms</p>
                <p className="text-[10px] text-gray-700">{new Date(report.ranAt).toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-gray-800">
              <div
                className={`h-2 rounded-full transition-all ${report.summary.avgScore >= 90 ? "bg-green-500" : report.summary.avgScore >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${report.summary.avgScore}%` }}
              />
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-gray-800 pt-3">
              <button type="button" onClick={handleDownloadJson} className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"><span className="text-[11px]">⬇</span> Baixar JSON</button>
              <button type="button" onClick={handleDownloadTxt} className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"><span className="text-[11px]">⬇</span> Baixar relatório .txt</button>
              <button type="button" onClick={handleCopy} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${copied ? "border-green-700 bg-green-900/30 text-green-400" : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"}`}><span className="text-[11px]">{copied ? "✓" : "⎘"}</span>{copied ? "Copiado!" : "Copiar relatório"}</button>
            </div>
          </div>

          {failed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-400 mb-2">Falhas ({failed.length})</h2>
              <div className="space-y-2">{failed.map((r) => <ResultCard key={r.id} result={r} />)}</div>
            </div>
          )}

          {warned.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-yellow-400 mb-2">Avisos ({warned.length})</h2>
              <div className="space-y-2">{warned.map((r) => <ResultCard key={r.id} result={r} />)}</div>
            </div>
          )}

          {passed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-green-400 mb-2">Passou ({passed.length})</h2>
              <div className="space-y-2">
                {passed.map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 flex items-center gap-3">
                    {verdictBadge("PASS")}
                    <span className="font-mono text-[11px] text-gray-600">{r.id}</span>
                    <span className="text-xs text-gray-400 truncate">{r.name}</span>
                    <span className="ml-auto text-[11px] text-sky-400 shrink-0">{r.groupLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.limitations.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-2">Limitações da suíte</h2>
              <ul className="space-y-1 text-xs text-gray-500 list-disc pl-4">
                {report.limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
