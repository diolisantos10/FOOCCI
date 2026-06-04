"use client";

/**
 * Sticky bottom CTA bar — mobile only. Appears after the user scrolls past the
 * hero. No dependencies; pure scroll listener. Hidden on lg+ where the header
 * CTA is always visible.
 */

import { useEffect, useState } from "react";
import { DEMO_ANCHOR, PRIMARY_CTA_LABEL, WHATSAPP_CTA_LABEL, ctaTarget, whatsappUrl } from "./config";
import { WhatsAppIcon } from "./icons";

export function StickyMobileCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  const waHref = whatsappUrl() ?? DEMO_ANCHOR;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-center gap-2">
        <a
          href={DEMO_ANCHOR}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          {PRIMARY_CTA_LABEL}
        </a>
        <a
          {...ctaTarget(waHref)}
          aria-label={WHATSAPP_CTA_LABEL}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-[#25D366] hover:bg-gray-50"
        >
          <WhatsAppIcon className="h-6 w-6" />
        </a>
      </div>
    </div>
  );
}
