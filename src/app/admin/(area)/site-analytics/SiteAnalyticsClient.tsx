"use client";

/**
 * Admin → Analytics do site.
 *
 * The measurement id of foocci.com.br itself — not a restaurant's. It is read at
 * request time, so pasting it here takes effect on the next page load, with no deploy.
 *
 * The screen states, per field, whether the stored value is ACTIVE. A GA4 id with a
 * typo is silently dropped by validation (it goes into a <script> tag), and without
 * this feedback "I pasted it and nothing happened" would be unanswerable.
 */

import { useCallback, useEffect, useState } from "react";

interface Payload {
  stored: {
    gaMeasurementId: string | null;
    metaPixelId: string | null;
    googleSiteVerification: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  active: {
    gaMeasurementId: string | null;
    metaPixelId: string | null;
    googleSiteVerification: string | null;
  };
  valid: Record<string, boolean>;
}

const FIELDS = [
  {
    key: "gaMeasurementId" as const,
    label: "Google Analytics 4 — ID de medição",
    hint: 'Começa com "G-". Em analytics.google.com → Admin → Fluxos de dados → seu site.',
    placeholder: "G-XXXXXXXXXX",
  },
  {
    key: "metaPixelId" as const,
    label: "Meta Pixel — ID",
    hint: "Só números. Gerenciador de Eventos da Meta → Fontes de dados.",
    placeholder: "123456789012345",
  },
  {
    key: "googleSiteVerification" as const,
    label: "Verificação do Google Search Console",
    hint: "Opcional. Só o código do método de meta tag, sem a tag em volta.",
    placeholder: "abc123...",
  },
];

export function SiteAnalyticsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/site-settings");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
      const d = json.data as Payload;
      setData(d);
      setDraft({
        gaMeasurementId: d.stored.gaMeasurementId ?? "",
        metaPixelId: d.stored.metaPixelId ?? "",
        googleSiteVerification: d.stored.googleSiteVerification ?? "",
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json.data as Payload);
      setMsg({ kind: "ok", text: "Salvo. Recarregue foocci.com.br para conferir." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-7 w-56 animate-pulse rounded bg-gray-800" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-52 animate-pulse rounded bg-gray-800" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-gray-800/60" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4">
          <p className="text-sm font-semibold text-red-300">Não consegui carregar</p>
          <p className="mt-1 text-sm text-red-200/80">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg bg-red-900/60 px-3 py-1.5 text-sm font-medium text-red-100 hover:bg-red-900"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const nothingSet = data && !data.active.gaMeasurementId && !data.active.metaPixelId;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Analytics do site</h1>
        <p className="mt-1 text-sm text-gray-400">
          Medição do <strong className="text-gray-200">nosso</strong> site comercial
          (foocci.com.br) — não é o Analytics de restaurante, que fica no painel de cada
          lojista, em Integrações → Google.
        </p>
      </header>

      {nothingSet ? (
        <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3">
          <p className="text-sm text-amber-200/90">
            ⚠️ <strong>Nenhuma medição ativa.</strong> O site está no ar sem Analytics —
            campanha que rodar agora não é medida.
          </p>
        </div>
      ) : null}

      <section className="mt-6 space-y-5">
        {FIELDS.map((f) => {
          const isActive = data?.valid?.[f.key];
          const stored = draft[f.key] ?? "";
          return (
            <div key={f.key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={f.key} className="text-sm font-medium text-gray-200">
                  {f.label}
                </label>
                {stored ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      isActive
                        ? "bg-emerald-900/50 text-emerald-300"
                        : "bg-red-900/50 text-red-300"
                    }`}
                  >
                    {isActive ? "ativo" : "formato inválido"}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500">{f.hint}</p>
              <input
                id={f.key}
                autoComplete="off"
                value={stored}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-violet-500"
              />
            </div>
          );
        })}
      </section>

      <div className="mt-8 flex flex-col gap-3 border-t border-gray-800 pt-5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {msg ? (
          <span className={`text-sm ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {msg.text}
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Vale imediatamente — o site lê estes valores a cada carregamento, sem precisar de
        deploy. Um código com erro de digitação é <strong>descartado</strong> em vez de
        ir para a página, e o selo acima diz qual está valendo.
      </p>
    </div>
  );
}
