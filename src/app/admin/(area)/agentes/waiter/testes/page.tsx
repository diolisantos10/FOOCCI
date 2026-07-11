"use client";

import { useState, useEffect, useCallback } from "react";
import { QualityTabs } from "../../../QualityTabs";
import { getScenarioGroups, type ScenarioGroup } from "@/services/ai/waiter/testing/waiterScenarios";
import type { EvalReport, ScenarioResult } from "@/services/ai/waiter/testing/waiterEvaluator";

// ─── types ────────────────────────────────────────────────────────────────────

interface RestaurantOption {
  id:   string;
  name: string;
  slug: string;
}

// ─── display helpers ─────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  return "text-red-400";
}

function statusBadge(pass: boolean) {
  return pass
    ? <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-[11px] font-semibold text-green-400">PASS</span>
    : <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-[11px] font-semibold text-red-400">FAIL</span>;
}

// ─── export helpers ───────────────────────────────────────────────────────────

function fmtDateForFilename(iso: string): string {
  const d   = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function buildFilename(slug: string, ranAt: string, ext: "json" | "txt"): string {
  return `waiter-test-${slug}-${fmtDateForFilename(ranAt)}.${ext}`;
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildJsonExport(
  report:         EvalReport,
  restaurantSlug: string,
  selectedGroups: Set<string>,
): Record<string, unknown> {
  return {
    exportedAt:     new Date().toISOString(),
    restaurantSlug,
    selectedGroups: selectedGroups.size > 0 ? Array.from(selectedGroups) : "all",
    restaurantId:   report.restaurantId,
    restaurantName: report.restaurantName,
    ranAt:          report.ranAt,
    durationMs:     report.durationMs,
    summary:        report.summary,
    results: report.results.map((r: ScenarioResult) => ({
      id:          r.id,
      group:       r.group,
      groupLabel:  r.groupLabel,
      description: r.description,
      message:     r.message,
      pass:        r.pass,
      checks:      r.checks,
      aiResponse:  r.aiResponse,
    })),
  };
}

function buildTxtReport(report: EvalReport, restaurantSlug: string): string {
  const dateStr       = new Date(report.ranAt).toLocaleString("pt-BR");
  const failedResults = report.results.filter((r: ScenarioResult) => !r.pass);
  const passedResults = report.results.filter((r: ScenarioResult) => r.pass);

  // Recommendations based on which check types failed
  const failedCheckTypes = new Set<string>(
    failedResults.flatMap((r: ScenarioResult) =>
      r.checks.filter((c) => !c.pass).map((c) => c.type as string),
    ),
  );
  const recommendations: string[] = [];
  if (failedCheckTypes.has("no_forbidden_denial"))
    recommendations.push("- Revisar priority intent guard em WaiterBrainV2.handleUserMessage (frases de grupo/porcao)");
  if (failedCheckTypes.has("includes_shareable"))
    recommendations.push("- Verificar isShareable() e catalogo (servingSize >= 2, keywords de combo/grupo)");
  if (failedCheckTypes.has("cards_not_empty"))
    recommendations.push("- Catalogo pode nao ter itens suficientes para este cenario ou modo retornou sem cards");
  if (failedCheckTypes.has("has_real_cards") || failedCheckTypes.has("no_hallucination"))
    recommendations.push("- Verificar filtro de IDs em WaiterBrainV2 — possivel regressao de alucinacao");
  if (failedCheckTypes.has("includes_category"))
    recommendations.push("- Verificar mapeamento de categorias no catalogo e regras de filtragem por categoria");

  const lines: string[] = [
    "===========================================",
    `WAITER TEST REPORT -- ${report.restaurantName}`,
    "===========================================",
    `Data:    ${dateStr}`,
    `Slug:    ${restaurantSlug}`,
    `Score:   ${report.summary.score}% (${report.summary.passed}/${report.summary.total} passou)`,
    `Falhas:  ${report.summary.failed}`,
    `Duracao: ${report.durationMs}ms`,
    "",
  ];

  if (failedResults.length > 0) {
    lines.push("-------------------------------------------");
    lines.push(`FALHAS (${failedResults.length})`);
    lines.push("-------------------------------------------");
    lines.push("");
    for (const r of failedResults) {
      lines.push(`[FAIL] ${r.id} -- ${r.groupLabel}`);
      lines.push(`Descricao:   ${r.description}`);
      lines.push(`Mensagem:    "${r.message}"`);
      lines.push(`Resposta IA: ${r.aiResponse.message || "(sem mensagem)"}`);
      if (r.aiResponse.cards.length > 0) {
        lines.push(`Produtos:    ${r.aiResponse.cards.join(", ")}`);
      }
      lines.push(`Modo:        ${r.aiResponse.mode}`);
      lines.push("Checks:");
      for (const c of r.checks) {
        lines.push(`  [${c.pass ? "OK  " : "FAIL"}] ${c.type} -- ${c.detail}`);
      }
      lines.push("");
    }
  }

  lines.push("-------------------------------------------");
  lines.push(`PASSOU (${passedResults.length})`);
  lines.push("-------------------------------------------");
  lines.push("");
  for (const r of passedResults) {
    lines.push(`[OK] ${r.id} -- ${r.description} (${r.groupLabel})`);
  }
  lines.push("");

  if (recommendations.length > 0) {
    lines.push("-------------------------------------------");
    lines.push("ACAO RECOMENDADA");
    lines.push("-------------------------------------------");
    for (const rec of recommendations) lines.push(rec);
    lines.push("");
  }

  return lines.join("\n");
}

// ─── result card ──────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: ScenarioResult }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-lg border ${result.pass ? "border-gray-700" : "border-red-800/50"} bg-gray-900 p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {statusBadge(result.pass)}
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">{result.id}</span>
            <span className="rounded bg-violet-900/40 px-1.5 py-0.5 text-[10px] text-violet-300">{result.groupLabel}</span>
          </div>
          <p className="text-sm text-gray-300 truncate">{result.description}</p>
          <p className="mt-0.5 text-xs text-gray-500 italic truncate">&ldquo;{result.message}&rdquo;</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {open ? "Fechar" : "Detalhes"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
          {/* Checks */}
          <div className="space-y-1">
            {result.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={c.pass ? "text-green-400 shrink-0" : "text-red-400 shrink-0"}>
                  {c.pass ? "✓" : "✗"}
                </span>
                <span className="font-mono text-gray-400 shrink-0">{c.type}</span>
                <span className="text-gray-500">{c.detail}</span>
              </div>
            ))}
          </div>

          {/* AI response preview */}
          <div className="rounded bg-gray-800 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Resposta IA</p>
            <p className="text-xs text-gray-300">{result.aiResponse.message || "(sem mensagem)"}</p>
            {result.aiResponse.cards.length > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">
                Cards: {result.aiResponse.cards.slice(0, 6).join(", ")}
                {result.aiResponse.cards.length > 6 && ` +${result.aiResponse.cards.length - 6} mais`}
              </p>
            )}
            <p className="mt-1 text-[10px] font-mono text-gray-600">mode: {result.aiResponse.mode}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function WaiterTestesPage() {
  const [restaurants, setRestaurants]       = useState<RestaurantOption[]>([]);
  const [restaurantId, setRestaurantId]     = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [groups]                            = useState<ScenarioGroup[]>(() => getScenarioGroups());
  const [loading, setLoading]               = useState(false);
  const [report, setReport]                 = useState<EvalReport | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [expandAll, setExpandAll]           = useState(false);
  const [copied, setCopied]                 = useState(false);

  // Load restaurant list
  useEffect(() => {
    fetch("/api/admin/restaurants")
      .then((r) => r.json())
      .then((d: unknown) => {
        const list: RestaurantOption[] = Array.isArray(d)
          ? (d as RestaurantOption[])
          : Array.isArray((d as { data?: unknown })?.data)
          ? ((d as { data: RestaurantOption[] }).data)
          : ((d as { restaurants?: RestaurantOption[] })?.restaurants ?? []);
        setRestaurants(list);
        if (list.length > 0 && !restaurantId) setRestaurantId(list[0]!.id);
      })
      .catch(() => setError("Falha ao carregar restaurantes"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedGroups.size === groups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(groups.map((g) => g.id)));
    }
  }

  const runTests = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    setReport(null);

    const body: { restaurantId: string; groups?: string[] } = { restaurantId };
    if (selectedGroups.size > 0 && selectedGroups.size < groups.length) {
      body.groups = Array.from(selectedGroups);
    }

    try {
      const res  = await fetch("/api/admin/ai/waiter-tests/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; report?: EvalReport; error?: string };
      if (!data.ok || !data.report) {
        setError(data.error ?? "Erro desconhecido");
      } else {
        setReport(data.report);
      }
    } catch {
      setError("Falha de rede ao executar testes");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedGroups, groups.length]);

  // ─── export handlers ─────────────────────────────────────────────────────

  function getSlug(): string {
    return restaurants.find((r) => r.id === restaurantId)?.slug ?? "restaurante";
  }

  function handleDownloadJson() {
    if (!report) return;
    const slug    = getSlug();
    const payload = buildJsonExport(report, slug, selectedGroups);
    triggerDownload(
      JSON.stringify(payload, null, 2),
      buildFilename(slug, report.ranAt, "json"),
      "application/json",
    );
  }

  function handleDownloadTxt() {
    if (!report) return;
    const slug = getSlug();
    triggerDownload(
      buildTxtReport(report, slug),
      buildFilename(slug, report.ranAt, "txt"),
      "text/plain;charset=utf-8",
    );
  }

  async function handleCopyToClipboard() {
    if (!report) return;
    const slug = getSlug();
    const txt  = buildTxtReport(report, slug);
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — fallback to download
      triggerDownload(txt, buildFilename(slug, report.ranAt, "txt"), "text/plain;charset=utf-8");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  const failedResults = report?.results.filter((r) => !r.pass) ?? [];
  const passedResults = report?.results.filter((r) => r.pass)  ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <QualityTabs />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Waiter Test Center</h1>
        <p className="text-sm text-gray-400 mt-1">
          Testes determinísticos do WaiterBrainV2 contra o cardápio real. Sem OpenAI. Sem efeitos colaterais.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 mb-6 space-y-4">
        {/* Restaurant selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Restaurante
          </label>
          <select
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            disabled={loading}
          >
            <option value="">Selecione um restaurante…</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
            ))}
          </select>
        </div>

        {/* Group selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Grupos de cenários
            </label>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              disabled={loading}
            >
              {selectedGroups.size === groups.length ? "Desmarcar todos" : "Todos"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const active = selectedGroups.size === 0 || selectedGroups.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  disabled={loading}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-violet-900/60 text-violet-200 border border-violet-700"
                      : "bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {g.label} <span className="opacity-60">({g.count})</span>
                </button>
              );
            })}
          </div>
          {selectedGroups.size === 0 && (
            <p className="mt-1.5 text-xs text-gray-600">Nenhum grupo selecionado = todos os grupos serão executados</p>
          )}
        </div>

        {/* Run button */}
        <button
          type="button"
          onClick={runTests}
          disabled={loading || !restaurantId}
          className="w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Executando testes…" : "Executar testes"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Score</p>
                <p className={`text-3xl font-bold ${scoreColor(report.summary.score)}`}>
                  {report.summary.score}%
                </p>
              </div>
              <div className="h-10 w-px bg-gray-800" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Passou</p>
                <p className="text-xl font-semibold text-green-400">{report.summary.passed}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Falhou</p>
                <p className="text-xl font-semibold text-red-400">{report.summary.failed}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Total</p>
                <p className="text-xl font-semibold text-gray-300">{report.summary.total}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[10px] text-gray-600">{report.restaurantName}</p>
                <p className="text-[10px] text-gray-600">{report.durationMs}ms</p>
                <p className="text-[10px] text-gray-700">{new Date(report.ranAt).toLocaleString("pt-BR")}</p>
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-3 h-2 rounded-full bg-gray-800">
              <div
                className={`h-2 rounded-full transition-all ${
                  report.summary.score >= 90
                    ? "bg-green-500"
                    : report.summary.score >= 70
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${report.summary.score}%` }}
              />
            </div>

            {/* Export buttons */}
            <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-gray-800 pt-3">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <span className="text-[11px]">⬇</span> Baixar JSON
              </button>
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <span className="text-[11px]">⬇</span> Baixar relatório .txt
              </button>
              <button
                type="button"
                onClick={handleCopyToClipboard}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  copied
                    ? "border-green-700 bg-green-900/30 text-green-400"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                <span className="text-[11px]">{copied ? "✓" : "⎘"}</span>
                {copied ? "Copiado!" : "Copiar relatório"}
              </button>
            </div>
          </div>

          {/* Failed first */}
          {failedResults.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-red-400">Falhas ({failedResults.length})</h2>
              </div>
              <div className="space-y-2">
                {failedResults.map((r) => <ResultCard key={r.id} result={r} />)}
              </div>
            </div>
          )}

          {/* Passed */}
          {passedResults.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-green-400">Passou ({passedResults.length})</h2>
                <button
                  type="button"
                  onClick={() => setExpandAll((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {expandAll ? "Recolher todos" : "Expandir todos"}
                </button>
              </div>
              <div className="space-y-2">
                {passedResults.map((r) => (
                  <div key={r.id}>
                    {expandAll
                      ? <ResultCard result={r} />
                      : (
                        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 flex items-center gap-3">
                          {statusBadge(true)}
                          <span className="font-mono text-[11px] text-gray-600">{r.id}</span>
                          <span className="text-xs text-gray-400 truncate">{r.description}</span>
                          <span className="ml-auto text-[11px] text-violet-400 shrink-0">{r.groupLabel}</span>
                        </div>
                      )
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
