"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { buildWhatsAppUrl, buildInstagramUrl, buildTikTokUrl } from "@/lib/social";

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type Extra = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  ingredients: string | null;
  servingSize: number | null;
  portionInfo: string | null;
  variants: Variant[];
  extras: Extra[];
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  items: Item[];
};

type Props = {
  slug: string;
  restaurant: { name: string; logoUrl: string | null };
  categories: Category[];
  featured: Item[];
  promoBanner?: Item | null;
  brandPrimaryColor?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  restaurantPhone?: string | null;
  googleReviewUrl?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

// ── WelcomeModal ──────────────────────────────────────────────────────────────
// Phone-first identification: step 1 = WhatsApp only, step 2 = name (new customers only).
// Appears once per session. Can be skipped.

function WelcomeModal({
  slug,
  onClose,
}: {
  slug: string;
  onClose: (identity: { name: string | null; displayPhone: string | null; customerId?: string } | null) => void;
}) {
  const [step,           setStep]           = useState<"phone" | "name">("phone");
  const [phoneInput,     setPhoneInput]     = useState("");
  const [nameInput,      setNameInput]      = useState("");
  const [collectedPhone, setCollectedPhone] = useState("");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    const ph = phoneInput.trim();
    if (ph.replace(/\D/g, "").length < 10) { setError("Informe um WhatsApp válido."); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ph }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const displayPh = fmtPhone(ph);
      if (data.found && data.name) {
        // Existing customer — no name needed
        try {
          sessionStorage.setItem(`foocci-customer-${slug}`,
            JSON.stringify({ phone: ph, name: data.name, customerId: data.customerId, displayPhone: displayPh }));
        } catch { /* ignore */ }
        onClose({ name: data.name, displayPhone: displayPh, customerId: data.customerId });
      } else {
        setCollectedPhone(ph);
        setStep("name");
      }
    } catch { setError("Erro ao verificar. Tente novamente."); }
    finally    { setLoading(false); }
  }

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (name.length < 2) { setError("Informe seu nome."); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: collectedPhone, name }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const firstName  = data.name ?? name.split(/\s+/)[0]!;
      const displayPh  = fmtPhone(collectedPhone);
      try {
        sessionStorage.setItem(`foocci-customer-${slug}`,
          JSON.stringify({ phone: collectedPhone, name: firstName, customerId: data.customerId, displayPhone: displayPh }));
      } catch { /* ignore */ }
      onClose({ name: firstName, displayPhone: displayPh, customerId: data.customerId });
    } catch { setError("Erro ao salvar. Tente novamente."); }
    finally    { setLoading(false); }
  }

  const inputCls = "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60";
  const btnCls   = "w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        <div className="mx-6 mt-5 rounded-2xl px-5 py-4 text-white shadow-sm" style={{ backgroundColor: "var(--brand-primary)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            {step === "phone" ? "Identificação rápida" : "Novo cadastro"}
          </p>
          <p className="mt-0.5 text-base font-bold leading-snug">
            {step === "phone"
              ? "Pra personalizar seu atendimento, informe seu WhatsApp. 📱"
              : "Como podemos te chamar? 😊"}
          </p>
        </div>

        <div className="px-6 pb-7 pt-5">
          {step === "phone" ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Seu WhatsApp</label>
                <input type="tel" inputMode="numeric" autoComplete="tel"
                  value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setError(null); }}
                  placeholder="(11) 99999-9999" disabled={loading} style={{ fontSize: "16px" }} className={inputCls} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={!phoneInput.trim() || loading} className={btnCls}
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {loading ? "Verificando…" : "Continuar →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleNameSubmit} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Seu nome</label>
                <input type="text" inputMode="text" autoCapitalize="words" autoFocus
                  value={nameInput} onChange={(e) => { setNameInput(e.target.value); setError(null); }}
                  placeholder="Ex: João Silva" disabled={loading} style={{ fontSize: "16px" }} className={inputCls} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={!nameInput.trim() || loading} className={btnCls}
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {loading ? "Salvando…" : "Continuar →"}
              </button>
            </form>
          )}
          <button type="button" onClick={() => onClose(null)}
            className="mt-3 w-full py-2 text-xs text-gray-400 transition-colors hover:text-gray-600">
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
        className="w-full h-full flex flex-col sm:max-w-md sm:h-[92vh] sm:rounded-2xl sm:overflow-hidden sm:shadow-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image — square-ish, capped at 50vh so content stays visible */}
        <div className="relative w-full shrink-0 bg-white overflow-hidden" style={{ aspectRatio: "1 / 1", maxHeight: "50vh" }}>
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-contain"
              loading="lazy"
            />
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
              <span className="shrink-0 text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>
                R$&nbsp;{formatPrice(item.price)}
              </span>
            </div>

            {item.description && (
              <p className="text-sm text-gray-600 leading-relaxed">
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

            {item.extras.length > 0 && (
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
                        {e.quantity > 1 && (
                          <span className="ml-1 text-xs text-gray-400">×{e.quantity}</span>
                        )}
                      </span>
                      <span className="text-sm font-bold text-gray-900">
                        {e.price === 0 ? "Grátis" : `+ R$ ${formatPrice(e.price)}`}
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
            className="w-full rounded-2xl py-4 text-base font-bold text-white hover:opacity-90 transition-opacity shadow-sm"
            style={{ backgroundColor: 'var(--brand-primary)' }}
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
        <div className="w-full h-52 flex items-center justify-center text-7xl" style={{ backgroundColor: 'var(--brand-primary)' }}>
          🍽️
        </div>
      )}
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      {/* Text */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 text-left">
        <span className="mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
          Promoção do dia
        </span>
        <p className="text-lg font-bold text-white leading-tight">{item.name}</p>
        <p className="mt-0.5 text-sm font-bold text-white/80">
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
        <p className="mt-1 text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>
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
              <span className="text-lg font-bold" style={{ color: 'var(--brand-primary)' }}>
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
      <div className="relative overflow-hidden rounded-2xl px-5 py-6 shadow-sm" style={{ backgroundColor: 'var(--brand-primary)' }}>
        <p className="text-xl font-bold text-white leading-snug">🔥 Combo do dia</p>
        <p className="mt-1 text-sm text-orange-100">Pizza + bebida com desconto especial</p>
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-30">🍕</span>
      </div>
    </div>
  );
}

// ── Main Client Component ─────────────────────────────────────────────────────

export function QRMenuClient({ slug, restaurant, categories, featured, promoBanner, brandPrimaryColor, instagramUrl, tiktokUrl, restaurantPhone, googleReviewUrl }: Props) {
  const pc = brandPrimaryColor || '#f97316';
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.id ?? ""
  );
  const [showWelcome, setShowWelcome] = useState<boolean>(false);

  // ── Identity state ─────────────────────────────────────────────
  const [identifiedName,  setIdentifiedName]  = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(`foocci-customer-${slug}`);
      if (raw) return (JSON.parse(raw) as { name?: string }).name ?? null;
    } catch { /* ignore */ }
    return null;
  });
  const [identifiedPhone, setIdentifiedPhone] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(`foocci-customer-${slug}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { phone?: string; displayPhone?: string };
        return parsed.displayPhone ?? (parsed.phone ? fmtPhone(parsed.phone) : null);
      }
    } catch { /* ignore */ }
    return null;
  });

  const navRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Show welcome modal once per session (skip if already identified)
  useEffect(() => {
    const seen = sessionStorage.getItem(`qr-welcome-seen-${slug}`);
    const identified = !!sessionStorage.getItem(`foocci-customer-${slug}`);
    if (!seen && !identified) setShowWelcome(true);
  }, [slug]);

  function handleWelcomeClose(identity: { name: string | null; displayPhone: string | null; customerId?: string } | null) {
    if (identity?.name) { setIdentifiedName(identity.name); setIdentifiedPhone(identity.displayPhone); }
    setShowWelcome(false);
    sessionStorage.setItem(`qr-welcome-seen-${slug}`, "1");
  }

  function handleResetIdentity() {
    try { sessionStorage.removeItem(`foocci-customer-${slug}`); } catch { /* ignore */ }
    try { sessionStorage.removeItem(`qr-welcome-seen-${slug}`);  } catch { /* ignore */ }
    setIdentifiedName(null);
    setIdentifiedPhone(null);
    setShowWelcome(true);
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

      <div className="min-h-screen bg-[#fafaf9]" style={{ '--brand-primary': pc } as React.CSSProperties}>

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

            {/* Social / contact icons */}
            {(buildInstagramUrl(instagramUrl) || buildTikTokUrl(tiktokUrl) || buildWhatsAppUrl(restaurantPhone)) && (
              <div className="mt-3 flex items-center justify-center gap-3">
                {buildInstagramUrl(instagramUrl) && (
                  <a
                    href={buildInstagramUrl(instagramUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir Instagram"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-pink-100 hover:text-pink-600 active:scale-90"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                  </a>
                )}
                {buildTikTokUrl(tiktokUrl) && (
                  <a
                    href={buildTikTokUrl(tiktokUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir TikTok"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-900 hover:text-white active:scale-90"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34v-7a8.16 8.16 0 0 0 4.77 1.52V6.37a4.85 4.85 0 0 1-1-.32z"/>
                    </svg>
                  </a>
                )}
                {buildWhatsAppUrl(restaurantPhone) && (
                  <a
                    href={buildWhatsAppUrl(restaurantPhone)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Falar no WhatsApp"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-green-100 hover:text-green-600 active:scale-90"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                    </svg>
                  </a>
                )}
              </div>
            )}

            {/* Google Review button — only when URL is configured */}
            {googleReviewUrl && (
              <div className="mt-4">
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Avaliar restaurante no Google"
                  className="inline-flex items-center gap-2 rounded-full border border-yellow-300 bg-yellow-50 px-5 py-2.5 text-sm font-semibold text-yellow-800 shadow-sm transition hover:bg-yellow-100 active:scale-95"
                >
                  <span aria-hidden="true">⭐</span>
                  Avaliar restaurante
                </a>
              </div>
            )}
          </div>

          {/* Identity strip — shown after identification */}
          {(identifiedName || identifiedPhone) && (
            <div className="mx-auto max-w-2xl px-4 pb-3">
              <div className="flex items-center justify-between rounded-full bg-orange-50 border border-orange-100 px-4 py-2.5">
                <span className="text-sm font-semibold text-orange-700">
                  {identifiedName ? `Olá, ${identifiedName}` : "Olá"}
                  {identifiedPhone && <span className="font-normal text-orange-500"> · {identifiedPhone}</span>}
                </span>
                <button
                  type="button"
                  onClick={handleResetIdentity}
                  className="ml-3 shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-medium text-orange-600 hover:bg-orange-200 transition-colors"
                  aria-label="Trocar identificação"
                >
                  Trocar
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
                      ? "text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  style={activeCategory === cat.id ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── CATEGORY DESCRIPTION STRIP ───────────────────────── */}
        {categories.find((c) => c.id === activeCategory)?.description && (
          <div className="bg-white border-b border-gray-100">
            <div className="mx-auto max-w-2xl px-4 py-2">
              <p className="text-[11px] leading-snug text-gray-500">
                {categories.find((c) => c.id === activeCategory)!.description}
              </p>
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
