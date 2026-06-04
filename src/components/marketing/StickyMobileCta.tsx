"use client";

/**
 * Sticky bottom CTA bar — mobile only. Appears after the user scrolls past the
 * hero. Pre-launch: a single, non-sales CTA that explains the product
 * (no WhatsApp). No dependencies; pure scroll listener.
 */

import { useEffect, useState } from "react";
import { COMO_FUNCIONA_URL, PRIMARY_CTA_LABEL } from "./config";

export function StickyMobileCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto max-w-md">
        <a
          href={COMO_FUNCIONA_URL}
          className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          {PRIMARY_CTA_LABEL}
        </a>
      </div>
    </div>
  );
}
