"use client";

/**
 * CategoryNav — a navegação de categorias FIXA EMBAIXO do cardápio white-label
 * (chips com scroll horizontal + categoria ativa na cor da marca), e a faixa de
 * descrição da categoria ativa.
 *
 * Movido verbatim de src/app/qr/[slug]/QRMenuClient.tsx. Única extensão: o
 * `topSlot` — a Loja encaixa a barra de carrinho DENTRO do mesmo contêiner fixo,
 * acima dos chips, resolvendo o conflito de dois elementos fixos no rodapé sem
 * mágica de offsets. No QR o slot fica vazio e o markup é idêntico ao original.
 */

import { RefObject } from "react";
import type { MenuDisplayCategory } from "./types";

export function CategoryNav({
  navRef,
  categories,
  activeCategory,
  onSelect,
  topSlot,
}: {
  navRef: RefObject<HTMLDivElement>;
  categories: MenuDisplayCategory[];
  activeCategory: string;
  onSelect: (catId: string) => void;
  topSlot?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      {topSlot}
      {categories.length > 1 && (
        <div
          ref={navRef}
          className="mx-auto max-w-2xl flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              data-cat={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-3 text-base font-semibold min-h-[44px] transition-colors ${
                activeCategory === cat.id
                  ? "text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              style={activeCategory === cat.id ? { backgroundColor: 'var(--brand-primary)' } : undefined}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Faixa com a descrição da categoria ativa — logo abaixo do hero. */
export function CategoryDescriptionStrip({
  categories,
  activeCategory,
}: {
  categories: MenuDisplayCategory[];
  activeCategory: string;
}) {
  const description = categories.find((c) => c.id === activeCategory)?.description;
  if (!description) return null;
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="mx-auto max-w-2xl px-4 py-2">
        <p className="text-[11px] leading-snug text-gray-500">
          {description}
        </p>
      </div>
    </div>
  );
}
