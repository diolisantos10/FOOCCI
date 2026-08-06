"use client";

import { useState, useEffect, type FormEvent } from "react";
import { TopBar } from "@/components/layout/TopBar";
import {
  apiFetch,
  Feedback,
  SaveButton,
  PageCard,
  SectionHeading,
  Toggle,
  Field,
  INPUT,
} from "../settings/_shared";

// ── Option sets ─────────────────────────────────────────────────────────────

const CUISINE_OPTIONS = [
  { value: "pizza",      label: "Pizzaria",     emoji: "🍕" },
  { value: "sushi",      label: "Japonês",      emoji: "🍱" },
  { value: "burger",     label: "Hamburguer",   emoji: "🍔" },
  { value: "italiano",   label: "Italiano",     emoji: "🍝" },
  { value: "brasileiro", label: "Brasileiro",   emoji: "🇧🇷" },
  { value: "saudável",   label: "Saudável",     emoji: "🥗" },
  { value: "café",       label: "Café",         emoji: "☕" },
  { value: "sobremesa",  label: "Sobremesas",   emoji: "🍰" },
  { value: "mexicano",   label: "Mexicano",     emoji: "🌮" },
  { value: "asiático",   label: "Asiático",     emoji: "🥢" },
];

const PRICE_OPTIONS = [
  { value: "budget",    label: "Econômico",  desc: "Foco em preço acessível" },
  { value: "mid-range", label: "Médio",      desc: "Equilíbrio preço/qualidade" },
  { value: "premium",   label: "Premium",    desc: "Qualidade acima da média" },
  { value: "luxury",    label: "Luxo",       desc: "Exclusividade e sofisticação" },
];

const OBJECTIVE_OPTIONS = [
  { value: "velocidade",  label: "Velocidade",  desc: "Atendimento rápido" },
  { value: "experiência", label: "Experiência", desc: "Momento memorável" },
  { value: "ticket_alto", label: "Ticket alto", desc: "Maximizar valor por pedido" },
  { value: "volume",      label: "Volume",      desc: "Alto giro de pedidos" },
];

const VOICE_TONE_OPTIONS = [
  { value: "formal",    label: "Formal",    desc: "Profissional e respeitoso" },
  { value: "casual",    label: "Casual",    desc: "Próximo e descontraído" },
  { value: "divertido", label: "Divertido", desc: "Animado, usa humor leve" },
  { value: "premium",   label: "Premium",   desc: "Sofisticado e exclusivo" },
  { value: "direto",    label: "Direto",    desc: "Objetivo, sem rodeios" },
];

const PERSONALITY_SUGGESTIONS = [
  "Amigável", "Sofisticado", "Engraçado", "Vendedor",
  "Minimalista", "Técnico", "Acolhedor", "Animado",
  "Criativo", "Confiável", "Tradicional", "Inovador",
];

const UPSELL_OPTIONS = [
  { value: "none",      label: "Discreto",  desc: "Sem sugestões extras" },
  { value: "gentle",    label: "Gentil",    desc: "Sugere uma vez" },
  { value: "moderate",  label: "Moderado",  desc: "Sugere quando adequado" },
  { value: "proactive", label: "Agressivo", desc: "Sempre faz upsell" },
];

const EMOJI_OPTIONS = [
  { value: "none",       label: "Nenhum" },
  { value: "minimal",    label: "Pouco" },
  { value: "moderate",   label: "Médio" },
  { value: "expressive", label: "Muito" },
];

const COMM_STYLE_OPTIONS = [
  { value: "concise",        label: "Curtas",     desc: "Direto ao ponto" },
  { value: "conversational", label: "Naturais",   desc: "Tom de conversa" },
  { value: "detailed",       label: "Detalhadas", desc: "Explica os itens" },
];

// ── Form state ───────────────────────────────────────────────────────────────

/** Os dois alvos de imagem desta tela. O envio é o mesmo; o destino é que muda. */
type ImageTarget = "logo" | "capa";

interface MarcaForm {
  logoUrl: string;
  coverImageUrl: string;
  brandName: string;
  shortDescription: string;
  brandStory: string;
  targetAudience: string;
  restaurantType: string;
  pricePositioning: string;
  businessObjective: string;
  voiceTonePreset: string;
  personalityTraits: string[];
  upsellStyle: string;
  comboFocus: boolean;
  avgTicketFocus: boolean;
  emojiUsage: string;
  communicationStyle: string;
  canInsistAfterRefusal: boolean;
  useClientName: boolean;
  mainDishes: string;
  differentials: string;
  mostProfitableProducts: string;
  cuisineType: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  googleReviewUrl: string;
  ifoodReviewUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  facebookUrl: string;
  youtubeUrl: string;
}

const FORM_DEFAULTS: MarcaForm = {
  logoUrl: "",
  coverImageUrl: "",
  brandName: "",
  shortDescription: "",
  brandStory: "",
  targetAudience: "",
  restaurantType: "",
  pricePositioning: "",
  businessObjective: "",
  voiceTonePreset: "",
  personalityTraits: [],
  upsellStyle: "gentle",
  comboFocus: false,
  avgTicketFocus: false,
  emojiUsage: "moderate",
  communicationStyle: "conversational",
  canInsistAfterRefusal: true,
  useClientName: true,
  mainDishes: "",
  differentials: "",
  mostProfitableProducts: "",
  cuisineType: "",
  brandPrimaryColor: "#6366f1",
  brandSecondaryColor: "#8b5cf6",
  googleReviewUrl: "",
  ifoodReviewUrl: "",
  instagramUrl: "",
  tiktokUrl: "",
  facebookUrl: "",
  youtubeUrl: "",
};

// ── Sub-components ───────────────────────────────────────────────────────────

/**
 * Botão de enviar imagem — com os três estados na mesma peça: enviando, erro
 * (com o motivo) e salvo. Era código repetido no cartão do logo; virou peça
 * única quando a capa nasceu, para os dois não divergirem na primeira correção.
 */
function UploadButton({
  alvo,
  rotulo,
  enviando,
  erro,
  salvo,
  dica = "JPEG, PNG ou WebP · máx. 5 MB",
  onFile,
}: {
  alvo: ImageTarget;
  rotulo: string;
  enviando: boolean;
  erro?: string;
  salvo?: boolean;
  dica?: string;
  onFile: (file: File) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="cursor-pointer">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={enviando}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        <span
          className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${
            enviando
              ? "cursor-not-allowed border-line2 bg-[#FAFAF8] text-muted"
              : "cursor-pointer border-brand-300 bg-paper text-brand-600 hover:bg-brand-50"
          }`}
        >
          {enviando ? "Enviando…" : rotulo}
        </span>
      </label>
      <p className="text-xs text-muted">{dica}</p>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {salvo && !erro && (
        <p className="text-xs text-green-600">
          {alvo === "logo" ? "Logo salva com sucesso." : "Capa salva com sucesso."}
        </p>
      )}
    </div>
  );
}

function Chips({
  options,
  value,
  onChange,
  allowDeselect = true,
}: {
  options: { value: string; label: string; desc?: string; emoji?: string }[];
  value: string;
  onChange: (v: string) => void;
  allowDeselect?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.desc}
            onClick={() => onChange(allowDeselect && active ? "" : opt.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
              active
                ? "border-brand-500 bg-brand-600 text-white shadow-sm"
                : "border-line2 bg-paper text-ink2 hover:border-line2 hover:bg-[#FAFAF8]"
            }`}
          >
            {opt.emoji && <span className="mr-1.5">{opt.emoji}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiChips({
  suggestions,
  value,
  onChange,
  max = 8,
}: {
  suggestions: string[];
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const [custom, setCustom] = useState("");

  function toggle(trait: string) {
    if (value.includes(trait)) {
      onChange(value.filter((t) => t !== trait));
    } else if (value.length < max) {
      onChange([...value, trait]);
    }
  }

  function addCustom() {
    const trimmed = custom.trim();
    if (trimmed && !value.includes(trimmed) && value.length < max) {
      onChange([...value, trimmed]);
      setCustom("");
    }
  }

  const customSelected = value.filter((t) => !suggestions.includes(t));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((trait) => {
          const active = value.includes(trait);
          return (
            <button
              key={trait}
              type="button"
              onClick={() => toggle(trait)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                active
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-line2 bg-paper text-ink2 hover:border-line2 hover:bg-[#FAFAF8]"
              }`}
            >
              {trait}
            </button>
          );
        })}
      </div>

      {customSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customSelected.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-700"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="ml-0.5 text-brand-400 hover:text-brand-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {value.length < max && (
        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Adicionar traço personalizado…"
            maxLength={30}
            className="rounded-xl border border-line2 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!custom.trim()}
            className="rounded-xl border border-line2 px-3 py-1.5 text-sm text-ink2 hover:bg-[#FAFAF8] disabled:opacity-40 transition"
          >
            +
          </button>
        </div>
      )}

      {value.length > 0 && (
        <p className="text-xs text-muted">
          {value.length}/{max} traços selecionados
        </p>
      )}
    </div>
  );
}

// ── Redes sociais (seletor dobrável) ─────────────────────────────────────────

const SOCIAL_NETWORKS = [
  { key: "instagramUrl", label: "Instagram", emoji: "📸", placeholder: "https://instagram.com/seurestaurante" },
  { key: "tiktokUrl",    label: "TikTok",    emoji: "🎬", placeholder: "https://tiktok.com/@seurestaurante" },
  { key: "facebookUrl",  label: "Facebook",  emoji: "👍", placeholder: "https://facebook.com/suapagina" },
  { key: "youtubeUrl",   label: "YouTube",   emoji: "▶️", placeholder: "https://youtube.com/@seucanal" },
] as const;
type SocialKey = (typeof SOCIAL_NETWORKS)[number]["key"];

function SocialLinksSection({
  values, onChange,
}: {
  values: Record<SocialKey, string>;
  onChange: (key: SocialKey, value: string) => void;
}) {
  const [active, setActive] = useState<Set<SocialKey>>(
    () => new Set(SOCIAL_NETWORKS.filter((n) => values[n.key]?.trim()).map((n) => n.key)),
  );
  const [addOpen, setAddOpen] = useState(false);
  const available = SOCIAL_NETWORKS.filter((n) => !active.has(n.key));

  return (
    <PageCard>
      <h2 className="text-base font-semibold text-ink">📱 Redes Sociais</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Escolha as redes que o restaurante tem e cole o endereço. Elas entram nas campanhas de CRM automaticamente.
      </p>

      <div className="space-y-3">
        {SOCIAL_NETWORKS.filter((n) => active.has(n.key)).map((n) => (
          <div key={n.key} className="rounded-xl border border-line p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{n.emoji} {n.label}</span>
              <button
                type="button"
                onClick={() => { onChange(n.key, ""); setActive((p) => { const s = new Set(p); s.delete(n.key); return s; }); }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                remover
              </button>
            </div>
            <input
              type="url"
              value={values[n.key]}
              onChange={(e) => onChange(n.key, e.target.value)}
              placeholder={n.placeholder}
              className={INPUT}
            />
          </div>
        ))}
        {active.size === 0 && <p className="text-xs text-muted">Nenhuma rede adicionada ainda.</p>}
      </div>

      {available.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            ➕ Adicionar rede social
          </button>
          {addOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
              {available.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => { setActive((p) => new Set(p).add(n.key)); setAddOpen(false); }}
                  className="rounded-xl border border-line bg-white px-3 py-2 text-sm hover:bg-[#FAFAF8]"
                >
                  {n.emoji} {n.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </PageCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MarcaPage() {
  const [form, setForm] = useState<MarcaForm>(FORM_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Dois alvos de imagem na mesma tela (logo e capa) com o MESMO fluxo. Estado
  // por alvo, e não um par de booleanos por peça: enviar a capa não pode acender
  // "Enviando…" no logo.
  const [uploading, setUploading] = useState<ImageTarget | null>(null);
  const [uploadError, setUploadError] = useState<Partial<Record<ImageTarget, string>>>({});
  const [uploadSaved, setUploadSaved] = useState<Partial<Record<ImageTarget, boolean>>>({});

  useEffect(() => {
    apiFetch("/api/brand-config").then(({ ok, data }) => {
      if (ok && data) {
        const p = (data.brandPersona ?? {}) as Record<string, unknown>;
        setForm({
          logoUrl:               String(p.logoUrl ?? ""),
          coverImageUrl:         data.coverImageUrl ?? "",
          brandName:             String(p.brandName ?? ""),
          shortDescription:      String(p.shortDescription ?? ""),
          brandStory:            String(p.brandStory ?? ""),
          targetAudience:        String(p.targetAudience ?? ""),
          restaurantType:        String(p.restaurantType ?? ""),
          pricePositioning:      String(p.pricePositioning ?? ""),
          businessObjective:     String(p.businessObjective ?? ""),
          voiceTonePreset:       String(p.voiceTonePreset ?? ""),
          personalityTraits:     Array.isArray(p.personalityTraits)
            ? (p.personalityTraits as string[])
            : [],
          upsellStyle:           data.upsellStyle ?? "gentle",
          comboFocus:            Boolean(p.comboFocus),
          avgTicketFocus:        Boolean(p.avgTicketFocus),
          emojiUsage:            data.emojiUsage ?? "moderate",
          communicationStyle:    data.communicationStyle ?? "conversational",
          canInsistAfterRefusal: p.canInsistAfterRefusal !== false,
          useClientName:         p.useClientName !== false,
          mainDishes:            String(p.mainDishes ?? ""),
          differentials:         String(p.differentials ?? ""),
          mostProfitableProducts: String(p.mostProfitableProducts ?? ""),
          cuisineType:           String(p.cuisineType ?? ""),
          brandPrimaryColor:     data.brandPrimaryColor ?? "#6366f1",
          brandSecondaryColor:   data.brandSecondaryColor ?? "#8b5cf6",
          googleReviewUrl:       data.googleReviewUrl ?? "",
          ifoodReviewUrl:        data.ifoodReviewUrl ?? "",
          instagramUrl:          data.instagramUrl ?? "",
          tiktokUrl:             data.tiktokUrl ?? "",
          facebookUrl:           data.facebookUrl ?? "",
          youtubeUrl:            data.youtubeUrl ?? "",
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  function set<K extends keyof MarcaForm>(key: K) {
    return (value: MarcaForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Envia logo OU capa. Um caminho só: o de dois lugares diferentes já tinha
   * produzido dois tratamentos de erro diferentes para a mesma falha de rede.
   * Grava na hora (como o logo sempre gravou) — quem sobe uma imagem e sai da
   * tela sem apertar Salvar não pode perder a imagem.
   */
  async function handleImageUpload(file: File, alvo: ImageTarget) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const falha = (msg: string) => setUploadError((e) => ({ ...e, [alvo]: msg }));

    if (!allowed.includes(file.type)) {
      falha("Formato inválido. Use JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      falha("Arquivo muito grande. Máximo 5 MB.");
      return;
    }
    setUploading(alvo);
    setUploadError((e) => ({ ...e, [alvo]: undefined }));
    setUploadSaved((e) => ({ ...e, [alvo]: false }));

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
      // API wraps responses as { success, data } — unwrap before reading url
      const json = await res.json() as { success?: boolean; data?: { url?: string }; error?: string };
      const uploadedUrl = json?.data?.url;

      if (!res.ok || !uploadedUrl) {
        falha(json?.error ?? (res.status === 401 ? "Sessão expirada. Faça login novamente." : "Falha no envio. Tente novamente."));
        return;
      }

      if (alvo === "logo") {
        set("logoUrl")(uploadedUrl);
        // O logo mora no brandPersona (JSON); a capa tem coluna própria.
        await apiFetch("/api/brand-config", "PATCH", { brandPersona: { logoUrl: uploadedUrl } });
      } else {
        set("coverImageUrl")(uploadedUrl);
        await apiFetch("/api/brand-config", "PATCH", { coverImageUrl: uploadedUrl });
      }
      setUploadSaved((e) => ({ ...e, [alvo]: true }));
    } catch {
      falha("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(null);
    }
  }

  /** Tira a capa e volta ao degradê da marca. Some imediatamente, sem Salvar. */
  async function handleRemoveCover() {
    set("coverImageUrl")("");
    setUploadSaved((e) => ({ ...e, capa: false }));
    setUploadError((e) => ({ ...e, capa: undefined }));
    await apiFetch("/api/brand-config", "PATCH", { coverImageUrl: null });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    const brandPersona: Record<string, unknown> = {
      canInsistAfterRefusal: form.canInsistAfterRefusal,
      useClientName:         form.useClientName,
      comboFocus:            form.comboFocus,
      avgTicketFocus:        form.avgTicketFocus,
    };
    if (form.logoUrl)                brandPersona.logoUrl = form.logoUrl;
    if (form.brandName)              brandPersona.brandName = form.brandName;
    if (form.shortDescription)       brandPersona.shortDescription = form.shortDescription;
    if (form.brandStory)             brandPersona.brandStory = form.brandStory;
    if (form.targetAudience)         brandPersona.targetAudience = form.targetAudience;
    if (form.restaurantType)         brandPersona.restaurantType = form.restaurantType;
    if (form.pricePositioning)       brandPersona.pricePositioning = form.pricePositioning;
    if (form.businessObjective)      brandPersona.businessObjective = form.businessObjective;
    if (form.voiceTonePreset)        brandPersona.voiceTonePreset = form.voiceTonePreset;
    if (form.personalityTraits.length > 0) brandPersona.personalityTraits = form.personalityTraits;
    if (form.mainDishes)             brandPersona.mainDishes = form.mainDishes;
    if (form.differentials)          brandPersona.differentials = form.differentials;
    if (form.mostProfitableProducts) brandPersona.mostProfitableProducts = form.mostProfitableProducts;
    if (form.cuisineType)            brandPersona.cuisineType = form.cuisineType;

    // PATCH — only sends fields owned by this form; never clobbers AI/other settings
    const { ok, data } = await apiFetch("/api/brand-config", "PATCH", {
      upsellStyle:        form.upsellStyle,
      emojiUsage:         form.emojiUsage,
      communicationStyle: form.communicationStyle,
      brandPrimaryColor:  form.brandPrimaryColor || null,
      brandSecondaryColor: form.brandSecondaryColor || null,
      coverImageUrl:      form.coverImageUrl || null,
      googleReviewUrl:    form.googleReviewUrl || null,
      ifoodReviewUrl:     form.ifoodReviewUrl || null,
      instagramUrl:       form.instagramUrl || null,
      tiktokUrl:          form.tiktokUrl || null,
      facebookUrl:        form.facebookUrl || null,
      youtubeUrl:         form.youtubeUrl || null,
      brandPersona,
    });

    if (ok) {
      setSuccess("Persona da marca salva com sucesso.");
    } else {
      setError(data?.error ?? "Erro ao salvar.");
    }
    setSaving(false);
  }

  // O cabeçalho é a ÚNICA régua do topo — e é dentro dele que mora a pílula do
  // Assistente. Tela do menu lateral sem `TopBar` ficava sem assistente nenhum.
  if (loading) {
    return (
      <>
        <TopBar title="Marca" />
        <p className="p-6 text-sm text-muted">Carregando…</p>
      </>
    );
  }

  return (
    <>
    <TopBar title="Marca" />
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* ── 0. Logomarca ─────────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🖼️ Logomarca do restaurante"
          subtitle="Usada no cardápio digital e nas comunicações com o cliente."
        />
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line2 bg-[#FAFAF8]">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-3xl">🏪</span>
            )}
          </div>
          <UploadButton
            alvo="logo"
            rotulo={form.logoUrl ? "Trocar logo" : "Fazer upload"}
            enviando={uploading === "logo"}
            erro={uploadError.logo}
            salvo={uploadSaved.logo}
            onFile={(f) => void handleImageUpload(f, "logo")}
          />
        </div>
      </PageCard>

      {/* ── 0.1 Capa do cardápio ─────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🏞️ Capa do cardápio"
          subtitle="A faixa larga no topo do cardápio do QR Code, atrás do logo."
        />
        <div className="space-y-4">
          {/* A prévia mostra o resultado REAL — inclusive o caminho vazio. Sem
              capa não aparece caixa cinza nem "sem imagem": aparece o degradê da
              marca, que é exatamente o que o cliente vai ver no cardápio. */}
          <div
            className="relative h-28 w-full overflow-hidden rounded-2xl border border-line sm:h-36"
            style={{
              backgroundImage: `linear-gradient(135deg, ${form.brandPrimaryColor || "#25d366"} 0%, ${form.brandSecondaryColor || form.brandPrimaryColor || "#128c7e"} 100%)`,
            }}
          >
            {form.coverImageUrl && (
              <img
                src={form.coverImageUrl}
                alt="Prévia da capa do cardápio"
                className="absolute inset-0 h-full w-full object-cover object-center"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {!form.coverImageUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-white/85 px-3 py-1 text-[11.5px] font-semibold text-ink2">
                  Sem capa — o cardápio usa as cores da sua marca
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <UploadButton
              alvo="capa"
              rotulo={form.coverImageUrl ? "Trocar capa" : "Enviar capa"}
              enviando={uploading === "capa"}
              erro={uploadError.capa}
              salvo={uploadSaved.capa}
              dica="Deitada (ex.: 1600×600) · JPEG, PNG ou WebP · máx. 5 MB"
              onFile={(f) => void handleImageUpload(f, "capa")}
            />
            {form.coverImageUrl && (
              <button
                type="button"
                onClick={() => void handleRemoveCover()}
                className="inline-flex items-center gap-2 rounded-xl border border-line2 bg-paper px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-[#FAFAF8]"
              >
                Tirar capa
              </button>
            )}
          </div>
        </div>
      </PageCard>

      {/* ── 1. Identidade da Marca ────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🧠 Identidade da Marca"
          subtitle="Como sua marca se apresenta e quem ela quer alcançar."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome da marca">
            <input
              type="text"
              value={form.brandName}
              onChange={(e) => set("brandName")(e.target.value)}
              placeholder="Ex: Foocci Burgers"
              maxLength={100}
              className={INPUT}
            />
          </Field>
          <Field label="Público principal" hint="Quem é seu cliente ideal?">
            <input
              type="text"
              value={form.targetAudience}
              onChange={(e) => set("targetAudience")(e.target.value)}
              placeholder="Ex: jovens adultos que valorizam qualidade"
              maxLength={200}
              className={INPUT}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição curta">
              <input
                type="text"
                value={form.shortDescription}
                onChange={(e) => set("shortDescription")(e.target.value)}
                placeholder="Ex: Hamburguer artesanal com ingredientes premium"
                maxLength={200}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="História da marca" hint="Opcional — humaniza a comunicação da IA.">
              <textarea
                value={form.brandStory}
                onChange={(e) => set("brandStory")(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Ex: Fundado em 2018 por dois apaixonados por gastronomia…"
                className={`${INPUT} resize-none`}
              />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ── 2. Posicionamento ─────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🎯 Posicionamento"
          subtitle="Define como a IA posiciona seu restaurante nas conversas."
        />
        <div className="space-y-5">
          <Field label="Tipo de restaurante">
            <input
              type="text"
              value={form.restaurantType}
              onChange={(e) => set("restaurantType")(e.target.value)}
              placeholder="Ex: hamburguer artesanal, pizzaria napolitana"
              maxLength={100}
              className={INPUT}
            />
          </Field>
          <Field label="Nível de preço">
            <Chips
              options={PRICE_OPTIONS}
              value={form.pricePositioning}
              onChange={set("pricePositioning")}
            />
          </Field>
          <Field label="Objetivo principal">
            <Chips
              options={OBJECTIVE_OPTIONS}
              value={form.businessObjective}
              onChange={set("businessObjective")}
            />
          </Field>
        </div>
      </PageCard>

      {/* ── 3 & 4. Tom de Voz + Personalidade ────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PageCard>
          <SectionHeading
            title="🗣️ Tom de Voz"
            subtitle="Como a IA fala com seus clientes."
          />
          <Field label="Preset de tom">
            <Chips
              options={VOICE_TONE_OPTIONS}
              value={form.voiceTonePreset}
              onChange={set("voiceTonePreset")}
            />
          </Field>
        </PageCard>

        <PageCard>
          <SectionHeading
            title="🧑‍🍳 Personalidade"
            subtitle="Traços que definem o caráter do assistente."
          />
          <MultiChips
            suggestions={PERSONALITY_SUGGESTIONS}
            value={form.personalityTraits}
            onChange={set("personalityTraits")}
          />
        </PageCard>
      </div>

      {/* ── 5 & 6. Vendas + Comunicação ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PageCard>
          <SectionHeading
            title="💰 Estilo de Venda"
            subtitle="Controla como a IA sugere itens e aumenta o ticket."
          />
          <div className="space-y-5">
            <Field label="Estratégia de upsell">
              <Chips
                options={UPSELL_OPTIONS}
                value={form.upsellStyle}
                onChange={set("upsellStyle")}
                allowDeselect={false}
              />
            </Field>
            <div className="space-y-3 pt-1">
              <Toggle
                label="Foco em combos"
                desc="IA prioriza sugestões de combos e promoções"
                checked={form.comboFocus}
                onChange={set("comboFocus")}
              />
              <Toggle
                label="Foco em ticket médio"
                desc="IA trabalha ativamente para aumentar o valor do pedido"
                checked={form.avgTicketFocus}
                onChange={set("avgTicketFocus")}
              />
            </div>
          </div>
        </PageCard>

        <PageCard>
          <SectionHeading
            title="🧾 Comunicação"
            subtitle="Regras de estilo e comportamento nas mensagens."
          />
          <div className="space-y-5">
            <Field label="Uso de emojis">
              <Chips
                options={EMOJI_OPTIONS}
                value={form.emojiUsage}
                onChange={set("emojiUsage")}
                allowDeselect={false}
              />
            </Field>
            <Field label="Tamanho das mensagens">
              <Chips
                options={COMM_STYLE_OPTIONS}
                value={form.communicationStyle}
                onChange={set("communicationStyle")}
                allowDeselect={false}
              />
            </Field>
            <div className="space-y-3 pt-1">
              <Toggle
                label="Usar nome do cliente"
                desc="IA usa o nome do cliente nas mensagens"
                checked={form.useClientName}
                onChange={set("useClientName")}
              />
              <Toggle
                label="Pode insistir após recusa"
                desc="IA pode re-sugerir itens que o cliente recusou"
                checked={form.canInsistAfterRefusal}
                onChange={set("canInsistAfterRefusal")}
              />
            </div>
          </div>
        </PageCard>
      </div>

      {/* ── 7. Contexto do Cardápio ───────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🍽️ Contexto do Cardápio"
          subtitle="Ajuda a IA a apresentar seu cardápio com mais contexto e personalidade."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Pratos principais" hint="O que define sua cozinha?">
            <textarea
              value={form.mainDishes}
              onChange={(e) => set("mainDishes")(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex: Pizzas napolitanas assadas em forno a lenha, massas artesanais…"
              className={`${INPUT} resize-none`}
            />
          </Field>
          <Field label="Diferenciais" hint="O que torna você único?">
            <textarea
              value={form.differentials}
              onChange={(e) => set("differentials")(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex: ingredientes importados, receitas exclusivas, entrega em 30 min…"
              className={`${INPUT} resize-none`}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Produtos mais lucrativos"
              hint="Opcional — IA priorizará esses itens ao fazer sugestões."
            >
              <input
                type="text"
                value={form.mostProfitableProducts}
                onChange={(e) => set("mostProfitableProducts")(e.target.value)}
                placeholder="Ex: Combo Premium, Pizza Quatro Queijos, Sobremesas"
                maxLength={300}
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ── 8. Avatar da Marca ────────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🤖 Avatar da Marca"
          subtitle="Tipo de culinária — personaliza o avatar e o contexto do assistente."
        />
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {CUISINE_OPTIONS.map((opt) => {
            const active = form.cuisineType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("cuisineType")(active ? "" : opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all ${
                  active
                    ? "border-brand-400 bg-brand-50 shadow-sm"
                    : "border-line2 bg-paper hover:border-line2 hover:bg-[#FAFAF8]"
                }`}
              >
                <span className="text-2xl leading-none">{opt.emoji}</span>
                <span
                  className={`text-[10px] font-medium leading-tight ${
                    active ? "text-brand-700" : "text-ink2"
                  }`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </PageCard>

      {/* ── 9. Identidade Visual ─────────────────────────────────── */}
      <PageCard>
        <SectionHeading
          title="🎨 Identidade Visual"
          subtitle="Cores aplicadas ao cardápio digital e comunicações com o cliente."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cor principal">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brandPrimaryColor || "#6366f1"}
                onChange={(e) => set("brandPrimaryColor")(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-xl border-0 p-0.5 shadow-sm"
              />
              <input
                type="text"
                value={form.brandPrimaryColor}
                onChange={(e) => set("brandPrimaryColor")(e.target.value)}
                placeholder="#6366f1"
                maxLength={7}
                className={`${INPUT} w-32 font-mono`}
              />
              <div className="h-10 w-10 shrink-0 rounded-xl border border-line shadow-sm" style={{ backgroundColor: form.brandPrimaryColor || "#6366f1" }} />
            </div>
          </Field>
          <Field label="Cor secundária">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.brandSecondaryColor || "#8b5cf6"}
                onChange={(e) => set("brandSecondaryColor")(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-xl border-0 p-0.5 shadow-sm"
              />
              <input
                type="text"
                value={form.brandSecondaryColor}
                onChange={(e) => set("brandSecondaryColor")(e.target.value)}
                placeholder="#8b5cf6"
                maxLength={7}
                className={`${INPUT} w-32 font-mono`}
              />
              <div className="h-10 w-10 shrink-0 rounded-xl border border-line shadow-sm" style={{ backgroundColor: form.brandSecondaryColor || "#8b5cf6" }} />
            </div>
          </Field>
        </div>
      </PageCard>

      {/* ── Redes Sociais ─────────────────────────────────────────── */}
      <SocialLinksSection
        values={{ instagramUrl: form.instagramUrl, tiktokUrl: form.tiktokUrl, facebookUrl: form.facebookUrl, youtubeUrl: form.youtubeUrl }}
        onChange={(k, v) => set(k)(v)}
      />

      {/* ── 10. Links de Avaliação ───────────────────────────────── */}
      <PageCard>
        <h2 className="text-base font-semibold text-ink">⭐ Links de Avaliação</h2>
        <p className="mt-0.5 mb-4 text-sm text-muted">
          Cole os links de avaliação do seu restaurante. Eles aparecem no CRM para facilitar campanhas pós-venda.
        </p>
        <div className="space-y-3">
          <Field label="Google Reviews">
            <input
              type="url"
              value={form.googleReviewUrl}
              onChange={(e) => set("googleReviewUrl")(e.target.value)}
              placeholder="https://g.page/r/..."
              className={INPUT}
            />
          </Field>
          <Field label="iFood Avaliações">
            <input
              type="url"
              value={form.ifoodReviewUrl}
              onChange={(e) => set("ifoodReviewUrl")(e.target.value)}
              placeholder="https://www.ifood.com.br/..."
              className={INPUT}
            />
          </Field>
        </div>
      </PageCard>

      <SaveButton saving={saving} label="Salvar persona da marca" />
    </form>
    </>
  );
}
