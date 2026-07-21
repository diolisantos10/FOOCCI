"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCard } from "./QRCard";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ─────────────────────────────────────────────────────────────────────

type MenuSource = "MANUAL" | "EXTERNAL";

type Variant = {
  id: string;
  name: string;
  price: number | null; // null = inherit the product's price for the channel
  imageUrl?: string | null; // optional per-variant photo; null = use the product image
  priceDelivery?: number | null;
  priceDineIn?:   number | null;
  priceIfood?:    number | null;
  isAvailable: boolean;
  sortOrder: number;
};

type Extra = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

type OptionGroupItem = {
  id:        string;
  name:      string;
  price:     number;
  portion:   string | null;
  sortOrder: number;
};

type OptionGroup = {
  id:        string;
  name:      string;
  required:  boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options:   OptionGroupItem[];
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  price: number;
  priceDelivery?: number | null;
  priceDineIn?:   number | null;
  priceIfood?:    number | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  isAvailable: boolean;
  showInDelivery: boolean;
  showInDineIn: boolean;
  hasVariants: boolean;
  code: string | null;
  servingSize: number | null;
  portionInfo: string | null;
  tagFunil:             string | null;
  perfilPaladar:        string | null;
  harmonizacaoSugerida: string | null;
  alergenosDetalhados:  string | null;
  storytellingIA:       string | null;
  hasActivePromo?:   boolean;
  promoActiveToday?: boolean;
  variants: Variant[];
  extras: Extra[];
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isAvailable: boolean;
  showInDelivery: boolean;
  showInDineIn: boolean;
  sortOrder: number;
  source: MenuSource;
  items: Item[];
};

type CategoryFormState = { name: string; description: string };

const EMPTY_CAT: CategoryFormState = { name: "", description: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Primitives ────────────────────────────────────────────────────────────────

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line2 border-t-gray-700" />
  );
}

function DragHandle({
  listeners,
}: {
  listeners?: Record<string, unknown>;
}) {
  return (
    <button
      type="button"
      {...(listeners as React.HTMLAttributes<HTMLButtonElement>)}
      className="cursor-grab touch-none select-none px-1 text-muted hover:text-muted active:cursor-grabbing"
      aria-label="Reordenar"
    >
      ⠿
    </button>
  );
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

function ToggleSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <span
      className={`flex select-none items-center gap-1.5 text-xs ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer text-ink2"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
          checked ? "bg-brand-500" : "bg-line2"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-paper shadow transition-transform duration-150 ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </button>
      {label}
    </span>
  );
}

// ── Image upload ──────────────────────────────────────────────────────────────

const UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function ImageUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
      setError("Tipo não permitido. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setError("Arquivo muito grande. Máximo: 5 MB.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro no upload.");
      onChange(data.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar imagem.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1">
      {value && (
        <div className="relative inline-block">
          {/* Square preview — image is center-cropped into a fixed square frame */}
          <div className="h-40 w-40 overflow-hidden rounded-lg border border-line2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              className="h-full w-full object-cover object-center"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
          >
            ×
          </button>
        </div>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {uploading ? <Spinner /> : value ? "Trocar imagem" : "Adicionar imagem"}
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Recomendado: imagem quadrada (1:1). O recorte é automático.
      </p>
      {error && <InlineError message={error} />}
    </div>
  );
}

// ── Promo Modal ───────────────────────────────────────────────────────────────

type PromoData = {
  id: string; status: string; discountType: "PERCENTAGE" | "PRICE";
  discountValue: number; originalPrice: number; promotionalPrice: number;
  channel: "DELIVERY" | "DINE_IN" | "BOTH"; startsAt: string | null; endsAt: string | null;
};

type PromoForm = {
  active: boolean; discountType: "PERCENTAGE" | "PRICE"; value: string;
  channel: "DELIVERY" | "DINE_IN" | "BOTH"; startsAt: string; endsAt: string;
};

function PromoModal({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error,   setError]   = useState("");
  const [existingStatus, setExistingStatus] = useState<"ACTIVE" | "PAUSED" | null>(null);
  const [form, setForm] = useState<PromoForm>({
    active: true, discountType: "PERCENTAGE", value: "",
    channel: "BOTH", startsAt: "", endsAt: "",
  });

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch(`/api/menu/items/${item.id}/promotion`, "GET")
      .then((d) => {
        const p: PromoData | null = d.data?.promotion ?? null;
        if (p) {
          setExistingStatus(p.status as "ACTIVE" | "PAUSED");
          setForm({
            active:       p.status === "ACTIVE",
            discountType: p.discountType,
            value:        p.discountType === "PERCENTAGE"
              ? String(p.discountValue)
              : String(p.promotionalPrice),
            channel:  p.channel as "DELIVERY" | "DINE_IN" | "BOTH",
            startsAt: p.startsAt ? p.startsAt.slice(0, 16) : "",
            endsAt:   p.endsAt   ? p.endsAt.slice(0, 16)   : "",
          });
        }
      })
      .catch(() => setError("Erro ao carregar promoção."))
      .finally(() => setLoading(false));
  }, [item.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const val = parseFloat(form.value);
    if (isNaN(val) || val <= 0) { setError("Valor inválido."); setSaving(false); return; }
    try {
      await apiFetch(`/api/menu/items/${item.id}/promotion`, "PUT", {
        discountType: form.discountType,
        value: val,
        channel: form.channel,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt:   form.endsAt   ? new Date(form.endsAt).toISOString()   : null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Desativar promoção?")) return;
    setRemoving(true);
    setError("");
    try {
      await apiFetch(`/api/menu/items/${item.id}/promotion`, "DELETE");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-xl bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Promoção</h2>
              {!loading && existingStatus === "ACTIVE" && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Ativa</span>
              )}
              {!loading && existingStatus === "PAUSED" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Pausada</span>
              )}
            </div>
            <p className="text-xs text-muted">{item.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-lg leading-none text-muted hover:text-ink2">✕</button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted"><Spinner /></div>
        ) : (
          <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
            {/* Discount type */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Tipo de desconto</label>
              <div className="flex gap-2">
                {(["PERCENTAGE", "PRICE"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, discountType: t, value: "" }))}
                    className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      form.discountType === t
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-line2 text-ink2 hover:border-green-300"
                    }`}
                  >
                    {t === "PERCENTAGE" ? "Percentual (%)" : "Preço fixo (R$)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Value */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">
                {form.discountType === "PERCENTAGE" ? "Desconto (%)" : "Preço promocional (R$)"}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
                  {form.discountType === "PERCENTAGE" ? "%" : "R$"}
                </span>
                <input
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder={form.discountType === "PERCENTAGE" ? "ex: 15" : "ex: 29,90"}
                  className="w-full rounded-lg border border-line2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
              <p className="text-[11px] text-muted">
                Preço original: R$ {item.price.toFixed(2)}
              </p>
            </div>

            {/* Channel */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Canal</label>
              <div className="flex gap-2">
                {([["DELIVERY", "Delivery"], ["DINE_IN", "Salão"], ["BOTH", "Ambos"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, channel: v }))}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                      form.channel === v
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-line2 text-ink2 hover:border-green-300"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Início (opcional)</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="w-full rounded-lg border border-line2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Fim (opcional)</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="w-full rounded-lg border border-line2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
            </div>

            {error && <InlineError message={error} />}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
              >
                {saving ? <Spinner /> : existingStatus ? "Atualizar promoção" : "Salvar promoção"}
              </button>
              {existingStatus && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {removing ? <Spinner /> : "Remover"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Category Promo Modal ──────────────────────────────────────────────────────

type CatPromoData = {
  id: string; status: string; discountValue: number;
  channel: "DELIVERY" | "DINE_IN" | "BOTH"; startsAt: string | null; endsAt: string | null;
};

type CatPromoForm = {
  discountPercent: string;
  channel: "DELIVERY" | "DINE_IN" | "BOTH";
  startsAt: string;
  endsAt: string;
};

function CategoryPromoModal({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error,    setError]    = useState("");
  const [existingStatus, setExistingStatus] = useState<"ACTIVE" | "PAUSED" | null>(null);
  const [form, setForm] = useState<CatPromoForm>({
    discountPercent: "", channel: "BOTH", startsAt: "", endsAt: "",
  });

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch(`/api/menu/categories/${category.id}/promotion`, "GET")
      .then((d) => {
        const p: CatPromoData | null = d.data?.promotion ?? null;
        if (p) {
          setExistingStatus(p.status as "ACTIVE" | "PAUSED");
          setForm({
            discountPercent: String(p.discountValue),
            channel:  p.channel,
            startsAt: p.startsAt ? p.startsAt.slice(0, 16) : "",
            endsAt:   p.endsAt   ? p.endsAt.slice(0, 16)   : "",
          });
        }
      })
      .catch(() => setError("Erro ao carregar promoção."))
      .finally(() => setLoading(false));
  }, [category.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(form.discountPercent);
    if (isNaN(val) || val <= 0 || val >= 100) {
      setError("Percentual deve ser entre 0% e 100% (exclusivo).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/menu/categories/${category.id}/promotion`, "PUT", {
        discountPercent: val,
        channel: form.channel,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt:   form.endsAt   ? new Date(form.endsAt).toISOString()   : null,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Pausar promoção da categoria?")) return;
    setRemoving(true);
    setError("");
    try {
      await apiFetch(`/api/menu/categories/${category.id}/promotion`, "DELETE");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-xl bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Promoção da categoria</h2>
              {!loading && existingStatus === "ACTIVE" && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Ativa</span>
              )}
              {!loading && existingStatus === "PAUSED" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Pausada</span>
              )}
            </div>
            <p className="text-xs text-muted">{category.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-lg leading-none text-muted hover:text-ink2">✕</button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted"><Spinner /></div>
        ) : (
          <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
            <p className="text-xs text-muted leading-relaxed">
              Todos os produtos ativos desta categoria receberão o desconto.
              <br />
              <span className="text-muted">Produtos com promoção individual mantêm a própria promoção.</span>
            </p>

            {/* Discount percent */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Desconto (%)</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">%</span>
                <input
                  value={form.discountPercent}
                  onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="99.99"
                  required
                  placeholder="ex: 10"
                  className="w-full rounded-lg border border-line2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
              <p className="text-[11px] text-muted">Somente desconto percentual para categorias (MVP).</p>
            </div>

            {/* Channel */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Aplicar em</label>
              <div className="flex gap-2">
                {([["DELIVERY", "Delivery"], ["DINE_IN", "Salão"], ["BOTH", "Ambos"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, channel: v }))}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                      form.channel === v
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-line2 text-ink2 hover:border-green-300"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Início (opcional)</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="w-full rounded-lg border border-line2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Fim (opcional)</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="w-full rounded-lg border border-line2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
            </div>

            {error && <InlineError message={error} />}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
              >
                {saving ? <Spinner /> : existingStatus ? "Atualizar promoção" : "Ativar promoção"}
              </button>
              {existingStatus && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {removing ? <Spinner /> : "Remover"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  categoryId,
  categorySource,
  categoryIsAvailable,
  filterActive,
  onSave,
  onEdit,
  onPromo,
  onDuplicated,
}: {
  item: Item;
  categoryId: string;
  categorySource: MenuSource;
  categoryIsAvailable: boolean;
  filterActive?: boolean;
  onSave: (
    id: string,
    patch: Partial<{
      isAvailable: boolean;
      showInDelivery: boolean;
      showInDineIn: boolean;
    }>
  ) => Promise<void>;
  onEdit: (item: Item) => void;
  onPromo: (item: Item) => void;
  onDuplicated: (newItem: Item, toCategoryId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const editable = categorySource === "MANUAL";
  const [duplicating, setDuplicating] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Duplica rápido: cria uma cópia idêntica na MESMA categoria, logo abaixo do
  // original. Sem seletor de categoria — pra mudar a categoria depois, é só
  // editar o produto.
  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const data = await apiFetch(
        `/api/menu/items/${item.id}/duplicate`,
        "POST",
        {} // sem targetCategoryId → mesma categoria, logo abaixo do original
      );
      const raw = data.data;
      const newItem: Item = {
        id:                   raw.id,
        name:                 raw.name,
        description:          raw.description          ?? null,
        ingredients:          raw.ingredients          ?? null,
        price:                Number(raw.price),
        imageUrl:             raw.imageUrl             ?? null,
        isActive:             raw.isActive,
        sortOrder:            raw.sortOrder            ?? 0,
        isAvailable:          raw.isAvailable,
        showInDelivery:       raw.showInDelivery,
        showInDineIn:         raw.showInDineIn,
        hasVariants:          raw.hasVariants,
        code:                 raw.code                ?? null,
        servingSize:          raw.servingSize          ?? null,
        portionInfo:          raw.portionInfo          ?? null,
        tagFunil:             raw.tagFunil             ?? null,
        perfilPaladar:        raw.perfilPaladar        ?? null,
        harmonizacaoSugerida: raw.harmonizacaoSugerida ?? null,
        alergenosDetalhados:  raw.alergenosDetalhados  ?? null,
        storytellingIA:       raw.storytellingIA       ?? null,
        hasActivePromo:    false,
        promoActiveToday:  false,
        variants: (raw.variants ?? []).map((v: { id: string; name: string; price: string | number | null; imageUrl?: string | null; isAvailable: boolean; sortOrder: number }) => ({
          id:          v.id,
          name:        v.name,
          price:       v.price == null ? null : Number(v.price), // null = inherits product price
          imageUrl:    v.imageUrl ?? null,
          isAvailable: v.isAvailable,
          sortOrder:   v.sortOrder,
        })),
        extras: (raw.extras ?? []).map((e: { id: string; name: string; price: string | number; quantity: number }) => ({
          id:       e.id,
          name:     e.name,
          price:    Number(e.price),
          quantity: e.quantity,
        })),
      };
      onDuplicated(newItem, raw.categoryId);
    } catch { /* ignore */ }
    setDuplicating(false);
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`flex flex-col px-3 py-2.5 text-sm hover:bg-[#FAFAF8] ${editable ? "cursor-pointer" : ""} ${!categoryIsAvailable ? "opacity-50" : ""}`}
      onClick={() => editable && onEdit(item)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {editable && !filterActive && (
            <span onClick={(e) => e.stopPropagation()}>
              <DragHandle listeners={listeners} />
            </span>
          )}
          {editable && (
            <ToggleSwitch
              label=""
              checked={item.isAvailable}
              onChange={() => onSave(item.id, { isAvailable: !item.isAvailable })}
            />
          )}
          {item.imageUrl ? (
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-full w-full object-cover object-center"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          ) : (
            <div className="h-8 w-8 shrink-0 rounded bg-[#F4F4F2]" />
          )}
          <span
            className={`font-medium truncate ${
              !item.isActive ? "text-muted line-through" : "text-ink"
            }`}
          >
            {item.name}
          </span>
          {item.hasActivePromo && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
              item.promoActiveToday === false
                ? "bg-yellow-100 text-yellow-700"
                : "bg-green-100 text-green-700"
            }`}>
              {item.promoActiveToday === false ? "Promo programada" : "Promo ativa"}
            </span>
          )}
          {item.description && (
            <span className="hidden truncate text-xs text-muted sm:inline">
              — {item.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0 flex-wrap justify-end">
          <span className="font-semibold text-ink2">
            R$ {Number(item.price).toFixed(2)}
          </span>
          {editable && (
            <>
              <ToggleSwitch
                label="Delivery"
                checked={item.showInDelivery}
                disabled={!item.isAvailable}
                onChange={() => onSave(item.id, { showInDelivery: !item.showInDelivery })}
              />
              <ToggleSwitch
                label="Salão"
                checked={item.showInDineIn}
                disabled={!item.isAvailable}
                onChange={() => onSave(item.id, { showInDineIn: !item.showInDineIn })}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPromo(item); }}
                className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition-colors"
                title="Configurar promoção"
              >
                % Promo
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDuplicate(); }}
                disabled={duplicating}
                className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 transition-colors"
                title="Duplicar produto (cópia idêntica, logo abaixo)"
              >
                {duplicating ? "Duplicando…" : "+ Duplicar"}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Add-item form ─────────────────────────────────────────────────────────────

function AddItemForm({
  categoryId,
  onAdded,
}: {
  categoryId: string;
  onAdded: (item: Item) => void;
}) {
  const [name, setName]   = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = parseFloat(price);
    if (!name.trim() || isNaN(p) || p <= 0) {
      setError("Nome e preço válido são obrigatórios.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/menu/categories/${categoryId}/items`,
        "POST",
        { name: name.trim(), price: p }
      );
      onAdded({
        ...data.data,
        price: Number(data.data.price),
        hasVariants: data.data.hasVariants ?? false,
        servingSize: data.data.servingSize ?? null,
        portionInfo: data.data.portionInfo ?? null,
        variants: [],
        extras: [],
      });
      setName("");
      setPrice("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-dashed border-line2 bg-[#FAFAF8] px-5 py-3 space-y-2"
    >
      <p className="text-xs font-medium text-muted">
        Adição rápida — para detalhes, use <strong>+ Novo Produto</strong>
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do item"
          required
          className="flex-1 rounded border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preço"
          type="number"
          step="0.01"
          min="0.01"
          required
          className="w-24 rounded border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? <Spinner /> : "OK"}
        </button>
      </div>
      {error && <InlineError message={error} />}
    </form>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  allCategories,
  dragListeners,
  filterActive,
  onChange,
  onDelete,
  onEditItem,
  onPromoItem,
  onPromoCategory,
  onDuplicated,
}: {
  category: Category;
  allCategories: Category[];
  dragListeners?: Record<string, unknown>;
  filterActive?: boolean;
  onChange: (updated: Category) => void;
  onDelete: (id: string) => void;
  onEditItem: (item: Item, categoryId: string) => void;
  onPromoItem: (item: Item) => void;
  onPromoCategory: (category: Category) => void;
  onDuplicated: (newItem: Item, toCategoryId: string) => void;
}) {
  const [editingCat, setEditingCat] = useState(false);
  const [catForm, setCatForm] = useState<CategoryFormState>({
    name: category.name,
    description: category.description ?? "",
  });
  const [addingItem, setAddingItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = category.source === "MANUAL";

  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function saveCat() {
    if (!catForm.name.trim()) {
      setError("Nome obrigatório.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/menu/categories/${category.id}`,
        "PATCH",
        {
          name: catForm.name.trim(),
          description: catForm.description.trim() || undefined,
        }
      );
      onChange({
        ...category,
        name: data.data.name,
        description: data.data.description,
      });
      setEditingCat(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "PATCH", {
        isActive: !category.isActive,
      });
      onChange({ ...category, isActive: !category.isActive });
    } catch {
      /* ignore */
    }
  }

  // Category-level flags write only to the category, never to its items.
  // isAvailable acts purely as a gate: when false it disables the channel
  // toggles in the UI, but each item's own flags are untouched.
  async function saveCategoryFlag(
    flag: "isAvailable" | "showInDelivery" | "showInDineIn",
    value: boolean
  ) {
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "PATCH", {
        [flag]: value,
      });
      onChange({ ...category, [flag]: value });
    } catch {
      /* ignore */
    }
  }

  async function deleteCat() {
    if (
      !confirm(`Remover categoria "${category.name}" e todos os seus itens?`)
    )
      return;
    setBusy(true);
    try {
      await apiFetch(`/api/menu/categories/${category.id}`, "DELETE");
      onDelete(category.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
      setBusy(false);
    }
  }

  async function saveItem(
    id: string,
    patch: Partial<{
      isAvailable: boolean;
      showInDelivery: boolean;
      showInDineIn: boolean;
    }>
  ) {
    const body: Record<string, unknown> = {};
    if (patch.isAvailable !== undefined) body.isAvailable = patch.isAvailable;
    if (patch.showInDelivery !== undefined) body.showInDelivery = patch.showInDelivery;
    if (patch.showInDineIn !== undefined) body.showInDineIn = patch.showInDineIn;
    const data = await apiFetch(`/api/menu/items/${id}`, "PATCH", body);
    onChange({
      ...category,
      items: category.items.map((it) =>
        it.id === id ? { ...it, ...data.data, price: Number(data.data.price), variants: it.variants } : it
      ),
    });
  }

  async function deleteItem(id: string) {
    await apiFetch(`/api/menu/items/${id}`, "DELETE");
    onChange({
      ...category,
      items: category.items.filter((it) => it.id !== id),
    });
  }

  async function handleItemDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = category.items.findIndex((i) => i.id === active.id);
    const newIndex = category.items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(category.items, oldIndex, newIndex);

    // Optimistic update
    onChange({ ...category, items: reordered });

    try {
      await apiFetch(
        `/api/menu/items/${reordered[0]!.id}?action=reorder&categoryId=${category.id}`,
        "PATCH",
        { items: reordered.map((it, i) => ({ id: it.id, sortOrder: i })) }
      );
    } catch {
      // Revert on failure
      onChange({ ...category });
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line2 bg-paper">
      {/* Category header */}
      {editingCat ? (
        <div className="space-y-2 border-b border-line bg-brand-50 px-5 py-3">
          <input
            value={catForm.name}
            onChange={(e) =>
              setCatForm((f) => ({ ...f, name: e.target.value }))
            }
            placeholder="Nome da categoria"
            className="w-full rounded border border-line2 px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <input
            value={catForm.description}
            onChange={(e) =>
              setCatForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Descrição (opcional)"
            className="w-full rounded border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          {error && <InlineError message={error} />}
          <div className="flex gap-2">
            <button
              onClick={saveCat}
              disabled={busy}
              className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? <Spinner /> : "Salvar"}
            </button>
            <button
              onClick={() => setEditingCat(false)}
              className="rounded border border-line2 px-3 py-1 text-xs text-ink2 hover:bg-[#FAFAF8]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#FAFAF8] px-4 py-3">
          {/* Left: drag handle + availability toggle + name */}
          <div className="flex items-center gap-2 min-w-0">
            {editable && <DragHandle listeners={dragListeners} />}
            {editable && (
              <ToggleSwitch
                label=""
                checked={category.isAvailable}
                onChange={() => saveCategoryFlag("isAvailable", !category.isAvailable)}
              />
            )}
            <h2
              className={`font-semibold truncate ${
                !category.isActive ? "text-muted" : "text-ink"
              }`}
            >
              {category.name}
            </h2>
            {!category.isActive && (
              <span className="rounded-full bg-line2 px-2 py-0.5 text-xs text-muted">
                inativo
              </span>
            )}
            {category.source === "EXTERNAL" && (
              <span
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600"
                title="Importado de integração externa — edição desativada"
              >
                Importado
              </span>
            )}
          </div>

          {/* Right: channel controls + actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <span className="text-xs text-muted">
              {category.items.length} item
              {category.items.length !== 1 ? "s" : ""}
            </span>
            {editable && (
              <button
                onClick={(e) => { e.stopPropagation(); onPromoCategory(category); }}
                title="Promoção da categoria"
                className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition-colors"
              >
                % Promo
              </button>
            )}
            {editable && (
              <button
                onClick={() => {
                  setCatForm({ name: category.name, description: category.description ?? "" });
                  setEditingCat(true);
                }}
                title="Editar categoria"
                className="text-xs text-muted hover:text-ink2 transition-colors"
              >
                ✎
              </button>
            )}
            {editable && (
              <button
                onClick={toggleActive}
                title={category.isActive ? "Desativar" : "Ativar"}
                className="text-xs text-muted hover:text-ink2"
              >
                {category.isActive ? "●" : "○"}
              </button>
            )}
          </div>
        </div>
      )}
      {error && !editingCat && <InlineError message={error} />}

      {/* Items with per-category drag-and-drop */}
      {category.items.length === 0 && !addingItem && (
        <p className="px-5 py-4 text-sm text-muted">
          Nenhum item. {editable && "Adicione um item abaixo."}
        </p>
      )}
      {category.items.length > 0 && (
        <DndContext
          sensors={itemSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleItemDragEnd}
        >
          <SortableContext
            items={category.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-line">
              {category.items.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  categoryId={category.id}
                  categorySource={category.source}
                  categoryIsAvailable={category.isAvailable}
                  filterActive={filterActive}
                  onSave={saveItem}
                  onEdit={(it) => onEditItem(it, category.id)}
                  onPromo={onPromoItem}
                  onDuplicated={onDuplicated}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add item */}
      {editable &&
        (addingItem ? (
          <AddItemForm
            categoryId={category.id}
            onAdded={(item) => {
              onChange({ ...category, items: [...category.items, item] });
              setAddingItem(false);
            }}
          />
        ) : (
          <div className="border-t border-dashed border-line px-5 py-2">
            <button
              onClick={() => setAddingItem(true)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              + Adicionar item
            </button>
          </div>
        ))}
    </div>
  );
}

// ── Sortable category wrapper ─────────────────────────────────────────────────

function SortableCategoryCard(
  props: Omit<React.ComponentProps<typeof CategoryCard>, "dragListeners">
) {
  const { filterActive, onPromoItem, onPromoCategory, ...rest } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.category.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
    >
      <CategoryCard
        {...rest}
        filterActive={filterActive}
        onPromoItem={onPromoItem}
        onPromoCategory={onPromoCategory}
        dragListeners={filterActive ? undefined : listeners}
      />
    </div>
  );
}

// ── Add-category form ─────────────────────────────────────────────────────────

function AddCategoryForm({ onAdded }: { onAdded: (cat: Category) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_CAT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Nome obrigatório.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch("/api/menu/categories", "POST", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      onAdded({
        ...data.data,
        items: [],
        source: data.data.source ?? "MANUAL",
      });
      setForm(EMPTY_CAT);
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar categoria.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        + Nova categoria
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-2"
    >
      <p className="text-sm font-semibold text-ink2">Nova categoria</p>
      <input
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Nome (ex: Pizzas, Bebidas)"
        required
        className="w-full rounded border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      <input
        value={form.description}
        onChange={(e) =>
          setForm((f) => ({ ...f, description: e.target.value }))
        }
        placeholder="Descrição (opcional)"
        className="w-full rounded border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      {error && <InlineError message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? <Spinner /> : "Criar categoria"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setForm(EMPTY_CAT);
            setError("");
          }}
          className="rounded border border-line2 px-4 py-1.5 text-sm text-ink2 hover:bg-[#FAFAF8]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── NewItemModal ──────────────────────────────────────────────────────────────

type NewItemForm = {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
  showInDelivery: boolean;
  showInDineIn: boolean;
  servingSize: number | null;
  portionInfo: string;
  tagFunil:             string;
  perfilPaladar:        string;
  harmonizacaoSugerida: string;
  alergenosDetalhados:  string;
  storytellingIA:       string;
};

function NewItemModal({
  categories,
  open,
  onClose,
  onCreated,
}: {
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onCreated: (item: Item, categoryId: string) => void;
}) {
  const manualCategories = categories.filter((c) => c.source === "MANUAL");
  const [form, setForm] = useState<NewItemForm>({
    categoryId: manualCategories[0]?.id ?? "",
    name: "",
    description: "",
    price: "",
    imageUrl: null,
    showInDelivery: true,
    showInDineIn: true,
    servingSize: null,
    portionInfo: "",
    tagFunil:             "",
    perfilPaladar:        "",
    harmonizacaoSugerida: "",
    alergenosDetalhados:  "",
    storytellingIA:       "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiExpanded, setAiExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("foocci_menu_ai_expanded") === "true";
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      categoryId: manualCategories[0]?.id ?? "",
      name: "",
      description: "",
      price: "",
      imageUrl: null,
      showInDelivery: true,
      showInDineIn: true,
      servingSize: null,
      portionInfo: "",
      tagFunil:             "",
      perfilPaladar:        "",
      harmonizacaoSugerida: "",
      alergenosDetalhados:  "",
      storytellingIA:       "",
    });
    setError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!form.categoryId) { setError("Selecione uma categoria."); return; }
    if (!form.name.trim() || isNaN(price) || price <= 0) {
      setError("Nome e preço válido são obrigatórios.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/menu/categories/${form.categoryId}/items`,
        "POST",
        {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          price,
          imageUrl: form.imageUrl || undefined,
          showInDelivery: form.showInDelivery,
          showInDineIn: form.showInDineIn,
          servingSize: form.servingSize ?? undefined,
          portionInfo: form.portionInfo.trim() || undefined,
          tagFunil:             form.tagFunil.trim()             || undefined,
          perfilPaladar:        form.perfilPaladar.trim()        || undefined,
          harmonizacaoSugerida: form.harmonizacaoSugerida.trim() || undefined,
          alergenosDetalhados:  form.alergenosDetalhados.trim()  || undefined,
          storytellingIA:       form.storytellingIA.trim()       || undefined,
        }
      );
      const item: Item = {
        ...data.data,
        price: Number(data.data.price),
        hasVariants: data.data.hasVariants ?? false,
        servingSize: data.data.servingSize ?? null,
        portionInfo: data.data.portionInfo ?? null,
        tagFunil:             data.data.tagFunil             ?? null,
        perfilPaladar:        data.data.perfilPaladar        ?? null,
        harmonizacaoSugerida: data.data.harmonizacaoSugerida ?? null,
        alergenosDetalhados:  data.data.alergenosDetalhados  ?? null,
        storytellingIA:       data.data.storytellingIA       ?? null,
        variants: [],
        extras: [],
      };
      onCreated(item, form.categoryId);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar produto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          className="relative flex flex-col w-full max-w-5xl rounded-xl bg-paper shadow-2xl overflow-hidden"
          style={{ maxHeight: "92vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Novo Produto</h2>
            <button type="button" onClick={onClose} className="text-lg leading-none text-muted hover:text-ink2" aria-label="Fechar">✕</button>
          </div>

          {/* Body + footer in a form so submit button outside scroll area still works */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col lg:flex-row min-h-full">

                {/* ── Left sidebar ──────────────────────────────────────── */}
                <div className="w-full lg:w-72 shrink-0 border-b border-line lg:border-b-0 lg:border-r p-5 space-y-5">

                  {/* Image */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink2">Imagem</label>
                    <ImageUpload value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} />
                  </div>

                  {/* Canais de venda */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink2">Canais de venda</label>
                    <div className="flex flex-col gap-2.5">
                      <ToggleSwitch
                        label="Delivery"
                        checked={form.showInDelivery}
                        onChange={() => setForm((f) => ({ ...f, showInDelivery: !f.showInDelivery }))}
                      />
                      <ToggleSwitch
                        label="QR Salão"
                        checked={form.showInDineIn}
                        onChange={() => setForm((f) => ({ ...f, showInDineIn: !f.showInDineIn }))}
                      />
                    </div>
                  </div>

                </div>

                {/* ── Main content ───────────────────────────────────────── */}
                <div className="flex-1 min-w-0 px-5 py-4 space-y-4">

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink2">Categoria <span className="text-red-500">*</span></label>
                    {manualCategories.length === 0 ? (
                      <p className="text-xs text-red-500">Crie uma categoria antes de adicionar produtos.</p>
                    ) : (
                      <select
                        value={form.categoryId}
                        onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                        className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        {manualCategories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Name */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink2">Nome <span className="text-red-500">*</span></label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Nome do produto"
                      required
                      className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink2">Descrição do produto</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Descrição exibida no cardápio (opcional)"
                      rows={4}
                      className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    <p className="text-[11px] text-muted">Explique o produto de forma clara para o cliente.</p>
                  </div>

                  {/* Price */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink2">Preço <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">R$</span>
                      <input
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                        placeholder="0,00"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        className="w-full rounded-lg border border-line2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                    </div>
                  </div>

                  {/* Serving size + portion info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-ink2">Serve (pessoas)</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, servingSize: f.servingSize === n ? null : n }))}
                            className={`flex-1 rounded border py-1.5 text-xs font-medium transition-colors ${
                              form.servingSize === n
                                ? "border-brand-500 bg-brand-500 text-white"
                                : "border-line2 text-ink2 hover:border-brand-300"
                            }`}
                          >
                            {n === 4 ? "4+" : n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-ink2">Porção</label>
                      <input
                        value={form.portionInfo}
                        onChange={(e) => setForm((f) => ({ ...f, portionInfo: e.target.value }))}
                        placeholder="ex: 300g, 500ml"
                        maxLength={50}
                        className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                    </div>
                  </div>

                  {/* IA / Enriquecimento */}
                  <div className="border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() => setAiExpanded((v) => {
                        const n = !v;
                        if (typeof window !== "undefined") localStorage.setItem("foocci_menu_ai_expanded", String(n));
                        return n;
                      })}
                      className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-brand-500 hover:text-brand-700 transition-colors"
                    >
                      <span>Avançado / IA</span>
                      <svg className={`h-3 w-3 transition-transform ${aiExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {!aiExpanded && (
                      <p className="mt-1 text-[11px] text-muted">
                        Campos usados pela inteligência do Foocci. Preencha apenas se quiser personalizar recomendações e descrições comerciais.
                      </p>
                    )}
                    {aiExpanded && (
                      <div className="mt-3 space-y-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-ink2">Etapa do funil</label>
                          <select
                            value={form.tagFunil}
                            onChange={(e) => setForm((f) => ({ ...f, tagFunil: e.target.value }))}
                            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                          >
                            <option value="">— Não definido —</option>
                            <option value="Entrada">Entrada</option>
                            <option value="Prato Principal">Prato Principal</option>
                            <option value="Bebida">Bebida</option>
                            <option value="Sobremesa">Sobremesa</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-ink2">Perfil de paladar</label>
                          <input
                            value={form.perfilPaladar}
                            onChange={(e) => setForm((f) => ({ ...f, perfilPaladar: e.target.value }))}
                            placeholder="ex: umami, cremoso, cítrico"
                            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-ink2">Harmonização sugerida</label>
                          <input
                            value={form.harmonizacaoSugerida}
                            onChange={(e) => setForm((f) => ({ ...f, harmonizacaoSugerida: e.target.value }))}
                            placeholder="ex: Água Tônica, Cerveja Heineken"
                            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-ink2">Alérgenos detalhados</label>
                          <input
                            value={form.alergenosDetalhados}
                            onChange={(e) => setForm((f) => ({ ...f, alergenosDetalhados: e.target.value }))}
                            placeholder="ex: glúten, lactose, frutos do mar"
                            className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-ink2">Storytelling IA</label>
                          <textarea
                            rows={3}
                            value={form.storytellingIA}
                            onChange={(e) => setForm((f) => ({ ...f, storytellingIA: e.target.value }))}
                            placeholder="Narrativa usada pela IA quando o cliente pede uma recomendação especial"
                            className="w-full resize-none rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {error && <InlineError message={error} />}

                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line2 px-4 py-2 text-sm text-ink2 hover:bg-[#FAFAF8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || manualCategories.length === 0}
                className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy ? <Spinner /> : "Criar produto"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar({
  categories,
  onAdded,
  onNewItem,
  onBulkPrice,
  onCategoriesUpdated,
}: {
  categories: Category[];
  onAdded: (cat: Category) => void;
  onNewItem: () => void;
  onBulkPrice: () => void;
  onCategoriesUpdated: () => void;
}) {
  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  const [fillingDesc, setFillingDesc] = useState(false);
  const [fillResult, setFillResult] = useState<string | null>(null);

  function downloadCSV() {
    const rows: string[] = [
      ["Categoria", "Produto", "Descrição", "Preço", "Ativo", "Disponível", "Ingredientes", "URL da Imagem"].join(";"),
    ];
    for (const cat of categories) {
      for (const item of cat.items) {
        rows.push([
          cat.name,
          item.name,
          item.description ?? "",
          item.price.toFixed(2).replace(".", ","),
          item.isActive ? "Sim" : "Não",
          item.isAvailable ? "Sim" : "Não",
          item.ingredients ?? "",
          item.imageUrl ?? "",
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
      }
    }
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cardapio.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFillDescriptions() {
    setFillingDesc(true);
    setFillResult(null);
    try {
      const res = await fetch("/api/menu/categories/fill-descriptions", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        const n = json.data?.updated ?? 0;
        setFillResult(n > 0 ? `${n} descrição(ões) preenchida(s).` : "Nenhuma categoria sem descrição encontrada.");
        if (n > 0) onCategoriesUpdated();
      } else {
        setFillResult("Erro ao preencher descrições.");
      }
    } catch {
      setFillResult("Erro de rede.");
    } finally {
      setFillingDesc(false);
      setTimeout(() => setFillResult(null), 4000);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        {categories.length} categoria
        {categories.length !== 1 ? "s" : ""}
        {" · "}
        {totalItems} item
        {totalItems !== 1 ? "s" : ""}
        {fillResult && (
          <span className="ml-2 text-green-600 font-medium">{fillResult}</span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/menu/upload"
          className="rounded-lg border border-line2 px-3 py-2 text-sm text-ink2 hover:bg-[#FAFAF8]"
        >
          Importar planilha
        </Link>
        {categories.length > 0 && (
          <>
            <button
              type="button"
              onClick={downloadCSV}
              className="rounded-lg border border-line2 px-3 py-2 text-sm text-ink2 hover:bg-[#FAFAF8]"
              title="Baixar cardápio completo em CSV"
            >
              Baixar CSV
            </button>
            <button
              type="button"
              onClick={onBulkPrice}
              className="rounded-lg border border-line2 px-3 py-2 text-sm text-ink2 hover:bg-[#FAFAF8]"
            >
              Ajustar preços
            </button>
            <button
              type="button"
              onClick={handleFillDescriptions}
              disabled={fillingDesc}
              title="Preenche descrições vazias para categorias com nomes conhecidos (sushi, sashimi etc.)"
              className="rounded-lg border border-line2 px-3 py-2 text-sm text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
            >
              {fillingDesc ? "…" : "Preencher descrições"}
            </button>
          </>
        )}
        {categories.some((c) => c.source === "MANUAL") && (
          <button
            type="button"
            onClick={onNewItem}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            + Novo Produto
          </button>
        )}
        <AddCategoryForm onAdded={onAdded} />
      </div>
    </div>
  );
}

// ── CategoryFilter ────────────────────────────────────────────────────────────

function CategoryFilter({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line2 bg-paper px-3 py-2 text-sm text-ink2 focus:outline-none focus:ring-1 focus:ring-brand-400"
    >
      <option value="">Todas categorias</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

// ── SortableVariantRow ────────────────────────────────────────────────────────

function SortableVariantRow({
  variant,
  onUpdated,
  onDeleted,
}: {
  variant: Variant;
  onUpdated: (v: Variant) => void;
  onDeleted: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: variant.id });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; price: string; imageUrl: string | null }>({
    name: variant.name,
    price: variant.price == null ? "" : String(variant.price),
    imageUrl: variant.imageUrl ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  async function handleSave() {
    // Variant price is OPTIONAL — blank means "inherit the product's price".
    const trimmedName = form.name.trim();
    if (!trimmedName) { setError("Nome da variação é obrigatório."); return; }
    const raw = form.price.trim();
    let price: number | null = null;
    if (raw !== "") {
      const p = parseFloat(raw);
      if (isNaN(p) || p < 0) { setError("Preço da variação inválido."); return; }
      price = p;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/api/menu/variants/${variant.id}`, "PATCH", {
        name: trimmedName,
        price, // null clears the override → inherits the product price
        imageUrl: form.imageUrl, // null = use the product image
      });
      onUpdated({ ...variant, name: data.data.name, price: data.data.price == null ? null : Number(data.data.price), imageUrl: data.data.imageUrl ?? null });
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remover variante "${variant.name}"?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/menu/variants/${variant.id}`, "DELETE");
      onDeleted(variant.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
      setBusy(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="rounded-lg border border-line2 bg-paper"
    >
      {editing ? (
        <div className="space-y-2 p-3">
          <div className="flex gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nome (ex: 350ml)"
              className="flex-1 rounded border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <input
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="herda"
              title="Deixe em branco para herdar o preço do produto"
              type="number"
              step="0.01"
              min="0"
              className="w-24 rounded border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink2">Foto da variação (opcional)</p>
            <p className="mb-1 text-[10px] text-muted">Se não adicionar, será usada a foto do produto.</p>
            <ImageUpload value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} />
          </div>
          {error && <InlineError message={error} />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? <Spinner /> : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
                setForm({ name: variant.name, price: variant.price == null ? "" : String(variant.price), imageUrl: variant.imageUrl ?? null });
              }}
              className="rounded border border-line2 px-3 py-1 text-xs text-ink2 hover:bg-[#FAFAF8]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <DragHandle listeners={listeners} />
          {variant.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={variant.imageUrl} alt={variant.name} className="h-8 w-8 shrink-0 rounded object-cover" />
          )}
          <span className="flex-1 truncate text-sm text-ink">
            {variant.name}
          </span>
          <span className="shrink-0 text-sm font-semibold text-ink2">
            {variant.price == null
              ? <span className="text-xs font-normal text-muted">herda do produto</span>
              : `R$ ${Number(variant.price).toFixed(2)}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setForm({ name: variant.name, price: variant.price == null ? "" : String(variant.price), imageUrl: variant.imageUrl ?? null });
              setEditing(true);
            }}
            className="shrink-0 text-xs text-blue-500 hover:underline"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="shrink-0 text-xs text-red-400 hover:underline"
          >
            {busy ? <Spinner /> : "Remover"}
          </button>
        </div>
      )}
      {error && !editing && (
        <div className="px-3 pb-2">
          <InlineError message={error} />
        </div>
      )}
    </div>
  );
}

// ── EditItemModal ─────────────────────────────────────────────────────────────

type EditModalForm = {
  name: string;
  description: string;
  ingredients: string;
  price: string;
  priceDelivery: string;
  priceDineIn:   string;
  priceIfood:    string;
  imageUrl: string | null;
  showInDelivery: boolean;
  showInDineIn: boolean;
  hasVariants: boolean;
  code: string;
  servingSize: number | null;
  portionInfo: string;
  categoryId: string;
  tagFunil:             string;
  perfilPaladar:        string;
  harmonizacaoSugerida: string;
  alergenosDetalhados:  string;
  storytellingIA:       string;
};

function EditItemModal({
  item,
  categories,
  currentCategoryId,
  onClose,
  onSave,
  onDelete,
  onOpenPromo,
}: {
  item: Item | null;
  categories: Category[];
  currentCategoryId: string;
  onClose: () => void;
  onSave: (patch: EditModalForm) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenPromo?: () => void;
}) {
  const manualCategories = categories.filter((c) => c.source === "MANUAL");
  const [form, setForm] = useState<EditModalForm>({
    name: "",
    description: "",
    ingredients: "",
    price: "",
    priceDelivery: "",
    priceDineIn:   "",
    priceIfood:    "",
    imageUrl: null,
    showInDelivery: false,
    showInDineIn: false,
    hasVariants: false,
    code: "",
    servingSize: null,
    portionInfo: "",
    categoryId: currentCategoryId,
    tagFunil:             "",
    perfilPaladar:        "",
    harmonizacaoSugerida: "",
    alergenosDetalhados:  "",
    storytellingIA:       "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiExpanded, setAiExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("foocci_menu_ai_expanded") === "true";
  });

  // Variants state — initialised from item.variants when modal opens
  const [variants, setVariants] = useState<Variant[]>([]);
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariant, setNewVariant] = useState<{ name: string; price: string; imageUrl: string | null }>({ name: "", price: "", imageUrl: null });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  // Extras state
  const [extras, setExtras] = useState<Extra[]>([]);
  const [addingExtra, setAddingExtra] = useState(false);
  const [newExtra, setNewExtra] = useState({ name: "", quantity: "1", price: "" });
  const [extraAddBusy, setExtraAddBusy] = useState(false);
  const [extraAddError, setExtraAddError] = useState("");

  // OptionGroups state
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [ogLoading, setOgLoading] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", required: false, minSelect: "1", maxSelect: "1" });
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingOptionTo, setAddingOptionTo] = useState<string | null>(null);
  const [newOption, setNewOption] = useState({ name: "", price: "", portion: "" });
  const [optionBusy, setOptionBusy] = useState(false);
  const [optionError, setOptionError] = useState("");

  const variantSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Sync form + variants whenever a different item is opened
  useEffect(() => {
    if (!item) return;
    setForm({
      name: item.name,
      description: item.description ?? "",
      ingredients: item.ingredients ?? "",
      price: String(item.price),
      priceDelivery: item.priceDelivery != null ? String(item.priceDelivery) : "",
      priceDineIn:   item.priceDineIn   != null ? String(item.priceDineIn)   : "",
      priceIfood:    item.priceIfood    != null ? String(item.priceIfood)    : "",
      imageUrl: item.imageUrl ?? null,
      showInDelivery: item.showInDelivery,
      showInDineIn: item.showInDineIn,
      hasVariants: item.hasVariants,
      code: item.code ?? "",
      servingSize: item.servingSize ?? null,
      portionInfo: item.portionInfo ?? "",
      categoryId: currentCategoryId,
      tagFunil:             item.tagFunil             ?? "",
      perfilPaladar:        item.perfilPaladar        ?? "",
      harmonizacaoSugerida: item.harmonizacaoSugerida ?? "",
      alergenosDetalhados:  item.alergenosDetalhados  ?? "",
      storytellingIA:       item.storytellingIA       ?? "",
    });
    setVariants(item.variants ?? []);
    setExtras(item.extras ?? []);
    setAddingVariant(false);
    setNewVariant({ name: "", price: "", imageUrl: null });
    setAddingExtra(false);
    setNewExtra({ name: "", quantity: "1", price: "" });
    setError("");
    setAddError("");
    setExtraAddError("");
    // Load option groups fresh
    setOptionGroups([]);
    setAddingGroup(false);
    setGroupError("");
    setExpandedGroups(new Set());
    setAddingOptionTo(null);
    setOptionError("");
    setOgLoading(true);
    apiFetch(`/api/menu/items/${item.id}/option-groups`, "GET")
      .then((d) => setOptionGroups(d.data ?? []))
      .catch(() => {})
      .finally(() => setOgLoading(false));
  }, [item?.id]);

  // Close on Escape
  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  async function handleSave() {
    const price = parseFloat(form.price);
    if (!form.name.trim() || isNaN(price) || price <= 0) {
      setError("Nome e preço válido são obrigatórios.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, price: String(price) });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(`Remover "${item.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(item.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddVariant() {
    if (!item) {
      setAddError("Item não encontrado.");
      return;
    }
    // Variant price is OPTIONAL — blank means "inherit the product's price".
    const trimmedName = newVariant.name.trim();
    if (!trimmedName) { setAddError("Nome da variação é obrigatório."); return; }
    const raw = newVariant.price.trim();
    let price: number | null = null;
    if (raw !== "") {
      const p = parseFloat(raw);
      if (isNaN(p) || p < 0) { setAddError("Preço da variação inválido."); return; }
      price = p;
    }
    setAddBusy(true);
    setAddError("");
    try {
      const data = await apiFetch(`/api/menu/items/${item.id}/variants`, "POST", {
        name: trimmedName,
        price, // null = inherits the product price
        imageUrl: newVariant.imageUrl, // optional — null = use the product image
        sortOrder: variants.length,
      });
      setVariants((vs) => [
        ...vs,
        { ...data.data, price: data.data.price == null ? null : Number(data.data.price), imageUrl: data.data.imageUrl ?? null },
      ]);
      setNewVariant({ name: "", price: "", imageUrl: null });
      setAddingVariant(false);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Erro ao adicionar variante.");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleAddExtra() {
    if (!item) return;
    const qty = parseInt(newExtra.quantity, 10);
    const price = newExtra.price === "" ? 0 : parseFloat(newExtra.price);
    if (!newExtra.name.trim() || isNaN(qty) || qty < 1 || isNaN(price) || price < 0) {
      setExtraAddError("Nome, quantidade (≥1) e preço (≥0) são obrigatórios.");
      return;
    }
    setExtraAddBusy(true);
    setExtraAddError("");
    try {
      const data = await apiFetch(`/api/menu/items/${item.id}/extras`, "POST", {
        name: newExtra.name.trim(),
        quantity: qty,
        price,
      });
      setExtras((es) => [...es, { ...data.data, price: Number(data.data.price) }]);
      setNewExtra({ name: "", quantity: "1", price: "" });
      setAddingExtra(false);
    } catch (e: unknown) {
      setExtraAddError(e instanceof Error ? e.message : "Erro ao adicionar extra.");
    } finally {
      setExtraAddBusy(false);
    }
  }

  async function handleDeleteExtra(extraId: string) {
    try {
      await apiFetch(`/api/menu/extras/${extraId}`, "DELETE");
      setExtras((es) => es.filter((e) => e.id !== extraId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover extra.");
    }
  }

  // ── Option-group CRUD ───────────────────────────────────────────────────────

  async function handleAddGroup() {
    if (!item) return;
    const min = parseInt(newGroup.minSelect, 10);
    const max = parseInt(newGroup.maxSelect, 10);
    if (!newGroup.name.trim()) { setGroupError("Nome do grupo é obrigatório."); return; }
    if (isNaN(min) || min < 0 || isNaN(max) || max < 0) { setGroupError("Min/max inválidos."); return; }
    setGroupBusy(true);
    setGroupError("");
    try {
      const d = await apiFetch(`/api/menu/items/${item.id}/option-groups`, "POST", {
        name:      newGroup.name.trim(),
        required:  newGroup.required,
        minSelect: min,
        maxSelect: max,
        sortOrder: optionGroups.length,
      });
      const created: OptionGroup = { ...d.data, options: [] };
      setOptionGroups((gs) => [...gs, created]);
      setExpandedGroups((s) => new Set([...s, created.id]));
      setNewGroup({ name: "", required: false, minSelect: "1", maxSelect: "1" });
      setAddingGroup(false);
    } catch (e: unknown) {
      setGroupError(e instanceof Error ? e.message : "Erro ao criar grupo.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    try {
      await apiFetch(`/api/menu/option-groups/${groupId}`, "DELETE");
      setOptionGroups((gs) => gs.filter((g) => g.id !== groupId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover grupo.");
    }
  }

  async function handleAddOption(groupId: string) {
    const price = newOption.price === "" ? 0 : parseFloat(newOption.price);
    if (!newOption.name.trim()) { setOptionError("Nome da opção é obrigatório."); return; }
    if (isNaN(price) || price < 0) { setOptionError("Preço inválido."); return; }
    setOptionBusy(true);
    setOptionError("");
    try {
      const d = await apiFetch(`/api/menu/option-groups/${groupId}/options`, "POST", {
        name:      newOption.name.trim(),
        price,
        portion:   newOption.portion.trim() || undefined,
        sortOrder: (optionGroups.find((g) => g.id === groupId)?.options.length ?? 0),
      });
      setOptionGroups((gs) =>
        gs.map((g) => g.id === groupId ? { ...g, options: [...g.options, { ...d.data, price: Number(d.data.price) }] } : g)
      );
      setNewOption({ name: "", price: "", portion: "" });
      setAddingOptionTo(null);
    } catch (e: unknown) {
      setOptionError(e instanceof Error ? e.message : "Erro ao adicionar opção.");
    } finally {
      setOptionBusy(false);
    }
  }

  async function handleDeleteOption(groupId: string, optionId: string) {
    try {
      await apiFetch(`/api/menu/option-items/${optionId}`, "DELETE");
      setOptionGroups((gs) =>
        gs.map((g) => g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g)
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover opção.");
    }
  }

  async function handleVariantDragEnd(event: DragEndEvent) {
    if (!item) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = variants.findIndex((v) => v.id === active.id);
    const newIndex = variants.findIndex((v) => v.id === over.id);
    const reordered = arrayMove(variants, oldIndex, newIndex);

    setVariants(reordered);
    try {
      await apiFetch(
        `/api/menu/variants/${reordered[0]!.id}?action=reorder&itemId=${item.id}`,
        "PATCH",
        { items: reordered.map((v, i) => ({ id: v.id, sortOrder: i })) }
      );
    } catch {
      setVariants(variants);
    }
  }

  return (
    <>
      {/* Backdrop + centering container */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        {/* Modal panel */}
        <div
          className="relative flex w-full max-w-5xl flex-col rounded-xl bg-paper shadow-2xl"
          style={{ maxHeight: "92vh" }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Editar item</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-muted hover:text-ink2"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col lg:flex-row min-h-full">

            {/* ── Left sidebar ─────────────────────────────────────────── */}
            <div className="w-full lg:w-72 shrink-0 border-b border-line lg:border-b-0 lg:border-r p-5 space-y-5">

              {/* Image */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Imagem</label>
                <ImageUpload
                  value={form.imageUrl}
                  onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
                />
              </div>

              {/* Canais de venda */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-ink2">Canais de venda</label>
                <div className="flex flex-col gap-2.5">
                  <ToggleSwitch
                    label="Delivery"
                    checked={form.showInDelivery}
                    onChange={() => setForm((f) => ({ ...f, showInDelivery: !f.showInDelivery }))}
                  />
                  <ToggleSwitch
                    label="QR Salão"
                    checked={form.showInDineIn}
                    onChange={() => setForm((f) => ({ ...f, showInDineIn: !f.showInDineIn }))}
                  />
                </div>
              </div>

              {/* Código interno */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Código interno</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Código do produto (opcional)"
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              {/* Promoção shortcut */}
              {onOpenPromo && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">Promoção</label>
                  <button
                    type="button"
                    onClick={onOpenPromo}
                    className="flex w-full items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      {item?.hasActivePromo && (
                        <span className={`h-2 w-2 rounded-full shrink-0 ${item?.promoActiveToday === false ? "bg-yellow-500" : "bg-green-500"}`} />
                      )}
                      {item?.hasActivePromo
                        ? (item?.promoActiveToday === false ? "Promo programada — editar" : "Promo ativa — editar")
                        : "Configurar promoção"}
                    </span>
                    <span className="text-sm">%</span>
                  </button>
                </div>
              )}

            </div>

            {/* ── Main content ─────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 divide-y divide-line">

          {/* ── Informações básicas ───────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Informações básicas
            </p>

            {manualCategories.length > 1 && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">Categoria</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {manualCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome do item"
                className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Descrição do produto</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição exibida no cardápio (opcional)"
                rows={4}
                className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <p className="text-[11px] text-muted">Explique o produto de forma clara para o cliente.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Ingredientes</label>
              <textarea
                value={form.ingredients}
                onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))}
                placeholder="Ex: frango grelhado, queijo prato, alface, tomate — usado pela IA para sugestões"
                rows={3}
                className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

          </div>

          {/* ── Preço e porção ────────────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Preço e porção
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">
                Preço base <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
                  R$
                </span>
                <input
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0,00"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="w-full rounded-lg border border-line2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>
            </div>

            {/* ── Preços por canal (P0-B) ─────────────────────────────── */}
            <div className="space-y-2 rounded-lg border border-line2 bg-[#FAFAF8]/60 p-3">
              <p className="text-[11px] font-semibold text-ink2">Preços por canal</p>
              <p className="text-[11px] text-muted">Se deixar vazio, usa o preço base.</p>
              {([
                { key: "priceDelivery" as const, label: "Delivery",   disabled: !form.showInDelivery },
                { key: "priceDineIn"   as const, label: "Salão / QR", disabled: !form.showInDineIn },
              ]).map((ch) => (
                <div key={ch.key} className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">
                    {ch.label}{ch.disabled && <span className="ml-1 text-[10px] text-muted">(canal desativado)</span>}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">R$</span>
                    <input
                      value={form[ch.key]}
                      onChange={(e) => setForm((f) => ({ ...f, [ch.key]: e.target.value }))}
                      placeholder="usa preço base"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="w-full rounded-lg border border-line2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Serve (pessoas)</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, servingSize: f.servingSize === n ? null : n }))}
                    className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors ${
                      form.servingSize === n
                        ? "border-brand-500 bg-brand-500 text-white shadow-sm"
                        : "border-line2 bg-paper text-muted hover:border-brand-300 hover:text-brand-600"
                    }`}
                  >
                    {n === 4 ? "4+" : n}
                  </button>
                ))}
              </div>
              {form.servingSize && (
                <p className="text-[11px] text-muted">
                  Serve {form.servingSize === 4 ? "4 ou mais" : form.servingSize} pessoa{form.servingSize !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-ink2">Informação de porção</label>
              <input
                value={form.portionInfo}
                onChange={(e) => setForm((f) => ({ ...f, portionInfo: e.target.value }))}
                placeholder="ex: 300g, 500ml, 2 fatias"
                maxLength={50}
                className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
          </div>

          {/* ── Grupos de opções ──────────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Grupos de opções
                </p>
                <p className="text-[11px] text-muted">Combos, escolhas obrigatórias ou remoções</p>
              </div>
              {optionGroups.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                  {optionGroups.length}
                </span>
              )}
            </div>

            {ogLoading && (
              <p className="text-xs text-muted">Carregando…</p>
            )}

            {!ogLoading && optionGroups.length === 0 && !addingGroup && (
              <p className="rounded-lg border border-dashed border-line2 py-3 text-center text-xs text-muted">
                Nenhum grupo — clique abaixo para adicionar
              </p>
            )}

            {/* Group list */}
            {optionGroups.map((group) => {
              const expanded = expandedGroups.has(group.id);
              return (
                <div key={group.id} className="rounded-xl border border-blue-100 bg-blue-50 overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((s) => {
                        const n = new Set(s);
                        n.has(group.id) ? n.delete(group.id) : n.add(group.id);
                        return n;
                      })}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-ink">{group.name}</p>
                      <p className="text-[11px] text-muted">
                        {group.required ? "Obrigatório" : "Opcional"} · {group.minSelect}–{group.maxSelect} seleções · {group.options.length} opções
                      </p>
                    </button>
                    <span className="shrink-0 text-[10px] text-muted">{expanded ? "▲" : "▼"}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group.id)}
                      className="shrink-0 rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label="Remover grupo"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded options */}
                  {expanded && (
                    <div className="border-t border-blue-100 bg-paper px-3 pb-3 pt-2 space-y-2">
                      {group.options.length === 0 && !addingOptionTo && (
                        <p className="text-xs text-muted">Nenhuma opção ainda.</p>
                      )}
                      {group.options.map((opt) => (
                        <div key={opt.id} className="flex items-center gap-2 rounded-lg bg-[#FAFAF8] px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink">{opt.name}</p>
                            {opt.portion && <p className="text-[11px] text-muted">{opt.portion}</p>}
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-ink2">
                            {opt.price > 0 ? `+R$ ${opt.price.toFixed(2)}` : "grátis"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteOption(group.id, opt.id)}
                            className="shrink-0 rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-500"
                            aria-label="Remover opção"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ))}

                      {/* Add option form */}
                      {addingOptionTo === group.id ? (
                        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-2 space-y-2">
                          <div className="flex gap-2">
                            <input
                              value={newOption.name}
                              onChange={(e) => { setOptionError(""); setNewOption((f) => ({ ...f, name: e.target.value })); }}
                              placeholder="Nome da opção (ex: Cru, Flambado)"
                              className={`flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${optionError && !newOption.name.trim() ? "border-red-400" : "border-line2"}`}
                            />
                            <div className="relative w-28">
                              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted">R$</span>
                              <input
                                value={newOption.price}
                                onChange={(e) => setNewOption((f) => ({ ...f, price: e.target.value }))}
                                placeholder="Grátis"
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full rounded-lg border border-line2 pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted">Preço adicional opcional — deixe em branco se essa escolha não alterar o preço.</p>
                          <input
                            value={newOption.portion}
                            onChange={(e) => setNewOption((f) => ({ ...f, portion: e.target.value }))}
                            placeholder="Porção (ex: 100g) — opcional"
                            className="w-full rounded-lg border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          {optionError && <p className="text-[11px] text-red-600">{optionError}</p>}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleAddOption(group.id)}
                              disabled={optionBusy}
                              className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                            >
                              {optionBusy ? "…" : "Adicionar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAddingOptionTo(null); setNewOption({ name: "", price: "", portion: "" }); setOptionError(""); }}
                              className="rounded-lg border border-line2 px-3 py-1 text-xs text-ink2 hover:bg-[#FAFAF8]"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAddingOptionTo(group.id); setNewOption({ name: "", price: "", portion: "" }); setOptionError(""); }}
                          className="text-xs font-medium text-blue-500 hover:text-blue-700"
                        >
                          + Adicionar opção
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add group form */}
            {addingGroup ? (
              <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3 space-y-2">
                <p className="text-[11px] font-medium text-blue-700">Novo grupo de opções</p>
                <input
                  value={newGroup.name}
                  onChange={(e) => setNewGroup((f) => ({ ...f, name: e.target.value }))}
                  placeholder='Nome (ex: "Escolha seus 2 temakis")'
                  className="w-full rounded-lg border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <div className="flex gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <input
                      id="og-required"
                      type="checkbox"
                      checked={newGroup.required}
                      onChange={(e) => setNewGroup((f) => ({ ...f, required: e.target.checked }))}
                      className="h-4 w-4 rounded border-line2 text-blue-500 focus:ring-blue-400"
                    />
                    <label htmlFor="og-required" className="text-xs text-ink2">Obrigatório</label>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-ink2">Mín.</label>
                    <input
                      value={newGroup.minSelect}
                      onChange={(e) => setNewGroup((f) => ({ ...f, minSelect: e.target.value }))}
                      type="number"
                      min="0"
                      className="w-14 rounded-lg border border-line2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-ink2">Máx.</label>
                    <input
                      value={newGroup.maxSelect}
                      onChange={(e) => setNewGroup((f) => ({ ...f, maxSelect: e.target.value }))}
                      type="number"
                      min="1"
                      className="w-14 rounded-lg border border-line2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>
                {groupError && <p className="text-[11px] text-red-600">{groupError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddGroup}
                    disabled={groupBusy}
                    className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {groupBusy ? "…" : "Criar grupo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingGroup(false); setNewGroup({ name: "", required: false, minSelect: "1", maxSelect: "1" }); setGroupError(""); }}
                    className="rounded-lg border border-line2 px-3 py-1 text-xs text-ink2 hover:bg-[#FAFAF8]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGroup(true)}
                className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-700"
              >
                <span className="text-base leading-none">+</span> Adicionar grupo de opções
              </button>
            )}
          </div>

          {/* ── Adicionais ────────────────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Adicionais
              </p>
              {extras.length > 0 && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-600">
                  {extras.length}
                </span>
              )}
            </div>

            {extras.length > 0 && (
              <ul className="space-y-2">
                {extras.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{e.name}</p>
                      <p className="text-[11px] text-muted">
                        {e.quantity > 1 ? `até ${e.quantity}x` : "1 unidade"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-brand-500 px-2 py-1 text-xs font-bold text-white">
                      +R$ {e.price.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteExtra(e.id)}
                      className="shrink-0 rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label="Remover adicional"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {extras.length === 0 && !addingExtra && (
              <p className="rounded-lg border border-dashed border-line2 py-3 text-center text-xs text-muted">
                Nenhum adicional — clique abaixo para adicionar
              </p>
            )}

            {addingExtra ? (
              <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-3 space-y-2">
                <p className="text-[11px] font-medium text-brand-700">Novo adicional</p>
                <div className="flex gap-2">
                  <input
                    value={newExtra.name}
                    onChange={(e) => { setExtraAddError(""); setNewExtra((f) => ({ ...f, name: e.target.value })); }}
                    placeholder="Nome (ex: Queijo extra)"
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 ${extraAddError && !newExtra.name.trim() ? "border-red-400" : "border-line2"}`}
                  />
                  <input
                    value={newExtra.quantity}
                    onChange={(e) => setNewExtra((f) => ({ ...f, quantity: e.target.value }))}
                    placeholder="Qtd"
                    type="number"
                    min="1"
                    step="1"
                    className="w-16 rounded-lg border border-line2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <div className="relative w-24">
                    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted">R$</span>
                    <input
                      value={newExtra.price}
                      onChange={(e) => setNewExtra((f) => ({ ...f, price: e.target.value }))}
                      placeholder="Grátis"
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-lg border border-line2 pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>
                </div>
                {extraAddError && <InlineError message={extraAddError} />}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddExtra}
                    disabled={extraAddBusy}
                    className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {extraAddBusy ? <Spinner /> : "Adicionar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingExtra(false);
                      setNewExtra({ name: "", quantity: "1", price: "" });
                      setExtraAddError("");
                    }}
                    className="rounded-lg border border-line2 px-3 py-1 text-xs text-ink2 hover:bg-[#FAFAF8]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingExtra(true)}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <span className="text-base leading-none">+</span> Adicionar adicional
              </button>
            )}
          </div>

          {/* ── Variantes ─────────────────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Variantes
                </p>
                {!form.hasVariants && (
                  <p className="text-[11px] text-muted">Tamanhos, sabores ou opções com preço diferente</p>
                )}
              </div>
              <ToggleSwitch
                label="Ativar"
                checked={form.hasVariants}
                onChange={() => setForm((f) => ({ ...f, hasVariants: !f.hasVariants }))}
              />
            </div>

            {form.hasVariants && (
              <div className="space-y-2">
                {variants.length > 0 && (
                  <DndContext
                    sensors={variantSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleVariantDragEnd}
                  >
                    <SortableContext
                      items={variants.map((v) => v.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {variants.map((v) => (
                          <SortableVariantRow
                            key={v.id}
                            variant={v}
                            onUpdated={(updated) =>
                              setVariants((vs) =>
                                vs.map((x) => (x.id === updated.id ? updated : x))
                              )
                            }
                            onDeleted={(id) =>
                              setVariants((vs) => vs.filter((x) => x.id !== id))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {addingVariant ? (
                  <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-3 space-y-2">
                    <p className="text-[11px] font-medium text-brand-700">Nova variante</p>
                    <div className="flex gap-2">
                      <input
                        value={newVariant.name}
                        onChange={(e) => { setAddError(""); setNewVariant((f) => ({ ...f, name: e.target.value })); }}
                        placeholder="Nome (ex: 350ml, Grande)"
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 ${addError && !newVariant.name.trim() ? "border-red-400" : "border-line2"}`}
                      />
                      <div className="relative w-24">
                        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted">R$</span>
                        <input
                          value={newVariant.price}
                          onChange={(e) => { setAddError(""); setNewVariant((f) => ({ ...f, price: e.target.value })); }}
                          placeholder="herda"
                          title="Deixe em branco para herdar o preço do produto"
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-lg border border-line2 pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-ink2">Foto da variação (opcional)</p>
                      <p className="mb-1 text-[10px] text-muted">Se não adicionar, será usada a foto do produto.</p>
                      <ImageUpload value={newVariant.imageUrl} onChange={(url) => setNewVariant((f) => ({ ...f, imageUrl: url }))} />
                    </div>
                    {addError && <InlineError message={addError} />}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddVariant}
                        disabled={addBusy}
                        className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                      >
                        {addBusy ? <Spinner /> : "Adicionar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingVariant(false);
                          setNewVariant({ name: "", price: "", imageUrl: null });
                          setAddError("");
                        }}
                        className="rounded-lg border border-line2 px-3 py-1 text-xs text-ink2 hover:bg-[#FAFAF8]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingVariant(true)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <span className="text-base leading-none">+</span> Adicionar variante
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Avançado / IA ─────────────────────────────── */}
          <div className="px-5 py-4">
            <button
              type="button"
              onClick={() => setAiExpanded((v) => {
                const n = !v;
                if (typeof window !== "undefined") localStorage.setItem("foocci_menu_ai_expanded", String(n));
                return n;
              })}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-brand-500 hover:text-brand-700 transition-colors"
            >
              <span>Avançado / IA</span>
              <svg className={`h-3 w-3 transition-transform ${aiExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {!aiExpanded && (
              <p className="mt-1 text-[11px] text-muted">
                Campos usados pela inteligência do Foocci. Preencha apenas se quiser personalizar recomendações e descrições comerciais.
              </p>
            )}
            {aiExpanded && (
              <div className="mt-3 space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">Etapa do funil</label>
                  <select
                    value={form.tagFunil}
                    onChange={(e) => setForm((f) => ({ ...f, tagFunil: e.target.value }))}
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="">— Não definido —</option>
                    <option value="Entrada">Entrada</option>
                    <option value="Prato Principal">Prato Principal</option>
                    <option value="Bebida">Bebida</option>
                    <option value="Sobremesa">Sobremesa</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">Perfil de paladar</label>
                  <input
                    value={form.perfilPaladar}
                    onChange={(e) => setForm((f) => ({ ...f, perfilPaladar: e.target.value }))}
                    placeholder="ex: umami, cremoso, cítrico, levemente picante"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">Harmonização sugerida</label>
                  <input
                    value={form.harmonizacaoSugerida}
                    onChange={(e) => setForm((f) => ({ ...f, harmonizacaoSugerida: e.target.value }))}
                    placeholder="ex: Água Tônica, Cerveja Heineken"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">Alérgenos detalhados</label>
                  <input
                    value={form.alergenosDetalhados}
                    onChange={(e) => setForm((f) => ({ ...f, alergenosDetalhados: e.target.value }))}
                    placeholder="ex: glúten, lactose, frutos do mar, amendoim"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-ink2">Storytelling IA</label>
                  <textarea
                    rows={3}
                    value={form.storytellingIA}
                    onChange={(e) => setForm((f) => ({ ...f, storytellingIA: e.target.value }))}
                    placeholder="Narrativa usada pela IA quando o cliente pede uma recomendação especial"
                    className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="px-5 pb-4">
              <InlineError message={error} />
            </div>
          )}

            </div>{/* end main content */}
          </div>{/* end two-column flex */}
        </div>{/* end body */}

        {/* Footer — sticky because it is outside the overflow-y-auto body */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            Excluir produto
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? <Spinner /> : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line2 px-4 py-2 text-sm text-ink2 hover:bg-[#FAFAF8]"
            >
              Cancelar
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}

// ── BulkPriceModal ────────────────────────────────────────────────────────────

type BulkAction = "increase" | "decrease" | "set";

const ACTION_LABELS: Record<BulkAction, string> = {
  increase: "Aumentar em",
  decrease: "Diminuir em",
  set: "Definir como",
};

function BulkPriceModal({
  categories,
  open,
  onClose,
  onApplied,
}: {
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [scope, setScope] = useState("");
  const [action, setAction] = useState<BulkAction>("increase");
  const [value, setValue] = useState("");
  const [applyToVariants, setApplyToVariants] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    affected: number;
    variantsAffected: number;
  } | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep("form");
    setScope("");
    setAction("increase");
    setValue("");
    setApplyToVariants(false);
    setError("");
    setResult(null);
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Live counts (mirrors backend: isActive items in scope)
  const scopedCats = scope
    ? categories.filter((c) => c.id === scope)
    : categories;
  const activeItems = scopedCats.flatMap((c) => c.items).filter((i) => i.isActive);
  const itemCount = activeItems.length;
  const variantCount = applyToVariants
    ? activeItems.reduce((n, i) => n + i.variants.length, 0)
    : 0;
  const scopeLabel = scope
    ? (categories.find((c) => c.id === scope)?.name ?? "")
    : "Todo o cardápio";

  function handlePreview() {
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) {
      setError("Informe um valor positivo.");
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch("/api/menu/bulk-price", "POST", {
        action,
        value: parseFloat(value),
        ...(scope ? { categoryId: scope } : {}),
        applyToVariants,
      });
      setResult(data.data);
      setStep("done");
      onApplied();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao aplicar ajuste.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-paper shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">
              {step === "done" ? "Ajuste aplicado" : "Ajustar preços em massa"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-lg leading-none text-muted hover:text-ink2"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          {/* ── Step 1: form ── */}
          {step === "form" && (
            <div className="px-5 py-4 space-y-4">
              {/* Scope */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">
                  Escopo
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  <option value="">Todo o cardápio</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">
                  Ação
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as BulkAction)}
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  <option value="increase">Aumentar em</option>
                  <option value="decrease">Diminuir em</option>
                  <option value="set">Definir como</option>
                </select>
              </div>

              {/* Value */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-ink2">
                  Valor (R$) <span className="text-red-500">*</span>
                </label>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  className="w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              {/* Apply to variants */}
              <ToggleSwitch
                label="Incluir variantes"
                checked={applyToVariants}
                onChange={() => setApplyToVariants((v) => !v)}
              />

              {/* Live count hint */}
              <p className="text-xs text-muted">
                {itemCount} item{itemCount !== 1 ? "s" : ""}
                {applyToVariants && variantCount > 0
                  ? ` e ${variantCount} variante${variantCount !== 1 ? "s" : ""}`
                  : ""}{" "}
                {itemCount === 1 ? "será afetado" : "serão afetados"}.
              </p>

              {error && <InlineError message={error} />}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!value || itemCount === 0}
                  className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  Pré-visualizar
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: confirm ── */}
          {step === "confirm" && (
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg bg-[#FAFAF8] p-4 space-y-1 text-sm text-ink2">
                <p>
                  <span className="font-medium">Ação:</span>{" "}
                  {ACTION_LABELS[action]} R$ {parseFloat(value).toFixed(2)}
                </p>
                <p>
                  <span className="font-medium">Escopo:</span> {scopeLabel}
                </p>
                {applyToVariants && (
                  <p>
                    <span className="font-medium">Variantes:</span> incluídas
                  </p>
                )}
              </div>

              <p className="text-sm text-ink2">
                <span className="font-semibold text-brand-600">
                  {itemCount}
                </span>{" "}
                item{itemCount !== 1 ? "s" : ""}{" "}
                {itemCount === 1 ? "será afetado" : "serão afetados"}
                {applyToVariants && variantCount > 0 && (
                  <>
                    , junto com{" "}
                    <span className="font-semibold text-brand-600">
                      {variantCount}
                    </span>{" "}
                    variante{variantCount !== 1 ? "s" : ""}
                  </>
                )}
                .
              </p>

              {error && <InlineError message={error} />}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setStep("form"); setError(""); }}
                  disabled={busy}
                  className="rounded-lg border border-line2 px-4 py-2 text-sm text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={busy || itemCount === 0}
                  className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {busy ? <Spinner /> : "Confirmar"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: done ── */}
          {step === "done" && result && (
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg bg-green-50 p-4 space-y-1 text-sm text-green-700">
                <p>
                  ✓ {result.affected} item{result.affected !== 1 ? "s" : ""}{" "}
                  atualizado{result.affected !== 1 ? "s" : ""}.
                </p>
                {result.variantsAffected > 0 && (
                  <p>
                    ✓ {result.variantsAffected}{" "}
                    variante{result.variantsAffected !== 1 ? "s" : ""}{" "}
                    atualizada{result.variantsAffected !== 1 ? "s" : ""}.
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MenuManager({
  initialCategories,
  restaurantSlug,
  restaurantId: _restaurantId,
  qrUrl,
  pedidoUrl,
}: {
  initialCategories: Category[];
  restaurantSlug: string;
  restaurantId: string;
  qrUrl: string;
  pedidoUrl: string;
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [filterQuery, setFilterQuery] = useState("");
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    item: Item;
    categoryId: string;
  } | null>(null);
  const [promoItem, setPromoItem] = useState<Item | null>(null);
  const [promoCategory, setPromoCategory] = useState<Category | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const isFilterActive = filterQuery !== "";
  const visibleCategories = isFilterActive
    ? categories.filter((c) => c.id === filterQuery)
    : categories;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  function updateCategory(updated: Category) {
    setCategories((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    refresh();
  }

  function removeCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    refresh();
  }

  function addCategory(cat: Category) {
    setCategories((prev) => [...prev, cat]);
    refresh();
  }

  function handleDuplicated(newItem: Item, toCategoryId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === toCategoryId ? { ...c, items: [...c.items, newItem] } : c
      )
    );
    refresh();
  }

  async function handleModalSave(patch: EditModalForm) {
    if (!editingItem) return;
    const { item, categoryId: oldCategoryId } = editingItem;
    const newCategoryId = patch.categoryId || oldCategoryId;
    const body: Record<string, unknown> = {
      name: patch.name.trim(),
      description: patch.description.trim() || undefined,
      ingredients: patch.ingredients.trim() || undefined,
      price: parseFloat(patch.price),
      // Channel prices: empty string → null (clear override / use base).
      priceDelivery: patch.priceDelivery.trim() === "" ? null : parseFloat(patch.priceDelivery),
      priceDineIn:   patch.priceDineIn.trim()   === "" ? null : parseFloat(patch.priceDineIn),
      imageUrl: patch.imageUrl,
      showInDelivery: patch.showInDelivery,
      showInDineIn: patch.showInDineIn,
      hasVariants: patch.hasVariants,
      code: patch.code.trim() || undefined,
      servingSize: patch.servingSize ?? undefined,
      portionInfo: patch.portionInfo.trim() || undefined,
      tagFunil:             patch.tagFunil.trim()             || undefined,
      perfilPaladar:        patch.perfilPaladar.trim()        || undefined,
      harmonizacaoSugerida: patch.harmonizacaoSugerida.trim() || undefined,
      alergenosDetalhados:  patch.alergenosDetalhados.trim()  || undefined,
      storytellingIA:       patch.storytellingIA.trim()       || undefined,
      ...(newCategoryId !== oldCategoryId && { categoryId: newCategoryId }),
    };
    const data = await apiFetch(`/api/menu/items/${item.id}`, "PATCH", body);
    const updated: Item = {
      ...item,
      ...data.data,
      price: Number(data.data.price),
      servingSize: data.data.servingSize ?? null,
      portionInfo: data.data.portionInfo ?? null,
      variants: item.variants,
    };
    setCategories((prev) => {
      if (newCategoryId === oldCategoryId) {
        return prev.map((c) =>
          c.id === oldCategoryId
            ? { ...c, items: c.items.map((it) => (it.id === item.id ? updated : it)) }
            : c
        );
      }
      // Category changed: remove from old, append to new
      return prev.map((c) => {
        if (c.id === oldCategoryId) return { ...c, items: c.items.filter((it) => it.id !== item.id) };
        if (c.id === newCategoryId) return { ...c, items: [...c.items, updated] };
        return c;
      });
    });
    refresh();
  }

  async function handleModalDelete(itemId: string) {
    if (!editingItem) return;
    const { categoryId } = editingItem;
    await apiFetch(`/api/menu/items/${itemId}`, "DELETE");
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.filter((it) => it.id !== itemId) }
          : c
      )
    );
    setEditingItem(null);
    refresh();
  }

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);

    // Optimistic update
    setCategories(reordered);

    try {
      await apiFetch(
        `/api/menu/categories/${reordered[0]!.id}?action=reorder`,
        "PATCH",
        { items: reordered.map((c, i) => ({ id: c.id, sortOrder: i })) }
      );
    } catch {
      // Revert on failure
      setCategories(categories);
    }
  }

  return (
    <div className="space-y-4">
      {/* QR access cards */}
      {restaurantSlug && (
        <div className="grid gap-4 sm:grid-cols-2">
          <QRCard
            url={qrUrl}
            slug={restaurantSlug}
            label="QR Code Salão"
            subtitle="Cardápio digital — sem pedido"
            downloadName={`salao-qr-${restaurantSlug}.png`}
            tip="Cole nas mesas para que os clientes consultem o cardápio. Leitura apenas — sem carrinho ou checkout."
          />
          <QRCard
            url={pedidoUrl}
            slug={restaurantSlug}
            label="QR Code Delivery"
            subtitle="Pedido online completo"
            downloadName={`delivery-qr-${restaurantSlug}.png`}
            tip="Compartilhe para delivery e retirada. O cliente conversa com o agente, monta o pedido e paga online."
          />
        </div>
      )}

      {/* Header actions */}
      <TopBar
        categories={categories}
        onAdded={addCategory}
        onNewItem={() => setNewItemOpen(true)}
        onBulkPrice={() => setBulkPriceOpen(true)}
        onCategoriesUpdated={refresh}
      />

      {/* Category filter */}
      <CategoryFilter
        categories={categories}
        value={filterQuery}
        onChange={setFilterQuery}
      />

      {/* Empty state */}
      {categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-line2 p-10 text-center text-sm text-muted space-y-3">
          <p>
            Nenhuma categoria criada ainda. Clique em{" "}
            <strong>+ Nova categoria</strong> para começar.
          </p>
          <p>
            Ou{" "}
            <a
              href="/seed-menu"
              className="font-medium text-brand-600 hover:underline"
            >
              popular com um cardápio de exemplo
            </a>{" "}
            (pizzaria, 4 categorias, 11 itens).
          </p>
        </div>
      )}

      {/* Category cards with drag-and-drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleCategoryDragEnd}
      >
        <SortableContext
          items={visibleCategories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {visibleCategories.map((cat) => (
              <SortableCategoryCard
                key={cat.id}
                category={cat}
                allCategories={categories}
                filterActive={isFilterActive}
                onChange={updateCategory}
                onDelete={removeCategory}
                onEditItem={(item, categoryId: string) => setEditingItem({ item, categoryId })}
                onPromoItem={setPromoItem}
                onPromoCategory={setPromoCategory}
                onDuplicated={handleDuplicated}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Integration callout */}
      <div className="rounded-xl border border-dashed border-line2 p-4 text-xs text-muted">
        <span className="font-medium text-muted">Integração futura:</span>{" "}
        categorias e itens importados automaticamente de um sistema externo
        (POS, iFood, etc.) aparecerão aqui com a badge{" "}
        <span className="rounded bg-blue-100 px-1 text-blue-600">
          Importado
        </span>{" "}
        e não poderão ser editados manualmente.
      </div>

      {/* Bulk price dialog */}
      <BulkPriceModal
        categories={categories}
        open={bulkPriceOpen}
        onClose={() => setBulkPriceOpen(false)}
        onApplied={refresh}
      />

      {/* New item modal */}
      <NewItemModal
        categories={categories}
        open={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onCreated={(item, categoryId) => {
          setCategories((prev) =>
            prev.map((c) =>
              c.id === categoryId ? { ...c, items: [...c.items, item] } : c
            )
          );
          refresh();
        }}
      />

      {/* Edit item modal */}
      <EditItemModal
        item={editingItem?.item ?? null}
        categories={categories}
        currentCategoryId={editingItem?.categoryId ?? ""}
        onClose={() => { setEditingItem(null); refresh(); }}
        onSave={handleModalSave}
        onDelete={handleModalDelete}
        onOpenPromo={editingItem ? () => setPromoItem(editingItem.item) : undefined}
      />

      {/* Product promo modal */}
      {promoItem && (
        <PromoModal
          item={promoItem}
          onClose={() => { setPromoItem(null); refresh(); }}
        />
      )}

      {/* Category promo modal */}
      {promoCategory && (
        <CategoryPromoModal
          category={promoCategory}
          onClose={() => { setPromoCategory(null); refresh(); }}
        />
      )}
    </div>
  );
}
