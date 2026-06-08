"use client";

import { useMemo, useState } from "react";
import { AUDITOR_META_LIST } from "@/services/quality/registryMeta";
import {
  buildExecutiveSummary,
  emptyExecutiveSummary,
  statusLabel,
  buildAuditJson,
  buildAuditTxt,
  sortFindings,
  type ExecutiveSummary,
} from "@/services/quality/dashboardModel";
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

// ─── summary card ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${tone ?? "text-gray-200"}`}>{value}</p>
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

  const summary: ExecutiveSummary = result ? buildExecutiveSummary(result) : emptyExecutiveSummary();

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
      else setResult(data.result);
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

  const findingsByAuditor = useMemo(() => {
    const map = new Map<string, AuditRunResult["findings"]>();
    if (result) for (const f of result.findings) {
      const arr = map.get(f.auditorId) ?? [];
      arr.push(f);
      map.set(f.auditorId, arr);
    }
    return map;
  }, [result]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Controle de Qualidade</h1>
          <p className="mt-1 text-sm text-gray-400">
            Auditores internos que verificam o Foocci antes da operação.
          </p>
        </div>
        <span className="rounded-full bg-violet-900/50 px-3 py-1 text-xs font-semibold text-violet-200">
          v1 · Manual
        </span>
      </div>

      {/* Read-only banner */}
      <div className="mb-5 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-[11px] text-gray-400">
        🔒 Read-only · SafeMode (dry-run, sem efeitos colaterais). Nenhuma auditoria envia WhatsApp, cria pedido,
        gera Pix ou altera o banco.
      </div>

      {/* Executive summary */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Auditores" value={summary.auditors} />
        <SummaryCard label="Passou" value={summary.passed} tone="text-green-400" />
        <SummaryCard label="Atenção" value={summary.attention} tone="text-amber-400" />
        <SummaryCard label="Falhou" value={summary.failed} tone="text-red-400" />
        <SummaryCard label="P0 aberto" value={summary.p0Open} tone={summary.p0Open > 0 ? "text-red-400" : "text-gray-200"} />
        <SummaryCard
          label="Status geral"
          value={result ? statusLabel(summary.globalStatus) : "—"}
          tone={result ? statusTone(summary.globalStatus) : "text-gray-500"}
        />
      </div>

      {/* Run-all + status line */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run()}
          disabled={loading}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runningId === "__all__" ? "Rodando…" : "Rodar auditoria manual"}
        </button>
        {result && (
          <>
            <button
              type="button"
              onClick={() => copy("json")}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              {copied === "json" ? "✓ Copiado" : "Copiar JSON"}
            </button>
            <button
              type="button"
              onClick={() => copy("txt")}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              {copied === "txt" ? "✓ Copiado" : "Copiar TXT"}
            </button>
          </>
        )}
        <span className="text-xs text-gray-500">
          {result
            ? `Run ${result.runId} · ${result.findings.length} findings`
            : "Aguardando primeira rodada manual"}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Auditor list */}
      <div className="space-y-3">
        {auditors.map((a) => {
          const findings = sortFindings(findingsByAuditor.get(a.id) ?? []);
          const worst = findings[0];
          return (
            <div key={a.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-white">{a.name}</h2>
                    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">{a.area}</span>
                    <span className="rounded bg-violet-900/40 px-1.5 py-0.5 text-[10px] text-violet-300">{a.group}</span>
                    {connectionBadge(a.connection)}
                    {worst && severityBadge(worst.severity)}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{a.mission}</p>
                </div>
                <button
                  type="button"
                  onClick={() => run(a.id)}
                  disabled={loading}
                  className="shrink-0 rounded-lg border border-violet-700 bg-violet-900/40 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-900/70 disabled:opacity-50"
                >
                  {runningId === a.id ? "Rodando…" : "Rodar este auditor"}
                </button>
              </div>

              {/* Linked labs */}
              <div className="mt-2 flex flex-wrap gap-2">
                {a.linkedLabs.map((lab) =>
                  lab.exists ? (
                    <a
                      key={lab.label}
                      href={lab.href}
                      className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] text-gray-300 hover:border-violet-600 hover:text-violet-200"
                    >
                      🔗 {lab.label}
                    </a>
                  ) : (
                    <span key={lab.label} className="rounded-full border border-dashed border-gray-700 px-2.5 py-1 text-[11px] text-gray-600">
                      {lab.label} (planejado)
                    </span>
                  ),
                )}
              </div>

              {/* Findings */}
              {findings.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
                  {findings.map((f, i) => (
                    <div key={i} className="rounded-lg bg-gray-800/60 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {findingStatusBadge(f.status)}
                        {severityBadge(f.severity)}
                        <span className="text-xs font-semibold text-gray-200">{f.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{f.summary}</p>
                      {f.evidence.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-[11px] text-gray-500">
                          {f.evidence.map((e, j) => <li key={j}>{e}</li>)}
                        </ul>
                      )}
                      <p className="mt-1 text-[11px] text-violet-300/80">→ {f.recommendation}</p>
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
