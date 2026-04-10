"use client";

/**
 * /marca — Brand identity page.
 *
 * Single source of truth for restaurant brand settings used by Foocci:
 * colors, logo, and visual identity applied to the digital menu and
 * customer-facing communications.
 *
 * Future: custom fonts, banners, seasonal themes.
 */

import { useState, useEffect, type FormEvent } from "react";
import { TopBar } from "@/components/layout/TopBar";

// ── API helper (inline — avoids settings/_shared coupling) ───────────────────

async function apiFetch(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, data: json?.data ?? json };
}

// ── Live phone preview ────────────────────────────────────────────────────────

function LivePreview({
  primaryColor,
  secondaryColor,
  logoUrl,
  restaurantName,
}: {
  primaryColor:   string;
  secondaryColor: string;
  logoUrl:        string;
  restaurantName: string;
}) {
  const primary   = primaryColor   || "#6366f1";
  const secondary = secondaryColor || "#8b5cf6";

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
        Preview ao vivo
      </p>

      {/* Phone shell */}
      <div className="w-52 rounded-[2.5rem] bg-gray-900 p-[5px] shadow-2xl shadow-gray-400/30">
        <div className="overflow-hidden rounded-[2.1rem] bg-gray-50">
          {/* Notch */}
          <div className="flex justify-center bg-gray-900 py-1.5">
            <div className="h-1.5 w-14 rounded-full bg-gray-700" />
          </div>

          {/* App header */}
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: primary }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="h-8 w-8 rounded-full border-2 border-white/30 object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm">🍽</div>
            )}
            <div>
              <p className="text-[11px] font-bold leading-none text-white">{restaurantName || "Seu Restaurante"}</p>
              <p className="mt-0.5 text-[9px] text-white/70">• Online agora</p>
            </div>
          </div>

          {/* Chat area */}
          <div className="space-y-2 p-2.5" style={{ minHeight: 180, background: "#e5ddd5" }}>
            <div className="flex items-end gap-1.5">
              <div
                className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-[10px] leading-snug text-white shadow-sm"
                style={{ backgroundColor: primary }}
              >
                Olá! Bem-vindo 😊 O que vai ser hoje?
              </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="h-12 w-full" style={{ background: `linear-gradient(135deg, ${primary}33 0%, ${secondary}33 100%)` }} />
              <div className="px-2.5 py-2">
                <p className="text-[10px] font-bold text-gray-900">X-Burguer Especial</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">R$ 28,90</span>
                  <button type="button" className="rounded-full px-2.5 py-1 text-[9px] font-bold text-white" style={{ backgroundColor: primary }}>
                    + Pedir
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-white px-3 py-2 text-[10px] shadow-sm">
                Perfeito! Quero esse 🤤
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 bg-gray-100 px-2.5 py-2">
            <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[9px] text-gray-400">Mensagem…</div>
          </div>
        </div>
      </div>

      {/* Color chips */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-5 w-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: primary }} title="Cor principal" />
        <div className="h-5 w-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: secondary }} title="Cor secundária" />
        <p className="text-[10px] text-gray-400">{primary} · {secondary}</p>
      </div>
    </div>
  );
}

// ── Color field ───────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
}) {
  const display = value || "#6366f1";
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={display}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded-xl border-0 p-0.5 shadow-sm"
          style={{ backgroundColor: display }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          maxLength={7}
          className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <div className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 shadow-sm" style={{ backgroundColor: display }} />
      </div>
    </div>
  );
}

// ── Feedback banner ───────────────────────────────────────────────────────────

function Feedback({
  success,
  error,
  onDismiss,
}: {
  success:   string | null;
  error:     string | null;
  onDismiss: () => void;
}) {
  if (success)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
        ✓ {success}
      </div>
    );
  if (error)
    return (
      <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span>{error}</span>
        <button type="button" className="ml-2 text-xs underline opacity-70 hover:opacity-100" onClick={onDismiss}>
          fechar
        </button>
      </div>
    );
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarcaPage() {
  const [primaryColor,   setPrimaryColor]   = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [logoUrl,        setLogoUrl]        = useState("");
  const [restaurantName, setRestaurantName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/brand-config"),
      apiFetch("/api/settings/store"),
    ]).then(([bc, store]) => {
      if (bc.ok) {
        setPrimaryColor(bc.data?.brandPrimaryColor   ?? "#6366f1");
        setSecondaryColor(bc.data?.brandSecondaryColor ?? "#8b5cf6");
      }
      if (store.ok) {
        setLogoUrl(store.data?.logoUrl ?? "");
        setRestaurantName(store.data?.name ?? "");
      }
    }).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    const [bcRes, storeRes] = await Promise.all([
      apiFetch("/api/brand-config", "PUT", {
        brandPrimaryColor:   primaryColor   || null,
        brandSecondaryColor: secondaryColor || null,
      }),
      apiFetch("/api/settings/store", "PUT", { logoUrl: logoUrl || null }),
    ]);

    if (bcRes.ok && storeRes.ok) {
      setSuccess("Identidade visual salva com sucesso.");
    } else {
      setError(
        (!bcRes.ok   ? bcRes.data?.error   : null) ??
        (!storeRes.ok ? storeRes.data?.error : null) ??
        "Erro ao salvar."
      );
    }
    setSaving(false);
  }

  return (
    <>
      <TopBar title="Marca" />

      <div className="mx-auto max-w-3xl px-6 py-6 pb-12">
        {loading ? (
          <p className="py-8 text-sm text-gray-400">Carregando…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Feedback success={success} error={error} onDismiss={() => setError(null)} />

            {/* ── Identidade visual ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Fields */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Identidade visual</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Cores e logo aplicadas ao cardápio digital e comunicações com o cliente.
                  </p>
                </div>
                <ColorField label="Cor principal"  value={primaryColor}   onChange={setPrimaryColor}   />
                <ColorField label="Cor secundária" value={secondaryColor} onChange={setSecondaryColor} />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Logo (URL)</label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…"
                    maxLength={500}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
                  />
                </div>
              </div>

              {/* Live preview */}
              <div className="flex items-center justify-center rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <LivePreview
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  logoUrl={logoUrl}
                  restaurantName={restaurantName}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar identidade visual"}
            </button>

            {/* ── Em breve ──────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Em breve</p>
              <p className="text-sm font-medium text-gray-700">Mais opções de identidade de marca</p>
              <ul className="mt-2 space-y-1 text-xs text-gray-400">
                {[
                  "Tema de cores personalizado para o cardápio",
                  "Logotipo e favicon do cardápio digital",
                  "Banners e destaques na home",
                  "Mensagens personalizadas por ocasião",
                  "Tom de voz e estilo da marca",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
