"use client";

/**
 * /settings/experience — Visual identity only.
 *
 * AI behaviour (personality, sales strategy, communication style)
 * has moved to /agente-ia. This page is the single source of truth
 * for brand colours and logo.
 */

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Feedback, SaveButton, PageCard, SectionHeading } from "../_shared";

// ── LivePreview ───────────────────────────────────────────────────────────────

function LivePreview({
  primaryColor,
  secondaryColor,
  logoUrl,
  restaurantName,
}: {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
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

// ── ColorField ────────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExperiencePage() {
  const [primaryColor, setPrimaryColor]     = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [logoUrl, setLogoUrl]               = useState("");
  const [restaurantName, setRestaurantName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

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

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Identity fields */}
        <PageCard>
          <SectionHeading
            title="Identidade visual"
            subtitle="Cores e logo aplicadas ao cardápio digital e comunicações com o cliente."
          />
          <div className="space-y-5">
            <ColorField label="Cor principal"   value={primaryColor}   onChange={setPrimaryColor}   />
            <ColorField label="Cor secundária"  value={secondaryColor} onChange={setSecondaryColor} />
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
        </PageCard>

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

      <SaveButton saving={saving} label="Salvar identidade visual" />
    </form>
  );
}
