"use client";

/**
 * MenuHero — o bloco de abertura do cardápio white-label: capa, logo redondo,
 * nome, subtítulo, ícones sociais, botão de avaliação Google, faixa de
 * identidade, banners de promoção (tabela Promotion), PromoBanner de item e os
 * carrosséis "🔥 Promoções" e "⭐ Mais vendidos".
 *
 * Movido verbatim de src/app/qr/[slug]/QRMenuClient.tsx. Única parametrização:
 * o subtítulo (QR = "Cardápio digital"; Loja = "Cardápio digital — peça online").
 *
 * Duas peças internas são EXPORTADAS para o topo de app da Loja (emenda do CEO
 * em 04/08: o corpo segue igual por construção; o topo da Loja é de marketplace):
 * - MenuSocialLinks — os ícones Instagram/TikTok/WhatsApp (markup idêntico).
 * - MenuShowcase — banners de promoção + PromoBanner + carrosséis.
 * O MenuHero continua compondo as duas no MESMO lugar — o DOM do QR não muda.
 */

import { buildWhatsAppUrl, buildInstagramUrl, buildTikTokUrl } from "@/lib/social";
import { FeaturedCard, PromoBanner } from "./cards";
import { MenuCover } from "./MenuCover";
import type { MenuDisplayItem, PromotionBannerData } from "./types";

/** Ícones sociais do cardápio. Devolve null quando não há nenhum link. */
export function MenuSocialLinks({
  instagramUrl,
  tiktokUrl,
  restaurantPhone,
  className,
}: {
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  restaurantPhone?: string | null;
  className?: string;
}) {
  if (!buildInstagramUrl(instagramUrl) && !buildTikTokUrl(tiktokUrl) && !buildWhatsAppUrl(restaurantPhone)) {
    return null;
  }
  return (
    <div className={className}>
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
  );
}

/** Banners de promoção + PromoBanner de item + carrosséis (Promoções / Mais vendidos). */
export function MenuShowcase({
  promotionBanners = [],
  promoBanner,
  promotedItems = [],
  featured = [],
  onSelectItem,
}: {
  promotionBanners?: PromotionBannerData[];
  promoBanner?: MenuDisplayItem | null;
  promotedItems?: MenuDisplayItem[];
  featured?: MenuDisplayItem[];
  onSelectItem: (item: MenuDisplayItem) => void;
}) {
  return (
    <>
      {/* Promotion image banners from Promotions table */}
      {promotionBanners.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 pb-4 space-y-3">
          {promotionBanners.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-2xl shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.imageUrl} alt={b.name} className="w-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* DB-driven promo banner (menu category item) */}
      {promoBanner && (
        <div className="mx-auto max-w-2xl px-4 pb-5">
          <PromoBanner
            item={promoBanner}
            onClick={() => onSelectItem(promoBanner)}
          />
        </div>
      )}

      {/* Promotions carousel */}
      {promotedItems.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 pb-6">
          <p className="mb-3 text-sm font-bold text-gray-700">
            🔥 Promoções
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
            {promotedItems.map((item) => (
              <FeaturedCard
                key={item.id}
                item={item}
                onClick={() => onSelectItem(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Featured carousel */}
      {featured.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 pb-6">
          <p className="mb-3 text-sm font-bold text-gray-700">
            ⭐ Mais vendidos
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
            {featured.map((item) => (
              <FeaturedCard
                key={item.id}
                item={item}
                onClick={() => onSelectItem(item)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function MenuHero({
  restaurant,
  coverImageUrl,
  subtitle = "Cardápio digital",
  instagramUrl,
  tiktokUrl,
  restaurantPhone,
  googleReviewUrl,
  identifiedName,
  identifiedPhone,
  onResetIdentity,
  promotionBanners = [],
  promoBanner,
  promotedItems = [],
  featured = [],
  onSelectItem,
}: {
  restaurant: { name: string; logoUrl: string | null };
  /** Capa do cardápio. Ausente é o caso normal — ver MenuCover (estado vazio). */
  coverImageUrl?: string | null;
  subtitle?: string;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  restaurantPhone?: string | null;
  googleReviewUrl?: string | null;
  identifiedName: string | null;
  identifiedPhone: string | null;
  onResetIdentity: () => void;
  promotionBanners?: PromotionBannerData[];
  promoBanner?: MenuDisplayItem | null;
  promotedItems?: MenuDisplayItem[];
  featured?: MenuDisplayItem[];
  onSelectItem: (item: MenuDisplayItem) => void;
}) {
  return (
    <div id="hero" className="bg-white border-b border-gray-100">
      {/* Capa + logo. O logo saiu daqui para o MenuCover porque ele monta na
          DIVISA entre a capa e o conteúdo — com o anel branco, não com o
          `ring-orange-50` de antes (laranja da Foocci numa tela white-label). */}
      <MenuCover
        coverImageUrl={coverImageUrl}
        restaurantName={restaurant.name}
        logoUrl={restaurant.logoUrl}
      />

      <div
        className={`mx-auto max-w-2xl px-4 pb-5 text-center ${
          restaurant.logoUrl ? "pt-3" : "pt-6"
        }`}
      >
        <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
        <p className="mt-1 text-xs text-gray-400">{subtitle}</p>

        {/* Social / contact icons */}
        <MenuSocialLinks
          instagramUrl={instagramUrl}
          tiktokUrl={tiktokUrl}
          restaurantPhone={restaurantPhone}
          className="mt-3 flex items-center justify-center gap-3"
        />

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
              onClick={onResetIdentity}
              className="ml-3 shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-medium text-orange-600 hover:bg-orange-200 transition-colors"
              aria-label="Trocar identificação"
            >
              Trocar
            </button>
          </div>
        </div>
      )}

      <MenuShowcase
        promotionBanners={promotionBanners}
        promoBanner={promoBanner}
        promotedItems={promotedItems}
        featured={featured}
        onSelectItem={onSelectItem}
      />
    </div>
  );
}
