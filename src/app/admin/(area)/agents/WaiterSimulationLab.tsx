"use client";

/**
 * WaiterSimulationLab — the single operational cockpit for the Waiter Simulation
 * Lab. The operator opens this ONE tab and immediately sees: is the lab running
 * automatically, when it last ran / runs next, what was tested, which problems and
 * OPPORTUNITIES appeared, what needs human approval, the real sanitized examples
 * feeding it, and the recent history. Nothing is hidden in docs/logs/workflows.
 *
 * Human approval lives here (opportunities + real examples) — NOT on individual
 * Library techniques (those are born ready; governance is at version/runtime).
 */

import { useCallback, useEffect, useState } from "react";

const BASE = "/api/admin/agents/waiter/simulation";

interface RunMini {
  id: string; mode: string; status: string; createdAt: string;
  scenariosTotal: number; scenariosPassed: number; scenariosWarning: number; scenariosFailed: number;
  p0Count: number; p1Count: number; p2Count: number; opportunityCount: number;
}
interface OppRow {
  id: string; type: string; severity: string; title: string; summary: string;
  recommendation: string; expectedImpact: string | null; status: string;
  scenario?: { scenarioType: string; persona: string; initialMessage: string } | null;
  run?: { mode: string } | null;
}
interface ScenarioRow {
  id: string; scenarioType: string; persona: string; initialMessage: string;
  status: string; severity: string; score: number; summary: string; transcript: string | null;
}
interface ExampleStats { total: number; approved: number; pending: number; rejected: number }
interface ExampleRow { id: string; intent: string; scenarioType: string; channel: string; summary: string; status: string }
interface Cockpit {
  automation: { isAutomated: boolean; scheduleLabel: string; nextScheduledRunEstimate: string };
  latestRun: RunMini | null;
  latestManualRun: RunMini | null;
  latestCronRun: RunMini | null;
  pendingOpportunities: OppRow[];
  pendingOpportunityCount: number;
  opportunitiesByStatus: Record<string, number>;
  latestScenarios: ScenarioRow[];
  exampleStats: ExampleStats;
  runtimeSafety: { label: string };
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
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export function WaiterSimulationLab() {
  const [ck, setCk] = useState<Cockpit | null>(null);
  const [history, setHistory] = useState<RunMini[]>([]);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [scenarioCount, setScenarioCount] = useState(12);
  const [seed, setSeed] = useState("");

  const load = useCallback(async () => {
    const [c, h, e] = await Promise.all([
      fetch(`${BASE}/cockpit`).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`${BASE}?limit=15`).then((r) => r.json()).catch(() => ({ ok: false })),
      fetch(`${BASE}/examples?limit=20`).then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    if (c.ok) setCk(c.cockpit);
    if (h.ok) setHistory(h.runs ?? []);
    if (e.ok) setExamples(e.examples ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runNow = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${BASE}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioCount, seed: seed.trim() || undefined }),
      });
      const json = await res.json();
      setMsg(json.ok ? `Pronto: ${json.summary.passed}/${json.summary.scenariosTotal} OK · ${json.summary.p0} crítico(s) · ${json.summary.opportunities} oportunidade(s).` : (json.error ?? "Falha."));
      await load();
    } finally { setBusy(false); }
  }, [scenarioCount, seed, load]);

  const reviewOpp = useCallback(async (id: string, status: string) => {
    await fetch(`${BASE}/opportunities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }, [load]);

  const extractExamples = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/examples/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 50, days: 30 }) });
      const json = await res.json();
      setMsg(json.ok ? `Extraídos ${json.created} exemplo(s) pendente(s).` : (json.error ?? "Falha."));
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const reviewExample = useCallback(async (id: string, status: string) => {
    await fetch(`${BASE}/examples/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }, [load]);

  const parseTranscript = (t: string | null): Array<{ role: string; content: string }> => {
    if (!t) return [];
    try { return JSON.parse(t); } catch { return []; }
  };

  return (
    <div className="space-y-4">
      {/* ── SEÇÃO 1 — Status do laboratório ─────────────────────────────── */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">🧪 Laboratório automático do Waiter</h3>
            <p className="text-[11px] text-gray-700">Clientes artificiais testam o Waiter em ambiente seguro. Não cria pedido, não gera Pix, não envia WhatsApp e não altera o runtime.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={ck?.automation.isAutomated ? "green" : "gray"}>{ck?.automation.isAutomated ? "Ativo · roda automaticamente" : "Inativo"}</Pill>
            <Pill tone="green">Seguro · runtime real intocado</Pill>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Última automática" value={fmt(ck?.latestCronRun?.createdAt)} tone="violet" />
          <Stat label="Próxima automática" value={fmt(ck?.automation.nextScheduledRunEstimate)} tone="blue" />
          <Stat label="Última manual" value={fmt(ck?.latestManualRun?.createdAt)} tone="blue" />
          <Stat label="Crítico (P0) último run" value={String(ck?.latestRun?.p0Count ?? 0)} tone={(ck?.latestRun?.p0Count ?? 0) > 0 ? "red" : "green"} />
          <Stat label="Pendente para você decidir" value={String(ck?.pendingOpportunityCount ?? 0)} tone={(ck?.pendingOpportunityCount ?? 0) > 0 ? "amber" : "gray"} />
          <Stat label="Exemplos aprovados" value={String(ck?.exampleStats.approved ?? 0)} tone="green" />
          <Stat label="Frequência" value={ck?.automation.scheduleLabel ?? "—"} tone="gray" />
          <Stat label="Runtime real" value="Intocado" tone="green" />
        </div>
      </section>

      {/* ── SEÇÃO 2 — Rodar simulação ───────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Rodar simulação agora</h3>
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
          {ck?.latestManualRun && (
            <span className="text-[11px] text-gray-500">Último manual: {ck.latestManualRun.scenariosPassed}/{ck.latestManualRun.scenariosTotal} OK · P0 {ck.latestManualRun.p0Count}</span>
          )}
        </div>
        {msg && <p className="mt-2 text-[11px] text-gray-700">{msg}</p>}
      </section>

      {/* ── SEÇÃO 3 — Oportunidades pendentes (a mais importante) ────────── */}
      <section className="rounded-xl border-2 border-amber-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">⚠️ Oportunidades pendentes para sua decisão</h3>
        <div className="mt-2 space-y-1.5">
          {(ck?.pendingOpportunities.length ?? 0) === 0 && (
            <p className="text-[12px] text-gray-500">Nenhuma oportunidade pendente agora. O simulador continuará rodando automaticamente.</p>
          )}
          {ck?.pendingOpportunities.map((o) => (
            <div key={o.id} className="rounded-lg border border-amber-100 bg-amber-50/40 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={sevTone(o.severity)}>{o.severity}</Pill>
                <Pill tone="gray">{o.type}</Pill>
                <span className="text-xs font-semibold text-gray-900">{o.title}</span>
                <Pill tone={o.run?.mode === "CRON" ? "violet" : "blue"}>{o.run?.mode ?? "—"}</Pill>
              </div>
              <p className="mt-1 text-[11px] text-gray-600">{o.summary}</p>
              <p className="mt-0.5 text-[11px] text-gray-800">→ {o.recommendation}</p>
              {o.scenario && <p className="mt-0.5 text-[10px] text-gray-400">Cenário: {o.scenario.scenarioType} · “{o.scenario.initialMessage}”</p>}
              <div className="mt-1.5 flex gap-1">
                <Btn tone="green" onClick={() => void reviewOpp(o.id, "APPROVED")}>Aprovar</Btn>
                <Btn tone="red" onClick={() => void reviewOpp(o.id, "REJECTED")}>Rejeitar</Btn>
                <Btn onClick={() => void reviewOpp(o.id, "BACKLOGGED")}>Mandar para backlog</Btn>
              </div>
            </div>
          ))}
        </div>
        {ck && (
          <p className="mt-2 text-[10px] text-gray-400">
            Aprovadas {ck.opportunitiesByStatus.APPROVED ?? 0} · Rejeitadas {ck.opportunitiesByStatus.REJECTED ?? 0} · Backlog {ck.opportunitiesByStatus.BACKLOGGED ?? 0}
          </p>
        )}
      </section>

      {/* ── SEÇÃO 4 — Últimas conversas simuladas ───────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Últimas conversas simuladas</h3>
        <div className="mt-2 space-y-1.5">
          {(ck?.latestScenarios.length ?? 0) === 0 && <p className="text-[11px] text-gray-500">Rode uma simulação para ver as conversas.</p>}
          {ck?.latestScenarios.map((s) => {
            const turns = parseTranscript(s.transcript);
            const customer = turns.find((t) => t.role === "customer")?.content ?? s.initialMessage;
            const agent = turns.find((t) => t.role === "agent")?.content ?? "";
            return (
              <div key={s.id} className="rounded-lg border border-gray-100 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={statusTone(s.status)}>{s.status}</Pill>
                  <Pill tone={sevTone(s.severity)}>{s.severity}</Pill>
                  <span className="text-xs font-semibold text-gray-800">{s.scenarioType}</span>
                  <span className="text-[10px] text-gray-400">{s.persona}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-600">🙋 {customer}</p>
                {agent && <p className="text-[11px] text-gray-700">🤖 {agent}</p>}
                <p className="mt-0.5 text-[10px] text-gray-400">{s.summary}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SEÇÃO 5 — Exemplos reais sanitizados ────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Exemplos reais sanitizados</h3>
          <button type="button" disabled={busy} onClick={() => void extractExamples()}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Extrair de conversas reais</button>
        </div>
        <p className="mt-1 text-[11px] text-amber-700">Conversas reais são sanitizadas antes de alimentar o simulador (telefone, e-mail, endereço, CPF/CNPJ, nome). Conversa bruta nunca é exibida nem armazenada.</p>
        {ck && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            <Stat label="Total" value={String(ck.exampleStats.total)} tone="blue" />
            <Stat label="Aprovados" value={String(ck.exampleStats.approved)} tone="green" />
            <Stat label="Pendentes" value={String(ck.exampleStats.pending)} tone="amber" />
            <Stat label="Rejeitados" value={String(ck.exampleStats.rejected)} tone="gray" />
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {examples.length === 0 && <p className="text-[11px] text-gray-500">Nenhum exemplo ainda. Extraia de conversas reais (sanitizadas) acima.</p>}
          {examples.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <Pill tone={e.status === "APPROVED" ? "green" : e.status === "REJECTED" ? "red" : e.status === "BACKLOGGED" ? "violet" : "amber"}>{e.status}</Pill>
              <Pill tone="gray">{e.scenarioType}</Pill>
              <Pill tone="blue">{e.channel}</Pill>
              <span className="text-[11px] text-gray-700">{e.intent}</span>
              <div className="ml-auto flex gap-1">
                <Btn tone="green" onClick={() => void reviewExample(e.id, "APPROVED")}>Aprovar</Btn>
                <Btn tone="red" onClick={() => void reviewExample(e.id, "REJECTED")}>Rejeitar</Btn>
                <Btn onClick={() => void reviewExample(e.id, "BACKLOGGED")}>Backlog</Btn>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SEÇÃO 6 — Histórico ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Histórico</h3>
        <div className="mt-2 space-y-1">
          {history.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma simulação ainda.</p>}
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <span className="font-mono text-[10px] text-gray-400">{fmt(r.createdAt)}</span>
              <Pill tone={r.mode === "CRON" ? "violet" : "blue"}>{r.mode}</Pill>
              <Pill tone={statusTone(r.status === "COMPLETED" ? "PASS" : "WARNING")}>{r.status}</Pill>
              <span className="text-[11px] text-gray-600">{r.scenariosTotal} cenários · {r.scenariosPassed} OK · {r.scenariosWarning} aviso · {r.scenariosFailed} falha</span>
              <Pill tone={r.p0Count > 0 ? "red" : "gray"}>P0 {r.p0Count}</Pill>
              <Pill tone="violet">{r.opportunityCount} opp</Pill>
              <Pill tone="green">runtime intocado</Pill>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5"><Pill tone={tone}>{value}</Pill></div>
    </div>
  );
}
function Btn({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: string }) {
  const cls = tone === "red" ? "border-red-300 text-red-700 hover:bg-red-50"
    : tone === "green" ? "border-green-300 text-green-700 hover:bg-green-50"
    : "border-gray-300 text-gray-700 hover:bg-gray-100";
  return <button type="button" onClick={onClick} className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</button>;
}
