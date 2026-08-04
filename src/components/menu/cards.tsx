"use client";

/**
 * Cards do cardápio white-label — PromoBanner, FeaturedCard, ProductCard.
 * Movidos verbatim de src/app/qr/[slug]/QRMenuClient.tsx. Usados pelo QR (mesa)
 * e pela Loja (/pedido sem IA) para que os dois cardápios nunca divirjam.
 */

import { formatPrice } from "./format";
import type { MenuDisplayItem } from "./types";

// ── Promo Banner ─────────────────────────────────────────────────────────────

export function PromoBanner({
  item,
  onClick,
}: {
  item: MenuDisplayItem;
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
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
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
        {item.promotion ? (
          <p className="mt-0.5 text-sm font-bold text-white">
            <span className="text-red-300 line-through mr-1.5">R$&nbsp;{formatPrice(item.price)}</span>
            R$&nbsp;{formatPrice(item.promotion.promotionalPrice)}
          </p>
        ) : (
          <p className="mt-0.5 text-sm font-bold text-white/80">
            R$&nbsp;{formatPrice(item.price)}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Featured Carousel Card ────────────────────────────────────────────────────

export function FeaturedCard({
  item,
  onClick,
}: {
  item: MenuDisplayItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="snap-start shrink-0 w-40 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-orange-100 transition-all"
    >
      {/* Square image zone — center-cropped */}
      <div className="aspect-square overflow-hidden bg-gray-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover object-center"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            🍽️
          </div>
        )}
      </div>
      <div className="p-2.5">
        {item.promotion && (
          <span className="mb-1 inline-block rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
            {item.promotion.badgeText}
          </span>
        )}
        <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
          {item.name}
        </p>
        {item.promotion ? (
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xs font-bold text-red-600">
              R$&nbsp;{formatPrice(item.promotion.promotionalPrice)}
            </span>
            <span className="text-[10px] text-gray-400 line-through">
              R$&nbsp;{formatPrice(item.price)}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>
            R$&nbsp;{formatPrice(item.price)}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

export function ProductCard({
  item,
  isFirst,
  onClick,
}: {
  item: MenuDisplayItem;
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
                {item.promotion && (
                  <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    {item.promotion.badgeText}
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
              {item.promotion ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-red-600">
                    R$&nbsp;{formatPrice(item.promotion.promotionalPrice)}
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    R$&nbsp;{formatPrice(item.price)}
                  </span>
                </div>
              ) : (
                <span className="text-lg font-bold" style={{ color: 'var(--brand-primary)' }}>
                  R$&nbsp;{formatPrice(item.price)}
                </span>
              )}
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
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
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
