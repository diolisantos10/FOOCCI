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

// ── Toggle pill ───────────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        on ? "bg-indigo-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Station row ───────────────────────────────────────────────────────────────

function StationRow({
  station,
  canEdit,
  onChange,
}: {
  station: Station;
  canEdit: boolean;
  onChange: (patch: Partial<Station>) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
      {/* Station name */}
      <div className="flex min-w-0 items-center gap-3 sm:w-44 sm:shrink-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
          {station.key === "CAIXA" ? "💵" : station.key === "COPA" ? "🥤" : station.key === "CUPOM" ? "🧾" : "🍳"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{station.name}</p>
          <p className="text-[11px] text-gray-400">{station.printerName ? "Impressora definida" : "Sem impressora"}</p>
        </div>
      </div>

      {/* Printer field */}
      <div className="min-w-0 flex-1">
        <input
          type="text"
          value={station.printerName ?? ""}
          disabled={!canEdit}
          placeholder="Nome da impressora (ex: Elgin i9, POS-80)"
          onChange={(e) => onChange({ printerName: e.target.value })}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 transition"
        />
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-2 sm:shrink-0">
        <span className="text-xs text-gray-500">{station.enabled ? "Ativa" : "Desativada"}</span>
        <Toggle on={station.enabled} onChange={(v) => onChange({ enabled: v })} disabled={!canEdit} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PrintStationsClient({ userRole }: { userRole: string }) {
  const canEdit = userRole === "OWNER" || userRole === "MANAGER";
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch("/api/integracoes/impressao");
    if (ok && Array.isArray(data?.stations)) setStations(data.stations as Station[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (id: string, patch: Partial<Station>) => {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setFeedback(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const { ok, data } = await apiFetch("/api/integracoes/impressao", "PUT", {
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        printerName: s.printerName,
        enabled: s.enabled,
      })),
    });
    setSaving(false);
    if (ok) {
      if (Array.isArray(data?.stations)) setStations(data.stations as Station[]);
      setFeedback({ type: "ok", msg: "Configuração de impressão salva! ✅" });
    } else {
      setFeedback({ type: "err", msg: "Erro ao salvar. Tente novamente." });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Intro */}
      <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
        <p className="text-sm font-semibold text-indigo-900">🖨️ Distribuição de impressão por cozinha</p>
        <p className="mt-1 text-xs leading-relaxed text-indigo-700">
          Diga qual impressora atende cada estação. O programa <strong>Carteiro</strong> (instalado no PC do
          restaurante) usa esta configuração para enviar cada pedido à impressora certa — comanda da cozinha
          na cozinha, via do caixa no caixa, e assim por diante.
        </p>
      </div>

      {/* Connection hint */}
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
        <span className="text-lg">💡</span>
        <p className="text-xs leading-relaxed text-amber-800">
          Por enquanto, digite o nome de cada impressora. Assim que o <strong>Carteiro</strong> estiver conectado,
          este campo vira uma <strong>lista para escolher</strong> as impressoras detectadas automaticamente — sem
          digitar nada.
        </p>
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
            <StationRow key={s.id} station={s} canEdit={canEdit} onChange={(patch) => update(s.id, patch)} />
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
