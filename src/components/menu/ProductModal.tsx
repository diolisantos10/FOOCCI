"use client";

/**
 * ProductModal — a ficha do produto do cardápio white-label: fullscreen no
 * celular, card centrado no desktop; imagem quadrada, descrição, serve X
 * pessoas, porção, ingredientes, variantes e adicionais.
 *
 * Fonte visual: src/app/qr/[slug]/QRMenuClient.tsx (movido verbatim).
 * Dois modos sobre a MESMA casca:
 *   - sem `commerce` (QR da mesa): variantes/adicionais são informativos e o
 *     rodapé é o botão "Fechar" — pixel-idêntico ao QR original;
 *   - com `commerce` (Loja): variantes viram SELECIONÁVEIS (escolher define o
 *     preço), grupos de opções e adicionais pagos ganham seletores, e o rodapé
 *     vira observação + quantidade + "Adicionar · R$ X".
 *
 * As convenções de carrinho ESPELHAM o PedidoClient (handleItemAdd /
 * handleVariantAdd / handleCustomizedAdd) — mesmo formato que o finalize
 * (/api/pedido/[slug]/finalize, cartItemSchema) já aceita. Nada de formato novo.
 */

import { useEffect, useState } from "react";
import { formatPrice } from "./format";
import { ImageCarousel } from "./ImageCarousel";
import { menuItemPhotos } from "./photos";
import type {
  CartLine,
  MenuDisplayItem,
  MenuOptionGroup,
  SelectedExtra,
  SelectedOption,
} from "./types";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function ProductModal({
  item,
  onClose,
  commerce,
}: {
  item: MenuDisplayItem;
  onClose: () => void;
  commerce?: { onAdd: (line: CartLine) => void };
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /* ── Estado do modo compra ─────────────────────────────────────────────── */
  // Mesmas convenções do PedidoClient: variante válida tem preço e nome;
  // personalização (opções/adicionais) só existe quando o item NÃO tem variantes.
  const validVariants = item.variants.filter((v) => v.price > 0 && v.name.trim());
  const variantMode   = !!commerce && validVariants.length > 0;
  const optionGroups  = item.optionGroups ?? [];
  const paidExtras    = item.extras.filter((e) => e.price > 0);
  const customizable  = !!commerce && !variantMode && (optionGroups.length > 0 || paidExtras.length > 0);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [optionQtys, setOptionQtys] = useState<Record<string, number>>({});
  const [extraQtys, setExtraQtys]   = useState<Record<string, number>>({});
  const [notes, setNotes]           = useState("");
  const [qty, setQty]               = useState(1);
  const [errors, setErrors]         = useState<string[]>([]);

  const selectedVariant = validVariants.find((v) => v.id === selectedVariantId) ?? null;

  // Grupo de "remoções": opcional e 100% grátis → vira checkbox (PedidoClient).
  function isRemovalGroup(group: MenuOptionGroup) {
    return !group.required && group.options.every((o) => o.price === 0);
  }

  function groupTotal(group: MenuOptionGroup) {
    return group.options.reduce((s, o) => s + (optionQtys[o.id] ?? 0), 0);
  }

  function changeOptionQty(group: MenuOptionGroup, optionId: string, delta: number) {
    setErrors([]);
    setOptionQtys((prev) => {
      const cur    = prev[optionId] ?? 0;
      const newQty = Math.max(0, cur + delta);
      const total  = groupTotal(group) - cur + newQty;
      if (delta > 0 && group.maxSelect > 0 && total > group.maxSelect) return prev;
      return { ...prev, [optionId]: newQty };
    });
  }

  function toggleRemovalOption(group: MenuOptionGroup, optionId: string) {
    setErrors([]);
    setOptionQtys((prev) => ({ ...prev, [optionId]: (prev[optionId] ?? 0) > 0 ? 0 : 1 }));
  }

  function changeExtraQty(extraId: string, delta: number) {
    setExtraQtys((prev) => ({ ...prev, [extraId]: Math.max(0, (prev[extraId] ?? 0) + delta) }));
  }

  const optionsExtra = optionGroups
    .flatMap((g) => g.options)
    .reduce((s, o) => s + (optionQtys[o.id] ?? 0) * o.price, 0);
  const extrasExtra = paidExtras.reduce((s, e) => s + (extraQtys[e.id] ?? 0) * e.price, 0);

  const baseUnit = item.promotion?.promotionalPrice ?? item.price;
  const unitPrice = variantMode
    ? (selectedVariant?.price ?? null)
    : baseUnit + optionsExtra + extrasExtra;

  function handleAdd() {
    if (!commerce) return;

    // Variante escolhida define o preço — espelha handleVariantAdd do PedidoClient.
    if (variantMode) {
      if (!selectedVariant) { setErrors(["Escolha uma opção para continuar."]); return; }
      const trimmed = notes.trim();
      commerce.onAdd({
        id:         trimmed ? `${item.id}_${selectedVariant.id}_c${uid()}` : `${item.id}_${selectedVariant.id}`,
        baseItemId: item.id,
        name:       `${item.name} — ${selectedVariant.name}`,
        price:      selectedVariant.price,
        qty,
        variantId:   selectedVariant.id,
        variantName: selectedVariant.name,
        ...(trimmed ? { notes: trimmed } : {}),
      });
      return;
    }

    // Personalização — espelha handleCustomizedAdd do PedidoClient.
    const errs: string[] = [];
    for (const group of optionGroups) {
      const total     = groupTotal(group);
      const minNeeded = group.required ? Math.max(group.minSelect, 1) : group.minSelect;
      if (total < minNeeded) {
        errs.push(`"${group.name}": selecione pelo menos ${minNeeded} opção`);
      }
    }
    if (errs.length > 0) { setErrors(errs); return; }

    const selectedOptions: SelectedOption[] = optionGroups.flatMap((group) =>
      group.options
        .filter((o) => (optionQtys[o.id] ?? 0) > 0)
        .map((o) => ({
          groupId:         group.id,
          groupName:       group.name,
          optionId:        o.id,
          optionName:      o.name,
          qty:             optionQtys[o.id]!,
          priceAdjustment: o.price,
        })),
    );
    const selectedExtras: SelectedExtra[] = paidExtras
      .filter((e) => (extraQtys[e.id] ?? 0) > 0)
      .map((e) => ({ extraId: e.id, name: e.name, unitPrice: e.price, qty: extraQtys[e.id]! }));

    const trimmed = notes.trim();
    const hasAny  = trimmed || selectedOptions.length > 0 || selectedExtras.length > 0;
    const finalUnit = baseUnit + optionsExtra + extrasExtra;

    if (!hasAny) {
      commerce.onAdd({ id: item.id, baseItemId: item.id, name: item.name, price: finalUnit, qty });
      return;
    }
    commerce.onAdd({
      id:         `${item.id}_c${uid()}`,
      baseItemId: item.id,
      name:       item.name,
      price:      finalUnit,
      qty,
      ...(trimmed ? { notes: trimmed } : {}),
      ...(selectedOptions.length > 0 ? { selectedOptions } : {}),
      ...(selectedExtras.length > 0 ? { selectedExtras } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm">
      {/* Desktop: centered card */}
      <div
        className="relative w-full h-full flex flex-col sm:max-w-md sm:h-[92vh] sm:rounded-2xl overflow-hidden sm:shadow-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — floats over the sheet, stays put while the content scrolls */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Fechar"
        >
          ←
        </button>

        {/* One natural scroll flow: image + details scroll together (image is NOT fixed) */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Image — square, center-cropped, capped at 50vh; part of the scrollable content.
              Com fotos extras (carouselEnabled) vira carrossel, e a CAPA é o
              primeiro slide: quem tocou no card tem de reencontrar a mesma foto
              aqui. A regra mora em `menuItemPhotos`, não neste JSX. */}
          <div className="relative w-full bg-gray-100 overflow-hidden" style={{ aspectRatio: "1 / 1", maxHeight: "50vh" }}>
            {(() => {
              const fotos = menuItemPhotos(item);
              if (fotos.length === 0) {
                return (
                  <div className="w-full h-full bg-orange-50 flex items-center justify-center text-8xl">
                    🍽️
                  </div>
                );
              }
              if (fotos.length === 1) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fotos[0]!}
                    alt={item.name}
                    className="w-full h-full object-cover object-center"
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                );
              }
              return <ImageCarousel images={fotos} alt={item.name} />;
            })()}
          </div>

          <div className="px-5 pt-5 pb-2 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-bold text-gray-900 leading-tight">
                {item.name}
              </h3>
              {item.promotion ? (
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-xl font-bold text-red-600">
                    R$&nbsp;{formatPrice(item.promotion.promotionalPrice)}
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    R$&nbsp;{formatPrice(item.price)}
                  </span>
                </div>
              ) : (
                <span className="shrink-0 text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>
                  R$&nbsp;{formatPrice(item.price)}
                </span>
              )}
            </div>

            {item.description && (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {item.description}
              </p>
            )}

            {(item.servingSize || item.portionInfo) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.servingSize && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    👥 Serve {item.servingSize === 4 ? "4+" : item.servingSize} {item.servingSize === 1 ? "pessoa" : "pessoas"}
                  </span>
                )}
                {item.portionInfo && (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    ⚖️ {item.portionInfo}
                  </span>
                )}
              </div>
            )}

            {item.ingredients && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ingredientes</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.ingredients}</p>
              </div>
            )}

            {/* ── Variantes ── */}
            {variantMode ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Escolha uma opção
                </p>
                <div className="space-y-1.5">
                  {validVariants.map((v) => {
                    const vImg     = v.imageUrl ?? item.imageUrl;
                    const selected = v.id === selectedVariantId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setErrors([]); setSelectedVariantId(v.id); }}
                        className="flex w-full items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5 border text-left transition-colors"
                        style={selected ? { borderColor: "var(--brand-primary)" } : { borderColor: "#f3f4f6" }}
                      >
                        <span
                          aria-hidden
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                          style={{ borderColor: selected ? "var(--brand-primary)" : "#d1d5db" }}
                        >
                          {selected && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--brand-primary)" }} />}
                        </span>
                        {vImg && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={vImg}
                            alt={v.name}
                            className="h-9 w-9 shrink-0 rounded-lg object-cover"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <span className="flex-1 text-sm text-gray-800">{v.name}</span>
                        <span className="text-sm font-bold text-gray-900">
                          R$&nbsp;{formatPrice(v.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : item.variants.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Variantes
                </p>
                <div className="space-y-1.5">
                  {item.variants.map((v) => {
                    // Variant photo when set, else fall back to the product photo.
                    const vImg = v.imageUrl ?? item.imageUrl;
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5 border border-gray-100"
                      >
                        {vImg && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={vImg}
                            alt={v.name}
                            className="h-9 w-9 shrink-0 rounded-lg object-cover"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <span className="flex-1 text-sm text-gray-800">{v.name}</span>
                        <span className="text-sm font-bold text-gray-900">
                          R$&nbsp;{formatPrice(v.price)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* ── Grupos de opções (só modo compra sem variantes) ── */}
            {customizable && optionGroups.map((group) => (
              <div key={group.id} className="space-y-2 pt-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.name}
                  </p>
                  <span className="text-[10px] text-gray-400">
                    {group.required ? "Obrigatório" : "Opcional"}
                    {group.maxSelect > 0 ? ` · até ${group.maxSelect}` : ""}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.options.map((o) => {
                    const q = optionQtys[o.id] ?? 0;
                    if (isRemovalGroup(group)) {
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleRemovalOption(group, o.id)}
                          className="flex w-full items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5 border text-left transition-colors"
                          style={q > 0 ? { borderColor: "var(--brand-primary)" } : { borderColor: "#f3f4f6" }}
                        >
                          <span
                            aria-hidden
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-bold text-white"
                            style={q > 0
                              ? { borderColor: "var(--brand-primary)", backgroundColor: "var(--brand-primary)" }
                              : { borderColor: "#d1d5db" }}
                          >
                            {q > 0 ? "✓" : ""}
                          </span>
                          <span className="flex-1 text-sm text-gray-800">{o.name}</span>
                        </button>
                      );
                    }
                    return (
                      <div
                        key={o.id}
                        className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5 border transition-colors"
                        style={q > 0 ? { borderColor: "var(--brand-primary)" } : { borderColor: "#f3f4f6" }}
                      >
                        <span className="flex-1 text-sm text-gray-800">{o.name}</span>
                        {o.price > 0 && (
                          <span className="text-sm font-bold text-gray-900">
                            + R$&nbsp;{formatPrice(o.price)}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`tirar ${o.name}`}
                            onClick={() => changeOptionQty(group, o.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-gray-200 font-bold text-gray-600"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-semibold text-gray-900">{q}</span>
                          <button
                            type="button"
                            aria-label={`mais ${o.name}`}
                            onClick={() => changeOptionQty(group, o.id, +1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-gray-200 font-bold text-gray-600"
                          >
                            +
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* ── Adicionais ── */}
            {commerce && customizable && item.extras.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Adicionais
                </p>
                <div className="space-y-1.5">
                  {paidExtras.map((e) => {
                    const q = extraQtys[e.id] ?? 0;
                    return (
                      <div
                        key={e.id}
                        className="flex items-center gap-2.5 rounded-xl bg-orange-50 px-3 py-2.5 border transition-colors"
                        style={q > 0 ? { borderColor: "var(--brand-primary)" } : { borderColor: "#ffedd5" }}
                      >
                        <span className="flex-1 text-sm text-gray-800">{e.name}</span>
                        <span className="text-sm font-bold text-gray-900">
                          + R$&nbsp;{formatPrice(e.price)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`tirar ${e.name}`}
                            onClick={() => changeExtraQty(e.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-orange-100 font-bold text-gray-600"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-semibold text-gray-900">{q}</span>
                          <button
                            type="button"
                            aria-label={`mais ${e.name}`}
                            onClick={() => changeExtraQty(e.id, +1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-orange-100 font-bold text-gray-600"
                          >
                            +
                          </button>
                        </span>
                      </div>
                    );
                  })}
                  {item.extras.filter((e) => e.price === 0).map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-xl bg-orange-50 px-3 py-2.5 border border-orange-100"
                    >
                      <span className="text-sm text-gray-800">
                        {e.name}
                        {(e.quantity ?? 1) > 1 && (
                          <span className="ml-1 text-xs text-gray-400">×{e.quantity}</span>
                        )}
                      </span>
                      <span className="text-sm font-bold text-gray-900">Grátis</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : item.extras.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Adicionais
                </p>
                <div className="space-y-1.5">
                  {item.extras.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-xl bg-orange-50 px-3 py-2.5 border border-orange-100"
                    >
                      <span className="text-sm text-gray-800">
                        {e.name}
                        {(e.quantity ?? 1) > 1 && (
                          <span className="ml-1 text-xs text-gray-400">×{e.quantity}</span>
                        )}
                      </span>
                      <span className="text-sm font-bold text-gray-900">
                        {e.price === 0 ? "Grátis" : `+ R$ ${formatPrice(e.price)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        {commerce ? (
          <div className="shrink-0 px-5 py-4 border-t border-gray-100">
            {errors.length > 0 && (
              <div className="mb-3 rounded-xl bg-red-50 px-3 py-2">
                {errors.map((err) => (
                  <p key={err} className="text-xs text-red-600">{err}</p>
                ))}
              </div>
            )}
            <label className="sr-only" htmlFor="produto-observacao">Alguma observação?</label>
            <textarea
              id="produto-observacao"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Alguma observação? Ex.: sem cebola…"
              maxLength={300}
              rows={1}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
            <div className="mt-3 flex items-center gap-3">
              <div className="flex shrink-0 items-center rounded-2xl border border-gray-200">
                <button
                  type="button"
                  aria-label="menos um"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="px-4 py-3.5 text-lg font-bold text-gray-600"
                >
                  −
                </button>
                <span className="w-7 text-center text-base font-bold text-gray-900">{qty}</span>
                <button
                  type="button"
                  aria-label="mais um"
                  onClick={() => setQty((q) => q + 1)}
                  className="px-4 py-3.5 text-lg font-bold text-gray-600"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={variantMode && !selectedVariant}
                className="flex-1 rounded-2xl py-4 text-base font-bold text-white hover:opacity-90 transition-opacity shadow-sm disabled:opacity-40"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {unitPrice == null ? "Escolha uma opção" : `Adicionar · R$ ${formatPrice(unitPrice * qty)}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 px-5 py-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl py-4 text-base font-bold text-white hover:opacity-90 transition-opacity shadow-sm"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
