/**
 * Hero (home) — implements the APPROVED MOCKUP (official art direction).
 * Server component. Pre-launch.
 *
 * Left: orange-rule eyebrow, essence headline, bold-segment subheadline, pill
 * CTAs with icons (play / calendar), pilot microcopy. Right: the approved scene
 * rendered as ONE composed photograph — a warm restaurant with the Foocci
 * mascot as host behind the curved counter, the "Olá! Sou o Foocci" speech
 * bubble and the black F tile, exactly as delivered (`SITE_ASSETS.heroComposed`).
 * Rendering the official composition flat keeps the art direction faithful — no
 * CSS reinterpretation. A warm fallback only shows if the asset is ever missing.
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
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-5 pb-10 pt-8 lg:min-h-[37rem] lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:px-8 lg:pb-20 lg:pt-14">
        {/* ── Left: message (per mockup) ─────────────────────────────────────── */}
        <div className="relative z-10 text-center lg:max-w-xl lg:text-left">
          <span className="inline-flex items-center gap-3">
            <span aria-hidden className="hidden h-0.5 w-6 rounded-full bg-brand-500 lg:block" />
            <Eyebrow>Hospitalidade digital inteligente</Eyebrow>
          </span>

          <h1
            id="hero-title"
            className="mt-4 text-[2.2rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[2.8rem] lg:text-[3.3rem]"
          >
            Todo mundo vende um pedaço.{" "}
            <span className="text-brand-500">O Foocci faz os quatro conversarem.</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink2 sm:text-lg lg:mx-0 lg:mt-5">
            Cardápio, pedido, atendimento por IA e CRM de fidelidade são{" "}
            <strong className="font-semibold text-ink">quatro contratos</strong> que não
            trocam uma informação entre si. Aqui é um só — e o cliente do delivery é o
            mesmo que o CRM reconhece e a IA atende pelo nome.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row lg:mt-8 lg:justify-start">
            <PrimaryCta
              className="w-full gap-2.5 sm:w-auto"
              withArrow={false}
              href="#calculadora"
              label="Calcule quanto você paga de comissão"
              icon={<PlayCircleIcon className="h-5 w-5" />}
            />
            <SecondaryCta
              className="w-full gap-2.5 sm:w-auto"
              label={FOLLOW_LAUNCH_LABEL}
              href={DEMO_URL}
              icon={<CalendarIcon className="h-5 w-5 text-muted" />}
            />
          </div>

          <p className="mt-3 text-sm text-muted lg:mt-4">
            Atendemos restaurantes de todos os tamanhos. Fale com a gente e veja funcionando no seu.
          </p>
        </div>

        {/* ── Right: approved composed scene (per mockup) ────────────────────── */}
        <HostScene />
      </div>
    </section>
  );
}

/* ── Host scene — the official composed photograph (mascot host + bubble + tile) ── */

function HostScene() {
  const composed = hasAsset(SITE_ASSETS.heroComposed);

  return (
    <div className="relative mx-auto w-full max-w-2xl lg:mr-0 lg:max-w-none">
      {/* warm glow behind the scene (atmosphere, not content) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-5 -z-10 rounded-[2.75rem] bg-gradient-to-tr from-brand-100/45 via-amber-50/70 to-transparent blur-2xl"
      />
      <div className="relative overflow-hidden rounded-[1.75rem] shadow-[0_34px_72px_-34px_rgba(120,72,20,0.55)] ring-1 ring-black/[0.05] lg:rounded-[2rem]">
        {composed ? (
          <Image
            src={`/${SITE_ASSETS.heroComposed}`}
            alt="Mascote do Foocci recebendo clientes no balcão de um restaurante acolhedor, com o balão de fala: Olá! Sou o Foocci."
            width={1672}
            height={941}
            priority
            sizes="(min-width: 1024px) 52vw, 100vw"
            className="h-auto w-full"
          />
        ) : (
          <div
            aria-hidden
            className="aspect-[16/9] w-full bg-gradient-to-br from-[#f6e6d1] via-[#fbf1e6] to-[#f4e3cc]"
          />
        )}
      </div>
    </div>
  );
}
