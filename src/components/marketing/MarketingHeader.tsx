"use client";

/**
 * Sticky marketing header (shared across /site and /site/*). Client component:
 * tracks scroll (subtle border once scrolled) and toggles the mobile menu.
 * Launch mode: no pre-launch pill; the primary CTA opens the demo request.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LOGIN_URL, NAV_LINKS, FOLLOW_LAUNCH_LABEL, DEMO_URL } from "./config";
import { MenuIcon, CloseIcon } from "./icons";

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";

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
      className={`sticky top-0 z-50 bg-paper/85 backdrop-blur-md transition-colors ${
        scrolled ? "border-b border-line" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
        {/*
          No celular a logo fica CENTRALIZADA (pedido do CEO, 2026-08-04). O espaçador
          tem a mesma largura do botão de menu à direita — é ele que faz o centro ser o
          centro de verdade, sem posicionamento absoluto. No desktop some.
        */}
        <span aria-hidden className="w-10 shrink-0 lg:hidden" />

        <Link
          href="/site"
          className={`flex flex-1 items-center justify-center gap-2.5 rounded-md lg:flex-none lg:justify-start ${FOCUS}`}
          aria-label="Foocci — início"
        >
          <Image
            src="/brand/foocci/foocci-wordmark.png"
            alt="Foocci"
            width={200}
            height={50}
            priority
            className="h-[22px] w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Navegação principal">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md text-sm font-semibold text-ink2 transition-colors hover:text-ink ${FOCUS}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href={LOGIN_URL}
            className={`inline-flex items-center rounded-xl border border-line2 bg-paper px-5 py-2 text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(11,11,11,.03)] transition-colors hover:bg-[#FAFAF8] ${FOCUS}`}
          >
            Entrar
          </Link>
          <Link
            href={DEMO_URL}
            className={`inline-flex items-center rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 ${FOCUS}`}
          >
            {FOLLOW_LAUNCH_LABEL}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-[#F4F4F2] lg:hidden ${FOCUS}`}
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-paper lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-3" aria-label="Navegação principal">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-2 py-3 text-base text-ink2 hover:bg-[#FAFAF8] ${FOCUS}`}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              <Link
                href={LOGIN_URL}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-2 py-3 text-base font-semibold text-ink hover:bg-[#FAFAF8] ${FOCUS}`}
              >
                Entrar
              </Link>
              <Link
                href={DEMO_URL}
                onClick={() => setOpen(false)}
                className={`inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-white hover:bg-brand-600 ${FOCUS}`}
              >
                {FOLLOW_LAUNCH_LABEL}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
