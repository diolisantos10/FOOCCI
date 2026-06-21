"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Station {
  id: string;
  key: string;
  name: string;
  printerName: string | null;
  enabled: boolean;
  position: number;
}

interface Agent {
  online: boolean;
  lastSeenAt: string | null;
  printers: string[];
  pairingCode: string;
  version: string | null;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data ?? json };
}

function stationEmoji(key: string) {
  return key === "CAIXA" ? "💵" : key === "COPA" ? "🥤" : key === "CUPOM" ? "🧾" : "🍳";
}

// ── Carteiro status card ──────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent | null }) {
  if (!agent) return null;

  if (agent.online) {
    return (
      <div className="mb-5 rounded-2xl border border-green-100 bg-green-50 px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Carteiro conectado
        </p>
        <p className="mt-1 text-xs text-green-700">
          {agent.printers.length > 0
            ? `${agent.printers.length} impressora(s) detectada(s) — já aparecem na lista abaixo.`
            : "Conectado, mas nenhuma impressora foi detectada ainda."}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        Carteiro não conectado
      </p>
      <p className="mt-1 text-xs leading-relaxed text-indigo-700">
        Abra o <strong>Carteiro</strong> no PC do restaurante e cole o código abaixo para parear. Depois disso,
        as impressoras aparecem sozinhas e a impressão fica automática.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="rounded-xl border border-indigo-200 bg-white px-4 py-2 font-mono text-lg font-bold tracking-[0.3em] text-indigo-700">
          {agent.pairingCode}
        </span>
        <span className="text-xs text-indigo-400">Código de pareamento</span>
      </div>
    </div>
  );
}

// ── Printer control (dropdown when detected, text fallback otherwise) ──────────

function PrinterControl({
  value,
  printers,
  disabled,
  onChange,
}: {
  value: string | null;
  printers: string[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const cls =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 transition";

  if (printers.length === 0) {
    return (
      <input
        type="text"
        value={value ?? ""}
        disabled={disabled}
        placeholder="Nome da impressora (ex: Elgin i9)"
        onChange={(e) => onChange(e.target.value)}
        className={`${cls} placeholder:text-gray-400`}
      />
    );
  }

  const options = Array.from(new Set([...printers, ...(value ? [value] : [])]));
  return (
    <select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cls}>
      <option value="">— sem impressora —</option>
      {options.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

// ── Station row ───────────────────────────────────────────────────────────────

function StationRow({
  station,
  agent,
  canEdit,
  testing,
  onChange,
  onTest,
}: {
  station: Station;
  agent: Agent | null;
  canEdit: boolean;
  testing: boolean;
  onChange: (patch: Partial<Station>) => void;
  onTest: () => void;
}) {
  const hasPrinter = !!(station.printerName && station.printerName.trim());
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3 sm:w-40 sm:shrink-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
          {stationEmoji(station.key)}
        </div>
        <p className="truncate text-sm font-semibold text-gray-900">{station.name}</p>
      </div>

      <div className="min-w-0 flex-1">
        <PrinterControl
          value={station.printerName}
          printers={agent?.printers ?? []}
          disabled={!canEdit}
          onChange={(v) => onChange({ printerName: v })}
        />
      </div>

      <div className="flex items-center gap-3 sm:shrink-0">
        <button
          type="button"
          onClick={onTest}
          disabled={!hasPrinter || testing}
          title={hasPrinter ? "Enviar uma comanda de teste" : "Defina uma impressora primeiro"}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
        >
          {testing ? "Enviando…" : "🖨️ Testar"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ enabled: !station.enabled })}
          disabled={!canEdit}
          aria-pressed={station.enabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
            station.enabled ? "bg-indigo-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
              station.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PrintStationsClient({ userRole }: { userRole: string }) {
  const canEdit = userRole === "OWNER" || userRole === "MANAGER";
  const [stations, setStations] = useState<Station[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch("/api/integracoes/impressao");
    if (ok) {
      if (Array.isArray(data?.stations)) setStations(data.stations as Station[]);
      if (data?.agent) setAgent(data.agent as Agent);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Refresh agent status every 15s so the badge/printers stay live while open.
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const update = (id: string, patch: Partial<Station>) => {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setFeedback(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const { ok, data } = await apiFetch("/api/integracoes/impressao", "PUT", {
      stations: stations.map((s) => ({ id: s.id, name: s.name, printerName: s.printerName, enabled: s.enabled })),
    });
    setSaving(false);
    if (ok) {
      if (Array.isArray(data?.stations)) setStations(data.stations as Station[]);
      setFeedback({ type: "ok", msg: "Configuração de impressão salva! ✅" });
    } else {
      setFeedback({ type: "err", msg: "Erro ao salvar. Tente novamente." });
    }
  };

  const handleTest = async (station: Station) => {
    setTestingId(station.id);
    setFeedback(null);
    const { ok, data } = await apiFetch("/api/integracoes/impressao/teste", "POST", { stationId: station.id });
    setTestingId(null);
    if (ok) {
      setFeedback({
        type: "ok",
        msg: agent?.online
          ? `Comanda de teste enviada para ${station.name}. Veja a impressora! 🖨️`
          : `Teste na fila para ${station.name} — vai imprimir assim que o Carteiro conectar.`,
      });
    } else {
      setFeedback({ type: "err", msg: (data as { error?: string })?.error ?? "Erro ao enviar o teste." });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Carteiro status / pairing */}
      <AgentCard agent={agent} />

      {/* Intro */}
      <div className="mb-5 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs leading-relaxed text-gray-500">
        Diga qual impressora atende cada estação. O <strong className="text-gray-700">Carteiro</strong> usa este
        mapa para enviar cada pedido à impressora certa — comanda da cozinha na cozinha, via do caixa no caixa.
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {stations.map((s) => (
            <StationRow
              key={s.id}
              station={s}
              agent={agent}
              canEdit={canEdit}
              testing={testingId === s.id}
              onChange={(patch) => update(s.id, patch)}
              onTest={() => handleTest(s)}
            />
          ))}
        </div>
      )}

      {/* Save */}
      {canEdit ? (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          Apenas o proprietário ou gerente pode alterar a configuração de impressão.
        </p>
      )}
    </div>
  );
}
