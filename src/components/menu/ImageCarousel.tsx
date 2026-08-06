"use client";

/**
 * ImageCarousel — o carrossel de fotos da ficha do produto.
 *
 * Movido VERBATIM de src/app/pedido/[slug]/PedidoClient.tsx (onde era a única
 * cópia) para cá, porque as três fichas do produto são a mesma ficha:
 *   • /pedido/[slug] com IA  → PedidoClient (a origem deste código);
 *   • /pedido/[slug] sem IA  → components/menu/ProductModal com `commerce`;
 *   • /qr/[slug] da mesa     → components/menu/ProductModal sem `commerce`.
 * As duas últimas não tinham carrossel nenhum: o lojista subia 3 fotos e só a
 * capa aparecia. Peça única, um comportamento só.
 *
 * Snap-scroll escrito à mão em Tailwind (sem lib, DESIGN.md §6). Os eventos de
 * toque param aqui de propósito: o PedidoClient usa swipe horizontal na folha
 * para fechar, e arrastar entre as fotos não pode fechar a ficha.
 */

import { useState } from "react";

export function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  return (
    <div className="relative h-full w-full">
      <div
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0);
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${alt} — foto ${i + 1}`}
            className="h-full w-full shrink-0 snap-center object-cover object-center"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full bg-white shadow transition-all ${i === active ? "w-4" : "w-1.5 opacity-60"}`}
          />
        ))}
      </div>
    </div>
  );
}
