/**
 * Hero (home) — implements the APPROVED MOCKUP (official art direction).
 * Server component. Pre-launch.
 *
 * Left: orange-rule eyebrow, essence headline, bold-segment subheadline, pill
 * CTAs with icons (play / calendar), pilot microcopy. Right: warm restaurant
 * scene with the mascot as a LARGE host standing BEHIND the counter, speech
 * bubble on his left and the black F tile on the counter — exactly as in the
 * mockup. The restaurant photograph renders automatically from the official
 * asset slot (`SITE_ASSETS.heroRestaurant`) once the file is delivered; until
 * then a faithful warm fallback keeps the same composition. No fake data.
 */

import Image from "next/image";
import { PrimaryCta, SecondaryCta } from "./Cta";
import { FOLLOW_LAUNCH_LABEL, DEMO_URL } from "./config";
import { PlayCircleIcon, CalendarIcon } from "./icons";
import { Eyebrow } from "./premium";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-14 pt-10 lg:min-h-[37rem] lg:grid-cols-[1fr_1.05fr] lg:gap-6 lg:px-8 lg:pb-20 lg:pt-14">
        {/* ── Left: message (per mockup) ─────────────────────────────────────── */}
        <div className="relative z-10 text-center lg:max-w-xl lg:text-left">
          <span className="inline-flex items-center gap-3">
            <span aria-hidden className="hidden h-0.5 w-6 rounded-full bg-brand-500 lg:block" />
            <Eyebrow>Hospitalidade digital inteligente</Eyebrow>
          </span>

          <h1
            id="hero-title"
            className="mt-4 text-[2.2rem] font-semibold leading-[1.08] tracking-tight text-[#0B0B0B] sm:text-[2.8rem] lg:text-[3.3rem]"
          >
            Transformando pedidos em experiências que fazem{" "}
            <span className="text-brand-500">clientes voltarem.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg lg:mx-0">
            Foocci é o{" "}
            <strong className="font-semibold text-gray-800">
              sistema inteligente de vendas, relacionamento e fidelização
            </strong>{" "}
            que coloca seu restaurante no centro da experiência do cliente.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryCta
              className="w-full gap-2.5 sm:w-auto"
              withArrow={false}
              label="Ver como a Foocci funciona"
              icon={<PlayCircleIcon className="h-5 w-5" />}
            />
            <SecondaryCta
              className="w-full gap-2.5 sm:w-auto"
              label={FOLLOW_LAUNCH_LABEL}
              href={DEMO_URL}
              icon={<CalendarIcon className="h-5 w-5 text-gray-500" />}
            />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Produto em fase piloto. Lançamento comercial em breve.
          </p>
        </div>

        {/* ── Right: host scene (per mockup) ─────────────────────────────────── */}
        <HostScene />
      </div>
    </section>
  );
}

/* ── Host scene — restaurant ambience, large mascot BEHIND the counter ───────── */

const COUNTER_H = "24%"; // counter band height ≈ mockup proportion

function HostScene() {
  const photo = hasAsset(SITE_ASSETS.heroRestaurant);

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="relative h-[26rem] overflow-hidden rounded-[2.25rem] sm:h-[30rem] lg:h-[33rem]">
        {/* Background: official restaurant photo (slot) or faithful warm fallback */}
        {photo ? (
          <Image
            src={`/${SITE_ASSETS.heroRestaurant}`}
            alt=""
            aria-hidden
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-right"
          />
        ) : (
          <>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#f6e6d1] via-[#fbf1e6] to-[#f4e3cc]" />
            <div aria-hidden className="pointer-events-none absolute -top-8 left-10 h-24 w-24 rounded-full bg-amber-200/60 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -top-4 right-14 h-20 w-20 rounded-full bg-orange-200/60 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute top-16 right-8 h-2.5 w-2.5 rounded-full bg-amber-400/70 shadow-[0_0_24px_8px_rgba(251,191,36,0.45)]" />
            {/* counter (fallback only — the photo already contains it) */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-[#e9d4b7] to-[#d9bf9b]" style={{ height: COUNTER_H }} />
            <div aria-hidden className="absolute inset-x-0 h-1 bg-white/60" style={{ bottom: COUNTER_H }} />
          </>
        )}

        {/* soft white fade into the text column (per mockup) */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-white via-white/60 to-transparent" />

        {/* Mascot — large host, legs clipped by the counter line ("behind the bar") */}
        <div aria-hidden className="absolute inset-x-0 top-0 overflow-hidden" style={{ bottom: COUNTER_H }}>
          <Image
            src="/brand/foocci/foocci-mascot-cutout.png"
            alt=""
            width={196}
            height={321}
            priority
            className="absolute -bottom-10 left-1/2 h-[19rem] w-auto -translate-x-[34%] sm:-bottom-12 sm:h-[23rem] lg:h-[26rem]"
          />
        </div>
        <span className="sr-only">Mascote da Foocci recebendo no balcão do restaurante</span>

        {/* Speech bubble — left of the host, tail pointing to him (per mockup) */}
        <div className="absolute left-2 top-[16%] z-30 max-w-[225px] rounded-2xl bg-white/97 p-4 text-left shadow-[0_16px_40px_-16px_rgba(120,72,20,0.45)] ring-1 ring-black/[0.04] sm:left-6 sm:top-[18%] sm:max-w-[250px] sm:p-5">
          <span aria-hidden className="absolute -right-1.5 top-9 h-3.5 w-3.5 rotate-45 bg-white/97" />
          <p className="text-base font-semibold text-[#0B0B0B] sm:text-lg">
            Olá! Sou a <span className="text-brand-500">Foocci</span>.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600 sm:text-sm">
            Estou aqui para ajudar seu restaurante a criar conexões que geram resultados.
          </p>
        </div>

        {/* Black F tile standing on the counter (per mockup) */}
        <Image
          src="/brand/foocci/foocci-anagram.png"
          alt=""
          aria-hidden
          width={256}
          height={256}
          className="absolute right-[7%] z-20 h-16 w-16 drop-shadow-[0_14px_18px_rgba(80,48,12,0.35)] sm:h-20 sm:w-20"
          style={{ bottom: `calc(${COUNTER_H} - 1.25rem)` }}
        />
      </div>
    </div>
  );
}
