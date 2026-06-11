"use client";

/**
 * WhatsApp Text Order — Cockpit do simulador.
 *
 * Uma tela para o operador PROVAR o anotador de pedido por texto SEM celular e
 * SEM teste manual: roda a simulação completa (transcript + comanda + ações que
 * criariam pedido/Pix + segurança) e mostra o diagnóstico de config/readiness do
 * Sushi Cazza. Nada real é enviado/criado.
 */

import { useState } from "react";

type SimMode = "DRY_RUN" | "REPLY_ONLY" | "FULL_TEST";
type Status = "PASS" | "WARNING" | "FAIL";

interface SimCheck { name: string; passed: boolean; severity: "P0" | "P1" | "P2"; message: string }
interface SimLine { actor: "CUSTOMER" | "AGENT" | "SYSTEM"; text: string }
interface SimScenario {
  status: Status; scenarioId: string; name: string; kind: "FLOW" | "CONFIG";
  transcript: SimLine[]; detectedIntent: string; extractedEntities: unknown;
  orderDraft: unknown; actions: string[];
  safety: { noEvolution: boolean; noRealOrder: boolean; noRealPix: boolean; runtimeTouched: false };
  checks: SimCheck[];
}
interface SimReport {
  ok: boolean; status: Status; total: number; passed: number; warned: number; failed: number;
  p0: number; mode: SimMode; scenarios: SimScenario[];
  safety: { noEvolution: boolean; noRealOrder: boolean; noRealPix: boolean; runtimeTouched: false };
}
interface Readiness {
  ok: boolean; restaurantName: string | null;
  replyOnlyReady: boolean; fullTestReady: boolean; restaurantWideReady: boolean;
  blockers: string[]; warnings: string[]; requiredNextActions: string[];
  flowDiagnostic: { status: string; passed: number; total: number; p0: number };
  config: {
    scope: string; mode: string; allowlistCount: number; riskLevel: string;
    canRunReplyOnly: boolean; canRunFullTest: boolean; rollbackSteps: string[];
  };
}

const STATUS_STYLE: Record<Status, string> = {
  PASS: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  WARNING: "bg-amber-900/50 text-amber-300 border-amber-700",
  FAIL: "bg-red-900/50 text-red-300 border-red-700",
};

export default function WhatsAppCockpitPage() {
  const [mode, setMode] = useState<SimMode>("REPLY_ONLY");
  const [slug, setSlug] = useState("sushi-cazza");
  const [sim, setSim] = useState<SimReport | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function runAll() {
    setLoading(true); setError(null);
    try {
      const [simRes, rdRes] = await Promise.all([
        fetch("/api/admin/diagnostics/whatsapp-text-ordering/simulator/full", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }),
        }),
        fetch("/api/admin/diagnostics/whatsapp-text-ordering/readiness", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantSlug: slug }),
        }),
      ]);
      if (!simRes.ok) throw new Error(`Simulação falhou (${simRes.status})`);
      setSim(await simRes.json());
      setReadiness(rdRes.ok ? await rdRes.json() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao rodar a simulação");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 text-gray-100">
      <h1 className="text-2xl font-bold">WhatsApp · Pedido por Texto — Cockpit</h1>
      <p className="mt-1 text-sm text-gray-400">
        Prove o anotador de pedido sem celular e sem teste manual. Esta tela roda a conversa inteira
        num cardápio de teste e mostra o que o cliente veria, a comanda montada e se criaria pedido/Pix.
      </p>
      <div className="mt-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
        Seguro: não envia WhatsApp, não cria pedido, não gera Pix.
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-400">Modo simulado</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as SimMode)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2">
            <option value="DRY_RUN">DRY_RUN (não responde)</option>
            <option value="REPLY_ONLY">REPLY_ONLY (responde, sem pedido/Pix)</option>
            <option value="FULL_TEST">FULL_TEST (simulado — ações WOULD_*)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-400">Restaurante (config/readiness)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2" />
        </label>
        <button onClick={runAll} disabled={loading}
          className="rounded-md bg-violet-600 px-4 py-2 font-semibold hover:bg-violet-500 disabled:opacity-50">
          {loading ? "Rodando…" : "Rodar simulação completa"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-md border border-red-700 bg-red-950/50 px-3 py-2 text-red-300">{error}</p>}

      {/* Summary */}
      {sim && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className={`rounded-md border px-3 py-1 text-sm font-bold ${STATUS_STYLE[sim.status]}`}>{sim.status}</span>
          <span className="text-sm text-gray-300">✅ {sim.passed} · ⚠ {sim.warned} · ❌ {sim.failed} · P0 {sim.p0}</span>
          <span className="text-xs text-gray-500">
            Segurança: {sim.safety.noEvolution ? "sem Evolution" : "⚠"} · {sim.safety.noRealOrder ? "sem pedido real" : "⚠"} · {sim.safety.noRealPix ? "sem Pix real" : "⚠"} · runtimeTouched={String(sim.safety.runtimeTouched)}
          </span>
        </div>
      )}

      {/* Readiness */}
      {readiness && readiness.ok && (
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <h2 className="text-sm font-semibold text-gray-300">Config &amp; Readiness — {readiness.restaurantName}</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Info label="scope" value={readiness.config.scope} ok={readiness.config.scope === "PHONE_ALLOWLIST"} />
            <Info label="mode" value={readiness.config.mode} />
            <Info label="allowlist" value={String(readiness.config.allowlistCount)} />
            <Info label="riskLevel" value={readiness.config.riskLevel} ok={readiness.config.riskLevel !== "HIGH"} />
            <Info label="replyOnly pronto" value={String(readiness.replyOnlyReady)} ok={readiness.replyOnlyReady} />
            <Info label="fullTest pronto" value={String(readiness.fullTestReady)} ok={readiness.fullTestReady} />
            <Info label="restaurantWide pronto" value={String(readiness.restaurantWideReady)} ok={readiness.restaurantWideReady} />
            <Info label="fluxo" value={`${readiness.flowDiagnostic.status} ${readiness.flowDiagnostic.passed}/${readiness.flowDiagnostic.total} (p0=${readiness.flowDiagnostic.p0})`} ok={readiness.flowDiagnostic.status === "PASS"} />
          </div>
          {readiness.blockers.length > 0 && <List title="Bloqueios" items={readiness.blockers} tone="red" />}
          {readiness.warnings.length > 0 && <List title="Avisos" items={readiness.warnings} tone="amber" />}
          {readiness.requiredNextActions.length > 0 && <List title="Próximas ações" items={readiness.requiredNextActions} tone="gray" />}
          <details className="mt-2 text-xs text-gray-500">
            <summary className="cursor-pointer">Rollback (~30s)</summary>
            <ul className="mt-1 list-disc pl-5">{readiness.config.rollbackSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </details>
        </div>
      )}

      {/* Scenarios */}
      {sim && (
        <div className="mt-6 space-y-2">
          {sim.scenarios.map((s) => (
            <div key={s.scenarioId} className="rounded-lg border border-gray-800 bg-gray-900/50">
              <button onClick={() => setOpen(open === s.scenarioId ? null : s.scenarioId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="flex items-center gap-3">
                  <span className={`rounded border px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                  <span className="font-medium">{s.name}</span>
                  <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] uppercase text-gray-400">{s.kind}</span>
                </span>
                <span className="text-xs text-gray-500">{s.actions.join(", ") || "sem ações"}</span>
              </button>
              {open === s.scenarioId && (
                <div className="border-t border-gray-800 px-4 py-3 text-sm">
                  {s.kind === "FLOW" && (
                    <div className="mb-3 space-y-1">
                      {s.transcript.map((t, i) => (
                        <div key={i} className={t.actor === "CUSTOMER" ? "text-right" : ""}>
                          <span className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-1.5 ${t.actor === "CUSTOMER" ? "bg-emerald-800/60" : t.actor === "AGENT" ? "bg-gray-800" : "bg-gray-950 text-gray-400"}`}>
                            {t.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-400">Verificações</p>
                      <ul className="mt-1 space-y-0.5">
                        {s.checks.map((c, i) => (
                          <li key={i} className={c.passed ? "text-emerald-400" : c.severity === "P0" ? "text-red-400" : "text-amber-400"}>
                            {c.passed ? "✓" : "✗"} [{c.severity}] {c.name}{c.passed ? "" : ` — ${c.message}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-400">Comanda / ações</p>
                      <p className="mt-1 text-xs text-gray-400">Intent: <span className="text-gray-200">{s.detectedIntent}</span></p>
                      <p className="text-xs text-gray-400">Ações: <span className="text-gray-200">{s.actions.join(", ") || "—"}</span></p>
                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-950 p-2 text-[11px] text-gray-400">
                        {JSON.stringify(s.orderDraft ?? s.extractedEntities ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={ok === undefined ? "text-gray-200" : ok ? "text-emerald-400" : "text-red-400"}>{value}</span>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "red" | "amber" | "gray" }) {
  const color = tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-gray-400";
  return (
    <div className="mt-2">
      <p className={`text-xs font-semibold ${color}`}>{title}</p>
      <ul className="mt-0.5 list-disc pl-5 text-xs text-gray-400">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}
