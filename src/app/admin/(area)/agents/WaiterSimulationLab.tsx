"use client";

/**
 * WaiterSimulationLab — cockpit for the Agent Simulation Lab (Waiter).
 *
 * Runs safe, dry-run simulations of artificial customers against the real
 * deterministic Waiter engine, shows the score / P0·P1·P2 / opportunities, and
 * lets a human approve/reject/backlog each opportunity. It NEVER changes runtime.
 */

import { useCallback, useEffect, useState } from "react";

const BASE = "/api/admin/agents/waiter/simulation";

interface RunRow {
  id: string; status: string; seed: string | null; driver: string;
  scenariosTotal: number; scenariosPassed: number; scenariosWarning: number; scenariosFailed: number;
  p0Count: number; p1Count: number; p2Count: number; opportunityCount: number; createdAt: string;
}
interface ScenarioRow {
  id: string; scenarioType: string; persona: string; initialMessage: string;
  status: string; severity: string; score: number; summary: string; transcript: string | null;
}
interface OppRow {
  id: string; type: string; severity: string; title: string; summary: string;
  recommendation: string; expectedImpact: string | null; status: string;
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800", gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${map[tone] ?? map.gray}`}>{children}</span>;
}

const sevTone = (s: string) => (s === "P0" ? "red" : s === "P1" ? "amber" : s === "P2" ? "violet" : "gray");
const statusTone = (s: string) => (s === "PASS" ? "green" : s === "WARNING" ? "amber" : s === "FAIL" ? "red" : "gray");

export function WaiterSimulationLab() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [detail, setDetail] = useState<{ run: RunRow; scenarios: ScenarioRow[]; opportunities: OppRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [scenarioCount, setScenarioCount] = useState(12);
  const [seed, setSeed] = useState("");

  const loadRuns = useCallback(async () => {
    const res = await fetch(BASE).then((r) => r.json()).catch(() => ({ ok: false }));
    if (res.ok) setRuns(res.runs ?? []);
  }, []);

  const loadDetail = useCallback(async (runId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/${runId}`).then((r) => r.json());
      if (res.ok) setDetail({ run: res.run, scenarios: res.run.scenarios ?? [], opportunities: res.run.opportunities ?? [] });
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const runNow = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${BASE}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioCount, seed: seed.trim() || undefined }),
      });
      const json = await res.json();
      if (json.ok) { setMsg(`Run ${json.runId}: ${json.summary.passed}/${json.summary.scenariosTotal} PASS · P0=${json.summary.p0} · ${json.summary.opportunities} oportunidade(s).`); await loadRuns(); await loadDetail(json.runId); }
      else setMsg(json.error ?? "Falha.");
    } finally { setBusy(false); }
  }, [scenarioCount, seed, loadRuns, loadDetail]);

  const reviewOpp = useCallback(async (id: string, status: string) => {
    await fetch(`${BASE}/opportunities/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (detail) await loadDetail(detail.run.id);
  }, [detail, loadDetail]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] text-blue-800">
        🧪 <strong>Simulação segura</strong>: clientes artificiais conversam com o motor real do Waiter em modo dry-run.
        <strong> Não cria pedido, não gera Pix, não envia WhatsApp, não altera runtime.</strong> Só testa, diagnostica e sugere — o humano aprova.
      </div>

      {/* Controls */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Rodar simulação</h3>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600">Cenários
            <input type="number" min={1} max={24} value={scenarioCount}
              onChange={(e) => setScenarioCount(Math.max(1, Math.min(24, Number(e.target.value) || 12)))}
              className="mt-0.5 block w-20 rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-gray-600">Seed (opcional)
            <input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="ex: 2026-06-09"
              className="mt-0.5 block w-44 rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button type="button" disabled={busy} onClick={() => void runNow()}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Rodando…" : "Rodar simulação agora"}
          </button>
        </div>
        {msg && <p className="mt-2 text-[11px] text-gray-700">{msg}</p>}
      </section>

      {/* Last run summary */}
      {detail && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Último run</h3>
            <Pill tone={statusTone(detail.run.status === "COMPLETED" ? "PASS" : "WARNING")}>{detail.run.status}</Pill>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="Cenários" value={String(detail.run.scenariosTotal)} tone="blue" />
            <Stat label="PASS" value={String(detail.run.scenariosPassed)} tone="green" />
            <Stat label="WARN" value={String(detail.run.scenariosWarning)} tone="amber" />
            <Stat label="FAIL" value={String(detail.run.scenariosFailed)} tone="red" />
            <Stat label="P0" value={String(detail.run.p0Count)} tone={detail.run.p0Count > 0 ? "red" : "green"} />
            <Stat label="Oportunidades" value={String(detail.run.opportunityCount)} tone="violet" />
          </div>

          {/* Opportunities */}
          <h4 className="mt-4 text-xs font-bold text-gray-900">Oportunidades (revisão humana)</h4>
          <div className="mt-1.5 space-y-1.5">
            {detail.opportunities.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma oportunidade neste run.</p>}
            {detail.opportunities.map((o) => (
              <div key={o.id} className="rounded-lg border border-gray-100 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={sevTone(o.severity)}>{o.severity}</Pill>
                  <Pill tone="gray">{o.type}</Pill>
                  <span className="text-xs font-semibold text-gray-800">{o.title}</span>
                  <Pill tone={o.status === "APPROVED" ? "green" : o.status === "REJECTED" ? "red" : o.status === "BACKLOGGED" ? "violet" : "amber"}>{o.status}</Pill>
                </div>
                <p className="mt-1 text-[11px] text-gray-600">{o.summary}</p>
                <p className="mt-0.5 text-[11px] text-gray-700">→ {o.recommendation}</p>
                <div className="mt-1 flex gap-1">
                  <Btn onClick={() => void reviewOpp(o.id, "APPROVED")}>Aprovar</Btn>
                  <Btn tone="red" onClick={() => void reviewOpp(o.id, "REJECTED")}>Rejeitar</Btn>
                  <Btn onClick={() => void reviewOpp(o.id, "BACKLOGGED")}>Backlog</Btn>
                </div>
              </div>
            ))}
          </div>

          {/* Scenarios / transcripts */}
          <h4 className="mt-4 text-xs font-bold text-gray-900">Cenários + transcripts (sanitizados)</h4>
          <div className="mt-1.5 space-y-1.5">
            {detail.scenarios.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-100 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={statusTone(s.status)}>{s.status}</Pill>
                  <Pill tone={sevTone(s.severity)}>{s.severity}</Pill>
                  <span className="text-xs font-semibold text-gray-800">{s.scenarioType}</span>
                  <span className="text-[10px] text-gray-400">score {s.score}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-600">{s.persona} — “{s.initialMessage}”</p>
                <p className="mt-0.5 text-[11px] text-gray-700">{s.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Histórico de runs</h3>
        <div className="mt-2 space-y-1">
          {runs.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma simulação ainda. Rode a primeira acima.</p>}
          {runs.map((r) => (
            <button key={r.id} type="button" onClick={() => void loadDetail(r.id)}
              className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5 text-left hover:bg-gray-50">
              <span className="font-mono text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
              <Pill tone="blue">{r.scenariosTotal} cenários</Pill>
              <Pill tone="green">{r.scenariosPassed} PASS</Pill>
              <Pill tone={r.p0Count > 0 ? "red" : "gray"}>P0 {r.p0Count}</Pill>
              <Pill tone="violet">{r.opportunityCount} opp</Pill>
            </button>
          ))}
        </div>
      </section>

      {/* Metrics placeholders (honest) */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Métricas de simulação</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["Cobertura de personas", "Tendência de P0", "Conversão simulada", "Oportunidades aprovadas"].map((m) => (
            <div key={m} className="rounded-lg border border-dashed border-gray-200 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-gray-700">{m}</p>
              <p className="text-[10px] text-gray-400">Aguardando tracking</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-100 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5"><Pill tone={tone}>{value}</Pill></div>
    </div>
  );
}
function Btn({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: string }) {
  const cls = tone === "red" ? "border-red-300 text-red-700 hover:bg-red-50" : "border-gray-300 text-gray-700 hover:bg-gray-100";
  return <button type="button" onClick={onClick} className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</button>;
}
