"use client";

/**
 * CategorySections — as seções de produtos do cardápio white-label: cabeçalho
 * de categoria (faixa na cor da marca, texto branco uppercase) + lista de
 * ProductCard grandes, e o estado vazio quando não há categorias.
 *
 * Movido verbatim de src/app/qr/[slug]/QRMenuClient.tsx.
 */

import { ProductCard } from "./cards";
import type { MenuDisplayCategory, MenuDisplayItem } from "./types";

export function CategorySections({
  categories,
  onSelectItem,
}: {
  categories: MenuDisplayCategory[];
  onSelectItem: (item: MenuDisplayItem) => void;
}) {
  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400 text-sm">
        <span className="mb-3 text-4xl">🍽️</span>
        <p>Cardápio não disponível no momento.</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 space-y-10">
      {categories.map((cat) => (
        <section key={cat.id} id={`cat-${cat.id}`}>
          <div className="-mx-4 mb-6 px-4 py-3.5" style={{ backgroundColor: 'var(--brand-primary)' }}>
            <h2 className="text-lg font-extrabold uppercase tracking-widest text-white">
              {cat.name}
            </h2>
          </div>
          <ul className="space-y-5">
            {cat.items.map((item, idx) => (
              <ProductCard
                key={item.id}
                item={item}
                isFirst={idx === 0}
                onClick={() => onSelectItem(item)}
              />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
