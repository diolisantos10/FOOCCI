"use client";

/**
 * QRMenuClient — o cardápio da mesa (leitura, sem compra).
 *
 * O visual vive em src/components/menu/* — módulo compartilhado com a Loja sem
 * IA (/pedido/[slug], LojaClient), extraído DESTE arquivo em 04/08 para que os
 * dois cardápios nunca divirjam. Este cliente só orquestra: identidade por
 * telefone, categoria ativa (IntersectionObserver) e o modal de produto em modo
 * leitura (sem `commerce`).
 */

import React, { useState, useEffect, useRef } from "react";
import {
  CategoryDescriptionStrip,
  CategoryNav,
  CategorySections,
  MenuHero,
  ProductModal,
  WelcomeModal,
  fmtPhone,
  type CustomerIdentity,
  type MenuDisplayCategory,
  type MenuDisplayItem,
  type PromotionBannerData,
  escurecerCor,
  COR_PADRAO_DA_LOJA,
} from "@/components/menu";

type Props = {
  slug: string;
  restaurant: { name: string; logoUrl: string | null };
  categories: MenuDisplayCategory[];
  featured: MenuDisplayItem[];
  promotedItems?: MenuDisplayItem[];
  promoBanner?: MenuDisplayItem | null;
  promotionBanners?: PromotionBannerData[];
  /** Capa do cardápio (RestaurantBrandConfig.coverImageUrl). Vazio é normal. */
  coverImageUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  restaurantPhone?: string | null;
  googleReviewUrl?: string | null;
};

export function QRMenuClient({ slug, restaurant, categories, featured, promotedItems = [], promoBanner, promotionBanners = [], coverImageUrl, brandPrimaryColor, brandSecondaryColor, instagramUrl, tiktokUrl, restaurantPhone, googleReviewUrl }: Props) {
  const pc = brandPrimaryColor || COR_PADRAO_DA_LOJA;
  // A secundária só era usada pela Loja; a capa precisa dela para o degradê do
  // estado vazio. Sem cor secundária definida, ela é DERIVADA da primária —
  // usar a primária nas duas pontas dá um bloco chapado de tinta, que é
  // exatamente o que a capa vazia não pode ser.
  const sc = brandSecondaryColor || escurecerCor(pc);
  const [selectedItem, setSelectedItem] = useState<MenuDisplayItem | null>(null);
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

  // Show welcome modal once per session (skip if already identified)
  useEffect(() => {
    const seen = sessionStorage.getItem(`qr-welcome-seen-${slug}`);
    const identified = !!sessionStorage.getItem(`foocci-customer-${slug}`);
    if (!seen && !identified) setShowWelcome(true);
  }, [slug]);

  function handleWelcomeClose(identity: CustomerIdentity | null) {
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
    // The category nav is fixed at the BOTTOM now, so the top of the viewport is
    // free — scroll the section heading near the top with a small margin.
    const top = el.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <div style={{ '--brand-primary': pc, '--brand-secondary': sc } as React.CSSProperties}>
      {showWelcome && (
        <WelcomeModal slug={slug} onClose={handleWelcomeClose} />
      )}

      {selectedItem && (
        <ProductModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Bottom padding clears the fixed category nav so it never covers the footer/last items. */}
      <div className={`min-h-screen bg-[#fafaf9] ${categories.length > 1 ? "pb-24" : ""}`}>

        {/* ── HERO ──────────────────────────────────────────────── */}
        <MenuHero
          restaurant={restaurant}
          coverImageUrl={coverImageUrl}
          instagramUrl={instagramUrl}
          tiktokUrl={tiktokUrl}
          restaurantPhone={restaurantPhone}
          googleReviewUrl={googleReviewUrl}
          identifiedName={identifiedName}
          identifiedPhone={identifiedPhone}
          onResetIdentity={handleResetIdentity}
          promotionBanners={promotionBanners}
          promoBanner={promoBanner}
          promotedItems={promotedItems}
          featured={featured}
          onSelectItem={setSelectedItem}
        />

        {/* ── BOTTOM-FIXED CATEGORY NAV ─────────────────────────── */}
        {categories.length > 1 && (
          <CategoryNav
            navRef={navRef}
            categories={categories}
            activeCategory={activeCategory}
            onSelect={scrollToCategory}
          />
        )}

        {/* ── CATEGORY DESCRIPTION STRIP ───────────────────────── */}
        <CategoryDescriptionStrip categories={categories} activeCategory={activeCategory} />

        {/* ── PRODUCT SECTIONS ──────────────────────────────────── */}
        <CategorySections categories={categories} onSelectItem={setSelectedItem} />

        <footer className="py-8 text-center text-xs text-gray-400">
          Cardápio gerado por Foocci
        </footer>
      </div>
    </div>
  );
}
