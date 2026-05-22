"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────

interface CurrentItem {
  id:          string;
  name:        string;
  quantity:    number;
  price:       number;
  total:       number;
  variantName: string | null;
  notes:       string | null;
}

interface MenuCategory {
  id:   string;
  name: string;
}

interface MenuItem {
  id:          string;
  name:        string;
  price:       number;
  description: string | null;
  hasVariants: boolean;
  isAvailable: boolean;
}

interface MenuItemVariant {
  id:    string;
  name:  string;
  price: number;
}

interface OptionGroupItem {
  id:          string;
  name:        string;
  price:       number;
  isAvailable: boolean;
}

interface OptionGroup {
  id:        string;
  name:      string;
  required:  boolean;
  minSelect: number;
  maxSelect: number;
  options:   OptionGroupItem[];
}

interface MenuItemExtra {
  id:          string;
  name:        string;
  price:       number;
  isAvailable: boolean;
}

type ReplacementReason =
  | "CLIENTE_PEDIU"
  | "PRODUTO_INDISPONIVEL"
  | "ERRO_SABOR"
  | "ERRO_OPERACIONAL"
  | "OUTRO";

interface SelectedOption {
  groupId:      string;
  optionItemId: string;
  name:         string;
}

interface SelectedExtra {
  extraId:  string;
  name:     string;
  quantity: number;
  price:    number;
}

interface Props {
  orderId:      string;
  orderTotal:   number;
  currentItem:  CurrentItem;
  onClose:      () => void;
  onSuccess:    (priceDiff: number, newTotal: number) => void;
}

const REASON_LABELS: Record<ReplacementReason, string> = {
  CLIENTE_PEDIU:        "Cliente pediu troca",
  PRODUTO_INDISPONIVEL: "Produto indisponível",
  ERRO_SABOR:           "Erro no sabor/produto",
  ERRO_OPERACIONAL:     "Erro operacional",
  OUTRO:                "Outro",
};

// ─── Component ─────────────────────────────────────────────────

export function ItemReplacementModal({ orderId, orderTotal, currentItem, onClose, onSuccess }: Props) {
  // Step: "item" | "reason" | "review"
  const [step, setStep] = useState<"item" | "reason" | "review">("item");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Category/Item selection
  const [categories, setCategories]         = useState<MenuCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryItems, setCategoryItems]   = useState<MenuItem[]>([]);
  const [selectedItem, setSelectedItem]     = useState<MenuItem | null>(null);
  const [loadingCats, setLoadingCats]       = useState(true);
  const [loadingItems, setLoadingItems]     = useState(false);

  // ── Variant/Options/Extras
  const [variants, setVariants]                   = useState<MenuItemVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [optionGroups, setOptionGroups]           = useState<OptionGroup[]>([]);
  const [selectedOptions, setSelectedOptions]     = useState<SelectedOption[]>([]);
  const [extras, setExtras]                       = useState<MenuItemExtra[]>([]);
  const [selectedExtras, setSelectedExtras]       = useState<SelectedExtra[]>([]);
  const [quantity, setQuantity]                   = useState(currentItem.quantity);
  const [notes, setNotes]                         = useState<string>("");
  const [loadingDetails, setLoadingDetails]       = useState(false);

  // ── Reason
  const [reason, setReason]         = useState<ReplacementReason | null>(null);
  const [reasonNote, setReasonNote] = useState("");

  // ── Load categories on mount
  useEffect(() => {
    fetch("/api/menu/categories?activeOnly=true")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCategories(d.data as MenuCategory[]);
      })
      .catch(() => {})
      .finally(() => setLoadingCats(false));
  }, []);

  // ── Load items when category changes
  useEffect(() => {
    if (!selectedCategoryId) { setCategoryItems([]); return; }
    setLoadingItems(true);
    setSelectedItem(null);
    setVariants([]);
    setSelectedVariantId(null);
    setOptionGroups([]);
    setSelectedOptions([]);
    setExtras([]);
    setSelectedExtras([]);
    fetch(`/api/menu/categories/${selectedCategoryId}/items?activeOnly=true`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCategoryItems((d.data as MenuItem[]).filter((i) => i.isAvailable));
      })
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }, [selectedCategoryId]);

  // ── Load item details (variants, options, extras) when item is selected
  const loadItemDetails = useCallback(async (item: MenuItem) => {
    setSelectedItem(item);
    setVariants([]);
    setSelectedVariantId(null);
    setOptionGroups([]);
    setSelectedOptions([]);
    setExtras([]);
    setSelectedExtras([]);
    setLoadingDetails(true);

    try {
      const [varRes, ogRes, exRes] = await Promise.all([
        item.hasVariants ? fetch(`/api/menu/items/${item.id}/variants`).then((r) => r.json()) : Promise.resolve({ success: true, data: [] }),
        fetch(`/api/menu/items/${item.id}/option-groups`).then((r) => r.json()),
        fetch(`/api/menu/items/${item.id}/extras`).then((r) => r.json()),
      ]);

      if (varRes.success) setVariants(varRes.data as MenuItemVariant[]);
      if (ogRes.success)  setOptionGroups(ogRes.data as OptionGroup[]);
      if (exRes.success)  setExtras((exRes.data as MenuItemExtra[]).filter((e) => e.isAvailable));
    } catch {
      // ignore — user can still proceed with base price
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // ── Derived price calculation (client-side preview only; server recalculates)
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;
  const basePrice       = selectedVariant ? selectedVariant.price : (selectedItem?.price ?? 0);
  const optionsPrice    = selectedOptions.reduce((acc, sel) => {
    const opt = optionGroups.flatMap((g) => g.options).find((o) => o.id === sel.optionItemId);
    return acc + (opt?.price ?? 0);
  }, 0);
  const extrasPrice = selectedExtras.reduce((acc, e) => acc + e.price * e.quantity, 0);
  const newUnitPrice  = basePrice + optionsPrice + extrasPrice;
  const newItemTotal  = newUnitPrice * quantity;
  const newOrderTotal = orderTotal - currentItem.total + newItemTotal;
  const priceDiff     = newOrderTotal - orderTotal;

  // ── Option selection (single-select per group for now; multi-select if maxSelect > 1)
  function toggleOption(group: OptionGroup, option: OptionGroupItem) {
    setSelectedOptions((prev) => {
      const already = prev.find((s) => s.groupId === group.id && s.optionItemId === option.id);
      if (already) {
        return prev.filter((s) => !(s.groupId === group.id && s.optionItemId === option.id));
      }
      if (group.maxSelect === 1) {
        // replace existing selection for this group
        const without = prev.filter((s) => s.groupId !== group.id);
        return [...without, { groupId: group.id, optionItemId: option.id, name: option.name }];
      }
      if (prev.filter((s) => s.groupId === group.id).length >= group.maxSelect) return prev;
      return [...prev, { groupId: group.id, optionItemId: option.id, name: option.name }];
    });
  }

  function toggleExtra(extra: MenuItemExtra) {
    setSelectedExtras((prev) => {
      const exists = prev.find((e) => e.extraId === extra.id);
      if (exists) return prev.filter((e) => e.extraId !== extra.id);
      return [...prev, { extraId: extra.id, name: extra.name, price: extra.price, quantity: 1 }];
    });
  }

  // ── Validation before moving to review
  function validateItemStep(): string | null {
    if (!selectedItem) return "Selecione um produto.";
    if (selectedItem.hasVariants && variants.length > 0 && !selectedVariantId) {
      return "Selecione uma variante.";
    }
    for (const group of optionGroups) {
      const count = selectedOptions.filter((s) => s.groupId === group.id).length;
      if (group.required && count < group.minSelect) {
        return `Selecione pelo menos ${group.minSelect} opção em "${group.name}".`;
      }
    }
    return null;
  }

  function handleItemNext() {
    const err = validateItemStep();
    if (err) { setError(err); return; }
    setError(null);
    setStep("reason");
  }

  function handleReasonNext() {
    if (!reason) { setError("Selecione um motivo."); return; }
    setError(null);
    setStep("review");
  }

  async function handleConfirm() {
    if (!selectedItem || !reason) return;
    setSubmitting(true);
    setError(null);

    const selectedVariantObj = variants.find((v) => v.id === selectedVariantId) ?? null;

    const body = {
      orderItemId:        currentItem.id,
      newMenuItemId:      selectedItem.id,
      newVariantId:       selectedVariantId ?? null,
      newVariantName:     selectedVariantObj?.name ?? null,
      newOptionSelections: selectedOptions,
      newExtras:          selectedExtras,
      quantity,
      notes:              notes || null,
      reason,
      reasonNote:         reasonNote || null,
    };

    try {
      const res  = await fetch(`/api/orders/${orderId}/item-replacement`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Erro ao alterar o pedido.");
        return;
      }

      onSuccess(data.data.priceDiff, data.data.newTotal);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Trocar item do pedido</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-gray-100 px-6 py-2 gap-6 text-xs font-medium">
          {(["item", "reason", "review"] as const).map((s, idx) => (
            <span
              key={s}
              className={step === s ? "text-brand-600 border-b-2 border-brand-600 pb-1" : "text-gray-400"}
            >
              {idx + 1}. {s === "item" ? "Novo item" : s === "reason" ? "Motivo" : "Revisão"}
            </span>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* ── Section 1: Item atual (always visible) ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Item atual</p>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">{currentItem.quantity}× {currentItem.name}</p>
                {currentItem.variantName && (
                  <p className="text-xs text-gray-500">{currentItem.variantName}</p>
                )}
                {currentItem.notes && (
                  <p className="text-xs text-gray-400 italic">{currentItem.notes}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  R$ {currentItem.price.toFixed(2)} / un — Total: R$ {currentItem.total.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* ── STEP: item ── */}
          {step === "item" && (
            <div className="space-y-5">
              <p className="text-sm font-semibold text-gray-700">Escolha o novo item</p>

              {/* Category selector */}
              {loadingCats ? (
                <p className="text-sm text-gray-400">Carregando categorias…</p>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Categoria</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={selectedCategoryId ?? ""}
                    onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Item list */}
              {selectedCategoryId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Produto</label>
                  {loadingItems ? (
                    <p className="text-sm text-gray-400">Carregando produtos…</p>
                  ) : categoryItems.length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhum produto disponível nesta categoria.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {categoryItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => loadItemDetails(item)}
                          className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                            selectedItem?.id === item.id
                              ? "border-brand-500 bg-brand-50 text-brand-700"
                              : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                          }`}
                        >
                          <span>{item.name}</span>
                          <span className="font-medium text-gray-600">R$ {Number(item.price).toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Variant selector */}
              {selectedItem && loadingDetails && (
                <p className="text-sm text-gray-400">Carregando opções…</p>
              )}

              {selectedItem && !loadingDetails && variants.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Variante</label>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariantId(v.id)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                          selectedVariantId === v.id
                            ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                            : "border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {v.name} — R$ {Number(v.price).toFixed(2)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Option groups */}
              {selectedItem && !loadingDetails && optionGroups.map((group) => (
                <div key={group.id}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {group.name}
                    {group.required && <span className="ml-1 text-red-500">*</span>}
                    {group.maxSelect > 1 && <span className="ml-1 text-gray-400">(até {group.maxSelect})</span>}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {group.options.filter((o) => o.isAvailable).map((opt) => {
                      const sel = selectedOptions.some(
                        (s) => s.groupId === group.id && s.optionItemId === opt.id
                      );
                      return (
                        <button
                          key={opt.id}
                          onClick={() => toggleOption(group, opt)}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                            sel
                              ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                              : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {opt.name}{Number(opt.price) > 0 && ` +R$ ${Number(opt.price).toFixed(2)}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Extras */}
              {selectedItem && !loadingDetails && extras.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Adicionais (opcional)</label>
                  <div className="flex flex-wrap gap-2">
                    {extras.map((ext) => {
                      const sel = selectedExtras.some((e) => e.extraId === ext.id);
                      return (
                        <button
                          key={ext.id}
                          onClick={() => toggleExtra(ext)}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                            sel
                              ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                              : "border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          {ext.name}{Number(ext.price) > 0 && ` +R$ ${Number(ext.price).toFixed(2)}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity + Notes */}
              {selectedItem && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Quantidade</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                      >−</button>
                      <span className="w-8 text-center font-medium">{quantity}</span>
                      <button
                        onClick={() => setQuantity((q) => q + 1)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                      >+</button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Observação (opcional)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: sem cebola"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              )}

              {/* Live price preview */}
              {selectedItem && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Novo item ({quantity}×)</span>
                    <span>R$ {newItemTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-2">
                    <span>Novo total do pedido</span>
                    <span>R$ {newOrderTotal.toFixed(2)}</span>
                  </div>
                  {priceDiff !== 0 && (
                    <p className={`text-xs font-medium ${priceDiff > 0 ? "text-orange-600" : "text-green-600"}`}>
                      {priceDiff > 0
                        ? `Diferença a cobrar: R$ ${priceDiff.toFixed(2)}`
                        : `Diferença a devolver/absorver: R$ ${Math.abs(priceDiff).toFixed(2)}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: reason ── */}
          {step === "reason" && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700">Motivo da alteração</p>
              <div className="space-y-2">
                {(Object.entries(REASON_LABELS) as [ReplacementReason, string][]).map(([val, label]) => (
                  <label
                    key={val}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
                      reason === val ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={val}
                      checked={reason === val}
                      onChange={() => setReason(val)}
                      className="accent-brand-500"
                    />
                    <span className="text-sm text-gray-800">{label}</span>
                  </label>
                ))}
              </div>
              {reason === "OUTRO" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Detalhe (opcional)</label>
                  <textarea
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    placeholder="Descreva o motivo…"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── STEP: review ── */}
          {step === "review" && selectedItem && (
            <div className="space-y-5">
              <p className="text-sm font-semibold text-gray-700">Revisão da alteração</p>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {/* Before */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Antes</p>
                  <p className="font-medium text-gray-800">{currentItem.quantity}× {currentItem.name}</p>
                  {currentItem.variantName && <p className="text-xs text-gray-500">{currentItem.variantName}</p>}
                  <p className="mt-2 text-gray-600">R$ {currentItem.total.toFixed(2)}</p>
                </div>

                {/* After */}
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-400">Depois</p>
                  <p className="font-medium text-gray-800">{quantity}× {selectedItem.name}</p>
                  {selectedVariant && <p className="text-xs text-gray-500">{selectedVariant.name}</p>}
                  {selectedOptions.length > 0 && (
                    <p className="text-xs text-gray-500">{selectedOptions.map((o) => o.name).join(", ")}</p>
                  )}
                  <p className="mt-2 text-brand-700 font-medium">R$ {newItemTotal.toFixed(2)}</p>
                </div>
              </div>

              {/* Order total comparison */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Total anterior</span>
                  <span>R$ {orderTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2">
                  <span>Novo total</span>
                  <span>R$ {newOrderTotal.toFixed(2)}</span>
                </div>
                <div className={`text-sm font-medium ${priceDiff > 0 ? "text-orange-600" : priceDiff < 0 ? "text-green-600" : "text-gray-500"}`}>
                  {priceDiff > 0
                    ? `Diferença a cobrar: R$ ${priceDiff.toFixed(2)}`
                    : priceDiff < 0
                    ? `Diferença a devolver/absorver: R$ ${Math.abs(priceDiff).toFixed(2)}`
                    : "Sem diferença de valor"}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
                <span className="text-gray-500">Motivo: </span>
                <span className="font-medium text-gray-800">{REASON_LABELS[reason!]}</span>
                {reasonNote && <p className="mt-1 text-xs text-gray-500 italic">{reasonNote}</p>}
              </div>

              <p className="text-xs text-gray-400">
                ⚠️ O pagamento externo (Stone, Pix, Mercado Pago) não é alterado automaticamente.
                Ajustes devem ser realizados manualmente junto ao cliente.
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <button
            onClick={step === "item" ? onClose : () => setStep(step === "review" ? "reason" : "item")}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            {step === "item" ? "Cancelar" : "← Voltar"}
          </button>

          {step === "item" && (
            <button
              onClick={handleItemNext}
              disabled={!selectedItem}
              className="rounded-xl bg-gray-800 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition"
            >
              Continuar →
            </button>
          )}

          {step === "reason" && (
            <button
              onClick={handleReasonNext}
              disabled={!reason}
              className="rounded-xl bg-gray-800 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition"
            >
              Revisar →
            </button>
          )}

          {step === "review" && (
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {submitting ? "Salvando…" : "Confirmar troca"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
