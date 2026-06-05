/**
 * Hero (home). Server component. Pre-launch mode — Premium Pre-launch System.
 *
 * Left: pre-launch badge, H1, subheadline, primary + secondary CTAs, pilot note
 * and a compact capability strip. Right: a layered product-mockup composition
 * (focal order screen + a second screen peeking behind for depth) with floating
 * brand chips and a small institutional mascot. Background has subtle depth
 * (dot-grid + controlled orange halo) — no fake data, no invented numbers.
 */

import type { ReactNode } from "react";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { PRELAUNCH_BADGE } from "./config";
import { OrderMockup, CampaignMockup } from "./mockups";
import { SparklesIcon, UsersIcon, CartRefreshIcon } from "./icons";
import { DotGrid, Halo, TopWash, BrandBadge, MascotAvatar } from "./premium";

const CAPABILITIES = ["Cardápio digital", "WhatsApp", "IA", "CRM"];

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-white">
      <TopWash className="h-80" />
      <DotGrid className="[mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]" />
      <Halo className="-right-24 top-8 hidden h-[30rem] w-[30rem] lg:block" color="rgba(249,115,22,0.12)" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="text-center lg:text-left">
          <BrandBadge>{PRELAUNCH_BADGE}</BrandBadge>

          <h1
            id="hero-title"
            className="mt-6 text-[2rem] font-semibold leading-[1.08] tracking-tight text-[#0B0B0B] sm:text-[2.6rem] lg:text-[3.4rem]"
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

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 lg:justify-start">
            <span className="text-xs font-medium text-gray-400">Em um só sistema:</span>
            {CAPABILITIES.map((c) => (
              <span
                key={c}
                className="rounded-full border border-gray-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-xs sm:max-w-sm lg:max-w-none lg:pl-6">
          <HeroComposition />
        </div>
      </div>
    </section>
  );
}

/* ── Layered focal composition ───────────────────────────────────────────────── */

function HeroComposition() {
  return (
    <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
      {/* soft backdrop + glow */}
      <Halo className="-inset-6 lg:-inset-10" color="rgba(249,115,22,0.10)" />
      <div
        aria-hidden
        className="absolute -inset-3 -z-10 rounded-[2.25rem] bg-gradient-to-tr from-gray-50 via-white to-brand-50/40 ring-1 ring-gray-900/[0.03] lg:-inset-5"
      />

      {/* second screen peeking behind (depth / layers) — desktop only */}
      <div aria-hidden className="absolute -right-10 -top-10 hidden w-[74%] opacity-95 lg:block">
        <CampaignMockup />
      </div>

      {/* focal order screen */}
      <div className="relative z-10">
        <OrderMockup />
      </div>

      {/* floating brand chips — desktop only */}
      <FloatingChip className="-left-6 top-12 hidden lg:flex" icon={<SparklesIcon className="h-4 w-4" />} label="Pedido guiado" />
      <FloatingChip className="-right-7 top-1/2 hidden lg:flex" icon={<UsersIcon className="h-4 w-4" />} label="Cliente identificado" />
      <FloatingChip className="-bottom-4 right-6 hidden lg:flex" icon={<CartRefreshIcon className="h-4 w-4" />} label="Oportunidade recuperada" />

      {/* small institutional mascot — desktop only, does not compete with the mockup */}
      <MascotAvatar className="absolute -bottom-6 -left-7 z-20 hidden shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] lg:inline-flex" />
    </div>
  );
}

function FloatingChip({ className, icon, label }: { className?: string; icon: ReactNode; label: string }) {
  return (
    <div
      className={`absolute z-20 items-center gap-2 rounded-xl border border-gray-100 bg-white/95 px-3 py-2 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.30)] ring-1 ring-gray-900/[0.03] backdrop-blur ${className}`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      <span className="text-xs font-semibold text-gray-800">{label}</span>
    </div>
  );
}
