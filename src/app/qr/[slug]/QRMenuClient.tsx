"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  variants: Variant[];
};

type Category = {
  id: string;
  name: string;
  items: Item[];
};

type Props = {
  restaurant: { name: string; logoUrl: string | null };
  categories: Category[];
  featured: Item[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Product Modal ─────────────────────────────────────────────────────────────

function ProductModal({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel — bottom sheet on mobile, centered card on desktop */}
      <div
        className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        {item.imageUrl ? (
          <div className="relative h-56 sm:h-64 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        ) : (
          <div className="h-32 shrink-0 bg-orange-50 flex items-center justify-center text-6xl">
            🍽️
          </div>
        )}

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-white hover:bg-black/60 transition-colors"
          aria-label="Fechar"
        >
          ✕
        </button>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900 leading-tight">
              {item.name}
            </h3>
            <span className="shrink-0 text-lg font-bold text-orange-500">
              R$&nbsp;{formatPrice(item.price)}
            </span>
          </div>

          {item.description && (
            <p className="text-sm text-gray-600 leading-relaxed">
              {item.description}
            </p>
          )}

          {item.variants.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Variantes
              </p>
              <div className="space-y-1.5">
                {item.variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 border border-gray-100"
                  >
                    <span className="text-sm text-gray-800">{v.name}</span>
                    <span className="text-sm font-bold text-gray-900">
                      R$&nbsp;{formatPrice(v.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Featured Carousel Card ────────────────────────────────────────────────────

function FeaturedCard({
  item,
  onClick,
}: {
  item: Item;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="snap-start shrink-0 w-36 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-orange-100 transition-all"
    >
      <div className="h-28 bg-gray-100 overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            🍽️
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
          {item.name}
        </p>
        <p className="mt-1 text-xs font-bold text-orange-500">
          R$&nbsp;{formatPrice(item.price)}
        </p>
      </div>
    </button>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({
  item,
  isFirst,
  onClick,
}: {
  item: Item;
  isFirst: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-100 transition-all overflow-hidden"
      >
        <div className="flex gap-3 p-3">
          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[96px]">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {item.name}
                </p>
                {isFirst && (
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                    Mais pedido
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-base font-bold text-orange-500">
                R$&nbsp;{formatPrice(item.price)}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white shadow-sm">
                +
              </span>
            </div>
          </div>

          {/* Thumbnail */}
          <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-gray-100">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">
                🍽️
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

// ── Main Client Component ─────────────────────────────────────────────────────

export function QRMenuClient({ restaurant, categories, featured }: Props) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );

  const navRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: update active category chip as user scrolls
  useEffect(() => {
    if (categories.length === 0) return;

    const observers: IntersectionObserver[] = [];

    categories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) setActiveCategory(cat.id);
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  // Scroll active chip into view
  useEffect(() => {
    if (!navRef.current || !activeCategory) return;
    const chip = navRef.current.querySelector(
      `[data-cat="${activeCategory}"]`
    ) as HTMLElement | null;
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCategory]);

  function scrollToCategory(catId: string) {
    const el = document.getElementById(`cat-${catId}`);
    if (!el) return;
    const navHeight = navRef.current?.offsetHeight ?? 52;
    const top = el.getBoundingClientRect().top + window.scrollY - navHeight - 8;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <>
      {selectedItem && (
        <ProductModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      <div className="min-h-screen bg-[#fafaf9]">

        {/* ── HERO ──────────────────────────────────────────────── */}
        <div ref={heroRef} id="hero" className="bg-white border-b border-gray-100">
          <div className="mx-auto max-w-2xl px-4 pt-8 pb-5 text-center">
            {restaurant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={restaurant.logoUrl}
                alt={restaurant.name}
                className="mx-auto mb-4 h-20 w-20 rounded-full object-cover ring-4 ring-orange-50 shadow"
                loading="lazy"
              />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
            <p className="mt-1 text-xs text-gray-400">Cardápio digital</p>
          </div>

          {/* Featured carousel */}
          {featured.length > 0 && (
            <div className="mx-auto max-w-2xl px-4 pb-5">
              <p className="mb-3 text-sm font-bold text-gray-700">
                ⭐ Os mais pedidos hoje
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
                {featured.map((item) => (
                  <FeaturedCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedItem(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Quick action buttons */}
          <div className="mx-auto max-w-2xl px-4 pb-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => categories[0] && scrollToCategory(categories[0].id)}
              className="rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-600 transition-colors"
            >
              Ver cardápio
            </button>
            <button
              type="button"
              onClick={() =>
                heroRef.current?.scrollIntoView({ behavior: "smooth" })
              }
              className="rounded-full border border-orange-200 bg-orange-50 px-5 py-2 text-sm font-bold text-orange-600 hover:bg-orange-100 transition-colors"
            >
              Mais pedidos
            </button>
            <button
              type="button"
              onClick={() => {
                const last = categories[categories.length - 1];
                if (last) scrollToCategory(last.id);
              }}
              className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Promoções
            </button>
          </div>
        </div>

        {/* ── STICKY CATEGORY NAV ───────────────────────────────── */}
        {categories.length > 1 && (
          <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
            <div
              ref={navRef}
              className="mx-auto max-w-2xl flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide"
            >
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-cat={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                    activeCategory === cat.id
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PRODUCT SECTIONS ──────────────────────────────────── */}
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 text-sm">
            <span className="mb-3 text-4xl">🍽️</span>
            <p>Cardápio não disponível no momento.</p>
          </div>
        ) : (
          <main className="mx-auto max-w-2xl px-4 py-6 space-y-10">
            {categories.map((cat) => (
              <section key={cat.id} id={`cat-${cat.id}`}>
                <h2 className="mb-4 border-b border-gray-200 pb-2 text-base font-bold text-gray-900">
                  {cat.name}
                </h2>
                <ul className="space-y-3">
                  {cat.items.map((item, idx) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      isFirst={idx === 0}
                      onClick={() => setSelectedItem(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </main>
        )}

        <footer className="py-8 text-center text-xs text-gray-400">
          Cardápio gerado por Foocci
        </footer>
      </div>
    </>
  );
}
