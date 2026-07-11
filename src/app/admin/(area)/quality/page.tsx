"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QualityTabs } from "../QualityTabs";
import { AUDITOR_META_LIST } from "@/services/quality/registryMeta";
import {
  statusLabel,
  buildAuditJson,
  buildAuditTxt,
  sortFindings,
} from "@/services/quality/dashboardModel";
import {
  buildExecutiveOverview,
  TREND_LABEL,
  type Trend,
} from "@/services/quality/executiveSummary";
import { detectRegression } from "@/services/quality/regression";
import { deriveInternalAlerts } from "@/services/quality/internalAlerts";
import type { AuditRunResult, FindingSeverity, FindingStatus } from "@/services/quality/types";

// ─── display helpers ────────────────────────────────────────────────────────

function statusTone(status: FindingStatus): string {
  if (status === "FAIL") return "text-red-400";
  if (status === "WARNING") return "text-amber-400";
  return "text-green-400";
}

function severityBadge(sev: FindingSeverity) {
  const cls: Record<FindingSeverity, string> = {
    P0: "bg-red-900/50 text-red-300",
    P1: "bg-amber-900/50 text-amber-300",
    P2: "bg-yellow-900/40 text-yellow-300",
    INFO: "bg-gray-800 text-gray-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[sev]}`}>{sev}</span>;
}

function findingStatusBadge(status: FindingStatus) {
  const cls: Record<FindingStatus, string> = {
    PASS: "bg-green-900/50 text-green-300",
    WARNING: "bg-amber-900/50 text-amber-300",
    FAIL: "bg-red-900/50 text-red-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[status]}`}>{status}</span>;
}

function connectionBadge(connection: "ACTIVE" | "PARTIAL" | "PLANNED") {
  const map = {
    ACTIVE: { label: "Ativo", cls: "bg-green-900/50 text-green-300" },
    PARTIAL: { label: "Parcial", cls: "bg-amber-900/50 text-amber-300" },
    PLANNED: { label: "Planejado", cls: "bg-gray-800 text-gray-400" },
  } as const;
  const m = map[connection];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>;
}

const TREND_ICON: Record<Trend, string> = {
  improving: "↗",
  worsening: "↘",
  stable: "→",
  insufficient: "·",
};

function statusDotClass(status: FindingStatus): string {
  if (status === "FAIL") return "bg-red-500";
  if (status === "WARNING") return "bg-amber-500";
  return "bg-green-500";
}

// ─── types + helpers ─────────────────────────────────────────────────────────

interface SeverityCounts { P0: number; P1: number; P2: number; INFO: number }

interface ViewFinding {
  auditorId: string;
  status: FindingStatus;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence: string[];
  recommendation: string;
}

interface HistoryRun {
  id: string;
  source: string;
  globalStatus: FindingStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  auditorId: string | null;
  countsBySeverity: SeverityCounts;
  countsByStatus: Record<FindingStatus, number>;
  createdAt: string;
}

type LatestRun = HistoryRun & { findings: ViewFinding[] };

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function auditorName(id: string): string {
  return AUDITOR_META_LIST.find((a) => a.id === id)?.name ?? id;
}

// ─── compact cards ───────────────────────────────────────────────────────────

function MiniCard({ label, value, tone, sub }: { label: string; value: string | number; tone?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tone ?? "text-gray-200"}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function QualityControlPage() {
  const auditors = AUDITOR_META_LIST;
  const [result, setResult] = useState<AuditRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"json" | "txt" | null>(null);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [latestRun, setLatestRun] = useState<LatestRun | null>(null);
  const [selectedRun, setSelectedRun] = useState<LatestRun | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/quality/history?limit=20");
      const data = (await res.json()) as { ok: boolean; runs?: HistoryRun[]; latest?: LatestRun | null };
      if (data.ok) {
        setHistory(data.runs ?? []);
        setLatestRun(data.latest ?? null);
      }
    } catch {
      /* history is best-effort; ignore */
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  async function run(auditorId?: string) {
    setLoading(true);
    setRunningId(auditorId ?? "__all__");
    setError(null);
    try {
      const res = await fetch("/api/admin/quality/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auditorId ? { auditorId } : {}),
      });
      const data = (await res.json()) as { ok: boolean; result?: AuditRunResult; error?: string };
      if (!data.ok || !data.result) setError(data.error ?? "Erro desconhecido");
      else {
        setResult(data.result);
        void refreshHistory();
      }
    } catch {
      setError("Falha de rede ao executar a auditoria");
    } finally {
      setLoading(false);
      setRunningId(null);
    }
  }

  async function copy(kind: "json" | "txt") {
    if (!result) return;
    const text = kind === "json" ? buildAuditJson(result) : buildAuditTxt(result);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Não foi possível copiar — clipboard indisponível");
    }
  }

  // Unified view: a fresh manual run wins; otherwise the latest persisted run.
  const viewFindings: ViewFinding[] = (result?.findings as ViewFinding[] | undefined) ?? latestRun?.findings ?? [];
  const viewCounts = result?.countsBySeverity ?? latestRun?.countsBySeverity ?? null;
  const viewStatus: FindingStatus | null = result?.globalStatus ?? latestRun?.globalStatus ?? null;

  const overview = useMemo(
    () => buildExecutiveOverview({ counts: viewCounts, globalStatus: viewStatus, findings: viewFindings, runs: history }),
    [viewCounts, viewStatus, viewFindings, history],
  );

  const findingsByAuditor = useMemo(() => {
    const map = new Map<string, ViewFinding[]>();
    for (const f of viewFindings) {
      const arr = map.get(f.auditorId) ?? [];
      arr.push(f);
      map.set(f.auditorId, arr);
    }
    return map;
  }, [viewFindings]);

  const trendRuns = history.slice(0, 7).reverse(); // oldest → newest (left → right)
  const regression = useMemo(() => detectRegression(history[0], history[1]), [history]);
  const internalAlerts = useMemo(() => deriveInternalAlerts(history, 5), [history]);

  async function selectRun(id: string) {
    if (selectedId === id) { setSelectedId(null); setSelectedRun(null); return; } // toggle off
    setSelectedId(id);
    setSelectedRun(null);
    try {
      const res = await fetch(`/api/admin/quality/history?runId=${encodeURIComponent(id)}&limit=20`);
      const data = (await res.json()) as { ok: boolean; run?: LatestRun | null };
      if (data.ok && data.run) setSelectedRun(data.run);
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <QualityTabs />
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Controle de Qualidade</h1>
          <p className="mt-1 text-sm text-gray-400">Auditoria automática do Foocci antes da operação.</p>
        </div>
        <div className="text-right">
          <span className="rounded-full bg-violet-900/50 px-3 py-1 text-xs font-semibold text-violet-200">v3.3 · Diário</span>
          {latestRun && (
            <p className="mt-1.5 text-[11px] text-gray-500">
              Última: {fmtDateTime(latestRun.createdAt)} · {latestRun.source.toLowerCase()} · {fmtDuration(latestRun.durationMs)}
            </p>
          )}
        </div>
      </div>

      {/* Read-only banner */}
      <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-[11px] text-gray-400">
        🔒 Read-only · SafeMode. Nenhuma auditoria envia WhatsApp, cria pedido, gera Pix ou altera o banco.
        <span className="text-gray-500"> Auditoria automática diária por cron (madrugada).</span>
      </div>

      {/* New-P0 regression banner (visual only — no external alert) */}
      {regression.severity === "P0" && (
        <div className="mb-4 rounded-lg border border-red-600 bg-red-950/40 px-3 py-2 text-sm font-semibold text-red-200">
          🚨 {regression.title}: {regression.summary}
          <span className="ml-1 font-normal text-red-300/80">(detecção visual — nenhum alerta externo é enviado)</span>
        </div>
      )}

      {/* ── Alertas internos (derivados do histórico — sem envio externo) ── */}
      {internalAlerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Alertas internos</p>
            <span className="text-[10px] text-gray-600">Alerta interno — nenhum envio externo configurado.</span>
          </div>
          <div className="space-y-1.5">
            {internalAlerts.map((a) => (
              <div
                key={`${a.type}-${a.runId}`}
                className={`flex flex-wrap items-center gap-2 rounded-lg p-2 ${
                  a.severity === "P0" ? "bg-red-950/40 ring-1 ring-red-700/60" : a.severity === "WARNING" ? "bg-amber-950/30" : "bg-green-950/20"
                }`}
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    a.type === "NEW_P0" ? "bg-red-900/60 text-red-200" : a.type === "STATUS_REGRESSION" ? "bg-amber-900/50 text-amber-300" : "bg-green-900/50 text-green-300"
                  }`}
                >
                  {a.type === "NEW_P0" ? "NOVO P0" : a.type === "STATUS_REGRESSION" ? "REGRESSÃO" : "P0 RESOLVIDO"}
                </span>
                <span className="text-xs font-semibold text-gray-200">{a.title}</span>
                <span className="text-[11px] text-gray-400">{a.summary}</span>
                <span className="ml-auto text-[10px] text-gray-500">{fmtDateTime(a.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => selectRun(a.runId)}
                  className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300 hover:border-violet-600 hover:text-violet-200"
                >
                  ver rodada
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Situação do sistema (primeira dobra) ── */}
      <section
        className={`mb-4 rounded-xl border p-5 ${
          overview.globalStatus === "FAIL"
            ? "border-red-800/60 bg-red-950/20"
            : overview.globalStatus === "WARNING"
            ? "border-amber-800/50 bg-amber-950/15"
            : overview.globalStatus === "PASS"
            ? "border-green-800/50 bg-green-950/15"
            : "border-gray-800 bg-gray-900"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-2xl font-bold ${viewStatus ? statusTone(viewStatus) : "text-gray-500"}`}>
                {viewStatus ? statusLabel(viewStatus) : "—"}
              </span>
              {viewStatus && findingStatusBadge(viewStatus)}
              {/* Regression vs. previous run */}
              {regression.trend !== "INSUFFICIENT_HISTORY" && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    regression.severity === "P0"
                      ? "animate-pulse bg-red-900/70 text-red-200 ring-1 ring-red-500"
                      : regression.trend === "WORSENED"
                      ? "bg-amber-900/50 text-amber-300"
                      : regression.trend === "IMPROVED"
                      ? "bg-green-900/50 text-green-300"
                      : "bg-gray-800 text-gray-400"
                  }`}
                  title={regression.summary}
                >
                  {regression.trend === "IMPROVED" ? "▲ " : regression.trend === "WORSENED" ? "▼ " : "= "}
                  {regression.title}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-300">{overview.statusText}</p>
            {overview.hasHistory && (
              <p className="mt-2 text-xs text-gray-400">
                {overview.worstAuditor && overview.worstAuditor.severity !== "INFO" ? (
                  <>
                    Auditor mais crítico:{" "}
                    <span className="font-semibold text-gray-200">{auditorName(overview.worstAuditor.auditorId)}</span>{" "}
                    ({overview.worstAuditor.severity}).{" "}
                  </>
                ) : null}
                <span className="text-violet-300/90">→ {overview.recommendation}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => run()}
              disabled={loading}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningId === "__all__" ? "Rodando…" : "Rodar agora"}
            </button>
          </div>
        </div>
      </section>

      {/* ── Cards compactos ── */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniCard
          label="Última auditoria"
          value={latestRun ? latestRun.source.toLowerCase() : "—"}
          tone="text-gray-200"
          sub={latestRun ? fmtDateTime(latestRun.createdAt) : "sem histórico"}
        />
        <MiniCard label="P0 abertos" value={overview.p0} tone={overview.p0 > 0 ? "text-red-400" : "text-green-400"} />
        <MiniCard label="P1 / P2" value={`${overview.p1} / ${overview.p2}`} tone="text-amber-400" />
        <MiniCard label="Auditores OK" value={overview.auditorsOk} tone="text-green-400" />
        <MiniCard label="Com atenção" value={overview.auditorsAttention} tone={overview.auditorsAttention > 0 ? "text-amber-400" : "text-gray-200"} />
        <MiniCard label="Tendência" value={`${TREND_ICON[overview.trend]}`} tone="text-gray-200" sub={TREND_LABEL[overview.trend]} />
      </div>

      {/* ── Tendência das últimas rodadas ── */}
      {trendRuns.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Últimas rodadas</span>
          <div className="flex items-center gap-1.5">
            {trendRuns.map((r) => (
              <span
                key={r.id}
                title={`${r.globalStatus} · ${fmtDateTime(r.createdAt)} · ${r.source.toLowerCase()}`}
                className={`h-2.5 w-2.5 rounded-full ${statusDotClass(r.globalStatus)}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-gray-500">{TREND_LABEL[overview.trend]}</span>
        </div>
      )}

      {/* Copy + status line */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {result && (
          <>
            <button type="button" onClick={() => copy("json")} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white">
              {copied === "json" ? "✓ Copiado" : "Copiar JSON"}
            </button>
            <button type="button" onClick={() => copy("txt")} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white">
              {copied === "txt" ? "✓ Copiado" : "Copiar TXT"}
            </button>
          </>
        )}
        <span className="text-xs text-gray-500">
          {viewFindings.length > 0 ? `${viewFindings.length} findings na última rodada` : "Aguardando primeira rodada"}
        </span>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-sm text-red-400">{error}</div>}

      {/* Histórico recente */}
      <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-4">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">Histórico recente</p>
        {history.length === 0 ? (
          <p className="text-xs text-gray-600">Sem execuções registradas. Rode uma auditoria manual.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="py-1 pr-2 font-semibold">Quando</th>
                  <th className="px-2 font-semibold">Status</th>
                  <th className="px-2 font-semibold">P0/P1/P2</th>
                  <th className="px-2 font-semibold">Auditor</th>
                  <th className="px-2 font-semibold">Fonte</th>
                  <th className="pl-2 font-semibold">Duração</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => selectRun(h.id)}
                    className={`cursor-pointer border-t border-gray-800/70 hover:bg-gray-800/50 ${
                      selectedId === h.id ? "bg-gray-800/70" : ""
                    }`}
                  >
                    <td className="py-1 pr-2 text-gray-300">{fmtDateTime(h.createdAt)}</td>
                    <td className="px-2"><span className={statusTone(h.globalStatus)}>{h.globalStatus}</span></td>
                    <td className="px-2 text-gray-400">
                      <span className={h.countsBySeverity.P0 > 0 ? "text-red-400" : ""}>{h.countsBySeverity.P0}</span>
                      {" / "}{h.countsBySeverity.P1}{" / "}{h.countsBySeverity.P2}
                    </td>
                    <td className="px-2 text-gray-400">{h.auditorId ?? "todos"}</td>
                    <td className="px-2 text-gray-500">{h.source.toLowerCase()}</td>
                    <td className="pl-2 text-gray-500">{fmtDuration(h.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[10px] text-gray-600">Clique numa linha para ver os detalhes da rodada.</p>
          </div>
        )}

        {/* Drill-down panel for the selected run */}
        {selectedId && (
          <div className="mt-3 rounded-lg border border-violet-800/50 bg-gray-950/50 p-3">
            {!selectedRun ? (
              <p className="text-xs text-gray-500">Carregando rodada…</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-200">Rodada {fmtDateTime(selectedRun.createdAt)}</span>
                    {findingStatusBadge(selectedRun.globalStatus)}
                    <span className="text-[11px] text-gray-500">
                      {selectedRun.source.toLowerCase()} · {fmtDuration(selectedRun.durationMs)} ·
                      {" "}P0 {selectedRun.countsBySeverity.P0} · P1 {selectedRun.countsBySeverity.P1} · P2 {selectedRun.countsBySeverity.P2}
                    </span>
                  </div>
                  <button type="button" onClick={() => { setSelectedId(null); setSelectedRun(null); }} className="text-[11px] text-gray-500 hover:text-gray-300">
                    fechar ✕
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Auditores afetados:{" "}
                  {[...new Set(selectedRun.findings.map((f) => f.auditorId))].map(auditorName).join(", ") || "—"}
                </p>
                <div className="mt-2 space-y-1.5">
                  {sortFindings(selectedRun.findings).map((f, i) => (
                    <div key={i} className="rounded bg-gray-800/60 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {findingStatusBadge(f.status)}
                        {severityBadge(f.severity)}
                        <span className="text-[11px] text-gray-400">{auditorName(f.auditorId)}</span>
                        <span className="text-xs font-semibold text-gray-200">{f.title}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-400">{f.summary}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Auditor list */}
      <div className="space-y-2">
        {auditors.map((a) => {
          const findings = sortFindings(findingsByAuditor.get(a.id) ?? []);
          const worst = findings[0];
          const main = findings[0];
          return (
            <div key={a.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-white">{a.name}</h2>
                  {connectionBadge(a.connection)}
                  {worst ? severityBadge(worst.severity) : <span className="text-[10px] text-gray-600">não rodado</span>}
                  {main && <span className="truncate text-[11px] text-gray-400">{main.title}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.linkedLabs[0]?.exists && (
                    <a href={a.linkedLabs[0].href} className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] text-gray-300 hover:border-violet-600 hover:text-violet-200">
                      🔗 Lab
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => run(a.id)}
                    disabled={loading}
                    className="rounded-lg border border-violet-700 bg-violet-900/40 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-900/70 disabled:opacity-50"
                  >
                    {runningId === a.id ? "Rodando…" : "Rodar"}
                  </button>
                </div>
              </div>

              {/* Findings (P0 first via sortFindings) */}
              {findings.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-gray-800 pt-2">
                  {findings.map((f, i) => (
                    <div key={i} className="rounded-lg bg-gray-800/60 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {findingStatusBadge(f.status)}
                        {severityBadge(f.severity)}
                        <span className="text-xs font-semibold text-gray-200">{f.title}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-400">{f.summary}</p>
                      <p className="mt-0.5 text-[11px] text-violet-300/80">→ {f.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
