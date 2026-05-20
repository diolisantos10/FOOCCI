"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackingLink {
  id:                      string;
  name:                    string;
  slug:                    string;
  shortCode:               string | null;
  destinationType:         string;
  source:                  string;
  medium:                  string;
  campaign:                string | null;
  content:                 string | null;
  term:                    string | null;
  isActive:                boolean;
  clickCount:              number;
  identifiedCustomerCount: number;
  orderStartedCount:       number;
  orderCompletedCount:     number;
  revenue:                 string;
  createdAt:               string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCES = [
  { value: "instagram",  label: "Instagram"           },
  { value: "whatsapp",   label: "WhatsApp"             },
  { value: "qr",         label: "QR Code"              },
  { value: "google",     label: "Google"               },
  { value: "ifood",      label: "iFood"                },
  { value: "embalagem",  label: "Embalagem"            },
  { value: "panfleto",   label: "Panfleto / Impresso"  },
  { value: "tiktok",     label: "TikTok"               },
  { value: "outro",      label: "Outro"                },
];

const MEDIUMS = [
  { value: "bio",        label: "Bio (perfil)"   },
  { value: "direct",     label: "Direct / Link"  },
  { value: "mesa",       label: "Mesa"            },
  { value: "embalagem",  label: "Embalagem"       },
  { value: "sacolinha",  label: "Sacolinha"       },
  { value: "campanha",   label: "Campanha"        },
  { value: "organic",    label: "Orgânico"        },
  { value: "stories",    label: "Stories"         },
  { value: "feed",       label: "Feed"            },
  { value: "outro",      label: "Outro"           },
];

const SOURCE_ICONS: Record<string, string> = {
  instagram: "📸", whatsapp: "💬", qr: "📷", google: "🔍",
  ifood: "🛵", embalagem: "📦", panfleto: "📄", tiktok: "🎵", outro: "🔗",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRevenue(raw: string | number): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return `R$ ${(n || 0).toFixed(2).replace(".", ",")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── QR Canvas helper ──────────────────────────────────────────────────────────

function QRDisplay({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, url, { width: 200, margin: 2 }, () => {});
    });
  }, [url]);

  return <canvas ref={canvasRef} className="rounded-xl" />;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CanaisClient({ restaurantSlug }: { restaurantSlug: string }) {
  const [links, setLinks]         = useState<TrackingLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<"links" | "analytics">("links");
  // Per-link copy state: tracks which link's short URL was just copied
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);
  // Per-link regenerate loading state
  const [regenLoadingId, setRegenLoadingId] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    name:            "",
    slug:            "",
    slugManual:      false,
    destinationType: "PEDIDO",
    source:          "",
    medium:          "",
    campaign:        "",
    content:         "",
    term:            "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdLink, setCreatedLink] = useState<TrackingLink | null>(null);

  // Analytics settings state
  const [ga4Id, setGa4Id]   = useState("");
  const [gtmId, setGtmId]   = useState("");
  const [gaLoading, setGaLoading] = useState(true);
  const [gaSaving, setGaSaving]   = useState(false);
  const [gaSaved, setGaSaved]     = useState(false);
  const [gaError, setGaError]     = useState("");

  // QR modal
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // ── Fetch links ────────────────────────────────────────────────────────────

  const fetchLinks = useCallback(async () => {
    try {
      const res  = await fetch("/api/tracking-links");
      const json = await res.json();
      setLinks(json.data ?? []);
    } catch { /* keep current */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  // ── Fetch analytics settings ───────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/analytics/settings")
      .then((r) => r.json())
      .then((j) => {
        setGa4Id(j.data?.ga4MeasurementId ?? "");
        setGtmId(j.data?.gtmId ?? "");
      })
      .catch(() => {})
      .finally(() => setGaLoading(false));
  }, []);

  // ── Auto-slug from name ────────────────────────────────────────────────────

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: f.slugManual ? f.slug : toSlug(name),
    }));
  }

  // ── Create link ────────────────────────────────────────────────────────────

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim() || !form.source || !form.medium) {
      setCreateError("Nome, slug, origem e meio são obrigatórios.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res  = await fetch("/api/tracking-links", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:            form.name.trim(),
          slug:            form.slug.trim(),
          destinationType: form.destinationType,
          source:          form.source,
          medium:          form.medium,
          campaign:        form.campaign.trim() || undefined,
          content:         form.content.trim() || undefined,
          term:            form.term.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? "Erro ao criar link."); return; }
      const link = json.data as TrackingLink;
      setLinks((ls) => [link, ...ls]);
      setCreatedLink(link);
      setForm({ name: "", slug: "", slugManual: false, destinationType: "PEDIDO", source: "", medium: "", campaign: "", content: "", term: "" });
      setShowCreate(false);
    } catch { setCreateError("Falha de rede."); }
    finally { setCreating(false); }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  async function handleToggle(link: TrackingLink) {
    const updated = { ...link, isActive: !link.isActive };
    setLinks((ls) => ls.map((l) => l.id === link.id ? updated : l));
    await fetch(`/api/tracking-links/${link.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isActive: !link.isActive }),
    }).catch(() => {});
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(link: TrackingLink) {
    if (!confirm(`Apagar "${link.name}"?`)) return;
    setLinks((ls) => ls.filter((l) => l.id !== link.id));
    await fetch(`/api/tracking-links/${link.id}`, { method: "DELETE" }).catch(() => {});
  }

  // ── Save GA settings ───────────────────────────────────────────────────────

  async function handleSaveGA(e: FormEvent) {
    e.preventDefault();
    setGaSaving(true);
    setGaError("");
    setGaSaved(false);
    try {
      const res  = await fetch("/api/analytics/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ga4MeasurementId: ga4Id.trim() || null,
          gtmId:            gtmId.trim() || null,
        }),
      });
      if (!res.ok) { setGaError("Erro ao salvar."); return; }
      setGaSaved(true);
      setTimeout(() => setGaSaved(false), 3000);
    } catch { setGaError("Falha de rede."); }
    finally { setGaSaving(false); }
  }

  // ── Link URL helpers ───────────────────────────────────────────────────────

  function getLinkUrl(link: TrackingLink): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/l/${restaurantSlug}/${link.slug}`;
  }

  function getShortUrl(link: TrackingLink): string | null {
    if (!link.shortCode) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? "");
    return `${origin}/r/${link.shortCode}`;
  }

  async function handleRegenShortCode(link: TrackingLink) {
    setRegenLoadingId(link.id);
    try {
      const res  = await fetch(`/api/tracking-links/${link.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ regenerateShortCode: true }),
      });
      const json = await res.json();
      if (res.ok && json.data?.shortCode) {
        setLinks((ls) => ls.map((l) => l.id === link.id ? { ...l, shortCode: json.data.shortCode } : l));
      }
    } catch { /* ignore */ }
    finally { setRegenLoadingId(null); }
  }

  function handleCopyShortUrl(link: TrackingLink) {
    const url = getShortUrl(link);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedShortId(link.id);
      setTimeout(() => setCopiedShortId((prev) => prev === link.id ? null : prev), 2500);
    }).catch(() => {});
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Canais & Links Rastreáveis</h1>
          <p className="text-sm text-gray-500">Crie links únicos por canal e monitore cliques, pedidos e receita.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setCreatedLink(null); }}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 transition-colors"
        >
          + Novo link
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([["links", "🔗 Links"], ["analytics", "📊 Analytics"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Recently created notice ── */}
      {createdLink && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
          <span className="text-xl">✅</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Link criado com sucesso!</p>
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Rastreável</p>
              <p className="break-all text-xs font-mono text-green-700">{getLinkUrl(createdLink)}</p>
              {getShortUrl(createdLink) && (
                <>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-orange-500">Link curto</p>
                  <p className="break-all text-xs font-mono font-semibold text-gray-800">{getShortUrl(createdLink)}</p>
                </>
              )}
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(getLinkUrl(createdLink)); }}
                className="rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-700"
              >
                Copiar link rastreável
              </button>
              {getShortUrl(createdLink) && (
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(getShortUrl(createdLink)!); }}
                  className="rounded-lg border border-orange-300 bg-white px-3 py-1 text-xs font-bold text-orange-600 hover:bg-orange-50"
                >
                  Copiar link curto
                </button>
              )}
              <button
                type="button"
                onClick={() => setQrUrl(getLinkUrl(createdLink))}
                className="rounded-lg border border-green-300 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                Ver QR Code
              </button>
              <button
                type="button"
                onClick={() => setCreatedLink(null)}
                className="ml-auto text-xs text-green-600 hover:underline"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ LINKS TAB ══════════════════ */}
      {activeTab === "links" && (
        <>
          {/* Create form */}
          {showCreate && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
              <h2 className="mb-4 text-sm font-bold text-gray-800">Novo link rastreável</h2>
              <form onSubmit={handleCreate} className="space-y-3">
                {/* Name + slug row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">Nome do link *</label>
                    <input
                      value={form.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder='Ex: Instagram Bio, QR Mesa 01'
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">
                      Slug *{" "}
                      <span className="text-[10px] text-gray-400">(parte da URL)</span>
                    </label>
                    <input
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value, slugManual: true }))}
                      placeholder="instagram-bio"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                </div>

                {/* Destination */}
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700">Destino *</label>
                  <select
                    value={form.destinationType}
                    onChange={(e) => setForm((f) => ({ ...f, destinationType: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option value="PEDIDO">Cardápio Delivery (/pedido/…)</option>
                    <option value="QR">Cardápio QR / Mesa (/qr/…)</option>
                  </select>
                </div>

                {/* Source + medium row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">Origem (source) *</label>
                    <select
                      value={form.source}
                      onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                    >
                      <option value="">Selecione…</option>
                      {SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">Meio (medium) *</label>
                    <select
                      value={form.medium}
                      onChange={(e) => setForm((f) => ({ ...f, medium: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                    >
                      <option value="">Selecione…</option>
                      {MEDIUMS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Optional params */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Campanha</label>
                    <input value={form.campaign} onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                      placeholder="delivery-maio" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Conteúdo</label>
                    <input value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                      placeholder="banner-vermelho" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-600">Termo</label>
                    <input value={form.term} onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
                      placeholder="sushi entrega" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  </div>
                </div>

                {createError && (
                  <p className="text-xs text-red-600">{createError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >
                    {creating ? "Criando…" : "Criar link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); setCreateError(""); }}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Links list */}
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-12">Carregando…</p>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 py-16 text-center text-gray-400">
              <span className="text-4xl">🔗</span>
              <p className="text-sm font-medium text-gray-500">Nenhum link criado ainda</p>
              <p className="text-xs text-gray-400">Crie o primeiro link para começar a rastrear visitas por canal.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
              >
                + Criar primeiro link
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => {
                const url = getLinkUrl(link);
                return (
                  <div
                    key={link.id}
                    className={`rounded-2xl border bg-white p-4 transition-all ${
                      link.isActive ? "border-gray-200" : "border-gray-100 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Source icon */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl">
                        {SOURCE_ICONS[link.source] ?? "🔗"}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900 truncate">{link.name}</p>
                          {!link.isActive && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Inativo</span>
                          )}
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                            {link.destinationType === "QR" ? "QR" : "Delivery"}
                          </span>
                        </div>

                        {/* UTM info */}
                        <p className="mt-0.5 text-xs text-gray-500">
                          {link.source} · {link.medium}
                          {link.campaign ? ` · ${link.campaign}` : ""}
                        </p>

                        {/* URLs: rastreável + curto */}
                        <div className="mt-2 space-y-1.5">
                          {/* Link rastreável */}
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-20">Rastreável</span>
                            <p className="flex-1 truncate text-[11px] font-mono text-gray-400">{url}</p>
                            <button
                              type="button"
                              title="Copiar link rastreável"
                              onClick={() => navigator.clipboard.writeText(url)}
                              className="shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                              Copiar
                            </button>
                          </div>

                          {/* Link curto */}
                          {(() => {
                            const shortUrl = getShortUrl(link);
                            if (!shortUrl) return null;
                            const isCopied = copiedShortId === link.id;
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-orange-400 w-20">Link curto</span>
                                <p className="flex-1 truncate text-[11px] font-mono font-medium text-gray-700">{shortUrl}</p>
                                <button
                                  type="button"
                                  title="Copiar link curto"
                                  onClick={() => handleCopyShortUrl(link)}
                                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                                    isCopied
                                      ? "border-green-200 bg-green-50 text-green-700"
                                      : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                                  }`}
                                >
                                  {isCopied ? "✓ Copiado" : "Copiar"}
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Metrics */}
                        <div className="mt-2 flex flex-wrap gap-3">
                          {[
                            { icon: "👆", label: "Cliques",  value: link.clickCount },
                            { icon: "👤", label: "Clientes", value: link.identifiedCustomerCount },
                            { icon: "🛒", label: "Pedidos",  value: link.orderCompletedCount },
                            { icon: "💰", label: "Receita",  value: fmtRevenue(link.revenue) },
                          ].map((m) => (
                            <div key={m.label} className="text-center">
                              <p className="text-[10px] text-gray-400">{m.icon} {m.label}</p>
                              <p className="text-sm font-bold text-gray-800">{m.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 flex-col gap-1.5 items-end">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Ver QR Code"
                            onClick={() => setQrUrl(url)}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            📷 QR
                          </button>
                          <button
                            type="button"
                            title="Regenerar link curto"
                            onClick={() => handleRegenShortCode(link)}
                            disabled={regenLoadingId === link.id}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            {regenLoadingId === link.id ? "…" : "↺ Regenerar"}
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggle(link)}
                            className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                              link.isActive
                                ? "border border-gray-200 text-gray-500 hover:bg-gray-50"
                                : "border border-green-200 text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {link.isActive ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(link)}
                            className="rounded-lg border border-red-100 px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                          >
                            Apagar
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400">{fmtDate(link.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════ ANALYTICS TAB ══════════════════ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* GA4 / GTM */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-bold text-gray-800">Google Analytics / Tag Manager</h2>
            <p className="mb-4 text-xs text-gray-500">
              Se preenchidos, os scripts serão carregados automaticamente no cardápio público (/pedido).
              Deixe em branco para não usar.
            </p>

            {gaLoading ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : (
              <form onSubmit={handleSaveGA} className="space-y-3">
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-700">
                    GA4 Measurement ID
                  </label>
                  <input
                    value={ga4Id}
                    onChange={(e) => setGa4Id(e.target.value)}
                    placeholder="G-XXXXXXXXXX"
                    className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <p className="mt-0.5 text-[11px] text-gray-400">Formato: G-XXXXXXXXXX</p>
                </div>

                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-700">
                    Google Tag Manager ID
                  </label>
                  <input
                    value={gtmId}
                    onChange={(e) => setGtmId(e.target.value)}
                    placeholder="GTM-XXXXXXX"
                    className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <p className="mt-0.5 text-[11px] text-gray-400">Formato: GTM-XXXXXXX</p>
                </div>

                {gaError && <p className="text-xs text-red-600">{gaError}</p>}
                {gaSaved && <p className="text-xs text-green-600">✓ Configurações salvas!</p>}

                <button
                  type="submit"
                  disabled={gaSaving}
                  className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {gaSaving ? "Salvando…" : "Salvar"}
                </button>
              </form>
            )}
          </div>

          {/* Events info */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <h2 className="mb-2 text-sm font-bold text-gray-700">Eventos rastreados automaticamente</h2>
            <p className="mb-3 text-xs text-gray-500">
              Quando GA4 está configurado, os seguintes eventos são disparados no cardápio público:
            </p>
            <ul className="space-y-1 text-xs text-gray-600">
              {[
                ["view_menu",          "Ao carregar o cardápio"                         ],
                ["view_product",       "Ao abrir detalhes de um produto"                ],
                ["add_to_cart",        "Ao adicionar item ao carrinho"                  ],
                ["begin_checkout",     "Ao iniciar o checkout (nome/endereço)"          ],
                ["submit_order",       "Ao confirmar o pedido"                          ],
                ["select_item",        "Ao selecionar uma categoria"                    ],
              ].map(([ev, desc]) => (
                <li key={ev} className="flex items-start gap-2">
                  <code className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-mono">{ev}</code>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              Parâmetros incluídos: source, medium, campaign, trackingLinkId quando disponíveis.
            </p>
          </div>
        </div>
      )}

      {/* ── QR Modal ── */}
      {qrUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setQrUrl(null)}
        >
          <div
            className="rounded-2xl bg-white p-6 shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-800">QR Code</h3>
            <QRDisplay url={qrUrl} />
            <p className="break-all text-center text-[11px] font-mono text-gray-400">{qrUrl}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(qrUrl)}
                className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600"
              >
                Copiar URL
              </button>
              <button
                type="button"
                onClick={() => setQrUrl(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
