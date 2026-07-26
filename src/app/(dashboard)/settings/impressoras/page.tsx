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
  kitchenLargeFont: boolean;
}

interface Category {
  id: string;
  name: string;
  printStationKeys: string[];
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
        online ? "border-green-200 bg-green-50" : "border-line2 bg-[#FAFAF8]"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-muted"}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${online ? "text-green-800" : "text-ink2"}`}>
          {online ? "Carteiro conectado" : "Carteiro não conectado"}
        </p>
        <p className="text-xs text-muted">
          {online
            ? `Carteiro v${agent?.version ?? "?"} · ${agent?.printers.length ?? 0} impressora(s) detectada(s).`
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
        <p className="mb-3 text-sm text-ink2">Ele roda no computador do restaurante (Windows) e imprime sozinho.</p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/downloads/FOOCCI-Carteiro-0.3.0.exe"
            download="FOOCCI-Carteiro.exe"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            ⬇️ Baixar o programa (v0.3.0)
          </a>
          <a
            href="/downloads/Carteiro-Manual.txt"
            download
            className="inline-flex items-center gap-2 rounded-xl border border-line2 bg-paper px-4 py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] transition"
          >
            📄 Manual (passo a passo)
          </a>
        </div>
      </Step>

      <Step n={2} title="Abra o programa (dois cliques)">
        <p className="text-sm text-ink2">
          Dê dois cliques no arquivo baixado. Se o Windows mostrar um aviso azul, clique em{" "}
          <strong>“Mais informações” → “Executar assim mesmo”</strong> (é seguro, é o nosso programa). Uma telinha
          vai abrir no navegador.
        </p>
      </Step>

      <Step n={3} title="Conecte com este código">
        <p className="mb-3 text-sm text-ink2">Na tela do Carteiro, cole o código abaixo e clique em “Parear”.</p>
        {agent?.online ? (
          <p className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
            ✓ Já conectado — não precisa fazer de novo.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-line2 bg-[#FAFAF8] px-5 py-2.5 font-mono text-xl font-bold tracking-[0.35em] text-ink">
              {agent?.pairingCode ?? "········"}
            </span>
            <button
              type="button"
              onClick={onCopy}
              className="rounded-xl border border-line2 bg-paper px-4 py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] transition"
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
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
    "w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition";
  if (printers.length === 0) {
    return (
      <input
        type="text"
        value={value ?? ""}
        placeholder="Nome da impressora (ex: Elgin i9)"
        onChange={(e) => onChange(e.target.value)}
        className={`${cls} placeholder:text-muted`}
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
  const [largeFont, setLargeFont] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch("/api/integracoes/impressao");
    if (ok) {
      if (Array.isArray(data?.stations)) setStations(data.stations as Station[]);
      if (data?.agent) {
        setAgent(data.agent as Agent);
        setLargeFont(!!(data.agent as Agent).kitchenLargeFont);
      }
      if (Array.isArray(data?.categories)) setCategories(data.categories as Category[]);
    }
    setLoading(false);
  }, []);

  // Refresh only the agent (connection status + detected printers) every 15 s.
  // Stations and categories must NOT be overwritten while the user is editing.
  const refreshAgent = useCallback(async () => {
    const { ok, data } = await apiFetch("/api/integracoes/impressao");
    if (ok && data?.agent) setAgent(data.agent as Agent);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(refreshAgent, 15_000);
    return () => clearInterval(t);
  }, [load, refreshAgent]);

  const update = (id: string, patch: Partial<Station>) => {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSuccess(null);
  };

  const setCatStation = (id: string, idx: number, key: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, printStationKeys: c.printStationKeys.map((k, i) => (i === idx ? key : k)) } : c,
      ),
    );
    setSuccess(null);
  };
  const addCatStation = (id: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, printStationKeys: [...c.printStationKeys, ""] } : c)));
    setSuccess(null);
  };
  const removeCatStation = (id: string, idx: number) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, printStationKeys: c.printStationKeys.filter((_, i) => i !== idx) } : c)),
    );
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
      categories: categories.map((c) => ({ id: c.id, printStationKeys: c.printStationKeys })),
      kitchenLargeFont: largeFont,
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

  if (loading) return <p className="py-8 text-sm text-muted">Carregando…</p>;

  // "Estação padrão" — must mirror PrintQueueService: the first enabled kitchen (not
  // Caixa/Cupom) that has a printer of its own (not one the caixa already uses). Any
  // category left without a station lands here — one comanda, never sprayed to all.
  const cashierPrinterNames = new Set(
    stations
      .filter((s) => (s.key === "CAIXA" || s.key === "CUPOM") && s.printerName?.trim())
      .map((s) => s.printerName!.trim()),
  );
  const defaultKitchen =
    [...stations]
      .filter(
        (s) =>
          s.enabled &&
          !!s.printerName?.trim() &&
          s.key !== "CAIXA" &&
          s.key !== "CUPOM" &&
          !cashierPrinterNames.has(s.printerName!.trim()),
      )
      .sort((a, b) => a.position - b.position)[0] ?? null;

  return (
    <div className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* Status */}
      <StatusBanner agent={agent} />

      {/* Guidance for the "folha grande (A4)" symptom. Browser printing obeys the
          OS printer's paper size — if that is A4, the small comanda lands on a full
          A4 sheet. The robust fix is the Carteiro (raw thermal, never A4). */}
      <details className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-amber-800">
          🖨️ Está saindo em folha grande (A4)? Veja como resolver
        </summary>
        <div className="space-y-3 border-t border-amber-200 px-6 py-5 text-sm text-amber-900">
          <p>
            Isso acontece quando a comanda é impressa <strong>pelo navegador</strong> e a
            impressora está configurada no Windows com papel <strong>A4</strong> — aí a
            comanda pequena cai no canto de uma folha grande e desperdiça papel.
          </p>
          <div>
            <p className="font-semibold">Jeito recomendado (nunca sai A4):</p>
            <p>
              Use o <strong>Carteiro</strong> (aqui em cima). Ele imprime direto na bobina
              térmica, sem passar pela janela de impressão do navegador.
            </p>
          </div>
          <div>
            <p className="font-semibold">Se você imprime pelo botão “Imprimir” do navegador:</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Windows → Impressoras → sua impressora térmica → <strong>Preferências</strong>.</li>
              <li>Em “Tamanho do papel”, escolha a <strong>bobina / recibo (80&nbsp;mm)</strong> — não A4.</li>
              <li>Deixe as <strong>margens em 0</strong>, salve e imprima de novo.</li>
            </ol>
          </div>
          <p className="text-xs">
            Sua bobina é de <strong>58&nbsp;mm</strong> (mais estreita) em vez de 80&nbsp;mm? Me avise o
            modelo da impressora que eu ajusto o tamanho da comanda para 58&nbsp;mm.
          </p>
        </div>
      </details>

      {/* Setup — prominent when not connected, collapsible when connected */}
      {agent?.online ? (
        <details className="rounded-2xl border border-line bg-paper shadow-sm">
          <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-ink2">
            ⚙️ Instalar o Carteiro em outro computador
          </summary>
          <div className="border-t border-line px-6 py-5">
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
                className="flex flex-col gap-3 rounded-xl border border-line2 bg-[#FAFAF8] p-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2.5 sm:w-36 sm:shrink-0">
                  <span className="text-lg">{stationEmoji(s.key)}</span>
                  <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
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
                    className="rounded-lg border border-line2 bg-paper px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8] disabled:opacity-40 transition"
                  >
                    {testingId === s.id ? "Enviando…" : "🖨️ Testar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => update(s.id, { enabled: !s.enabled })}
                    aria-pressed={s.enabled}
                    title={s.enabled ? "Estação ativa" : "Estação desativada"}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      s.enabled ? "bg-brand-500" : "bg-line2"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform ${
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
          subtitle="Em qual(is) estação(ões) cada categoria imprime. Pode adicionar mais de uma — para pratos que saem em duas cozinhas."
        />
        {/* Where do categories with no station chosen go? Make the default explicit —
            this is exactly what used to surprise owners ("não segue o painel"). */}
        {defaultKitchen ? (
          <p className="mb-3 rounded-xl border border-line2 bg-[#FAFAF8] px-4 py-3 text-sm text-ink2">
            💡 Categoria <strong>sem estação escolhida</strong> imprime na estação padrão:{" "}
            <strong className="text-ink">{defaultKitchen.name}</strong>{" "}
            <span className="text-muted">(a primeira cozinha com impressora)</span>. Escolha uma
            estação para direcionar — e ela sai <strong>só</strong> onde você mandar.
          </p>
        ) : (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ⚠️ Nenhuma cozinha tem impressora própria ainda. Defina a impressora de uma cozinha na
            seção <strong>1</strong> acima — senão as comandas não têm para onde ir.
          </p>
        )}
        {categories.length === 0 ? (
          <p className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 text-sm text-muted">
            Você ainda não tem categorias no cardápio. Cadastre no <strong>Cardápio</strong> e elas aparecem aqui.
          </p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="rounded-xl border border-line2 bg-[#FAFAF8] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  {c.printStationKeys.filter((k) => k.trim()).length === 0 && (
                    <span className="rounded-full border border-line2 bg-paper px-2 py-0.5 text-xs text-muted">
                      → {defaultKitchen ? `${defaultKitchen.name} (padrão)` : "sem destino"}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  {c.printStationKeys.map((key, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="shrink-0 text-muted">→</span>
                      <select
                        value={key}
                        onChange={(e) => setCatStation(c.id, idx, e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
                      >
                        <option value="">— escolher estação —</option>
                        {stations.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeCatStation(c.id, idx)}
                        title="Remover impressora"
                        className="shrink-0 rounded-lg border border-line2 bg-paper px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-red-50 hover:text-red-500 transition"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addCatStation(c.id)}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition"
                  >
                    + adicionar impressora
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* Big-font opt-in for kitchen comandas */}
      <PageCard>
        <SectionHeading
          title="3. Letras grandes na cozinha"
          subtitle="Imprime os itens da comanda da cozinha em letra dupla — mais fácil de ler de longe."
        />
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line2 bg-[#FAFAF8] p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Ativar letra grande</p>
            <p className="mt-0.5 text-xs text-muted">
              Funciona em impressoras que aceitam comandos ESC/POS (a maioria das térmicas). Ative, salve e
              imprima um pedido de teste: se os itens saírem grandes, está certo. Se sair com códigos
              estranhos no lugar, é só desligar e salvar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setLargeFont((v) => !v); setSuccess(null); }}
            aria-pressed={largeFont}
            title={largeFont ? "Letra grande ativada" : "Letra grande desativada"}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${largeFont ? "bg-brand-500" : "bg-line2"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform ${largeFont ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
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
