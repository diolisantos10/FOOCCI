"use client";

/**
 * WhatsApp Routing Test Lab — admin UI.
 *
 * Simulates WhatsApp/Evolution events and conversation routing WITHOUT sending
 * any real WhatsApp message. Replaces manual testing: define a scenario, read
 * the verdict (would it send externally? show in Atendimento? render as a
 * customer bubble? reach an agent?).
 */

import { useState, useCallback } from "react";

// ── Response shapes (mirror WhatsAppRoutingTestService) ───────────────────────

interface RoutingDecision {
  isInternalCommand: boolean;
  commandType: string;
  actor: string;
  source: string;
  direction: string;
  visibility: string;
  shouldPersistConversationMessage: boolean;
  shouldShowInAtendimento: boolean;
  shouldRenderAsCustomerBubble: boolean;
  shouldCallWhatsAppAgent: boolean;
  shouldCallWaiter: boolean;
  shouldCallEvolutionSend: boolean;
  blockReason: string | null;
  safetyNotes: string[];
  expectedLabel: string;
  explanation: string;
}

interface ScenarioResult {
  scenarioId: string;
  name: string;
  input: Record<string, unknown>;
  actual: RoutingDecision;
  status: "pass" | "warn" | "fail";
  failedChecks: string[];
  redFlags: string[];
  explanation: string;
  wouldCallEvolutionSend: boolean;
  wouldShowInAtendimento: boolean;
  wouldRenderAsCustomerBubble: boolean;
  wouldCallWhatsAppAgent: boolean;
  wouldCallWaiter: boolean;
  wouldPersistMessage: boolean;
}

interface Summary {
  mode: string;
  total: number;
  passed: number;
  warned: number;
  failed: number;
  score: number;
  results: ScenarioResult[];
  generatedAt: string;
}

const STATUS_CLS: Record<string, string> = {
  pass: "bg-green-900/40 text-green-300 border-green-700",
  warn: "bg-amber-900/40 text-amber-300 border-amber-700",
  fail: "bg-red-900/50 text-red-300 border-red-700",
};

export default function WhatsAppRoutingTestPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customResult, setCustomResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Custom simulator form
  const [text, setText] = useState("/build teste de comando interno");
  const [source, setSource] = useState("WEBHOOK");
  const [fromMe, setFromMe] = useState(false);
  const [fromPhone, setFromPhone] = useState("+5511988887777");
  const [connectedPhone, setConnectedPhone] = useState("+5511990001122");

  const runSuite = useCallback(async (mode: "quick" | "full") => {
    setLoading(mode); setError(null); setCustomResult(null);
    try {
      const res = await fetch("/api/admin/diagnostics/whatsapp-routing-test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSummary(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao rodar a suíte.");
    } finally {
      setLoading(null);
    }
  }, []);

  const runCustom = useCallback(async () => {
    setLoading("custom"); setError(null); setSummary(null);
    try {
      const res = await fetch("/api/admin/diagnostics/whatsapp-routing-test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "custom",
          customEvent: {
            source,
            messageText: text,
            fromMe: source === "WEBHOOK" ? fromMe : undefined,
            fromPhone,
            connectedBusinessPhone: connectedPhone,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustomResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao simular evento.");
    } finally {
      setLoading(null);
    }
  }, [source, text, fromMe, fromPhone, connectedPhone]);

  const download = useCallback((kind: "json" | "txt") => {
    const payload = summary ?? customResult;
    if (!payload) return;
    let content: string;
    let mime: string;
    let name: string;
    if (kind === "json") {
      content = JSON.stringify(payload, null, 2);
      mime = "application/json"; name = "routing-test.json";
    } else {
      content = textReport(summary, customResult);
      mime = "text/plain"; name = "routing-test.txt";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }, [summary, customResult]);

  const copyReport = useCallback(async () => {
    await navigator.clipboard.writeText(textReport(summary, customResult));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [summary, customResult]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 text-gray-200">
      <h1 className="text-xl font-bold text-white">WhatsApp Routing Test Lab</h1>
      <p className="mt-1 text-sm text-gray-400">
        Simule eventos WhatsApp/Evolution sem enviar mensagens reais. Nenhuma chamada
        ao Evolution, nenhuma gravação no banco, nenhuma campanha.
      </p>

      {/* Suite buttons */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => runSuite("quick")}
          disabled={loading !== null}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {loading === "quick" ? "Rodando…" : "Rodar teste rápido"}
        </button>
        <button
          onClick={() => runSuite("full")}
          disabled={loading !== null}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
        >
          {loading === "full" ? "Rodando…" : "Rodar suíte completa"}
        </button>
      </div>

      {/* Custom simulator */}
      <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
        <h2 className="text-sm font-semibold text-gray-200">Simulador personalizado</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-gray-400 sm:col-span-2">
            Texto da mensagem
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            Origem
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            >
              <option value="WEBHOOK">WEBHOOK</option>
              <option value="MANUAL_OPERATOR">MANUAL_OPERATOR</option>
              <option value="CARDAPIO">CARDAPIO</option>
              <option value="SYSTEM">SYSTEM</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={fromMe}
              disabled={source !== "WEBHOOK"}
              onChange={(e) => setFromMe(e.target.checked)}
            />
            fromMe (mensagem saiu do número da loja)
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            from (telefone)
            <input
              value={fromPhone}
              onChange={(e) => setFromPhone(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-400">
            Número conectado da loja
            <input
              value={connectedPhone}
              onChange={(e) => setConnectedPhone(e.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            />
          </label>
        </div>
        <button
          onClick={runCustom}
          disabled={loading !== null || text.trim().length === 0}
          className="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {loading === "custom" ? "Simulando…" : "Simular evento"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Export bar */}
      {(summary || customResult) && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={() => download("json")} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">Baixar JSON</button>
          <button onClick={() => download("txt")} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">Baixar relatório TXT</button>
          <button onClick={copyReport} className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">{copied ? "✓ Copiado" : "Copiar relatório"}</button>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mt-4">
          <div className="flex items-center gap-4 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
            <div className="text-3xl font-bold text-white">{summary.score}<span className="text-base text-gray-500">/100</span></div>
            <div className="text-sm text-gray-300">
              ✓ {summary.passed} &nbsp; ⚠ {summary.warned} &nbsp; ✗ {summary.failed} &nbsp;
              <span className="text-gray-500">(total {summary.total})</span>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {summary.results.map((r) => <ResultCard key={r.scenarioId} r={r} />)}
          </div>
        </div>
      )}

      {/* Custom result */}
      {customResult && (
        <div className="mt-4">
          <ResultCard r={customResult} />
        </div>
      )}
    </div>
  );
}

function flag(label: string, value: boolean, danger: boolean) {
  const cls = value
    ? (danger ? "bg-red-900/50 text-red-300 border-red-700" : "bg-green-900/40 text-green-300 border-green-700")
    : "bg-gray-800 text-gray-500 border-gray-700";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}: {value ? "sim" : "não"}
    </span>
  );
}

function ResultCard({ r }: { r: ScenarioResult }) {
  return (
    <div className={`rounded-xl border p-4 ${STATUS_CLS[r.status]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗"} {r.name}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{r.scenarioId}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-gray-600 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">{r.actual.actor}</span>
        <span className="rounded-full border border-gray-600 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">{r.actual.source}</span>
        <span className="rounded-full border border-gray-600 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">{r.actual.direction}</span>
        <span className="rounded-full border border-gray-600 bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">{r.actual.visibility}</span>
        <span className="rounded-full border border-violet-700 bg-violet-900/40 px-2 py-0.5 text-[10px] text-violet-200">{r.actual.expectedLabel}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {flag("evolutionSend", r.wouldCallEvolutionSend, r.actual.isInternalCommand)}
        {flag("customerBubble", r.wouldRenderAsCustomerBubble, r.actual.isInternalCommand)}
        {flag("whatsAppAgent", r.wouldCallWhatsAppAgent, r.actual.isInternalCommand)}
        {flag("waiter", r.wouldCallWaiter, r.actual.isInternalCommand)}
        {flag("persist", r.wouldPersistMessage, false)}
        {flag("atendimento", r.wouldShowInAtendimento, false)}
      </div>

      {r.actual.blockReason && (
        <p className="mt-2 text-xs text-amber-300">🚫 {r.actual.blockReason}</p>
      )}
      {r.redFlags.map((f, i) => <p key={i} className="mt-1 text-xs font-semibold text-red-300">{f}</p>)}
      {r.failedChecks.map((f, i) => <p key={i} className="mt-1 text-xs text-red-300">✗ {f}</p>)}
      {r.actual.safetyNotes.map((n, i) => <p key={i} className="mt-1 text-[11px] text-gray-400">• {n}</p>)}
      <p className="mt-2 text-[11px] text-gray-400">{r.explanation}</p>
    </div>
  );
}

function textReport(summary: Summary | null, custom: ScenarioResult | null): string {
  if (summary) {
    const head = `FOOCCI — WhatsApp Routing Test Lab\nModo: ${summary.mode}  Score: ${summary.score}/100  ✓${summary.passed} ⚠${summary.warned} ✗${summary.failed}\n\n`;
    return head + summary.results.map(line).join("\n");
  }
  if (custom) return `FOOCCI — Routing (evento personalizado)\n\n${line(custom)}`;
  return "";
}

function line(r: ScenarioResult): string {
  const icon = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗";
  return [
    `${icon} [${r.scenarioId}] ${r.name}`,
    `   actor=${r.actual.actor} source=${r.actual.source} dir=${r.actual.direction} vis=${r.actual.visibility}`,
    `   evolutionSend=${r.wouldCallEvolutionSend} bubble=${r.wouldRenderAsCustomerBubble} agent=${r.wouldCallWhatsAppAgent} waiter=${r.wouldCallWaiter} persist=${r.wouldPersistMessage}`,
    r.redFlags.length ? `   RED: ${r.redFlags.join("; ")}` : "",
    r.failedChecks.length ? `   FAIL: ${r.failedChecks.join("; ")}` : "",
    `   why: ${r.explanation}`,
  ].filter(Boolean).join("\n");
}
