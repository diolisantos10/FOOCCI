"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CycleValidationReport } from "@/app/api/admin/training/validate-cycle/route";
import { EXTERNAL_ARENAS } from "@/services/agent-training/arenas";
import { UnifiedInboxTab } from "./UnifiedInboxTab";
import { BrainFreeFormPanel } from "../../brain/free-form/BrainFreeFormPanel";

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

interface DashboardData {
  activeRun: TrainingRun | null; runsToday: number; totalScenarios: number;
  passCount: number; warnCount: number; failCount: number;
  latestScore: number | null; pendingProposals: number;
  topFailureCategories: Array<{ category: string; count: number }>;
  latestRun: TrainingRun | null;
  liveFailuresToday: number;
  approvedSandboxCandidates: number;
  latestRealFailure: { id: string; title: string; status: string; riskLevel: string | null; createdAt: string } | null;
  // Continuous training
  continuousEnabled: boolean;
  lastSmallBatch: string | null;
  lastNightlyBatch: string | null;
  lastMiningRun: string | null;
  scenariosToday: number;
  warnFailToday: number;
  proposalsCreatedToday: number;
  unproposedWarnFail: number;
  warnFailWithoutEval: number;
  automationHealth: {
    autoDiagnoseOnFailure: boolean;
    autoCreateProposals: boolean;
    continuousEnabled: boolean;
  };
}

interface BackfillResult {
  ok: boolean;
  scenariosScanned?: number;
  evaluationsCreated?: number;
  proposalsCreated?: number;
  proposalsSkipped?: Array<{ category: string; reason: string }>;
  error?: string;
}

interface TrainingConfig {
  enableContinuousTraining: boolean; maxScenariosPerHour: number;
  useRealConversationMining: boolean; useAiGeneratedScenarios: boolean;
  minimumScoreThreshold: number; autoCreateProposals: boolean;
  autoApplySandbox: boolean;
  autoRunArenaOnCapture: boolean;
  autoDiagnoseOnFailure: boolean;
  smallBatchEveryHours: number | null;
  nightlyBatchEnabled: boolean;
}

interface SetupCheckItem {
  key: string; label: string; status: "ok" | "warn" | "error";
  detail: string; fix: string | null;
}

interface SetupCheckData {
  overallStatus: "ok" | "warn" | "error";
  items: SetupCheckItem[];
  cronEndpoints: Record<string, string>;
  lastRun: { completedAt: string | null; score: number | null } | null;
  pendingProposals: number;
}

interface RealCaseItem {
  id: string; title: string; source: string; status: string;
  riskLevel: string; failureCategory: string;
  restaurantId: string | null; failureSummary: string | null;
  createdAt: string; transcriptLength: number;
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
    APPLIED_TO_SANDBOX:  "bg-blue-900/60 text-blue-400",
    RESOLVED_MANUALLY:   "bg-gray-700 text-gray-500",
    LIVE_FAILURE:        "bg-orange-900/60 text-orange-400",
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

const TRAINING_FLOW_STEPS = [
  { icon: "⚠",  label: "Falha capturada",    desc: "Conversa real identificada como falha" },
  { icon: "📋", label: "Cenário criado",      desc: "Transformado em caso de treinamento" },
  { icon: "🤖", label: "Arena simula",        desc: "IA recria o atendimento em modo seguro" },
  { icon: "🔍", label: "Diagnóstico gerado",  desc: "GPT-4o avalia o que falhou" },
  { icon: "💡", label: "Proposta criada",     desc: "Melhoria sugerida automaticamente" },
  { icon: "✋", label: "Você aprova",         desc: "Nada vai ao ar sem revisão humana" },
  { icon: "🧪", label: "Sandbox aplicado",    desc: "Testado antes de qualquer produção" },
];

function VisaoGeralTab({ data, onRunBatch, running, onRunNightly, runningNightly, onRunMining, runningMining, onPause, onResume, onSwitchToCasos, onBackfill, backfilling, backfillResult }: {
  data: DashboardData | null;
  onRunBatch: () => void;
  running: boolean;
  onRunNightly: () => void;
  runningNightly: boolean;
  onRunMining: () => void;
  runningMining: boolean;
  onPause: () => void;
  onResume: () => void;
  onSwitchToCasos: () => void;
  onBackfill: () => void;
  backfilling: boolean;
  backfillResult: BackfillResult | null;
}) {
  if (!data) return <div className="text-gray-500 text-sm p-4">Carregando…</div>;

  const total = data.passCount + data.warnCount + data.failCount || 1;
  const continuousStatus = !data.continuousEnabled
    ? { label: "Não configurado", color: "text-gray-400", bg: "border-gray-700 bg-gray-800/40" }
    : data.activeRun
    ? { label: "Rodando agora", color: "text-green-400", bg: "border-green-700/40 bg-green-900/10" }
    : { label: "Ativo · aguardando cron", color: "text-blue-400", bg: "border-blue-700/40 bg-blue-900/10" };

  return (
    <div className="space-y-6 p-6">
      {/* Safety banner */}
      <div className="rounded-xl border border-violet-700/40 bg-violet-900/10 px-4 py-3 flex items-start gap-3">
        <span className="text-violet-400 mt-0.5">🛡</span>
        <div>
          <p className="text-sm font-semibold text-violet-300">O agente treina sozinho, mas não publica sozinho.</p>
          <p className="text-xs text-violet-500 mt-0.5">Clientes IA simulam atendimentos em modo seguro. Nenhuma mudança vai ao ar sem sua aprovação explícita.</p>
        </div>
      </div>

      {/* 7-step flow */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide mb-3">Como funciona o ciclo de treinamento</p>
        <div className="flex gap-0 overflow-x-auto pb-1">
          {TRAINING_FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center min-w-[80px] px-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-base shrink-0">
                  {step.icon}
                </div>
                <p className="text-[10px] font-semibold text-gray-300 text-center mt-1.5 leading-tight">{step.label}</p>
                <p className="text-[9px] text-gray-600 text-center mt-0.5 leading-tight hidden lg:block">{step.desc}</p>
              </div>
              {i < TRAINING_FLOW_STEPS.length - 1 && (
                <div className="w-6 h-px bg-gray-700 shrink-0 -mt-4" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status banner */}
      {data.activeRun && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-700/50 bg-blue-900/20 px-4 py-3">
          <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-sm text-blue-300">
            Treinamento em andamento — Run <code className="text-xs">{data.activeRun.id.slice(0, 8)}</code>
          </span>
        </div>
      )}

      {/* Live failures alert */}
      {data.liveFailuresToday > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-orange-700/40 bg-orange-900/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-orange-400">⚠</span>
            <span className="text-sm text-orange-300">
              <b>{data.liveFailuresToday}</b> falha{data.liveFailuresToday > 1 ? "s" : ""} capturada{data.liveFailuresToday > 1 ? "s" : ""} hoje de conversas reais
              {data.latestRealFailure && (
                <span className="ml-2 text-orange-500">· última: {data.latestRealFailure.title.slice(0, 40)}</span>
              )}
            </span>
          </div>
          <button
            onClick={onSwitchToCasos}
            className="shrink-0 rounded-lg bg-orange-800/60 px-3 py-1 text-xs font-semibold text-orange-300 hover:bg-orange-800 transition-colors"
          >
            Ver casos →
          </button>
        </div>
      )}

      {/* Unproposed WARN/FAIL backlog — automation status */}
      {data.unproposedWarnFail > 0 && (
        <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">💡</span>
              <div>
                <span className="text-sm text-yellow-300">
                  <b>{data.unproposedWarnFail}</b> falha{data.unproposedWarnFail > 1 ? "s" : ""} pendentes de proposta
                  {data.warnFailWithoutEval > 0 && (
                    <span className="text-yellow-500"> · {data.warnFailWithoutEval} sem diagnóstico</span>
                  )}
                </span>
                <p className="text-[11px] text-yellow-600 mt-0.5">Processamento automático via cron a cada 30 min.</p>
              </div>
            </div>
            <button
              onClick={onBackfill}
              disabled={backfilling}
              className="shrink-0 rounded-lg border border-yellow-700/50 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-900/30 disabled:opacity-50 transition-colors"
            >
              {backfilling ? "Processando…" : "↺ Reprocessar agora"}
            </button>
          </div>
          {backfillResult && (
            <p className={`text-xs ${backfillResult.ok ? "text-green-400" : "text-red-400"}`}>
              {backfillResult.ok
                ? `✓ ${backfillResult.evaluationsCreated ?? 0} diagnóstico(s) + ${backfillResult.proposalsCreated ?? 0} proposta(s) criada(s)` +
                  ((backfillResult.proposalsSkipped?.length ?? 0) > 0
                    ? ` · ${backfillResult.proposalsSkipped!.length} pulada(s): ${backfillResult.proposalsSkipped![0]?.reason ?? ""}`
                    : "")
                : `Erro: ${backfillResult.error ?? "falha"}`}
            </p>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Runs hoje",          value: data.runsToday,                   color: "text-white" },
          { label: "Falhas ao vivo hoje", value: data.liveFailuresToday,           color: data.liveFailuresToday > 0 ? "text-orange-400" : "text-gray-400" },
          { label: "Candidatos sandbox",  value: data.approvedSandboxCandidates,   color: data.approvedSandboxCandidates > 0 ? "text-blue-400" : "text-gray-400" },
          { label: "Aprovações pend.",    value: data.pendingProposals,            color: data.pendingProposals > 0 ? "text-yellow-400" : "text-gray-400" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3">
            <p className="text-[11px] text-gray-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{String(c.value)}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total cenários",   value: data.totalScenarios,    color: "text-white" },
          { label: "Score recente",    value: data.latestScore !== null ? data.latestScore.toFixed(1) : "—", color: data.latestScore !== null && data.latestScore >= 75 ? "text-green-400" : "text-yellow-400" },
          { label: "Pass",  value: data.passCount,  color: "text-green-400" },
          { label: "Fail",  value: data.failCount,  color: data.failCount > 0 ? "text-red-400" : "text-gray-400" },
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

      {/* Continuous training panel */}
      <div className={`rounded-xl border p-4 space-y-3 ${continuousStatus.bg}`}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Treinamento contínuo</p>
          <span className={`text-xs font-semibold ${continuousStatus.color}`}>{continuousStatus.label}</span>
        </div>

        {/* Last run times */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Batch pequeno",   value: data.lastSmallBatch },
            { label: "Batch noturno",   value: data.lastNightlyBatch },
            { label: "Mineração",       value: data.lastMiningRun },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-gray-700 bg-gray-900/60 px-2 py-2">
              <p className="text-[10px] text-gray-600 mb-0.5">{label}</p>
              <p className="text-[11px] text-gray-300">{value ? fmtDate(value) : "—"}</p>
            </div>
          ))}
        </div>

        {/* Today's counters */}
        <div className="flex gap-4 text-xs">
          <span className="text-gray-400">Cenários hoje: <b className="text-gray-200">{data.scenariosToday}</b></span>
          <span className="text-yellow-500">WARN/FAIL hoje: <b>{data.warnFailToday}</b></span>
          <span className="text-violet-400">Propostas hoje: <b>{data.proposalsCreatedToday}</b></span>
        </div>

        {/* Safety status */}
        <div className="flex gap-3 text-[11px] text-gray-500 flex-wrap">
          <span className="text-green-600">✓ sem WhatsApp real</span>
          <span className="text-green-600">✓ sem pedidos</span>
          <span className="text-green-600">✓ sem Pix</span>
          <span className="text-green-600">✓ propostas aguardam aprovação</span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={onRunBatch}
            disabled={running || !!data.activeRun}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
          >
            {running ? "Iniciando…" : "▶ Batch pequeno agora"}
          </button>
          <button
            onClick={onRunNightly}
            disabled={runningNightly || !!data.activeRun}
            className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {runningNightly ? "Iniciando…" : "🌙 Batch noturno agora"}
          </button>
          <button
            onClick={onRunMining}
            disabled={runningMining || !!data.activeRun}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {runningMining ? "Minerando…" : "⛏ Minerar conversas agora"}
          </button>
          {data.continuousEnabled ? (
            <button
              onClick={onPause}
              className="rounded-lg border border-yellow-700/50 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-900/20 transition-colors"
            >
              ⏸ Pausar treinamento
            </button>
          ) : (
            <button
              onClick={onResume}
              className="rounded-lg border border-green-700/50 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-900/20 transition-colors"
            >
              ▶ Ativar treinamento
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

function RunsTab({ runs, total, page, onPage, onSelectRun }: {
  runs: TrainingRun[]; total: number; page: number;
  onPage: (p: number) => void; onSelectRun: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
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
    <div className="space-y-4">
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

interface ProblemGroup {
  category: string; count: number; avgScore: number | null;
  scenarioIds: string[];
  examples: Array<{ id: string; title: string; status: string }>;
  latestAt: string | null;
}

function MelhoriasTab() {
  const [proposals, setProposals]     = useState<Proposal[]>([]);
  const [filter, setFilter]           = useState("PENDING_APPROVAL");
  const [updating, setUpdating]       = useState<string | null>(null);
  const [noteFor, setNoteFor]         = useState<string | null>(null);
  const [noteText, setNoteText]       = useState("");
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [problems, setProblems]       = useState<ProblemGroup[]>([]);
  const [generatingGroup, setGeneratingGroup] = useState<string | null>(null);
  const [groupMsg, setGroupMsg]       = useState<string | null>(null);
  const [unproposedCount, setUnproposedCount] = useState(0);
  const [backfilling, setBackfilling]         = useState(false);
  const [backfillMsg, setBackfillMsg]         = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/training/dashboard")
      .then((r) => r.json())
      .then((d: { unproposedWarnFail?: number }) => setUnproposedCount(d.unproposedWarnFail ?? 0));
  }, []);

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const res  = await fetch("/api/admin/training/backfill-proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json() as BackfillResult;
      setBackfillMsg(data.ok
        ? `✓ ${data.evaluationsCreated ?? 0} diagnóstico(s) + ${data.proposalsCreated ?? 0} proposta(s) criada(s)`
        : `Erro: ${data.error ?? "falha"}`);
      void load();
      const dash = await fetch("/api/admin/training/dashboard").then((r) => r.json()) as { unproposedWarnFail?: number };
      setUnproposedCount(dash.unproposedWarnFail ?? 0);
    } catch {
      setBackfillMsg("Erro: falha de rede");
    }
    setBackfilling(false);
  };

  useEffect(() => {
    void fetch("/api/admin/training/scenarios/problems")
      .then((r) => r.json())
      .then((d: { groups?: ProblemGroup[] }) => setProblems(d.groups ?? []));
  }, []);

  const generateGroupedProposal = async (group: ProblemGroup) => {
    setGeneratingGroup(group.category);
    setGroupMsg(null);
    const res = await fetch("/api/admin/training/proposals/grouped", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ category: group.category, scenarioIds: group.scenarioIds, agentType: "WHATSAPP_ORDERING" }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setGeneratingGroup(null);
    if (data.ok) { setGroupMsg(`✓ Proposta criada para ${group.category.replace(/_/g, " ")}`); void load(); }
    else setGroupMsg(`Erro: ${data.error ?? "falha"}`);
  };

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

        {/* Safety notice in detail view */}
        <div className="rounded-xl border border-blue-700/40 bg-blue-900/10 px-4 py-2.5 text-xs text-blue-400">
          Aprovar aqui não altera produção automaticamente. A melhoria entra como sandbox/candidata e precisa de ativação manual para produção.
        </div>

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
          {(selectedProposal.status === "PENDING_APPROVAL" || selectedProposal.status === "NEEDS_REVISION") && (
            <div className="flex gap-2 pt-2 flex-wrap">
              <button onClick={() => void updateStatus(selectedProposal.id, "APPLIED_TO_SANDBOX")} disabled={!!updating}
                className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
                ✓ Aprovar para sandbox
              </button>
              <button onClick={() => void updateStatus(selectedProposal.id, "APPROVED")} disabled={!!updating}
                className="rounded-lg bg-green-700/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                Aprovar (sem sandbox)
              </button>
              <button onClick={() => void updateStatus(selectedProposal.id, "REJECTED")} disabled={!!updating}
                className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:opacity-50">
                ✗ Rejeitar
              </button>
              <button onClick={() => setNoteFor(selectedProposal.id)}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700">
                Pedir ajuste
              </button>
              <button onClick={() => void updateStatus(selectedProposal.id, "RESOLVED_MANUALLY")} disabled={!!updating}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-800">
                Resolvido manualmente
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
    <div className="p-6 space-y-5">
      {/* Safety notice */}
      <div className="rounded-xl border border-blue-700/40 bg-blue-900/10 px-4 py-2.5 text-xs text-blue-400">
        Aprovar aqui não altera produção automaticamente. A melhoria entra como sandbox/candidata e precisa de ativação manual para produção.
      </div>

      {/* Principais problemas */}
      {problems.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-3">
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Principais problemas (últimas 48h)</p>
          {groupMsg && (
            <p className={`text-xs px-2 py-1 rounded ${groupMsg.startsWith("Erro") ? "text-red-400 bg-red-900/20" : "text-green-400 bg-green-900/20"}`}>
              {groupMsg}
            </p>
          )}
          <div className="space-y-2">
            {problems.map((g) => (
              <div key={g.category} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-red-400 shrink-0">{g.count}×</span>
                  <span className="text-gray-300 truncate">{g.category.replace(/_/g, " ")}</span>
                  {g.avgScore !== null && <span className="text-gray-600 shrink-0">avg {g.avgScore}</span>}
                </div>
                <button
                  onClick={() => void generateGroupedProposal(g)}
                  disabled={generatingGroup === g.category}
                  className="shrink-0 rounded bg-violet-900/60 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-900 disabled:opacity-50"
                >
                  {generatingGroup === g.category ? "…" : "Gerar proposta"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {["PENDING_APPROVAL", "APPROVED", "REJECTED", "NEEDS_REVISION", "APPLIED_TO_SANDBOX", "RESOLVED_MANUALLY"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === s ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >{s.replace(/_/g, " ")}</button>
        ))}
      </div>

      {proposals.length === 0 && filter === "PENDING_APPROVAL" && unproposedCount === 0 && (
        <div className="rounded-xl border border-dashed border-gray-700 py-10 text-center space-y-2">
          <p className="text-2xl">✓</p>
          <p className="text-sm font-semibold text-gray-300">Fila limpa</p>
          <p className="text-xs text-gray-500">Nenhuma melhoria aguardando aprovação. O agente vai gerando novas propostas conforme identifica falhas.</p>
        </div>
      )}

      {proposals.length === 0 && filter === "PENDING_APPROVAL" && unproposedCount > 0 && (
        <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 py-8 px-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-xl">⚙</span>
            <div>
              <p className="text-sm font-semibold text-yellow-300">
                {unproposedCount} falha{unproposedCount > 1 ? "s" : ""} em processamento automático
              </p>
              <p className="text-xs text-yellow-600 mt-0.5">
                O sistema gera propostas automaticamente via cron (a cada 30 min). Nenhuma ação necessária.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => void runBackfill()}
              disabled={backfilling}
              className="rounded-lg border border-yellow-700/50 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-900/30 disabled:opacity-50 transition-colors"
            >
              {backfilling ? "Processando…" : "↺ Reprocessar agora"}
            </button>
            <span className="text-[11px] text-yellow-700">ou aguarde o próximo ciclo automático</span>
          </div>
          {backfillMsg && (
            <p className={`text-xs ${backfillMsg.startsWith("Erro") ? "text-red-400" : "text-green-400"}`}>{backfillMsg}</p>
          )}
        </div>
      )}

      {proposals.length === 0 && filter !== "PENDING_APPROVAL" && (
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

// ── Arena Tab ─────────────────────────────────────────────────────────────────

const ARENA_SCENARIO_DEFS = [
  { key: "priceBeforeOrder",  title: "Pergunta preço antes de pedir",  persona: "cliente que pergunta preço",  description: "Pergunta preço do yakisoba antes de fazer o pedido",       riskTags: ["price_lookup", "order_completion"] },
  { key: "directOrder",       title: "Pedido direto",                  persona: "cliente direto",              description: "Pede yakisoba diretamente sem perguntas",                 riskTags: ["order_completion"] },
  { key: "addItemMidFlow",    title: "Adicionar item no meio",         persona: "cliente que muda pedido",     description: "Adiciona item extra durante coleta de endereço",          riskTags: ["interrupt", "mid_flow_add"] },
  { key: "cancelPendingItem", title: "Cancelar item pendente",         persona: "cliente indeciso",            description: "Cancela item antes de resolver ambiguidade",              riskTags: ["cancel_item", "ambiguity"] },
  { key: "requestAgent",      title: "Pedir atendente humano",         persona: "cliente bravo",               description: "Solicita atendente humano durante a conversa",            riskTags: ["handoff"] },
  { key: "cocaAmbiguity",     title: "Ambiguidade Coca-Cola",          persona: "cliente confuso",             description: "Pede 'uma coca' sem especificar tamanho",                 riskTags: ["ambiguity", "order_completion"] },
] as const;

interface ArenaMessage { role: "customer" | "bot"; content: string; ts: string; }
interface ArenaResult {
  scenarioId:           string | null;
  runId:                string;
  transcript:           ArenaMessage[];
  status:               "PASS" | "WARN" | "FAIL" | "PENDING";
  score:                number | null;
  persona:              string;
  scenarioTitle:        string;
  sideEffectsPerformed: string[];
}

function RealCasesSection({ onReplayTranscript, showReplayButton = true }: {
  onReplayTranscript: (items: Array<{ role: string; content: string; ts: string }>, title: string) => void;
  showReplayButton?: boolean;
}) {
  const [cases, setCases]     = useState<RealCaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/training/arena/real-cases");
      const data = await res.json() as { ok?: boolean; items?: RealCaseItem[] };
      setCases(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const diagnose = async (id: string) => {
    setActionMsg(null);
    const res  = await fetch(`/api/admin/training/scenarios/${id}/evaluate`, { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    setActionMsg(data.ok ? "✓ Diagnóstico gerado!" : `Erro: ${data.error ?? "falha"}`);
  };

  const propose = async (id: string) => {
    setActionMsg(null);
    const res  = await fetch(`/api/admin/training/scenarios/${id}/proposal`, { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    setActionMsg(data.ok ? "✓ Proposta criada! Veja em Melhorias para Aprovar." : `Erro: ${data.error ?? "falha"}`);
  };

  const replayInArena = async (id: string, title: string) => {
    const res  = await fetch(`/api/admin/training/scenarios/${id}`);
    const data = await res.json() as { transcriptJson?: Array<{ role: string; content: string; ts?: string }> };
    const turns = (data.transcriptJson ?? []).map((t) => ({
      role:    t.role === "customer" ? "customer" : "bot",
      content: t.content,
      ts:      t.ts ?? new Date().toISOString(),
    }));
    onReplayTranscript(turns, title);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Casos reais capturados
        </p>
        <button onClick={() => void load()} className="text-[11px] text-gray-600 hover:text-gray-400">↺ Atualizar</button>
      </div>

      {actionMsg && (
        <p className={`text-xs px-2 py-1 rounded ${actionMsg.startsWith("Erro") ? "text-red-400 bg-red-900/20" : "text-green-400 bg-green-900/20"}`}>
          {actionMsg}
        </p>
      )}

      {loading && <p className="text-xs text-gray-600">Carregando casos reais…</p>}

      {!loading && cases.length === 0 && (
        <p className="text-xs text-gray-600 py-3 text-center">
          Nenhum caso real capturado ainda. Falhas ao vivo aparecerão aqui automaticamente.
        </p>
      )}

      <div className="space-y-2">
        {cases.map((c) => (
          <div key={c.id} className="rounded-xl border border-gray-700 bg-gray-800/40 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-200 truncate">{c.title}</p>
                {c.failureSummary && (
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{c.failureSummary.slice(0, 80)}</p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {statusBadge(c.status)}
                {riskBadge(c.riskLevel)}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-red-400">{c.failureCategory.replace(/_/g, " ")}</span>
              <span>{c.transcriptLength} msgs</span>
              <span>{fmtDate(c.createdAt)}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {showReplayButton && (
                <button
                  onClick={() => void replayInArena(c.id, c.title)}
                  className="rounded bg-violet-800/60 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-800 transition-colors"
                >
                  ▶ Rodar na Arena
                </button>
              )}
              <button
                onClick={() => void diagnose(c.id)}
                className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-600 transition-colors"
              >
                🔍 Gerar diagnóstico
              </button>
              <button
                onClick={() => void propose(c.id)}
                className="rounded bg-yellow-900/40 px-2 py-1 text-[11px] text-yellow-400 hover:bg-yellow-900/60 transition-colors"
              >
                💡 Criar proposta
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArenaTab() {
  const [selectedKey, setSelectedKey] = useState<string>("priceBeforeOrder");
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<ArenaResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [replayTitle, setReplayTitle] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const selectedScenario = ARENA_SCENARIO_DEFS.find((s) => s.key === selectedKey)!

  const runArena = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    setVisibleCount(0);
    try {
      const res  = await fetch("/api/admin/training/arena/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ scenarioKey: selectedKey }),
      });
      const data = await res.json() as ArenaResult & { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Erro ${res.status}`);
      } else {
        setResult(data);
        let i = 0;
        const tick = () => {
          i++;
          setVisibleCount(i);
          if (i < data.transcript.length) setTimeout(tick, 650);
        };
        setTimeout(tick, 300);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [visibleCount]);

  const playbackDone = result && visibleCount >= result.transcript.length;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Safety banner */}
      <div className="rounded-xl border border-green-700/40 bg-green-900/10 px-4 py-2.5 flex items-start gap-2">
        <span className="mt-0.5 text-green-400">🛡</span>
        <p className="text-xs text-green-400 font-medium">
          Arena segura — clientes IA, motor real em modo seco.
          Nenhuma mensagem WhatsApp enviada, nenhum pedido criado, nenhum Pix gerado.
        </p>
      </div>

      {/* Concept note */}
      <div className="rounded-xl border border-violet-700/30 bg-violet-900/10 px-4 py-3 text-xs text-violet-400 space-y-1">
        <p className="font-semibold">Arena de treinamento automático</p>
        <p className="text-violet-500">Clientes IA simulam atendimentos reais. O agente responde com o motor real em modo seguro. Você assiste, avalia e aprova melhorias. Não é um simulador manual — você não precisa digitar nada.</p>
      </div>

      {/* External arenas — linked, never duplicated */}
      {EXTERNAL_ARENAS.map((arena) => (
        <a key={arena.id} href={arena.href}
          className="block rounded-xl border border-sky-700/40 bg-sky-900/10 px-4 py-3 hover:border-sky-500/60 transition-colors">
          <p className="text-xs font-semibold text-sky-300">🎛️ {arena.label} <span className="ml-1 text-[10px] text-sky-500">abrir cockpit →</span></p>
          <p className="mt-0.5 text-xs text-sky-500">{arena.description}</p>
        </a>
      ))}

      {/* replay label */}
      {replayTitle && (
        <div className="rounded-lg bg-violet-900/20 border border-violet-700/30 px-3 py-2 text-xs text-violet-400 flex items-center gap-2">
          <span>Reproduzindo caso real:</span>
          <span className="font-semibold">{replayTitle}</span>
          <button onClick={() => { setReplayTitle(null); setResult(null); setVisibleCount(0); }} className="ml-auto text-violet-500 hover:text-violet-300">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — scenario picker + controls */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Selecionar cenário</p>
          <div className="space-y-1.5">
            {ARENA_SCENARIO_DEFS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => { setSelectedKey(s.key); setResult(null); setError(null); setVisibleCount(0); }}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  selectedKey === s.key
                    ? "border-violet-500 bg-violet-900/20 text-violet-200"
                    : "border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                }`}
              >
                <p className="text-xs font-semibold">{s.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.riskTags.map((tag) => (
                    <span key={tag} className="rounded px-1.5 py-0.5 bg-gray-700 text-[10px] text-gray-400">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void runArena()}
            disabled={running}
            className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {running && <span className="flex h-2 w-2 rounded-full bg-violet-300 animate-pulse" />}
            {running ? "Simulando atendimento…" : "▶ Rodar atendimento simulado"}
          </button>

          {error && (
            <div className="rounded-xl border border-red-700/40 bg-red-900/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Result card */}
          {result && playbackDone && (
            <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultado</p>
              <div className="flex items-center gap-3">
                {statusBadge(result.status)}
                {scoreBar(result.score)}
              </div>
              {result.sideEffectsPerformed.length > 0 && (
                <p className="text-xs text-red-400 font-semibold">⚠ SAFETY VIOLATION: sideEffects não vazio: {result.sideEffectsPerformed.join(", ")}</p>
              )}
              <div className="flex gap-2 flex-wrap text-xs">
                {result.scenarioId && (
                  <button
                    type="button"
                    onClick={() => void fetch(`/api/admin/training/scenarios/${result.scenarioId}`)}
                    className="rounded border border-gray-600 px-2.5 py-1 text-gray-400 hover:bg-gray-700 transition-colors"
                  >
                    ID: {result.scenarioId.slice(0, 8)}…
                  </button>
                )}
                <span className="rounded border border-gray-700 px-2.5 py-1 text-gray-500 font-mono">
                  Run: {result.runId.slice(0, 8)}
                </span>
              </div>
              <p className="text-[11px] text-gray-600">Para diagnóstico GPT-4o e proposta, vá em Casos → Cenários → selecione este cenário → Gerar diagnóstico.</p>
            </div>
          )}
        </div>

        {/* Right — WhatsApp-like playback */}
        <div className="rounded-xl overflow-hidden border border-gray-700 flex flex-col" style={{ minHeight: 500 }}>
          {/* WA header */}
          <div className="bg-green-900/80 border-b border-green-700/40 px-4 py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-green-700 flex items-center justify-center text-base shrink-0">🤖</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{result?.scenarioTitle ?? selectedScenario.title}</p>
              <p className="text-[11px] text-green-400 truncate">Persona: {result?.persona ?? selectedScenario.persona}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-green-900/60 border border-green-700/40 px-2 py-0.5 text-[10px] text-green-400 font-semibold">
              ARENA SEGURA
            </span>
          </div>

          {/* Chat area */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto p-4 bg-gray-900/90 space-y-2"
          >
            {!result && !running && (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-gray-600 text-center">
                  Selecione um cenário e clique em<br />&ldquo;Rodar atendimento simulado&rdquo;
                </p>
              </div>
            )}
            {running && visibleCount === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2.5 w-2.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </div>
            )}
            {result && result.transcript.slice(0, visibleCount).map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                  msg.role === "customer"
                    ? "bg-green-700 text-white rounded-br-sm"
                    : "bg-gray-700 text-gray-100 rounded-bl-sm"
                }`}>
                  <p className={`text-[10px] mb-0.5 font-semibold ${msg.role === "customer" ? "text-green-200" : "text-gray-400"}`}>
                    {msg.role === "customer" ? "Cliente IA" : "Agente"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 text-right ${msg.role === "customer" ? "text-green-300" : "text-gray-500"}`}>
                    {new Date(msg.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {result && visibleCount < result.transcript.length && (
              <div className="flex justify-start">
                <div className="bg-gray-700 rounded-xl px-3 py-2 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-800/80 border-t border-gray-700 px-4 py-2 flex items-center gap-2">
            <p className="text-[11px] text-gray-500 flex-1">
              {result
                ? playbackDone
                  ? `${result.transcript.length} mensagens · ${result.status}`
                  : `Reproduzindo… ${visibleCount}/${result.transcript.length}`
                : "Arena automática — sem digitação manual"}
            </p>
          </div>
        </div>
      </div>
      <RealCasesSection
        onReplayTranscript={(turns, title) => {
          setReplayTitle(title);
          setResult({
            scenarioId:           null,
            runId:                "replay",
            transcript:           turns as ArenaMessage[],
            status:               "PENDING",
            score:                null,
            persona:              "caso real",
            scenarioTitle:        title,
            sideEffectsPerformed: [],
          });
          setVisibleCount(0);
          let i = 0;
          const tick = () => { i++; setVisibleCount(i); if (i < turns.length) setTimeout(tick, 650); };
          setTimeout(tick, 300);
        }}
      />
    </div>
  );
}

// ── Casos Tab (unified: real cases + scenarios + runs) ────────────────────────

type CasosView = "reais" | "cenarios" | "runs";

function CasosTab({ onSelectScenario }: { onSelectScenario: (id: string) => void }) {
  const [view, setView]           = useState<CasosView>("reais");
  const [runs, setRuns]           = useState<TrainingRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage]   = useState(1);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const loadRuns = useCallback(async (page: number) => {
    const res  = await fetch(`/api/admin/training/runs?page=${page}`);
    const data = await res.json();
    setRuns(data.runs ?? []);
    setRunsTotal(data.total ?? 0);
  }, []);

  useEffect(() => {
    if (view === "runs") void loadRuns(runsPage);
  }, [view, runsPage, loadRuns]);

  if (selectedRun) {
    return <RunDetailView runId={selectedRun} onBack={() => setSelectedRun(null)} />;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Sub-filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["reais",    "⚠ Casos Reais"],
          ["cenarios", "Cenários IA"],
          ["runs",     "Runs de treinamento"],
        ] as [CasosView, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${view === v ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "reais" && (
        <RealCasesSection showReplayButton={false} onReplayTranscript={() => {}} />
      )}
      {view === "cenarios" && (
        <ScenariosTab onSelectScenario={onSelectScenario} />
      )}
      {view === "runs" && (
        <RunsTab
          runs={runs} total={runsTotal} page={runsPage}
          onPage={(p) => { setRunsPage(p); void loadRuns(p); }}
          onSelectRun={(id) => setSelectedRun(id)}
        />
      )}
    </div>
  );
}

// ── Validate Cycle Tab ────────────────────────────────────────────────────────

function verdictBadge(v: CycleValidationReport["verdict"]) {
  if (v === "TRAINING_LOOP_VALIDATED")
    return <span className="rounded-full bg-green-900/40 px-3 py-1 text-xs font-semibold text-green-400 border border-green-700/40">TRAINING_LOOP_VALIDATED ✓</span>;
  if (v === "PARTIAL_WITH_ISSUES")
    return <span className="rounded-full bg-yellow-900/40 px-3 py-1 text-xs font-semibold text-yellow-400 border border-yellow-700/40">PARTIAL_WITH_ISSUES ⚠</span>;
  return <span className="rounded-full bg-red-900/40 px-3 py-1 text-xs font-semibold text-red-400 border border-red-700/40">FAILED_WITH_REASONS ✗</span>;
}

function priceLookupVerdictBadge(v: CycleValidationReport["priceLookup"]["validationVerdict"]) {
  const map: Record<CycleValidationReport["priceLookup"]["validationVerdict"], string> = {
    PASS:      "bg-green-900/40 text-green-400 border-green-700/40",
    WARN:      "bg-yellow-900/40 text-yellow-400 border-yellow-700/40",
    FAIL:      "bg-red-900/40 text-red-400 border-red-700/40",
    NOT_FOUND: "bg-gray-800 text-gray-500 border-gray-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold border ${map[v]}`}>{v}</span>;
}

function buildTextReport(report: CycleValidationReport): string {
  const lines: string[] = [
    "FOOCCI — Agent Training Center Validation Report",
    "=".repeat(50),
    `Gerado em:   ${report.generatedAt}`,
    `Run ID:      ${report.runId}`,
    "",
    "── Run Summary ──────────────────────────────",
    `Total:  ${report.runSummary.total} cenários`,
    `Pass:   ${report.runSummary.pass}  Warn: ${report.runSummary.warn}  Fail: ${report.runSummary.fail}`,
    `Score:  ${report.runSummary.score?.toFixed(1) ?? "—"}`,
    `Tempo:  ${(report.runSummary.durationMs / 1000).toFixed(1)}s`,
    "",
    "── Price Lookup ─────────────────────────────",
    `Found:  ${report.priceLookup.found}`,
    `Status: ${report.priceLookup.scenarioStatus ?? "—"}`,
    `Verdict: ${report.priceLookup.validationVerdict}`,
    `Disse "Não encontrei": ${report.priceLookup.saidNotFound}`,
    `priceLookupScore: ${report.priceLookup.priceLookupScore ?? "—"}`,
    `Notas: ${report.priceLookup.notes}`,
    ...(report.priceLookup.botReplies.length > 0 ? [
      "Bot replies:",
      ...report.priceLookup.botReplies.map((r) => `  › ${r.slice(0, 120)}`),
    ] : []),
    "",
    "── Diagnóstico ──────────────────────────────",
    `Gerado: ${report.diagnosis.generated}`,
    ...(report.diagnosis.generated ? [
      `Verdict: ${report.diagnosis.evaluatorVerdict ?? "—"}`,
      `Score:   ${report.diagnosis.overallScore ?? "—"}`,
      ...(report.diagnosis.weaknesses.length > 0 ? [`Fraquezas: ${report.diagnosis.weaknesses.join("; ")}`] : []),
    ] : []),
    "",
    "── Proposta ─────────────────────────────────",
    `Gerada: ${report.proposal.generated}`,
    ...(report.proposal.generated ? [
      `Status:    ${report.proposal.status}`,
      `Tipo:      ${report.proposal.changeType}`,
      `Risco:     ${report.proposal.riskLevel}`,
      `Título:    ${report.proposal.title}`,
    ] : []),
    "",
    "── Safety Checklist ─────────────────────────",
    `allowSideEffects=false:   ✓`,
    `Sem WhatsApp enviado:     ${report.safety.noWhatsAppSent ? "✓" : "✗"}`,
    `Sem pedido criado:        ${report.safety.noOrderCreated ? "✓" : "✗"}`,
    `Sem mutação de produção:  ${report.safety.noProductionMutation ? "✓" : "✗"}`,
    `Proposta PENDING_APPROVAL: ${report.safety.proposalPendingApproval ? "✓" : "✗"}`,
    "",
    "── Issues ───────────────────────────────────",
    ...(report.issues.length === 0 ? ["Nenhum"] : report.issues.map((i) => `• ${i}`)),
    "",
    "── Veredito ─────────────────────────────────",
    report.verdict,
    "",
    `Próximo passo: ${report.nextRecommendation}`,
  ];
  return lines.join("\n");
}

function ValidateCycleTab() {
  const [running,  setRunning]  = useState(false);
  const [report,   setReport]   = useState<CycleValidationReport | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [copied,   setCopied]   = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const res  = await fetch("/api/admin/training/validate-cycle", { method: "POST" });
      const data = await res.json() as { ok: boolean; report?: CycleValidationReport; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Erro ${res.status}`);
      } else if (data.report) {
        setReport(data.report);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setRunning(false);
    }
  };

  const copy = () => {
    if (!report) return;
    void navigator.clipboard.writeText(buildTextReport(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-700/40 bg-blue-900/10 px-4 py-3 text-xs text-blue-400 space-y-1">
        <p className="font-semibold">Validação do ciclo completo de treinamento</p>
        <p className="text-blue-500">Roda um batch de 10 cenários, avalia o cenário de preço, gera diagnóstico e proposta para o pior cenário WARN/FAIL.</p>
        <p className="text-blue-500">Nenhuma mensagem WhatsApp, pedido ou mutação de produção é feita.</p>
      </div>

      {/* Action */}
      <div className="flex gap-3 items-center">
        <button
          onClick={() => void run()}
          disabled={running}
          className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {running && <span className="flex h-2 w-2 rounded-full bg-violet-300 animate-pulse" />}
          {running ? "Validando… (pode levar 30–60s)" : "Validar ciclo agora"}
        </button>
        {report && (
          <button
            onClick={copy}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            {copied ? "✓ Copiado" : "Copiar relatório"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-700/40 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Verdict */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">Veredito</p>
              {verdictBadge(report.verdict)}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{new Date(report.generatedAt).toLocaleString("pt-BR")}</p>
              <p className="text-xs text-gray-600 font-mono">{report.runId.slice(0, 8)}</p>
            </div>
          </div>

          {/* Run summary */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
            <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Run Summary</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total",   value: report.runSummary.total,                            color: "text-white" },
                { label: "Pass",    value: report.runSummary.pass,                             color: "text-green-400" },
                { label: "Warn",    value: report.runSummary.warn,                             color: "text-yellow-400" },
                { label: "Fail",    value: report.runSummary.fail,                             color: "text-red-400" },
              ].map((c) => (
                <div key={c.label} className="text-center">
                  <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
            {report.runSummary.score !== null && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${report.runSummary.score >= 75 ? "bg-green-500" : report.runSummary.score >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${report.runSummary.score}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{report.runSummary.score.toFixed(1)}</span>
              </div>
            )}
            <p className="text-xs text-gray-600 mt-2">Duração: {(report.runSummary.durationMs / 1000).toFixed(1)}s</p>
          </div>

          {/* Price lookup */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Price Lookup — &ldquo;quanto custa o yakisoba&rdquo;</p>
              {priceLookupVerdictBadge(report.priceLookup.validationVerdict)}
            </div>
            <p className="text-xs text-gray-500">{report.priceLookup.notes}</p>
            {report.priceLookup.saidNotFound && (
              <p className="text-xs text-red-400 font-semibold">✗ Bot disse &ldquo;Não encontrei&rdquo;</p>
            )}
            {report.priceLookup.priceLookupScore !== null ? (
              <p className="text-xs text-gray-400">priceLookupScore: <span className={`font-mono font-semibold ${report.priceLookup.priceLookupScore < 60 ? "text-red-400" : report.priceLookup.priceLookupScore < 90 ? "text-yellow-400" : "text-green-400"}`}>{report.priceLookup.priceLookupScore}</span></p>
            ) : report.priceLookup.found ? (
              <p className="text-xs text-yellow-400">⚠ priceLookupScore não populado — avaliação GPT-4o não concluída</p>
            ) : null}
            {report.priceLookup.botReplies.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-gray-600 uppercase">Replies do bot:</p>
                {report.priceLookup.botReplies.map((r, i) => (
                  <p key={i} className="text-xs text-gray-300 bg-gray-900/60 rounded px-2 py-1 font-mono whitespace-pre-wrap">{r.slice(0, 200)}</p>
                ))}
              </div>
            )}
          </div>

          {/* Diagnosis */}
          <div className={`rounded-xl border p-4 space-y-2 ${report.diagnosis.generated ? "border-gray-700 bg-gray-800/60" : "border-red-700/50 bg-red-900/10"}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Diagnóstico GPT-4o</p>
              {!report.diagnosis.generated && (
                <span className="rounded-full bg-red-900/40 border border-red-700/40 px-2 py-0.5 text-xs font-semibold text-red-400">NÃO GERADO ✗</span>
              )}
            </div>
            {report.diagnosis.generated ? (
              <>
                {report.diagnosis.selectedScenarioTitle && (
                  <p className="text-xs text-gray-500">Cenário: <span className="text-gray-300">{report.diagnosis.selectedScenarioTitle}</span></p>
                )}
                <div className="flex gap-3 flex-wrap">
                  <span className="text-xs text-gray-300">Verdict: <span className="font-semibold text-white">{report.diagnosis.evaluatorVerdict}</span></span>
                  {report.diagnosis.overallScore !== null && (
                    <span className="text-xs text-gray-300">Score: <span className="font-semibold text-white">{report.diagnosis.overallScore}</span></span>
                  )}
                </div>
                {report.diagnosis.weaknesses.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {report.diagnosis.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-yellow-400">• {w}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-red-300">
                {report.issues.find((i) => i.startsWith("diagnosis") || i.startsWith("no_warn")) ?? "Diagnóstico não gerado — sem cenário WARN/FAIL ou erro na avaliação GPT-4o."}
              </p>
            )}
          </div>

          {/* Proposal */}
          <div className={`rounded-xl border p-4 space-y-2 ${report.proposal.generated ? (report.proposal.appearsInQueue ? "border-gray-700 bg-gray-800/60" : "border-yellow-700/50 bg-yellow-900/10") : "border-red-700/50 bg-red-900/10"}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Proposta de Melhoria</p>
              {!report.proposal.generated && (
                <span className="rounded-full bg-red-900/40 border border-red-700/40 px-2 py-0.5 text-xs font-semibold text-red-400">NÃO GERADA ✗</span>
              )}
              {report.proposal.generated && !report.proposal.appearsInQueue && (
                <span className="rounded-full bg-yellow-900/40 border border-yellow-700/40 px-2 py-0.5 text-xs font-semibold text-yellow-400">FORA DA FILA ⚠</span>
              )}
            </div>
            {report.proposal.generated ? (
              <div className="space-y-1">
                <p className="text-sm text-white">{report.proposal.title}</p>
                <div className="flex gap-3 flex-wrap text-xs text-gray-400">
                  <span>Status: <span className="text-yellow-400 font-semibold">{report.proposal.status}</span></span>
                  <span>Tipo: {report.proposal.changeType}</span>
                  <span>Risco: {report.proposal.riskLevel}</span>
                  {report.proposal.appearsInQueue && (
                    <span className="text-green-400 font-semibold">✓ Na fila PENDING_APPROVAL</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-mono">{report.proposal.proposalId?.slice(0, 16)}…</p>
              </div>
            ) : (
              <p className="text-xs text-red-300">
                {report.issues.find((i) => i.startsWith("proposal")) ?? "Proposta não gerada — requer diagnóstico primeiro."}
              </p>
            )}
          </div>

          {/* Safety checklist */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Safety Checklist</p>
            <div className="space-y-1.5">
              {[
                { label: "allowSideEffects=false",   ok: report.safety.allowSideEffectsFalse },
                { label: "Sem WhatsApp enviado",      ok: report.safety.noWhatsAppSent },
                { label: "Sem pedido criado",         ok: report.safety.noOrderCreated },
                { label: "Sem mutação de produção",   ok: report.safety.noProductionMutation },
                { label: "Proposta PENDING_APPROVAL", ok: report.safety.proposalPendingApproval },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className={ok ? "text-green-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                  <span className={ok ? "text-gray-300" : "text-red-300"}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Issues */}
          {report.issues.length > 0 && (
            <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 p-4">
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">Issues</p>
              <ul className="space-y-1">
                {report.issues.map((i, idx) => (
                  <li key={idx} className="text-xs text-yellow-300">• {i}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Next recommendation */}
          <div className="rounded-xl border border-violet-700/40 bg-violet-900/10 px-4 py-3">
            <p className="text-xs text-violet-400 font-semibold">Próximo passo</p>
            <p className="text-xs text-violet-300 mt-0.5">{report.nextRecommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupCheckPanel() {
  const [data, setData]       = useState<SetupCheckData | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/training/setup-check");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const testCron = async (key: string) => {
    setTesting(key);
    setTestResult(null);
    const res = await fetch("/api/admin/training/setup-check", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ endpoint: key }),
    });
    setTestResult(await res.json());
    setTesting(null);
  };

  const copyRailwayConfig = () => {
    if (!data) return;
    const text = [
      "# Railway Cron — Agent Training",
      "",
      "# Batch pequeno (a cada 30min)",
      `Schedule: */30 * * * *`,
      `URL: POST https://foocci.com.br/api/cron/agent-training/run-small-batch`,
      `Header: Authorization: Bearer $CRON_SECRET`,
      "",
      "# Batch noturno (diariamente 04:00 BRT = 07:00 UTC)",
      `Schedule: 0 7 * * *`,
      `URL: POST https://foocci.com.br/api/cron/agent-training/run-nightly`,
      `Header: Authorization: Bearer $CRON_SECRET`,
      "",
      "# Mineração (a cada 30min)",
      `Schedule: */30 * * * *`,
      `URL: POST https://foocci.com.br/api/cron/agent-training/mine-real-conversations`,
      `Header: Authorization: Bearer $CRON_SECRET`,
      "",
      "# Processamento de backlog WARN/FAIL → propostas (a cada 30min)",
      `Schedule: */30 * * * *`,
      `URL: POST https://foocci.com.br/api/cron/agent-training/process-backlog`,
      `Header: Authorization: Bearer $CRON_SECRET`,
    ].join("\n");
    void navigator.clipboard.writeText(text);
  };

  const statusIcon = (s: string) =>
    s === "ok" ? "✓" : s === "warn" ? "⚠" : "✗";
  const statusColor = (s: string) =>
    s === "ok" ? "text-green-400" : s === "warn" ? "text-yellow-400" : "text-red-400";
  const statusBg = (s: string) =>
    s === "ok" ? "border-green-700/30 bg-green-900/10" : s === "warn" ? "border-yellow-700/30 bg-yellow-900/10" : "border-red-700/30 bg-red-900/10";

  if (loading) return <div className="text-gray-500 text-sm p-2">Verificando configuração…</div>;
  if (!data)   return null;

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${statusBg(data.overallStatus)}`}>
        <div className="flex items-center gap-2">
          <span className={`text-lg ${statusColor(data.overallStatus)}`}>{statusIcon(data.overallStatus)}</span>
          <span className={`text-sm font-semibold ${statusColor(data.overallStatus)}`}>
            {data.overallStatus === "ok"
              ? "Sistema pronto — treinamento automático funcionando"
              : data.overallStatus === "warn"
              ? "Configuração parcial — alguns itens precisam de atenção"
              : "Configuração incompleta — treinamento automático não funcionará"}
          </span>
        </div>
        <button onClick={() => void load()}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-2 py-1">
          ↺ Verificar
        </button>
      </div>

      {/* Checklist items */}
      <div className="space-y-2">
        {data.items.map((item) => (
          <div key={item.key} className={`rounded-lg border px-3 py-2.5 flex items-start justify-between gap-3 ${statusBg(item.status)}`}>
            <div className="flex items-start gap-2 min-w-0">
              <span className={`text-sm mt-0.5 shrink-0 ${statusColor(item.status)}`}>{statusIcon(item.status)}</span>
              <div>
                <p className={`text-xs font-medium ${statusColor(item.status)}`}>{item.label}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{item.detail}</p>
                {item.fix && (
                  <p className="text-[11px] text-yellow-500 mt-0.5">→ {item.fix}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cron endpoints with test buttons */}
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Endpoints Cron</p>
          <button onClick={copyRailwayConfig}
            className="text-xs text-violet-400 hover:text-violet-300 border border-violet-700/40 rounded px-2 py-1">
            📋 Copiar config Railway
          </button>
        </div>
        {(Object.entries(data.cronEndpoints) as [string, string][]).map(([key, path]) => (
          <div key={key} className="flex items-center gap-3 flex-wrap">
            <code className="text-[11px] text-gray-400 flex-1 min-w-0 truncate">{path}</code>
            <button
              onClick={() => void testCron(key)}
              disabled={testing === key}
              className="shrink-0 text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 rounded px-2 py-1 disabled:opacity-50"
            >
              {testing === key ? "Testando…" : "▶ Testar agora"}
            </button>
          </div>
        ))}
        {testResult && (
          <div className={`rounded-lg border p-2 text-[11px] font-mono ${(testResult as { ok?: boolean }).ok ? "border-green-700/40 text-green-400" : "border-red-700/40 text-red-400"}`}>
            {JSON.stringify(testResult, null, 2).slice(0, 400)}
          </div>
        )}
        <p className="text-[10px] text-gray-600">Configure CRON_SECRET nas variáveis de ambiente. Setup único no Railway — não precisa ser repetido.</p>
      </div>
    </div>
  );
}

function ConfiguracoesTab() {
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
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Setup checklist */}
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold mb-3">Checklist de configuração</p>
        <SetupCheckPanel />
      </div>

      <div className="rounded-xl border border-red-700/40 bg-red-900/10 px-4 py-3 text-xs text-red-400 font-semibold">
        🔒 Aplicar em produção automaticamente — sempre DESATIVADO em v1. Nunca automático.
      </div>
      <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 px-4 py-3 text-xs text-yellow-400">
        Mudanças em produção requerem aprovação manual. Sandbox não afeta clientes reais.
      </div>

      <div className="space-y-4">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Captura de falhas reais</p>
        {([
          ["useRealConversationMining", "Capturar falhas reais automaticamente"],
          ["autoDiagnoseOnFailure",     "Gerar diagnóstico automático para WARN/FAIL"],
          ["autoCreateProposals",       "Criar proposta automática para falhas recorrentes"],
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
      </div>

      <div className="space-y-4 pt-2 border-t border-gray-800">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Sandbox e treinamento</p>
        {([
          ["enableContinuousTraining", "Treinamento contínuo ativo"],
          ["useAiGeneratedScenarios",  "Usar cenários gerados por IA"],
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
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Máx. cenários/hora</label>
        <input
          type="number" min={1} max={100} value={config.maxScenariosPerHour}
          onChange={(e) => setConfig((c) => c ? { ...c, maxScenariosPerHour: parseInt(e.target.value, 10) || 20 } : c)}
          className="w-40 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white"
        />
      </div>

      <button onClick={save} disabled={saving}
        className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 transition-colors">
        {saving ? "Salvando…" : saved ? "✓ Salvo" : "Salvar configuração"}
      </button>

      {/* Debug tools */}
      <div className="pt-4 border-t border-gray-800 space-y-2">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Ferramentas de diagnóstico</p>
        <a
          href="/admin/diagnostics/whatsapp-text-ordering/simulator"
          className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          <span>🔧</span>
          <span>WA Simulador (debug manual)</span>
          <span className="ml-auto text-gray-600">↗</span>
        </a>
        <p className="text-[10px] text-gray-600">Simulador manual do WhatsApp Text Ordering para diagnóstico de problemas. Não substitui a Arena automática.</p>
      </div>
    </div>
  );
}

// ── Scenario detail modal ─────────────────────────────────────────────────────

interface ScenarioDetail {
  id: string; title: string; status: string; score: number | null;
  customerPersona: string | null; goal: string | null; source: string;
  failureSummary: string | null; transcriptJson: unknown;
  expectedOutcomeJson: unknown; actualOutcomeJson: unknown;
  createdAt: string;
  evaluations: Array<{
    id: string; verdict: string; scoreJson: unknown;
    strengths: string | null; weaknesses: string | null;
    safetyIssues: string | null; frictionIssues: string | null;
    conversionIssues: string | null; recommendation: string | null;
    createdAt: string;
  }>;
}

const SCORE_LABELS: Record<string, string> = {
  conversionScore:      "Conversão",
  clarityScore:         "Clareza",
  safetyScore:          "Segurança",
  frictionScore:        "Sem fricção",
  menuAccuracyScore:    "Precisão cardápio",
  orderCompletionScore: "Pedido completo",
  handoffScore:         "Handoff",
  priceLookupScore:     "Preço lookup",
  overallScore:         "Geral",
};

function scoreBarMini(label: string, value: number) {
  const color = value >= 75 ? "#4ade80" : value >= 50 ? "#facc15" : "#f87171";
  return (
    <div key={label} className="flex items-center gap-2 text-[11px]">
      <span className="w-32 text-gray-500 shrink-0">{label}</span>
      <div className="h-1.5 w-24 rounded-full bg-gray-700 shrink-0">
        <div className="h-1.5 rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-gray-300 w-6">{value}</span>
    </div>
  );
}

function ScenarioDetailModal({ scenarioId, onClose }: { scenarioId: string; onClose: () => void }) {
  const [scenario, setScenario]     = useState<ScenarioDetail | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [proposing, setProposing]   = useState(false);
  const [actionMsg, setActionMsg]   = useState<string | null>(null);
  const [showRaw, setShowRaw]       = useState(false);

  const load = useCallback(() => {
    void fetch(`/api/admin/training/scenarios/${scenarioId}`)
      .then((r) => r.json())
      .then((d) => setScenario(d));
  }, [scenarioId]);

  useEffect(() => { load(); }, [load]);

  const runEvaluate = async () => {
    setEvaluating(true);
    setActionMsg(null);
    const res = await fetch(`/api/admin/training/scenarios/${scenarioId}/evaluate`, { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    setEvaluating(false);
    if (data.ok) { setActionMsg("✓ Diagnóstico gerado!"); load(); }
    else setActionMsg(`Erro: ${data.error ?? "falha"}`);
  };

  const runProposal = async () => {
    setProposing(true);
    setActionMsg(null);
    const res = await fetch(`/api/admin/training/scenarios/${scenarioId}/proposal`, { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    setProposing(false);
    if (data.ok) setActionMsg("✓ Proposta criada! Veja em Melhorias para Aprovar.");
    else setActionMsg(`Erro: ${data.error ?? "falha"}`);
  };

  const expected = scenario?.expectedOutcomeJson as Record<string, unknown> | null ?? null;
  const actual   = scenario?.actualOutcomeJson   as Record<string, unknown> | null ?? null;
  const hasEval  = (scenario?.evaluations?.length ?? 0) > 0;
  const firstEval = scenario?.evaluations?.[0];
  const scores   = firstEval?.scoreJson as Record<string, number> | null ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-6 px-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 shadow-xl mb-10">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">{scenario?.title ?? "Carregando…"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {!scenario ? (
          <div className="p-6 text-center text-gray-500 text-sm">Carregando…</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header badges */}
            <div className="flex gap-3 flex-wrap items-center">
              {statusBadge(scenario.status)}
              {scoreBar(scenario.score)}
              {scenario.customerPersona && <span className="text-xs text-gray-500">{scenario.customerPersona}</span>}
              {scenario.goal && <span className="text-xs text-gray-500">{scenario.goal.replace(/_/g, " ")}</span>}
              <span className="text-xs text-gray-600">{scenario.source === "REAL_CONVERSATION" ? "Real" : "IA"}</span>
            </div>

            {scenario.failureSummary && (
              <div className="rounded-lg border border-red-700/40 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                ⚠ {scenario.failureSummary}
              </div>
            )}

            {/* WhatsApp-style transcript */}
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Transcrição</p>
              <div className="rounded-xl border border-gray-700 bg-[#0d1117] p-3 space-y-2 max-h-72 overflow-y-auto">
                {(scenario.transcriptJson as Array<{ role: string; content: string; debug?: { stage?: string; intent?: string } }>)?.map((t, i) => (
                  <div key={i} className={`flex flex-col ${t.role === "customer" ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-sm whitespace-pre-wrap ${t.role === "customer" ? "bg-[#dcf8c6] text-[#111]" : "bg-white text-[#111]"}`}>
                      {t.content}
                    </div>
                    {t.debug && (
                      <span className="text-[10px] text-gray-600 mt-0.5 px-1">
                        {t.debug.intent ?? ""}{t.debug.stage ? ` · ${t.debug.stage}` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Expected vs Actual */}
            {(expected || actual) && (
              <div>
                <p className="text-[11px] text-gray-500 mb-2">Esperado vs Real</p>
                <div className="grid grid-cols-2 gap-3">
                  {expected && (
                    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs space-y-1">
                      <p className="text-[10px] text-gray-500 mb-1 font-semibold">ESPERADO</p>
                      {Object.entries(expected).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <span className="text-gray-500">{k}</span>
                          <span className={`text-gray-300 ${actual && k in actual && String(actual[k]) !== String(v) ? "text-red-400" : ""}`}>
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {actual && (
                    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 text-xs space-y-1">
                      <p className="text-[10px] text-gray-500 mb-1 font-semibold">REAL</p>
                      {Object.entries(actual).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <span className="text-gray-500">{k}</span>
                          <span className={`text-gray-300 ${expected && k in expected && String(expected[k]) !== String(v) ? "text-yellow-400" : ""}`}>
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Evaluation */}
            {hasEval && firstEval ? (
              <div>
                <p className="text-[11px] text-gray-500 mb-2">Diagnóstico IA</p>
                <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4 space-y-3">
                  <div className="flex gap-2 items-center">
                    {statusBadge(firstEval.verdict)}
                    <span className="text-xs text-gray-500">avaliado por GPT-4o</span>
                  </div>
                  {scores && (
                    <div className="grid grid-cols-1 gap-1 pt-1">
                      {Object.entries(scores)
                        .filter(([k]) => k !== "overallScore")
                        .map(([k, v]) => scoreBarMini(SCORE_LABELS[k] ?? k, v))}
                      <div className="border-t border-gray-700 pt-1 mt-1">
                        {scoreBarMini("GERAL", scores.overallScore ?? 0)}
                      </div>
                    </div>
                  )}
                  <div className="text-xs space-y-1.5 pt-1">
                    {firstEval.strengths   && <p className="text-green-400">✓ {firstEval.strengths}</p>}
                    {firstEval.weaknesses  && <p className="text-yellow-400">⚠ {firstEval.weaknesses}</p>}
                    {firstEval.frictionIssues && <p className="text-orange-400">↺ {firstEval.frictionIssues}</p>}
                    {firstEval.safetyIssues   && <p className="text-red-400">🛡 {firstEval.safetyIssues}</p>}
                    {firstEval.recommendation && <p className="text-gray-400">→ {firstEval.recommendation}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 p-4 text-center">
                <p className="text-xs text-gray-500 mb-3">Sem diagnóstico ainda.</p>
                <button onClick={runEvaluate} disabled={evaluating}
                  className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50">
                  {evaluating ? "Gerando…" : "🔍 Gerar diagnóstico"}
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {hasEval && !evaluating && (
                <button onClick={runEvaluate} disabled={evaluating}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800">
                  {evaluating ? "Gerando…" : "↺ Re-avaliar"}
                </button>
              )}
              {hasEval && scenario.status !== "PASS" && (
                <button onClick={runProposal} disabled={proposing}
                  className="rounded-lg bg-yellow-700/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-700 disabled:opacity-50">
                  {proposing ? "Criando…" : "💡 Criar proposta de melhoria"}
                </button>
              )}
            </div>

            {actionMsg && (
              <p className={`text-xs px-2 py-1 rounded ${actionMsg.startsWith("Erro") ? "text-red-400 bg-red-900/20" : "text-green-400 bg-green-900/20"}`}>
                {actionMsg}
              </p>
            )}

            {/* Raw JSON toggle */}
            <div>
              <button onClick={() => setShowRaw(v => !v)}
                className="text-[11px] text-gray-600 hover:text-gray-400">
                {showRaw ? "▲ Ocultar JSON raw" : "▼ Ver JSON raw"}
              </button>
              {showRaw && (
                <pre className="mt-2 rounded-lg border border-gray-700 bg-gray-950 p-3 text-[10px] text-gray-400 overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(scenario, null, 2)}
                </pre>
              )}
            </div>
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

// ── Formatura (Fase D): o boletim de sombra + as provas (gates) + a formatura
// (escada de promoção). Reaproveita o painel canônico da Escada do Brain — a
// "escola" agora mostra a cerimônia inteira, não só a aula. ────────────────────
function FormaturaTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-4">
        <h3 className="text-sm font-bold text-violet-200">🎓 Formatura — do treino ao atendimento ao vivo</h3>
        <p className="mt-1 text-xs text-gray-400">
          Aqui o agente &quot;se forma&quot;: o <b>boletim</b> mostra como ele se sai em sombra (raciocina em paralelo
          em toda conversa real, sem responder), as <b>provas</b> são os gates (coerência ≥ 70%, verdade completa,
          diagnóstico P0=0) e a <b>formatura</b> é a promoção governada — SHADOW → time (allowlist) → clientes.
          Nada aqui responde cliente sem sua decisão explícita; rollback de 30s sempre disponível.
        </p>
      </div>
      <BrainFreeFormPanel />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "visao-geral" | "caixa-unica" | "arena" | "casos" | "melhorias" | "formatura" | "validacao" | "configuracoes";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "visao-geral",     label: "Visão Geral" },
  { id: "caixa-unica",     label: "📥 Caixa Única" },
  { id: "arena",           label: "Arena" },
  { id: "casos",           label: "Casos" },
  { id: "melhorias",       label: "Melhorias para Aprovar" },
  { id: "formatura",       label: "🎓 Formatura" },
  { id: "validacao",       label: "Validação" },
  { id: "configuracoes",   label: "Configurações" },
];

export default function AgentTrainingPage() {
  const [tab, setTab]               = useState<Tab>("visao-geral");
  const [dashboard, setDashboard]   = useState<DashboardData | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [runningBatch, setRunningBatch]     = useState(false);
  const [runningNightly, setRunningNightly] = useState(false);
  const [runningMining, setRunningMining]   = useState(false);
  const [pendingCount, setPendingCount]     = useState(0);
  const [backfilling, setBackfilling]       = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/admin/training/dashboard");
    if (res.ok) setDashboard(await res.json());
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

  const triggerBatch = async () => {
    setRunningBatch(true);
    await fetch("/api/admin/training/runs", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ agentType: "WHATSAPP_ORDERING", mode: "QUICK", count: 10 }),
    });
    setRunningBatch(false);
    void loadDashboard();
  };

  const triggerNightly = async () => {
    setRunningNightly(true);
    await fetch("/api/admin/training/trigger/nightly", { method: "POST" });
    setRunningNightly(false);
    void loadDashboard();
  };

  const triggerMining = async () => {
    setRunningMining(true);
    await fetch("/api/admin/training/trigger/mine", { method: "POST" });
    setRunningMining(false);
    void loadDashboard();
  };

  const pauseTraining = async () => {
    await fetch("/api/admin/training/config", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ enableContinuousTraining: false }),
    });
    void loadDashboard();
  };

  const triggerBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/training/backfill-proposals", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      setBackfillResult(await res.json());
    } catch {
      setBackfillResult({ ok: false, error: "Falha de rede" });
    }
    setBackfilling(false);
    void loadDashboard();
    void loadPendingCount();
  };

  const resumeTraining = async () => {
    await fetch("/api/admin/training/config", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ enableContinuousTraining: true }),
    });
    void loadDashboard();
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
            <h1 className="text-lg font-bold text-white">🧠 Central de Treinamento IA</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Clientes IA simulam atendimentos, o agente responde em modo seguro, falhas viram melhorias, e você aprova antes de qualquer mudança.
            </p>
          </div>
          {pendingCount > 0 && (
            <button onClick={() => setTab("caixa-unica")}
              className="flex items-center gap-2 rounded-full bg-yellow-900/40 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-900/60 border border-yellow-700/40 transition-colors">
              <span className="flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              {pendingCount} melhoria{pendingCount > 1 ? "s" : ""} para aprovar
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
        {tab === "visao-geral" && (
          <VisaoGeralTab
            data={dashboard}
            onRunBatch={triggerBatch}
            running={runningBatch}
            onRunNightly={triggerNightly}
            runningNightly={runningNightly}
            onRunMining={triggerMining}
            runningMining={runningMining}
            onPause={pauseTraining}
            onResume={resumeTraining}
            onSwitchToCasos={() => setTab("casos")}
            onBackfill={triggerBackfill}
            backfilling={backfilling}
            backfillResult={backfillResult}
          />
        )}
        {tab === "caixa-unica"   && <UnifiedInboxTab />}
        {tab === "arena"         && <ArenaTab />}
        {tab === "casos"         && <CasosTab onSelectScenario={(id) => setSelectedScenario(id)} />}
        {tab === "melhorias"     && <MelhoriasTab />}
        {tab === "formatura"     && <FormaturaTab />}
        {tab === "validacao"     && <ValidateCycleTab />}
        {tab === "configuracoes" && <ConfiguracoesTab />}
      </div>
    </div>
  );
}
