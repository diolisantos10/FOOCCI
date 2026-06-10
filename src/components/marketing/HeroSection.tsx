/**
 * Hero (home) — Creative Direction V3 "Hospitalidade digital inteligente".
 * Server component. Pre-launch.
 *
 * Left: eyebrow + the emotional essence as the headline, official definition as
 * subheadline, pre-launch CTAs and pilot note. Right: the mascot as a LARGE host
 * standing on a counter in a warm, restaurant-inspired CSS atmosphere (amber
 * gradient + soft "pendant light" bokeh + counter), greeting with a short speech
 * bubble, with the F anagram as a brand object. No photos, no fake data/metrics.
 */

import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { PRELAUNCH_BADGE, FOLLOW_LAUNCH_LABEL, DEMO_URL } from "./config";
import { RepeatIcon, HeartIcon } from "./icons";
import { Eyebrow, BrandBadge } from "./premium";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-14 pt-10 lg:min-h-[38rem] lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pb-20 lg:pt-16">
        {/* ── Left: emotional message ─────────────────────────────────────────── */}
        <div className="relative z-10 text-center lg:max-w-xl lg:text-left">
          <Eyebrow>Hospitalidade digital inteligente</Eyebrow>

          <h1
            id="hero-title"
            className="mt-4 text-[2.2rem] font-semibold leading-[1.06] tracking-tight text-[#0B0B0B] sm:text-[2.9rem] lg:text-[3.5rem]"
          >
            Transformando pedidos em experiências que fazem{" "}
            <span className="text-brand-500">clientes voltarem.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg lg:mx-0">
            Foocci é o sistema inteligente de vendas, relacionamento e fidelização que
            coloca seu restaurante no centro da experiência do cliente.
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

/* ── Host scene — warm restaurant atmosphere (CSS) + the mascot as host ────────── */

function HostScene() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      {/* Warm restaurant atmosphere */}
      <div className="relative h-[26rem] overflow-hidden rounded-[2.25rem] bg-gradient-to-b from-[#f7e7d2] via-[#fbf1e6] to-white ring-1 ring-black/[0.04] shadow-[0_2px_4px_rgba(15,23,42,0.04),0_30px_70px_-30px_rgba(120,72,20,0.45)] sm:h-[30rem] lg:h-[34rem]">
        {/* warm wash + vignette */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-100/40 via-transparent to-amber-100/30" />
        {/* "pendant light" bokeh */}
        <div aria-hidden className="pointer-events-none absolute -top-6 left-8 h-24 w-24 rounded-full bg-amber-200/60 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute top-2 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full bg-orange-200/60 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -top-4 right-10 h-20 w-20 rounded-full bg-amber-300/50 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute top-20 right-6 h-2.5 w-2.5 rounded-full bg-amber-400/70 shadow-[0_0_24px_8px_rgba(251,191,36,0.45)]" />
        <div aria-hidden className="pointer-events-none absolute top-12 left-12 h-2 w-2 rounded-full bg-orange-400/70 shadow-[0_0_20px_7px_rgba(251,146,60,0.45)]" />

        {/* pre-launch badge */}
        <BrandBadge className="absolute left-5 top-5 z-30 bg-white/85 backdrop-blur">{PRELAUNCH_BADGE}</BrandBadge>

        {/* counter / balcão */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-[#e9d4b7] to-[#dcc3a0]" />
        <div aria-hidden className="absolute inset-x-0 bottom-[6.5rem] h-px bg-white/50" />
        <div aria-hidden className="absolute inset-x-6 bottom-[5.6rem] h-10 rounded-b-[2rem] bg-black/[0.04] blur-md" />

        {/* the host — large mascot (transparent cutout) */}
        <Image
          src="/brand/foocci/foocci-mascot-cutout.png"
          alt="Mascote da Foocci, anfitrião da marca"
          width={196}
          height={321}
          priority
          className="absolute bottom-10 left-1/2 z-20 h-[19rem] w-auto -translate-x-[58%] drop-shadow-[0_18px_22px_rgba(120,72,20,0.28)] sm:h-[22rem] lg:bottom-12 lg:h-[25rem]"
        />

        {/* speech bubble — the host greets */}
        <div className="absolute left-3 top-24 z-30 max-w-[210px] rounded-2xl rounded-bl-sm border border-black/5 bg-white/95 p-4 text-left shadow-[0_14px_36px_-14px_rgba(120,72,20,0.45)] ring-1 ring-black/[0.03] backdrop-blur sm:left-6 sm:top-28 lg:max-w-[240px]">
          <p className="text-sm font-semibold text-[#0B0B0B]">
            Olá! Sou a <span className="text-brand-500">Foocci</span>.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            Estou aqui para ajudar seu restaurante a criar conexões que geram resultados.
          </p>
        </div>

        {/* F anagram tile on the counter */}
        <span className="absolute bottom-12 right-8 z-20 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_14px_30px_-12px_rgba(120,72,20,0.5)] ring-1 ring-black/[0.05] sm:right-12 lg:bottom-14">
          <Image src="/brand/foocci/foocci-anagram.png" alt="" aria-hidden width={256} height={256} className="h-11 w-11" />
        </span>

        {/* outcome chips — relationship → return (approved labels, no numbers) */}
        <span className="absolute right-5 top-1/2 z-30 hidden items-center gap-2 rounded-xl border border-black/5 bg-white/95 px-3 py-2 shadow-[0_10px_28px_-12px_rgba(120,72,20,0.45)] ring-1 ring-black/[0.03] backdrop-blur lg:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <RepeatIcon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-gray-800">Cliente recorrente</span>
        </span>
        <span className="absolute left-6 top-1/2 z-20 hidden items-center gap-2 rounded-xl border border-black/5 bg-white/95 px-3 py-2 shadow-[0_10px_28px_-12px_rgba(120,72,20,0.4)] ring-1 ring-black/[0.03] backdrop-blur lg:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <HeartIcon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-gray-800">Atendimento com contexto</span>
        </span>
      </div>
    </div>
  );
}
