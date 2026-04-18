"use client";

import { useState, useCallback, type FormEvent } from "react";
import type { PromotionRow } from "@/services/promotions/PromotionService";
import type {
  PromotionType,
  PromotionChannel,
  PromotionTarget,
} from "@/validators/promotions";

// ── Label maps ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE:    "% Desconto",
  FIXED:         "R$ Desconto",
  COMBO:         "Combo",
  FREE_DELIVERY: "Frete grátis",
  COUPON:        "Cupom",
};

const CHANNEL_LABELS: Record<string, string> = {
  QR_MENU:  "Cardápio QR",
  DELIVERY: "Delivery",
  WHATSAPP: "WhatsApp / IA",
  ALL:      "Todos",
};

const TARGET_LABELS: Record<string, string> = {
  PRODUCT:  "Produto",
  CATEGORY: "Categoria",
  ORDER:    "Pedido",
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  DRAFT:     { label: "Rascunho",  bg: "bg-gray-100",   text: "text-gray-600"  },
  ACTIVE:    { label: "Ativa",     bg: "bg-green-100",  text: "text-green-700" },
  PAUSED:    { label: "Pausada",   bg: "bg-yellow-100", text: "text-yellow-700"},
  SCHEDULED: { label: "Agendada", bg: "bg-blue-100",   text: "text-blue-700"  },
  EXPIRED:   { label: "Encerrada", bg: "bg-red-50",     text: "text-red-600"   },
};

// ── Blank form ─────────────────────────────────────────────────────────────────

function blankForm(): PromotionForm {
  return {
    name:              "",
    description:       "",
    type:              "PERCENTAGE",
    discountValue:     "",
    target:            "ORDER",
    targetProductIds:  [],
    targetCategoryIds: [],
    channel:           "ALL",
    couponCode:        "",
    bannerImageUrl:    "",
    startsAt:          "",
    endsAt:            "",
    daysOfWeek:        [],
    timeFrom:          "",
    timeTo:            "",
    minOrderValue:     "",
    minQuantity:       "",
    maxUses:           "",
    oneTimePerUser:    false,
    combinable:        false,
  };
}

interface PromotionForm {
  name: string;
  description: string;
  type: PromotionType;
  discountValue: string;
  target: PromotionTarget;
  targetProductIds: string[];
  targetCategoryIds: string[];
  channel: PromotionChannel;
  couponCode: string;
  bannerImageUrl: string;
  startsAt: string;
  endsAt: string;
  daysOfWeek: number[];
  timeFrom: string;
  timeTo: string;
  minOrderValue: string;
  minQuantity: string;
  maxUses: string;
  oneTimePerUser: boolean;
  combinable: boolean;
}

function rowToForm(p: PromotionRow): PromotionForm {
  return {
    name:              p.name,
    description:       p.description ?? "",
    type:              p.type as PromotionType,
    discountValue:     String(p.discountValue),
    target:            p.target as PromotionTarget,
    targetProductIds:  p.targetProductIds,
    targetCategoryIds: p.targetCategoryIds,
    channel:           p.channel as PromotionChannel,
    couponCode:        p.couponCode ?? "",
    bannerImageUrl:    p.bannerImageUrl ?? "",
    startsAt:          p.startsAt ? p.startsAt.slice(0, 16) : "",
    endsAt:            p.endsAt ? p.endsAt.slice(0, 16) : "",
    daysOfWeek:        p.daysOfWeek,
    timeFrom:          p.timeFrom ?? "",
    timeTo:            p.timeTo ?? "",
    minOrderValue:     p.minOrderValue != null ? String(p.minOrderValue) : "",
    minQuantity:       p.minQuantity != null ? String(p.minQuantity) : "",
    maxUses:           p.maxUses != null ? String(p.maxUses) : "",
    oneTimePerUser:    p.oneTimePerUser,
    combinable:        p.combinable,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["DRAFT"]!;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  );
}

function FormGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 placeholder:text-gray-400";

// ── Promotion Form Drawer ──────────────────────────────────────────────────────

function PromotionDrawer({
  editing,
  onClose,
  onSaved,
}: {
  editing: PromotionRow | null;
  onClose: () => void;
  onSaved: (p: PromotionRow) => void;
}) {
  const [form, setForm] = useState<PromotionForm>(
    editing ? rowToForm(editing) : blankForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showBannerSection, setShowBannerSection] = useState(
    !!(editing?.bannerImageUrl)
  );

  function set<K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleBannerUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setError("Falha ao enviar imagem. Tente novamente.");
      return;
    }
    const json = await res.json();
    set("bannerImageUrl", json.url ?? "");
  }

  function toggleDay(d: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      name:              form.name.trim(),
      description:       form.description.trim() || undefined,
      type:              form.type,
      discountValue:     parseFloat(form.discountValue) || 0,
      target:            form.target,
      targetProductIds:  form.targetProductIds,
      targetCategoryIds: form.targetCategoryIds,
      channel:           form.channel,
      couponCode:        form.couponCode.trim() || undefined,
      bannerImageUrl:    form.bannerImageUrl.trim() || undefined,
      startsAt:          form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt:            form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      daysOfWeek:        form.daysOfWeek,
      timeFrom:          form.timeFrom || undefined,
      timeTo:            form.timeTo || undefined,
      minOrderValue:     form.minOrderValue ? parseFloat(form.minOrderValue) : undefined,
      minQuantity:       form.minQuantity ? parseInt(form.minQuantity) : undefined,
      maxUses:           form.maxUses ? parseInt(form.maxUses) : undefined,
      oneTimePerUser:    form.oneTimePerUser,
      combinable:        form.combinable,
    };

    const url = editing ? `/api/promotions/${editing.id}` : "/api/promotions";
    const method = editing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Erro ao salvar promoção");
      setSaving(false);
      return;
    }

    onSaved(json.data);
  }

  const showDiscount = form.type !== "FREE_DELIVERY" && form.type !== "COMBO";
  const discountLabel = form.type === "PERCENTAGE" ? "Desconto (%)" : "Desconto (R$)";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">
            {editing ? "Editar promoção" : "Nova promoção"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <form id="promotion-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

          {/* ── 1. Informações básicas ── */}
          <div>
            <SectionTitle>Informações básicas</SectionTitle>
            <div className="space-y-4">
              <FormGroup label="Nome da promoção *">
                <input
                  required
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ex: Happy Hour de Quinta"
                  maxLength={120}
                />
              </FormGroup>
              <FormGroup label="Descrição interna">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Visível apenas para você"
                  maxLength={500}
                />
              </FormGroup>
            </div>
          </div>

          {/* ── 2. Tipo de promoção ── */}
          <div>
            <SectionTitle>Tipo de promoção</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(["PERCENTAGE", "FIXED", "COMBO", "FREE_DELIVERY", "COUPON"] as PromotionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all text-left ${
                    form.type === t
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {showDiscount && (
              <div className="mt-4">
                <FormGroup label={discountLabel}>
                  <input
                    type="number"
                    min={0}
                    max={form.type === "PERCENTAGE" ? 100 : undefined}
                    step="0.01"
                    className={inputCls}
                    value={form.discountValue}
                    onChange={(e) => set("discountValue", e.target.value)}
                    placeholder={form.type === "PERCENTAGE" ? "10" : "5.00"}
                  />
                </FormGroup>
              </div>
            )}

            {form.type === "COUPON" && (
              <div className="mt-4">
                <FormGroup
                  label="Código do cupom *"
                  hint="Os clientes digitam este código para ativar o desconto"
                >
                  <input
                    required={form.type === "COUPON"}
                    className={`${inputCls} uppercase`}
                    value={form.couponCode}
                    onChange={(e) => set("couponCode", e.target.value.toUpperCase())}
                    placeholder="PROMO10"
                    maxLength={50}
                  />
                </FormGroup>
              </div>
            )}

          </div>

          {/* ── Banner opcional ── */}
          <div>
            <SectionTitle>Banner promocional</SectionTitle>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 accent-brand-500"
                checked={!!form.bannerImageUrl || showBannerSection}
                onChange={(e) => {
                  if (!e.target.checked) {
                    set("bannerImageUrl", "");
                    setShowBannerSection(false);
                  } else {
                    setShowBannerSection(true);
                  }
                }}
              />
              <span className="text-sm font-medium text-gray-700">
                Adicionar banner a esta promoção
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-400">
              O banner aparecerá no topo do cardápio QR e do delivery online enquanto a promoção estiver ativa.
            </p>

            {(showBannerSection || !!form.bannerImageUrl) && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500">
                  Imagem retangular (proporção 3:1 recomendada, ex: 1200×400 px).
                </p>
                {form.bannerImageUrl ? (
                  <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.bannerImageUrl}
                      alt="Preview do banner"
                      className="w-full object-cover"
                      style={{ aspectRatio: "3/1" }}
                    />
                    <button
                      type="button"
                      onClick={() => set("bannerImageUrl", "")}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white text-xs hover:bg-black/70"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer ${
                      uploading
                        ? "border-brand-300 bg-brand-50"
                        : "border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50"
                    }`}
                  >
                    <span className="text-2xl">{uploading ? "⏳" : "🖼️"}</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {uploading ? "Enviando…" : "Clique para fazer upload do banner"}
                    </span>
                    <span className="text-xs text-gray-400">JPEG, PNG ou WebP · máx. 5 MB</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleBannerUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* ── 3. Alvo ── */}
          <div>
            <SectionTitle>Alvo</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {(["ORDER", "CATEGORY", "PRODUCT"] as PromotionTarget[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("target", t)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                    form.target === t
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {TARGET_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <FormGroup label="Canal">
                <select
                  className={inputCls}
                  value={form.channel}
                  onChange={(e) => set("channel", e.target.value as PromotionChannel)}
                >
                  {(["ALL", "QR_MENU", "DELIVERY", "WHATSAPP"] as PromotionChannel[]).map((c) => (
                    <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
                  ))}
                </select>
              </FormGroup>
            </div>
          </div>

          {/* ── 4. Validade ── */}
          <div>
            <SectionTitle>Validade</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <FormGroup label="Início">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                />
              </FormGroup>
              <FormGroup label="Término" hint="Deixe vazio para sem expiração">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
              </FormGroup>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Dias da semana</p>
              <p className="text-xs text-gray-400 mb-2">Deixe em branco para todos os dias</p>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.daysOfWeek.includes(i)
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <FormGroup label="Hora início" hint="Opcional">
                <input
                  type="time"
                  className={inputCls}
                  value={form.timeFrom}
                  onChange={(e) => set("timeFrom", e.target.value)}
                />
              </FormGroup>
              <FormGroup label="Hora fim" hint="Opcional">
                <input
                  type="time"
                  className={inputCls}
                  value={form.timeTo}
                  onChange={(e) => set("timeTo", e.target.value)}
                />
              </FormGroup>
            </div>
          </div>

          {/* ── 5. Regras ── */}
          <div>
            <SectionTitle>Regras de elegibilidade</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <FormGroup label="Pedido mínimo (R$)" hint="Opcional">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={form.minOrderValue}
                  onChange={(e) => set("minOrderValue", e.target.value)}
                  placeholder="0.00"
                />
              </FormGroup>
              <FormGroup label="Qtd. mínima" hint="Opcional">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={inputCls}
                  value={form.minQuantity}
                  onChange={(e) => set("minQuantity", e.target.value)}
                  placeholder="—"
                />
              </FormGroup>
              <FormGroup label="Limite de usos" hint="Opcional">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={inputCls}
                  value={form.maxUses}
                  onChange={(e) => set("maxUses", e.target.value)}
                  placeholder="Ilimitado"
                />
              </FormGroup>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-brand-500"
                  checked={form.oneTimePerUser}
                  onChange={(e) => set("oneTimePerUser", e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Uso único por cliente</p>
                  <p className="text-xs text-gray-400">Cada cliente só pode usar esta promoção uma vez</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-brand-500"
                  checked={form.combinable}
                  onChange={(e) => set("combinable", e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Combinável com outras promoções</p>
                  <p className="text-xs text-gray-400">Permite acumular com outros descontos ativos</p>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            form="promotion-form"
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 shadow-sm"
          >
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar promoção"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Promotion Card ─────────────────────────────────────────────────────────────

function PromotionCard({
  promotion,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: {
  promotion: PromotionRow;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const canToggle =
    promotion.displayStatus === "ACTIVE" ||
    promotion.displayStatus === "PAUSED" ||
    promotion.displayStatus === "SCHEDULED" ||
    promotion.displayStatus === "DRAFT";
  const isActive = promotion.displayStatus === "ACTIVE";

  let validityText = "Sem expiração";
  if (promotion.startsAt && promotion.endsAt) {
    const s = new Date(promotion.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const e = new Date(promotion.endsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    validityText = `${s} → ${e}`;
  } else if (promotion.endsAt) {
    validityText = `Até ${new Date(promotion.endsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  } else if (promotion.startsAt) {
    validityText = `A partir de ${new Date(promotion.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  }

  const discountText = promotion.type === "PERCENTAGE"
    ? `${promotion.discountValue}% off`
    : promotion.type === "FIXED"
      ? `R$${promotion.discountValue.toFixed(2)} off`
      : promotion.type === "FREE_DELIVERY"
        ? "Frete grátis"
        : TYPE_LABELS[promotion.type] ?? promotion.type;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status={promotion.displayStatus} />
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {TYPE_LABELS[promotion.type] ?? promotion.type}
            </span>
            {promotion.couponCode && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-purple-700">
                {promotion.couponCode}
              </span>
            )}
            {promotion.bannerImageUrl && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">
                🖼 banner
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{promotion.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="font-semibold text-brand-600">{discountText}</span>
            <span>·</span>
            <span>{CHANNEL_LABELS[promotion.channel]}</span>
            <span>·</span>
            <span>{validityText}</span>
          </div>
          {promotion.minOrderValue != null && (
            <p className="mt-1 text-xs text-gray-400">
              Pedido mínimo: R${promotion.minOrderValue.toFixed(2)}
            </p>
          )}
          {promotion.daysOfWeek.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {promotion.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}
              {promotion.timeFrom && promotion.timeTo ? ` · ${promotion.timeFrom}–${promotion.timeTo}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Banner preview */}
      {promotion.type === "BANNER" && promotion.bannerImageUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={promotion.bannerImageUrl}
            alt={promotion.name}
            className="w-full object-cover"
            style={{ aspectRatio: "3/1" }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-3">
        <button
          onClick={onEdit}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={onDuplicate}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Duplicar
        </button>
        {canToggle && (
          <button
            onClick={onToggleStatus}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {isActive ? "Pausar" : "Ativar"}
          </button>
        )}
        <button
          onClick={onDelete}
          className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          Excluir
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PromotionsClient({
  initialPromotions,
}: {
  initialPromotions: PromotionRow[];
}) {
  const [promotions, setPromotions] = useState<PromotionRow[]>(initialPromotions);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────
  const filtered = promotions.filter((p) =>
    statusFilter === "ALL" ? true : p.displayStatus === statusFilter
  );

  // ── Handlers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(p: PromotionRow) {
    setEditing(p);
    setDrawerOpen(true);
  }

  const handleSaved = useCallback((p: PromotionRow) => {
    setPromotions((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [p, ...prev];
    });
    setDrawerOpen(false);
  }, []);

  async function handleDuplicate(p: PromotionRow) {
    const res = await fetch(`/api/promotions/${p.id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const json = await res.json();
    setPromotions((prev) => [json.data, ...prev]);
  }

  async function handleDelete(p: PromotionRow) {
    if (!window.confirm(`Excluir "${p.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(p.id);
    await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
    setPromotions((prev) => prev.filter((x) => x.id !== p.id));
    setDeleting(null);
  }

  async function handleToggleStatus(p: PromotionRow) {
    const newStatus = p.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const res = await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) return;
    const json = await res.json();
    setPromotions((prev) =>
      prev.map((x) => (x.id === p.id ? json.data : x))
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  const statusFilters: { value: string; label: string }[] = [
    { value: "ALL", label: "Todas" },
    { value: "ACTIVE", label: "Ativas" },
    { value: "SCHEDULED", label: "Agendadas" },
    { value: "PAUSED", label: "Pausadas" },
    { value: "DRAFT", label: "Rascunhos" },
    { value: "EXPIRED", label: "Encerradas" },
  ];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === f.value
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
              {f.value !== "ALL" && (
                <span className="ml-1.5 opacity-70">
                  {promotions.filter((p) => p.displayStatus === f.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          + Criar promoção
        </button>
      </div>

      {/* Promotion list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center">
          <span className="mb-3 text-4xl">🎁</span>
          <p className="text-sm font-semibold text-gray-700">
            {statusFilter === "ALL" ? "Nenhuma promoção criada" : "Nenhuma promoção neste status"}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {statusFilter === "ALL" && "Crie sua primeira promoção para atrair mais clientes."}
          </p>
          {statusFilter === "ALL" && (
            <button
              onClick={openCreate}
              className="mt-4 rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors"
            >
              Criar promoção
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => (
            <PromotionCard
              key={p.id}
              promotion={p}
              onEdit={() => openEdit(p)}
              onDuplicate={() => handleDuplicate(p)}
              onDelete={() => !deleting && handleDelete(p)}
              onToggleStatus={() => handleToggleStatus(p)}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <PromotionDrawer
          editing={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
