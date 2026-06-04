"use client";

/**
 * Sticky marketing header (shared across /site and /site/*). Client component:
 * tracks scroll (subtle border once scrolled) and toggles the mobile menu.
 * Pre-launch: shows a subtle "em breve" pill; primary CTA explains the product.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { LOGIN_URL, NAV_LINKS, PRIMARY_CTA_LABEL, COMO_FUNCIONA_URL } from "./config";
import { MenuIcon, CloseIcon } from "./icons";

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-white/85 backdrop-blur-md transition-colors ${
        scrolled ? "border-b border-gray-200" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
        <Link href="/site" className="flex items-center gap-2" aria-label="Foocci">
          <span className="text-xl font-bold tracking-tight text-[#0B0B0B]">Foocci</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">
            em breve
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0B0B0B]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link href={LOGIN_URL} className="text-sm font-semibold text-gray-700 transition-colors hover:text-brand-600">
            Entrar
          </Link>
          <Link
            href={COMO_FUNCIONA_URL}
            className="inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
          >
            {PRIMARY_CTA_LABEL}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-200 bg-white lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-3">
              <Link
                href={LOGIN_URL}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
              >
                Entrar
              </Link>
              <Link
                href={COMO_FUNCIONA_URL}
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded-full bg-brand-500 px-4 py-3 text-base font-semibold text-white hover:bg-brand-600"
              >
                {PRIMARY_CTA_LABEL}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
