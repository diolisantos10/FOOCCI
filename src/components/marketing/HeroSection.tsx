/**
 * Hero (home). Server component. Pre-launch mode — Creative Direction V3
 * "Hospitalidade digital inteligente".
 *
 * Left: eyebrow + the emotional essence as the headline, official definition as
 * subheadline, pre-launch CTAs and pilot note. Right: the mascot as the BRAND HOST
 * — standing on a neutral stage inside a warm, restaurant-inspired panel (CSS
 * atmosphere only, no heavy images), greeting with a short speech bubble, with the
 * F anagram as a brand object and the pre-launch badge. No fake data/metrics.
 */

import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { PRELAUNCH_BADGE, FOLLOW_LAUNCH_LABEL, DEMO_URL } from "./config";
import { RepeatIcon } from "./icons";
import { DotGrid, Halo, TopWash, BrandBadge, Eyebrow } from "./premium";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-white">
      <TopWash className="h-80" />
      <DotGrid className="[mask-image:radial-gradient(ellipse_at_top_left,black,transparent_55%)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
        {/* ── Left: emotional message ─────────────────────────────────────────── */}
        <div className="text-center lg:text-left">
          <Eyebrow>Hospitalidade digital inteligente</Eyebrow>

          <h1
            id="hero-title"
            className="mt-4 text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-[#0B0B0B] sm:text-[2.7rem] lg:text-[3.3rem]"
          >
            Transformando pedidos em experiências que fazem{" "}
            <span className="text-brand-500">clientes voltarem.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg lg:mx-0">
            Foocci é o sistema inteligente de vendas, relacionamento e fidelização que
            ajuda restaurantes a vender melhor, criar conexões com clientes e construir
            recorrência.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryCta className="w-full sm:w-auto" />
            <SecondaryCta label={FOLLOW_LAUNCH_LABEL} href={DEMO_URL} className="w-full sm:w-auto" />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Produto em fase piloto. Lançamento comercial em breve.
          </p>
        </div>

        {/* ── Right: the host scene ───────────────────────────────────────────── */}
        <HostScene />
      </div>
    </section>
  );
}

/* ── Host scene — mascot as the brand host in a warm restaurant atmosphere ────── */

function HostScene() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <Halo className="-inset-8 lg:-inset-12" color="rgba(249,115,22,0.10)" />

      {/* Warm panel — restaurant-inspired atmosphere (CSS only) */}
      <div className="relative h-[24rem] overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-brand-50/80 via-white to-white ring-1 ring-gray-900/[0.05] shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_60px_-28px_rgba(15,23,42,0.28)] sm:h-[26rem] lg:h-[30rem]">
        {/* soft "salão" arch + warm light */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl"
        />
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_62%)]" />

        {/* pre-launch badge */}
        <BrandBadge className="absolute left-5 top-5 z-20">{PRELAUNCH_BADGE}</BrandBadge>

        {/* neutral stage (the mascot's light plate blends seamlessly here) */}
        <div
          aria-hidden
          className="absolute bottom-0 left-1/2 h-[62%] w-[82%] -translate-x-1/2 rounded-t-[2.5rem] bg-gray-50 ring-1 ring-gray-900/[0.03]"
        />
        {/* "balcão" base line */}
        <div
          aria-hidden
          className="absolute bottom-0 left-1/2 h-5 w-[92%] -translate-x-1/2 rounded-t-2xl bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100"
        />

        {/* the host */}
        <Image
          src="/brand/foocci/foocci-mascot.png"
          alt="Mascote da Foocci, anfitrião da marca"
          width={196}
          height={321}
          priority
          className="absolute bottom-4 left-1/2 z-10 h-48 w-auto -translate-x-1/2 sm:h-56 lg:h-64 lg:-translate-x-[68%]"
        />

        {/* speech bubble — the host greets */}
        <div className="absolute right-4 top-[4.5rem] z-20 max-w-[230px] rounded-2xl rounded-bl-sm border border-gray-100 bg-white p-4 text-left shadow-[0_12px_32px_-14px_rgba(15,23,42,0.35)] ring-1 ring-gray-900/[0.03] sm:right-6 sm:top-20">
          <p className="text-sm font-semibold text-[#0B0B0B]">“Olá! Sou a Foocci.”</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            Estou aqui para ajudar seu restaurante a criar conexões que geram resultados.
          </p>
        </div>

        {/* F anagram as a brand object on the stage */}
        <span className="absolute bottom-6 right-6 z-20 hidden h-12 w-12 items-center justify-center rounded-xl bg-white shadow-[0_8px_24px_-10px_rgba(15,23,42,0.30)] ring-1 ring-gray-900/[0.04] sm:flex">
          <Image src="/brand/foocci/foocci-anagram.png" alt="" aria-hidden width={256} height={256} className="h-8 w-8" />
        </span>

        {/* outcome chip — relationship → return (approved label, no numbers) */}
        <span className="absolute bottom-24 right-5 z-20 hidden items-center gap-2 rounded-xl border border-gray-100 bg-white/95 px-3 py-2 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.30)] ring-1 ring-gray-900/[0.03] backdrop-blur lg:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <RepeatIcon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-gray-800">Cliente recorrente</span>
        </span>
      </div>
    </div>
  );
}
