"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, PageCard, SectionHeading, Feedback } from "../_shared";

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

interface Category {
  id: string;
  name: string;
  printStationKey: string | null;
}

function stationEmoji(key: string) {
  return key === "CAIXA" ? "💵" : key === "COPA" ? "🥤" : key === "CUPOM" ? "🧾" : "🍳";
}

// ── Carteiro status banner ────────────────────────────────────────────────────

function StatusBanner({ agent }: { agent: Agent | null }) {
  const online = !!agent?.online;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        online ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-gray-400"}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${online ? "text-green-800" : "text-gray-700"}`}>
          {online ? "Carteiro conectado" : "Carteiro não conectado"}
        </p>
        <p className="text-xs text-gray-500">
          {online
            ? `${agent?.printers.length ?? 0} impressora(s) detectada(s) neste PC.`
            : "Siga o passo a passo abaixo para ativar a impressão automática."}
        </p>
      </div>
    </div>
  );
}

// ── Setup steps (download + open + pair) ──────────────────────────────────────

function SetupSteps({ agent, onCopy, copied }: { agent: Agent | null; onCopy: () => void; copied: boolean }) {
  return (
    <div className="space-y-4">
      <Step n={1} title="Baixe o programa Carteiro">
        <p className="mb-3 text-sm text-gray-600">Ele roda no computador do restaurante (Windows) e imprime sozinho.</p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/downloads/FOOCCI-Carteiro.exe"
            download
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            ⬇️ Baixar o programa
          </a>
          <a
            href="/downloads/Carteiro-Manual.txt"
            download
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            📄 Manual (passo a passo)
          </a>
        </div>
      </Step>

      <Step n={2} title="Abra o programa (dois cliques)">
        <p className="text-sm text-gray-600">
          Dê dois cliques no arquivo baixado. Se o Windows mostrar um aviso azul, clique em{" "}
          <strong>“Mais informações” → “Executar assim mesmo”</strong> (é seguro, é o nosso programa). Uma telinha
          vai abrir no navegador.
        </p>
      </Step>

      <Step n={3} title="Conecte com este código">
        <p className="mb-3 text-sm text-gray-600">Na tela do Carteiro, cole o código abaixo e clique em “Parear”.</p>
        {agent?.online ? (
          <p className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
            ✓ Já conectado — não precisa fazer de novo.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 font-mono text-xl font-bold tracking-[0.35em] text-gray-800">
              {agent?.pairingCode ?? "········"}
            </span>
            <button
              type="button"
              onClick={onCopy}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              {copied ? "Copiado! ✓" : "Copiar código"}
            </button>
          </div>
        )}
      </Step>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

// ── Printer control ───────────────────────────────────────────────────────────

function PrinterControl({
  value,
  printers,
  onChange,
}: {
  value: string | null;
  printers: string[];
  onChange: (v: string) => void;
}) {
  const cls =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition";
  if (printers.length === 0) {
    return (
      <input
        type="text"
        value={value ?? ""}
        placeholder="Nome da impressora (ex: Elgin i9)"
        onChange={(e) => onChange(e.target.value)}
        className={`${cls} placeholder:text-gray-400`}
      />
    );
  }
  const options = Array.from(new Set([...printers, ...(value ? [value] : [])]));
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cls}>
      <option value="">— sem impressora —</option>
      {options.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImpressorasPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch("/api/integracoes/impressao");
    if (ok) {
      if (Array.isArray(data?.stations)) setStations(data.stations as Station[]);
      if (data?.agent) setAgent(data.agent as Agent);
      if (Array.isArray(data?.categories)) setCategories(data.categories as Category[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // keep connection status / printers fresh
    return () => clearInterval(t);
  }, [load]);

  const update = (id: string, patch: Partial<Station>) => {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSuccess(null);
  };

  const updateCategory = (id: string, printStationKey: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, printStationKey: printStationKey || null } : c)));
    setSuccess(null);
  };

  const handleCopy = () => {
    if (!agent?.pairingCode) return;
    navigator.clipboard?.writeText(agent.pairingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/integracoes/impressao", "PUT", {
      stations: stations.map((s) => ({ id: s.id, name: s.name, printerName: s.printerName, enabled: s.enabled })),
      categories: categories.map((c) => ({ id: c.id, printStationKey: c.printStationKey })),
    });
    setSaving(false);
    if (ok) {
      if (Array.isArray(data?.stations)) setStations(data.stations as Station[]);
      if (Array.isArray(data?.categories)) setCategories(data.categories as Category[]);
      setSuccess("Configuração de impressão salva.");
    } else {
      setError(data?.error ?? "Erro ao salvar.");
    }
  };

  const handleTest = async (station: Station) => {
    setTestingId(station.id);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/integracoes/impressao/teste", "POST", { stationId: station.id });
    setTestingId(null);
    if (ok) {
      setSuccess(
        agent?.online
          ? `Comanda de teste enviada para ${station.name}. Veja a impressora!`
          : `Teste na fila para ${station.name} — imprime assim que o Carteiro conectar.`,
      );
    } else {
      setError(data?.error ?? "Erro ao enviar o teste.");
    }
  };

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <div className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* Status */}
      <StatusBanner agent={agent} />

      {/* Setup — prominent when not connected, collapsible when connected */}
      {agent?.online ? (
        <details className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-gray-700">
            ⚙️ Instalar o Carteiro em outro computador
          </summary>
          <div className="border-t border-gray-50 px-6 py-5">
            <SetupSteps agent={agent} onCopy={handleCopy} copied={copied} />
          </div>
        </details>
      ) : (
        <PageCard>
          <SectionHeading
            title="Ative a impressão automática"
            subtitle="Três passos rápidos. Depois disso, os pedidos imprimem sozinhos na cozinha."
          />
          <SetupSteps agent={agent} onCopy={handleCopy} copied={copied} />
        </PageCard>
      )}

      {/* Step A — which printer per station */}
      <PageCard>
        <SectionHeading
          title="1. Impressora de cada estação"
          subtitle="Em qual impressora cada estação imprime. Use “Testar” para conferir."
        />
        <div className="space-y-3">
          {stations.map((s) => {
            const hasPrinter = !!(s.printerName && s.printerName.trim());
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2.5 sm:w-36 sm:shrink-0">
                  <span className="text-lg">{stationEmoji(s.key)}</span>
                  <span className="truncate text-sm font-semibold text-gray-900">{s.name}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <PrinterControl
                    value={s.printerName}
                    printers={agent?.printers ?? []}
                    onChange={(v) => update(s.id, { printerName: v })}
                  />
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTest(s)}
                    disabled={!hasPrinter || testingId === s.id}
                    title={hasPrinter ? "Enviar uma comanda de teste" : "Escolha uma impressora primeiro"}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    {testingId === s.id ? "Enviando…" : "🖨️ Testar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => update(s.id, { enabled: !s.enabled })}
                    aria-pressed={s.enabled}
                    title={s.enabled ? "Estação ativa" : "Estação desativada"}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      s.enabled ? "bg-brand-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        s.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </PageCard>

      {/* Step B — which station per food category */}
      <PageCard>
        <SectionHeading
          title="2. Para onde vai cada categoria"
          subtitle="Diga em qual estação cada categoria do cardápio é impressa. Ex.: Sushi → Cozinha 1, Bebidas → Copa."
        />
        {categories.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Você ainda não tem categorias no cardápio. Cadastre no <strong>Cardápio</strong> e elas aparecem aqui.
          </p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{c.name}</span>
                <span className="shrink-0 text-gray-300">→</span>
                <select
                  value={c.printStationKey ?? ""}
                  onChange={(e) => updateCategory(c.id, e.target.value)}
                  className="w-40 shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition"
                >
                  <option value="">— escolher —</option>
                  {stations.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* Single save for everything */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {saving ? "Salvando…" : "Salvar tudo"}
        </button>
      </div>
    </div>
  );
}
