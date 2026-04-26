"use client";

import { useState, useEffect, useRef, FormEvent } from "react";

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
  slug: string;
  restaurant: { name: string; logoUrl: string | null };
  categories: Category[];
  featured: Item[];
  promoBanner?: Item | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Welcome Modal (popup) ─────────────────────────────────────────────────────
// Appears once per session. Optional — can be skipped freely.
// On submit: calls /api/qr/[slug]/identify and passes greeting back to parent.

type WelcomePhase = "idle" | "loading" | "done";

function WelcomeModal({
  slug,
  onClose,
}: {
  slug: string;
  onClose: (greeting: string | null) => void;
}) {
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<WelcomePhase>("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim() || phase === "loading") return;
    setPhase("loading");
    try {
      const res = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: name.trim() }),
      });
      const data: { found: boolean; name?: string } = await res.json();
      const firstName = data.name ?? name.trim().split(/\s+/)[0];
      onClose(firstName ? `Olá, ${firstName}! 👋` : "Bem-vindo! 👋");
    } catch {
      onClose(name.trim() ? `Olá, ${name.trim().split(/\s+/)[0]}! 👋` : "Bem-vindo! 👋");
    }
  }

  const canSubmit = phone.trim().length >= 8 && phase !== "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* Orange accent bar */}
        <div className="mx-6 mt-5 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-400 px-5 py-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Bem-vindo!</p>
          <p className="mt-0.5 text-base font-bold leading-snug">
            Antes de ver o cardápio,<br />se apresente 😊
          </p>
        </div>

        <div className="px-6 pb-7 pt-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                Seu nome
              </label>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="words"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
                disabled={phase === "loading"}
                style={{ fontSize: "16px" }}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                Seu WhatsApp
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                disabled={phase === "loading"}
                style={{ fontSize: "16px" }}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50"
            >
              {phase === "loading" ? "Verificando…" : "Ver o cardápio →"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => onClose(null)}
            className="mt-3 w-full py-2 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            Pular identificação
          </button>
        </div>
      </div>
    </div>
  );
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
    <div className="fixed inset-0 z-50 bg-white flex flex-col sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm">
      {/* Desktop: centered card */}
      <div
        className="w-full h-full flex flex-col sm:max-w-md sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:overflow-hidden sm:shadow-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image — square, full width, flush to top */}
        <div className="relative w-full aspect-square shrink-0">
          {item.imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-orange-50 flex items-center justify-center text-8xl">
              🍽️
            </div>
          )}

          {/* Close button — top left */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            aria-label="Fechar"
          >
            ←
          </button>
        </div>

        {/* Body — scrolls if content is long */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-5 pb-2 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-bold text-gray-900 leading-tight">
                {item.name}
              </h3>
              <span className="shrink-0 text-xl font-bold text-orange-500">
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
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white hover:bg-orange-600 transition-colors shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Promo Banner ─────────────────────────────────────────────────────────────

function PromoBanner({
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
      className="relative w-full rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-52 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-52 bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-7xl">
          🍽️
        </div>
      )}
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      {/* Text */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 text-left">
        <span className="mb-1.5 inline-block rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Promoção do dia
        </span>
        <p className="text-lg font-bold text-white leading-tight">{item.name}</p>
        <p className="mt-0.5 text-sm font-bold text-orange-300">
          R$&nbsp;{formatPrice(item.price)}
        </p>
      </div>
    </button>
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
      className="snap-start shrink-0 w-40 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-orange-100 transition-all"
    >
      <div className="h-36 bg-gray-100 overflow-hidden">
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
        <div className="flex gap-4 p-4">
          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[160px]">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-base font-semibold text-gray-900 leading-tight">
                  {item.name}
                </p>
                {isFirst && (
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                    Mais pedido
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-2 text-sm text-gray-500 line-clamp-3 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>

            <div className="mt-4">
              <span className="text-lg font-bold text-orange-500">
                R$&nbsp;{formatPrice(item.price)}
              </span>
            </div>
          </div>

          {/* Thumbnail */}
          <div className="shrink-0 w-40 h-40 rounded-xl overflow-hidden bg-gray-100">
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

// ── Static Placeholder Banner ─────────────────────────────────────────────────

function PlaceholderBanner() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-5">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-5 py-6 shadow-sm">
        <p className="text-xl font-bold text-white leading-snug">🔥 Combo do dia</p>
        <p className="mt-1 text-sm text-orange-100">Pizza + bebida com desconto especial</p>
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-30">🍕</span>
      </div>
    </div>
  );
}

// ── Main Client Component ─────────────────────────────────────────────────────

export function QRMenuClient({ slug, restaurant, categories, featured, promoBanner }: Props) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );
  const [greeting, setGreeting] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(false);

  const navRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Show welcome modal once per session
  useEffect(() => {
    const key = `qr-welcome-seen-${slug}`;
    if (!sessionStorage.getItem(key)) {
      setShowWelcome(true);
    }
  }, [slug]);

  function handleWelcomeClose(g: string | null) {
    setGreeting(g);
    setShowWelcome(false);
    sessionStorage.setItem(`qr-welcome-seen-${slug}`, "1");
  }

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
      {showWelcome && (
        <WelcomeModal slug={slug} onClose={handleWelcomeClose} />
      )}

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

          {/* Greeting chip — shown after welcome modal resolves */}
          {greeting && (
            <div className="mx-auto max-w-2xl px-4 pb-3">
              <div className="flex items-center justify-between rounded-full bg-orange-50 border border-orange-100 px-4 py-2.5">
                <span className="text-sm font-semibold text-orange-700">{greeting}</span>
                <button
                  type="button"
                  onClick={() => setGreeting(null)}
                  className="ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] text-orange-500 hover:bg-orange-200 transition-colors"
                  aria-label="Fechar saudação"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Static promo banner */}
          <PlaceholderBanner />

          {/* DB-driven promo banner */}
          {promoBanner && (
            <div className="mx-auto max-w-2xl px-4 pb-5">
              <PromoBanner
                item={promoBanner}
                onClick={() => setSelectedItem(promoBanner)}
              />
            </div>
          )}

          {/* Featured carousel */}
          {featured.length > 0 && (
            <div className="mx-auto max-w-2xl px-4 pb-6">
              <p className="mb-3 text-sm font-bold text-gray-700">
                ⭐ Mais pedidos
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
        </div>

        {/* ── STICKY CATEGORY NAV ───────────────────────────────── */}
        {categories.length > 1 && (
          <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
            <div
              ref={navRef}
              className="mx-auto max-w-2xl flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide"
            >
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-cat={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-3 text-base font-semibold min-h-[44px] transition-colors ${
                    activeCategory === cat.id
                      ? "bg-green-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
                <div className="-mx-4 mb-6 bg-orange-500 px-4 py-3.5">
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
