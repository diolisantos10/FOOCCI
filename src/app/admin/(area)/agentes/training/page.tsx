"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrainingRun {
  id: string; agentType: string; source: string; mode: string | null;
  status: string; score: number | null; totalScenarios: number;
  passCount: number; warnCount: number; failCount: number;
  startedAt: string | null; completedAt: string | null; createdAt: string;
}

interface TrainingScenario {
  id: string; runId: string; title: string; status: string; score: number | null;
  customerPersona: string | null; goal: string | null; source: string;
  failureSummary: string | null; createdAt: string;
}

interface Proposal {
  id: string; agentType: string; title: string; problemSummary: string;
  rootCause: string | null; proposedChangeType: string; riskLevel: string;
  expectedImpact: string | null; beforeScore: number | null;
  afterScoreEstimate: number | null; status: string;
  reviewerNotes: string | null; createdAt: string;
}

interface BrainVersion {
  id: string; agentType: string; versionLabel: string; status: string;
  createdAt: string; activatedAt: string | null;
}

interface DashboardData {
  activeRun: TrainingRun | null; runsToday: number; totalScenarios: number;
  passCount: number; warnCount: number; failCount: number;
  latestScore: number | null; pendingProposals: number;
  topFailureCategories: Array<{ category: string; count: number }>;
  latestRun: TrainingRun | null;
}

interface TrainingConfig {
  enableContinuousTraining: boolean; maxScenariosPerHour: number;
  useRealConversationMining: boolean; useAiGeneratedScenarios: boolean;
  minimumScoreThreshold: number; autoCreateProposals: boolean;
  autoApplySandbox: boolean;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PASS:       "bg-green-900/60 text-green-400",
    WARN:       "bg-yellow-900/60 text-yellow-400",
    FAIL:       "bg-red-900/60 text-red-400",
    PENDING:    "bg-gray-700 text-gray-400",
    RUNNING:    "bg-blue-900/60 text-blue-400",
    COMPLETED:  "bg-green-900/60 text-green-400",
    FAILED:     "bg-red-900/60 text-red-400",
    QUEUED:     "bg-gray-700 text-gray-400",
    CANCELLED:  "bg-gray-700 text-gray-400",
    PENDING_APPROVAL: "bg-yellow-900/60 text-yellow-400",
    APPROVED:         "bg-green-900/60 text-green-400",
    REJECTED:         "bg-red-900/60 text-red-400",
    NEEDS_REVISION:   "bg-orange-900/60 text-orange-400",
    APPLIED_TO_SANDBOX: "bg-blue-900/60 text-blue-400",
    DRAFT:    "bg-gray-700 text-gray-400",
    SANDBOX:  "bg-blue-900/60 text-blue-400",
    ACTIVE:   "bg-green-900/60 text-green-400",
    ARCHIVED: "bg-gray-800 text-gray-500",
  };
  const cls = map[status] ?? "bg-gray-700 text-gray-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function riskBadge(risk: string) {
  const map: Record<string, string> = {
    LOW:    "bg-green-900/60 text-green-400",
    MEDIUM: "bg-yellow-900/60 text-yellow-400",
    HIGH:   "bg-red-900/60 text-red-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map[risk] ?? "bg-gray-700 text-gray-400"}`}>
      {risk}
    </span>
  );
}

function scoreBar(score: number | null) {
  if (score === null) return <span className="text-gray-500 text-xs">—</span>;
  const pct  = Math.min(100, Math.max(0, score));
  const color = pct >= 75 ? "#4ade80" : pct >= 50 ? "#facc15" : "#f87171";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-gray-700">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-gray-300">{pct.toFixed(0)}</span>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// ── Tab components ────────────────────────────────────────────────────────────

function DashboardTab({ data, onRunBatch, running }: {
  data: DashboardData | null;
  onRunBatch: () => void;
  running: boolean;
}) {
  if (!data) return <div className="text-gray-500 text-sm p-4">Carregando…</div>;

  const total = data.passCount + data.warnCount + data.failCount || 1;

  return (
    <div className="space-y-6 p-6">
      {/* Status banner */}
      {data.activeRun && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-700/50 bg-blue-900/20 px-4 py-3">
          <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-sm text-blue-300">
            Treinamento em andamento — Run <code className="text-xs">{data.activeRun.id.slice(0, 8)}</code>
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Runs hoje",        value: data.runsToday,         color: "text-white" },
          { label: "Total cenários",   value: data.totalScenarios,    color: "text-white" },
          { label: "Score recente",    value: data.latestScore !== null ? data.latestScore.toFixed(1) : "—", color: data.latestScore !== null && data.latestScore >= 75 ? "text-green-400" : "text-yellow-400" },
          { label: "Aprovações pend.", value: data.pendingProposals,  color: data.pendingProposals > 0 ? "text-yellow-400" : "text-gray-400" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3">
            <p className="text-[11px] text-gray-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{String(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Pass/Warn/Fail bar */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
        <p className="text-xs text-gray-500 mb-3">Distribuição de resultados</p>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-700">
          <div className="bg-green-500"  style={{ width: `${(data.passCount / total) * 100}%` }} />
          <div className="bg-yellow-500" style={{ width: `${(data.warnCount / total) * 100}%` }} />
          <div className="bg-red-500"    style={{ width: `${(data.failCount  / total) * 100}%` }} />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span className="text-green-400">✓ {data.passCount} pass</span>
          <span className="text-yellow-400">⚠ {data.warnCount} warn</span>
          <span className="text-red-400">✗ {data.failCount} fail</span>
        </div>
      </div>

      {/* Top failures */}
      {data.topFailureCategories.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
          <p className="text-xs text-gray-500 mb-3">Principais falhas (últimas 24h)</p>
          <ul className="space-y-2">
            {data.topFailureCategories.map((f) => (
              <li key={f.category} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{f.category.replace(/_/g, " ")}</span>
                <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-400">{f.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRunBatch}
          disabled={running || !!data.activeRun}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
        >
          {running ? "Iniciando…" : "▶ Rodar batch rápido"}
        </button>
      </div>
    </div>
  );
}

function RunsTab({ runs, total, page, onPage, onSelectRun }: {
  runs: TrainingRun[]; total: number; page: number;
  onPage: (p: number) => void; onSelectRun: (id: string) => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-700 bg-gray-800/80">
            <tr>
              {["ID", "Agente", "Fonte", "Modo", "Status", "Score", "Cenários", "Iniciado"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500 text-sm">Nenhum run encontrado.</td></tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer" onClick={() => onSelectRun(r.id)}>
                <td className="px-3 py-2 font-mono text-xs text-gray-400">{r.id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-gray-300">{r.agentType.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-gray-400 text-xs">{r.source}</td>
                <td className="px-3 py-2 text-gray-400 text-xs">{r.mode ?? "—"}</td>
                <td className="px-3 py-2">{statusBadge(r.status)}</td>
                <td className="px-3 py-2">{scoreBar(r.score)}</td>
                <td className="px-3 py-2 text-gray-400 text-xs">{r.totalScenarios} / {r.passCount}✓ {r.warnCount}⚠ {r.failCount}✗</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 20 && (
        <div className="flex justify-end gap-2">
          <button disabled={page === 1} onClick={() => onPage(page - 1)} className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-400 disabled:opacity-40">← Ant.</button>
          <span className="text-xs text-gray-500 self-center">Página {page}</span>
          <button disabled={page * 20 >= total} onClick={() => onPage(page + 1)} className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-400 disabled:opacity-40">Próx. →</button>
        </div>
      )}
    </div>
  );
}

function ScenariosTab({ runId, onSelectScenario }: { runId?: string; onSelectScenario: (id: string) => void }) {
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [filter, setFilter]       = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page) });
    if (runId)  qs.set("runId",  runId);
    if (filter) qs.set("status", filter);
    const res  = await fetch(`/api/admin/training/scenarios?${qs}`);
    const data = await res.json();
    setScenarios(data.scenarios ?? []);
    setTotal(data.total ?? 0);
  }, [runId, page, filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        {["", "FAIL", "WARN", "PASS", "PENDING"].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === s ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >{s || "Todos"}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-700 bg-gray-800/80">
            <tr>
              {["Título", "Persona", "Goal", "Fonte", "Status", "Score", "Data"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500 text-sm">Nenhum cenário.</td></tr>
            )}
            {scenarios.map((s) => (
              <tr key={s.id} className="border-b border-gray-800 hover:bg-gray-800/40 cursor-pointer" onClick={() => onSelectScenario(s.id)}>
                <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={s.title}>{s.title}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{s.customerPersona ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-[120px] truncate">{s.goal?.replace(/_/g, " ") ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{s.source === "REAL_CONVERSATION" ? "Real" : "IA"}</td>
                <td className="px-3 py-2">{statusBadge(s.status)}</td>
                <td className="px-3 py-2">{scoreBar(s.score)}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 20 && (
        <div className="flex justify-end gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-400 disabled:opacity-40">← Ant.</button>
          <span className="text-xs text-gray-500 self-center">Página {page} / {Math.ceil(total / 20)}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-400 disabled:opacity-40">Próx. →</button>
        </div>
      )}
    </div>
  );
}

function ProposalsTab() {
  const [proposals, setProposals]     = useState<Proposal[]>([]);
  const [filter, setFilter]           = useState("PENDING_APPROVAL");
  const [updating, setUpdating]       = useState<string | null>(null);
  const [noteFor, setNoteFor]         = useState<string | null>(null);
  const [noteText, setNoteText]       = useState("");
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ status: filter });
    const res = await fetch(`/api/admin/training/proposals?${qs}`);
    const data = await res.json();
    setProposals(data.proposals ?? []);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: string, status: string, notes?: string) => {
    setUpdating(id);
    await fetch(`/api/admin/training/proposals/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status, reviewerNotes: notes }),
    });
    setUpdating(null);
    setNoteFor(null);
    setNoteText("");
    void load();
  };

  if (selectedProposal) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => setSelectedProposal(null)} className="text-xs text-violet-400 hover:text-violet-300">← Voltar</button>
        <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-white">{selectedProposal.title}</h3>
            <div className="flex gap-2 shrink-0">
              {statusBadge(selectedProposal.status)}
              {riskBadge(selectedProposal.riskLevel)}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Problema</p>
            <p className="text-sm text-gray-300">{selectedProposal.problemSummary}</p>
          </div>
          {selectedProposal.rootCause && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Causa raiz</p>
              <p className="text-sm text-gray-300">{selectedProposal.rootCause}</p>
            </div>
          )}
          {selectedProposal.expectedImpact && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Impacto esperado</p>
              <p className="text-sm text-gray-300">{selectedProposal.expectedImpact}</p>
            </div>
          )}
          <div className="flex gap-4 text-xs text-gray-400">
            <span>Tipo: <b className="text-gray-300">{selectedProposal.proposedChangeType.replace(/_/g, " ")}</b></span>
            <span>Score: <b className="text-gray-300">{selectedProposal.beforeScore ?? "?"} → {selectedProposal.afterScoreEstimate ?? "?"}</b></span>
          </div>
          {selectedProposal.status === "PENDING_APPROVAL" && (
            <div className="flex gap-2 pt-2 flex-wrap">
              <button onClick={() => void updateStatus(selectedProposal.id, "APPROVED")} disabled={!!updating}
                className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50">
                ✓ Aprovar
              </button>
              <button onClick={() => void updateStatus(selectedProposal.id, "APPLIED_TO_SANDBOX")} disabled={!!updating}
                className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
                Aprovar para sandbox
              </button>
              <button onClick={() => void updateStatus(selectedProposal.id, "REJECTED")} disabled={!!updating}
                className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:opacity-50">
                ✗ Rejeitar
              </button>
              <button onClick={() => setNoteFor(selectedProposal.id)}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700">
                Pedir ajuste
              </button>
            </div>
          )}
          {noteFor === selectedProposal.id && (
            <div className="space-y-2 pt-2">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
                rows={3} placeholder="Descreva o ajuste necessário…" />
              <button onClick={() => void updateStatus(selectedProposal.id, "NEEDS_REVISION", noteText)}
                className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
                Enviar pedido de ajuste
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2 flex-wrap">
        {["PENDING_APPROVAL", "APPROVED", "REJECTED", "NEEDS_REVISION", "APPLIED_TO_SANDBOX"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === s ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >{s.replace(/_/g, " ")}</button>
        ))}
      </div>

      {proposals.length === 0 && (
        <p className="text-sm text-gray-500 py-6 text-center">Nenhuma proposta com status &ldquo;{filter.replace(/_/g, " ")}&rdquo;.</p>
      )}

      <div className="space-y-3">
        {proposals.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setSelectedProposal(p)} className="text-sm font-semibold text-white hover:text-violet-300 text-left">
                {p.title}
              </button>
              <div className="flex gap-2 shrink-0">
                {statusBadge(p.status)}
                {riskBadge(p.riskLevel)}
              </div>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2">{p.problemSummary}</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-3 text-[11px] text-gray-500">
                <span>{p.proposedChangeType.replace(/_/g, " ")}</span>
                <span>Score {p.beforeScore ?? "?"}→{p.afterScoreEstimate ?? "?"}</span>
              </div>
              {p.status === "PENDING_APPROVAL" && (
                <div className="flex gap-1.5">
                  <button onClick={() => void updateStatus(p.id, "APPROVED")} disabled={updating === p.id}
                    className="rounded bg-green-800 px-2 py-1 text-[11px] text-green-300 hover:bg-green-700 disabled:opacity-50">
                    Aprovar
                  </button>
                  <button onClick={() => void updateStatus(p.id, "APPLIED_TO_SANDBOX")} disabled={updating === p.id}
                    className="rounded bg-blue-800 px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-700 disabled:opacity-50">
                    Sandbox
                  </button>
                  <button onClick={() => void updateStatus(p.id, "REJECTED")} disabled={updating === p.id}
                    className="rounded bg-red-900/50 px-2 py-1 text-[11px] text-red-400 hover:bg-red-900 disabled:opacity-50">
                    Rejeitar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrainVersionsTab() {
  const [versions, setVersions] = useState<BrainVersion[]>([]);

  useEffect(() => {
    void fetch("/api/admin/training/brain-versions")
      .then((r) => r.json())
      .then((d) => setVersions(d ?? []));
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 px-4 py-3 text-xs text-yellow-400">
        Versões ATIVAS nunca são alteradas automaticamente. Candidatos precisam de aprovação manual.
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-700 bg-gray-800/80">
            <tr>
              {["Versão", "Agente", "Status", "Criado", "Ativado"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500 text-sm">Nenhuma versão criada.</td></tr>
            )}
            {versions.map((v) => (
              <tr key={v.id} className={`border-b border-gray-800 ${v.status === "ACTIVE" ? "bg-green-900/10" : ""}`}>
                <td className="px-3 py-2 text-gray-300 font-mono text-xs">{v.versionLabel}</td>
                <td className="px-3 py-2 text-gray-400 text-xs">{v.agentType}</td>
                <td className="px-3 py-2">{statusBadge(v.status)}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(v.createdAt)}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(v.activatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigTab() {
  const [config, setConfig]   = useState<TrainingConfig | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    void fetch("/api/admin/training/config")
      .then((r) => r.json())
      .then((d) => setConfig(d));
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    await fetch("/api/admin/training/config", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!config) return <div className="p-6 text-gray-500 text-sm">Carregando…</div>;

  const toggle = (key: keyof TrainingConfig) => {
    if (typeof config[key] !== "boolean") return;
    setConfig((c) => c ? { ...c, [key]: !c[key] } : c);
  };

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 px-4 py-3 text-xs text-yellow-400">
        autoApplyProduction está sempre desativado em v1. Nenhuma alteração de produção é automática.
      </div>

      {([
        ["enableContinuousTraining",  "Treinamento contínuo ativo"],
        ["useRealConversationMining", "Usar conversas reais"],
        ["useAiGeneratedScenarios",   "Usar cenários gerados por IA"],
        ["autoCreateProposals",       "Criar propostas automaticamente"],
        ["autoApplySandbox",          "Auto-aplicar no sandbox"],
      ] as [keyof TrainingConfig, string][]).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-300">{label}</span>
          <div
            onClick={() => toggle(key)}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${config[key] ? "bg-violet-600" : "bg-gray-700"}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${config[key] ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
        </label>
      ))}

      <div>
        <label className="text-xs text-gray-500 block mb-1">Máx. cenários/hora</label>
        <input
          type="number" min={1} max={100} value={config.maxScenariosPerHour}
          onChange={(e) => setConfig((c) => c ? { ...c, maxScenariosPerHour: parseInt(e.target.value, 10) || 20 } : c)}
          className="w-32 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Score mínimo aceitável</label>
        <input
          type="number" min={0} max={1} step={0.05} value={config.minimumScoreThreshold}
          onChange={(e) => setConfig((c) => c ? { ...c, minimumScoreThreshold: parseFloat(e.target.value) || 0.6 } : c)}
          className="w-32 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white"
        />
      </div>

      <button onClick={save} disabled={saving}
        className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors">
        {saving ? "Salvando…" : saved ? "✓ Salvo" : "Salvar configuração"}
      </button>
    </div>
  );
}

// ── Scenario detail modal ─────────────────────────────────────────────────────

function ScenarioDetailModal({ scenarioId, onClose }: { scenarioId: string; onClose: () => void }) {
  const [scenario, setScenario] = useState<{
    title: string; status: string; score: number | null; customerPersona: string | null;
    goal: string | null; failureSummary: string | null; transcriptJson: unknown;
    expectedOutcomeJson: unknown; actualOutcomeJson: unknown;
    evaluations: Array<{ verdict: string; strengths: string | null; weaknesses: string | null; recommendation: string | null; scoreJson: unknown }>;
  } | null>(null);

  useEffect(() => {
    void fetch(`/api/admin/training/scenarios/${scenarioId}`)
      .then((r) => r.json())
      .then((d) => setScenario(d));
  }, [scenarioId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-10 px-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 shadow-xl mb-10">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">{scenario?.title ?? "Carregando…"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {!scenario ? (
          <div className="p-6 text-center text-gray-500 text-sm">Carregando…</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex gap-3 flex-wrap">
              {statusBadge(scenario.status)}
              {scoreBar(scenario.score)}
              {scenario.customerPersona && <span className="text-xs text-gray-500">{scenario.customerPersona}</span>}
              {scenario.goal && <span className="text-xs text-gray-500">{scenario.goal.replace(/_/g, " ")}</span>}
            </div>

            {scenario.failureSummary && (
              <div className="rounded-lg border border-red-700/40 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                {scenario.failureSummary}
              </div>
            )}

            {/* WhatsApp-style transcript */}
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Transcrição</p>
              <div className="rounded-xl border border-gray-700 bg-[#0d1117] p-3 space-y-2 max-h-72 overflow-y-auto">
                {(scenario.transcriptJson as Array<{ role: string; content: string }>)?.map((t, i) => (
                  <div key={i} className={`flex ${t.role === "customer" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-sm ${t.role === "customer" ? "bg-[#dcf8c6] text-[#111]" : "bg-white text-[#111]"}`}>
                      {t.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Evaluations */}
            {scenario.evaluations.length > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-2">Avaliação IA</p>
                {scenario.evaluations.slice(0, 1).map((e, i) => (
                  <div key={i} className="rounded-lg border border-gray-700 bg-gray-800/60 p-3 space-y-2 text-xs">
                    <div className="flex gap-2">{statusBadge(e.verdict)}</div>
                    {e.strengths   && <p className="text-green-400">✓ {e.strengths}</p>}
                    {e.weaknesses  && <p className="text-yellow-400">⚠ {e.weaknesses}</p>}
                    {e.recommendation && <p className="text-gray-400">→ {e.recommendation}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Run detail view ───────────────────────────────────────────────────────────

function RunDetailView({ runId, onBack }: { runId: string; onBack: () => void }) {
  const [run, setRun] = useState<(TrainingRun & { scenarios: TrainingScenario[] }) | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/admin/training/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => setRun(d));
  }, [runId]);

  if (!run) return <div className="p-6 text-gray-500 text-sm">Carregando…</div>;

  return (
    <div className="p-6 space-y-4">
      {selectedScenario && (
        <ScenarioDetailModal scenarioId={selectedScenario} onClose={() => setSelectedScenario(null)} />
      )}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-xs text-violet-400 hover:text-violet-300">← Voltar</button>
        <h3 className="text-sm font-semibold text-white">Run {run.id.slice(0, 8)}</h3>
        {statusBadge(run.status)}
        {scoreBar(run.score)}
      </div>
      <div className="flex gap-4 text-xs text-gray-400">
        <span>Agente: <b className="text-gray-300">{run.agentType}</b></span>
        <span>Fonte: <b className="text-gray-300">{run.source}</b></span>
        <span>Modo: <b className="text-gray-300">{run.mode ?? "—"}</b></span>
      </div>
      <ScenariosTab runId={runId} onSelectScenario={setSelectedScenario} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "runs" | "cenarios" | "falhas" | "sugestoes" | "versoes" | "config";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "runs",      label: "Runs" },
  { id: "cenarios",  label: "Cenários" },
  { id: "sugestoes", label: "Sugestões" },
  { id: "versoes",   label: "Versões" },
  { id: "config",    label: "Config" },
];

export default function AgentTrainingPage() {
  const [tab, setTab]           = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [runs, setRuns]         = useState<TrainingRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [runningBatch, setRunningBatch] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/admin/training/dashboard");
    if (res.ok) setDashboard(await res.json());
  }, []);

  const loadRuns = useCallback(async (page: number) => {
    const res  = await fetch(`/api/admin/training/runs?page=${page}`);
    const data = await res.json();
    setRuns(data.runs ?? []);
    setRunsTotal(data.total ?? 0);
  }, []);

  const loadPendingCount = useCallback(async () => {
    const res  = await fetch("/api/admin/training/proposals?status=PENDING_APPROVAL");
    const data = await res.json();
    setPendingCount(data.total ?? 0);
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadPendingCount();
  }, [loadDashboard, loadPendingCount]);

  useEffect(() => {
    if (tab === "runs") void loadRuns(runsPage);
  }, [tab, runsPage, loadRuns]);

  const triggerBatch = async () => {
    setRunningBatch(true);
    await fetch("/api/admin/training/runs", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ agentType: "WHATSAPP_ORDERING", mode: "QUICK", count: 10 }),
    });
    setRunningBatch(false);
    void loadDashboard();
    if (tab === "runs") void loadRuns(1);
  };

  // Auto-refresh dashboard every 30s
  useEffect(() => {
    const t = setInterval(() => void loadDashboard(), 30_000);
    return () => clearInterval(t);
  }, [loadDashboard]);

  return (
    <div className="flex h-full flex-col bg-gray-950 text-white">
      {selectedScenario && (
        <ScenarioDetailModal scenarioId={selectedScenario} onClose={() => setSelectedScenario(null)} />
      )}

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">🧠 Agent Training Center</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              O agente treina sozinho, mas não publica sozinho.
            </p>
          </div>
          {pendingCount > 0 && (
            <button onClick={() => setTab("sugestoes")}
              className="flex items-center gap-2 rounded-full bg-yellow-900/40 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-900/60 border border-yellow-700/40 transition-colors">
              <span className="flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              {pendingCount} aprovação{pendingCount > 1 ? "ões" : ""} pendente{pendingCount > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelectedRun(null); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "dashboard" && (
          <DashboardTab data={dashboard} onRunBatch={triggerBatch} running={runningBatch} />
        )}
        {tab === "runs" && (
          selectedRun
            ? <RunDetailView runId={selectedRun} onBack={() => setSelectedRun(null)} />
            : <RunsTab runs={runs} total={runsTotal} page={runsPage}
                onPage={(p) => { setRunsPage(p); void loadRuns(p); }}
                onSelectRun={(id) => setSelectedRun(id)} />
        )}
        {tab === "cenarios" && (
          <ScenariosTab onSelectScenario={(id) => setSelectedScenario(id)} />
        )}
        {tab === "sugestoes" && <ProposalsTab />}
        {tab === "versoes"   && <BrainVersionsTab />}
        {tab === "config"    && <ConfigTab />}
      </div>
    </div>
  );
}
