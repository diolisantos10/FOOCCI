/**
 * Hero (home). Server component. Pre-launch mode.
 *
 * Left: pre-launch badge, H1, subheadline, primary + secondary CTAs, pilot note
 * and a compact capability strip. Right: a focal product mockup from the shared
 * mockup language (no real screenshots / no invented numbers) with a few floating
 * chips naming Foocci's role in the order → relationship flow.
 */

import type { ReactNode } from "react";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { PRELAUNCH_BADGE } from "./config";
import { OrderMockup } from "./mockups";
import { MegaphoneIcon, CartRefreshIcon, RepeatIcon } from "./icons";

const CAPABILITIES = ["Cardápio digital", "WhatsApp", "IA", "CRM"];

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-white">
      {/* Top fade + a single soft warm glow behind the mockup (no generic blobs). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-gray-50 to-white"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-10 -z-10 hidden h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.10),transparent)] lg:block"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
            {PRELAUNCH_BADGE}
          </span>

          <h1
            id="hero-title"
            className="mt-5 text-[2rem] font-bold leading-[1.1] tracking-tight text-[#0B0B0B] sm:text-4xl lg:text-[3.25rem]"
          >
            O sistema inteligente que ajuda restaurantes a vender mais e fazer{" "}
            <span className="text-brand-500">clientes voltarem.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg lg:mx-0">
            A Foocci une cardápio digital, WhatsApp, IA e CRM para transformar
            atendimento em venda, pedido em relacionamento e cliente em recorrência.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryCta className="w-full sm:w-auto" />
            <SecondaryCta href="#solucoes" className="w-full sm:w-auto" />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Produto em fase piloto. Lançamento comercial em breve.
          </p>

          {/* Compact capability strip — reinforces the one-system promise, scannable. */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 border-t border-gray-100 pt-5 lg:justify-start">
            <span className="text-xs font-medium text-gray-400">Em um só sistema:</span>
            {CAPABILITIES.map((c) => (
              <span
                key={c}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-xs sm:max-w-sm lg:max-w-none">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}

/* ── Focal mockup (shared language) + floating chips ─────────────────────────── */

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
      <div className="relative z-10">
        <OrderMockup />
      </div>

      <FloatingChip className="-left-6 top-10 hidden lg:flex" icon={<MegaphoneIcon className="h-4 w-4" />} label="Campanha CRM" />
      <FloatingChip className="-right-5 top-28 hidden lg:flex" icon={<CartRefreshIcon className="h-4 w-4" />} label="Oportunidade recuperada" />
      <FloatingChip className="-bottom-5 left-10 hidden lg:flex" icon={<RepeatIcon className="h-4 w-4" />} label="Cliente recorrente" />

      <div
        aria-hidden
        className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-tr from-gray-50 to-brand-50/40"
      />
    </div>
  );
}

function FloatingChip({ className, icon, label }: { className?: string; icon: ReactNode; label: string }) {
  return (
    <div
      className={`absolute z-20 items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg ring-1 ring-gray-900/[0.03] ${className}`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      <span className="text-xs font-semibold text-gray-800">{label}</span>
    </div>
  );
}
