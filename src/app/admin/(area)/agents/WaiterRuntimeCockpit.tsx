"use client";

/**
 * WaiterRuntimeCockpit — the REAL cockpit for the Waiter Runtime Merge.
 *
 * Unlike the documentary tabs, this one talks to live admin APIs:
 *   - GET  /api/admin/agents/waiter/runtime/knowledge   → active version + mode + comparison
 *   - GET  /api/admin/agents/waiter/runtime/versions    → versions + active
 *   - GET  /api/admin/agents/waiter/runtime/techniques  → curation list
 *   - POST .../versions, .../versions/[id], .../techniques/[id], .../quality-gate
 *
 * It NEVER touches the customer runtime directly — it only drives the governed
 * services. Default state is the safe CURRENT runtime.
 */

import { useCallback, useEffect, useState } from "react";

const BASE = "/api/admin/agents/waiter/runtime";

interface Knowledge {
  enabled: boolean;
  versionId?: string;
  mode: "CURRENT" | "LIBRARY_ASSISTED";
  techniques: Array<{ id: string; name: string; category: string }>;
  warnings: string[];
}
interface Comparison { identical: boolean; addedLines: string[]; summary: string }
interface VersionRow {
  id: string; name: string; status: string; mode: string; isActive: boolean;
  libraryEnabled: boolean; maxTechniques: number; qualityStatus: string | null;
  activatedAt: string | null; _count?: { techniques: number };
}
interface TechRow {
  id: string; techniqueName: string; category: string | null; status: string;
  runtimeEnabled: boolean; runtimePriority: number;
}
interface GateResult { passed: boolean; p0Count: number; globalStatus: string; reason: string }

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800", gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${map[tone] ?? map.gray}`}>{children}</span>;
}

export function WaiterRuntimeCockpit() {
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [active, setActive] = useState<VersionRow | null>(null);
  const [techniques, setTechniques] = useState<TechRow[]>([]);
  const [gate, setGate] = useState<GateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [k, v, t] = await Promise.all([
        fetch(`${BASE}/knowledge`).then((r) => r.json()),
        fetch(`${BASE}/versions`).then((r) => r.json()),
        fetch(`${BASE}/techniques`).then((r) => r.json()),
      ]);
      if (k.ok) { setKnowledge(k.knowledge); setComparison(k.comparison); }
      if (v.ok) { setVersions(v.versions ?? []); setActive(v.active ?? null); }
      if (t.ok) setTechniques(t.techniques ?? []);
    } catch {
      setMsg("Falha ao carregar o cockpit.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (path: string, body: unknown) => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) setMsg(json.reason ?? json.error ?? `Erro (HTTP ${res.status}).`);
      else setMsg("OK.");
      await load();
      return json;
    } finally { setBusy(false); }
  }, [load]);

  const runGate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/quality-gate`, { method: "POST" });
      const json = await res.json();
      if (json.ok) setGate(json.gate);
    } finally { setBusy(false); }
  }, []);

  const modeNow = active?.mode === "LIBRARY_ASSISTED" && active.libraryEnabled ? "LIBRARY_ASSISTED" : "CURRENT";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] text-blue-800">
        🛰️ Cockpit <strong>real</strong> do Runtime Merge: lê e comanda os serviços governados (versões, técnicas, Quality gate).
        A Library só altera o runtime quando há versão <strong>ACTIVE</strong> em <strong>LIBRARY_ASSISTED</strong> e a flag está ligada.
      </div>

      {/* ── DASHBOARD ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Estado do Runtime</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Modo ativo" value={modeNow} tone={modeNow === "CURRENT" ? "gray" : "violet"} />
          <Stat label="Versão ativa" value={active ? active.name : "— (CURRENT)"} tone={active ? "green" : "gray"} />
          <Stat label="Library no runtime" value={knowledge?.enabled ? "ON" : "OFF"} tone={knowledge?.enabled ? "green" : "gray"} />
          <Stat label="Técnicas ativas" value={String(knowledge?.techniques.length ?? 0)} tone="blue" />
          <Stat label="Quality (gate)" value={gate ? (gate.passed ? "P0=0 ✓" : `P0=${gate.p0Count}`) : (active?.qualityStatus ?? "—")} tone={gate ? (gate.passed ? "green" : "red") : "gray"} />
          <Stat label="Rollback" value={active ? "Disponível" : "n/a (já em CURRENT)"} tone={active ? "amber" : "gray"} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void runGate()} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Rodar Quality gate</button>
          <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50">Atualizar</button>
          <a href="/admin/agentes/waiter/testes" className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Test Center →</a>
          <a href="/admin/quality" className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Quality →</a>
        </div>
        {gate && (
          <p className={`mt-2 text-[11px] ${gate.passed ? "text-green-700" : "text-red-700"}`}>{gate.reason}</p>
        )}
        {comparison && (
          <p className="mt-1 text-[11px] text-gray-600">Comparação CURRENT vs LIBRARY_ASSISTED: {comparison.summary}</p>
        )}
        {msg && <p className="mt-1 text-[11px] text-gray-700">{msg}</p>}
      </section>

      {/* ── VERSIONS ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Versões do Waiter</h3>
          <button type="button" disabled={busy}
            onClick={() => { const name = window.prompt("Nome da nova versão DRAFT:"); if (name) void post("/versions", { name, mode: "LIBRARY_ASSISTED", libraryEnabled: true }); }}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">+ Criar DRAFT</button>
        </div>
        <div className="mt-2 space-y-1.5">
          {versions.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma versão. O runtime opera em CURRENT (seguro).</p>}
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <span className="text-xs font-semibold text-gray-800">{v.name}</span>
              <Pill tone={v.isActive ? "green" : v.status === "DRAFT" ? "gray" : v.status === "TESTING" ? "amber" : "gray"}>{v.status}</Pill>
              <Pill tone={v.mode === "LIBRARY_ASSISTED" ? "violet" : "gray"}>{v.mode}</Pill>
              <span className="text-[11px] text-gray-500">{v._count?.techniques ?? 0} técnica(s)</span>
              <div className="ml-auto flex gap-1">
                {v.status === "DRAFT" && <Btn onClick={() => void post(`/versions/${v.id}`, { action: "testing" })}>→ Testing</Btn>}
                {(v.status === "DRAFT" || v.status === "TESTING") && <Btn onClick={() => void post(`/versions/${v.id}`, { action: "activate" })}>Ativar (gate)</Btn>}
                {v.isActive && <Btn tone="red" onClick={() => void post(`/versions/${v.id}`, { action: "rollback" })}>Rollback</Btn>}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-gray-500">Ativação roda o Quality gate e bloqueia se houver P0. Rollback é instantâneo e não passa por gate.</p>
      </section>

      {/* ── TECHNIQUES CURATION ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Técnicas da Library (curadoria → runtime)</h3>
        <div className="mt-2 space-y-1.5">
          {techniques.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma técnica. Extraia na aba Library; nada entra no runtime sem curadoria.</p>}
          {techniques.slice(0, 40).map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <span className="text-xs text-gray-800">{t.techniqueName}</span>
              <Pill tone={t.status === "ACTIVE" ? "green" : t.status === "REJECTED" ? "red" : "gray"}>{t.status}</Pill>
              {t.runtimeEnabled && <Pill tone="violet">runtime ON</Pill>}
              <span className="text-[10px] text-gray-400">prio {t.runtimePriority}</span>
              <div className="ml-auto flex gap-1">
                {t.status !== "ACTIVE" && <Btn onClick={() => void post(`/techniques/${t.id}`, { action: "activate" })}>Ativar</Btn>}
                {t.status === "ACTIVE" && !t.runtimeEnabled && <Btn onClick={() => void post(`/techniques/${t.id}`, { action: "enable" })}>Habilitar runtime</Btn>}
                {t.runtimeEnabled && <Btn onClick={() => void post(`/techniques/${t.id}`, { action: "disable" })}>Desabilitar</Btn>}
                <Btn tone="red" onClick={() => void post(`/techniques/${t.id}`, { action: "reject", reason: "manual" })}>Rejeitar</Btn>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── METRICS (placeholders) ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900">Métricas comerciais</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["Conversão assistida", "Ticket influenciado", "Upsell incremental", "Bebida aceita", "Sobremesa aceita", "Recomendações aceitas", "Abandono reduzido"].map((m) => (
            <div key={m} className="rounded-lg border border-dashed border-gray-200 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-gray-700">{m}</p>
              <p className="text-[10px] text-gray-400">Aguardando tracking</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── GOVERNANCE ── */}
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-bold text-gray-900">Governança</h3>
        <ul className="mt-2 space-y-1 text-[11px] text-gray-700">
          <li>• Técnica só entra no prompt se estiver <strong>ACTIVE</strong> + <strong>runtimeEnabled</strong> e congelada numa versão ACTIVE.</li>
          <li>• <strong>Library não muda o runtime se a flag estiver OFF</strong> — o padrão é sempre CURRENT (seguro).</li>
          <li>• Apenas <strong>uma versão ACTIVE</strong> por escopo. Ativar exige Quality gate (P0 = 0).</li>
          <li>• <strong>Rollback</strong> é instantâneo e não passa por gate — voltar ao seguro nunca é bloqueado.</li>
          <li>• Qualquer erro na ponte mantém o runtime atual (fallback) sem quebrar o /pedido.</li>
        </ul>
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
  const cls = tone === "red"
    ? "border-red-300 text-red-700 hover:bg-red-50"
    : "border-gray-300 text-gray-700 hover:bg-gray-100";
  return (
    <button type="button" onClick={onClick} className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</button>
  );
}
