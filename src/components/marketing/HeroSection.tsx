/**
 * Hero. Server component.
 *
 * Left: badge, H1, subheadline, CTAs, microcopy.
 * Right: a premium CSS mockup (no real screenshots / no invented numbers) with
 * floating cards naming Foocci's role in the order → relationship flow.
 * Allowed sample labels only (see marketing brief).
 */

import { PrimaryCta, WhatsAppCta } from "./Cta";
import { SparklesIcon, UsersIcon, MegaphoneIcon, CartRefreshIcon, RepeatIcon } from "./icons";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-gray-50 to-white"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Hospitalidade digital inteligente para restaurantes
          </span>

          <h1 className="mt-5 text-3xl font-bold leading-[1.12] tracking-tight text-[#0B0B0B] sm:text-4xl lg:text-[3.25rem]">
            O sistema inteligente que ajuda restaurantes a vender mais e fazer{" "}
            <span className="text-brand-500">clientes voltarem.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-gray-600 lg:mx-0">
            A Foocci une cardápio digital, WhatsApp, IA e CRM para transformar
            atendimento em venda, pedido em relacionamento e cliente em recorrência.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryCta className="w-full sm:w-auto" />
            <WhatsAppCta className="w-full sm:w-auto" />
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Feita para restaurantes que querem vender melhor sem complicar a operação.
          </p>
        </div>

        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}

/* ── CSS product mockup ───────────────────────────────────────────────────── */

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
      {/* Main surface — mobile order screen */}
      <div className="relative z-10 rounded-3xl border border-gray-200 bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
          <span className="ml-2 text-xs font-medium text-gray-400">Foocci · pedido guiado</span>
        </div>

        <div className="mt-5 space-y-3">
          {["Prato principal", "Acompanhamento"].map((label) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-200" />
              <div className="flex-1">
                <div className="h-2.5 w-24 rounded-full bg-gray-300" />
                <div className="mt-2 h-2 w-16 rounded-full bg-gray-200" />
              </div>
              <span className="text-xs font-medium text-gray-400">{label}</span>
            </div>
          ))}

          {/* AI suggestion — the single orange highlight on the surface */}
          <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <SparklesIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-brand-700">Sugestão de bebida</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <UsersIcon className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-gray-500">Cliente identificado</span>
          </div>
          <span className="rounded-full bg-[#0B0B0B] px-3 py-1.5 text-xs font-semibold text-white">
            Histórico salvo
          </span>
        </div>
      </div>

      {/* Floating cards — desktop only (kept inside bounds, no mobile overflow) */}
      <FloatingCard className="-left-6 top-8 hidden lg:flex" icon={<MegaphoneIcon className="h-4 w-4" />} label="Campanha CRM" />
      <FloatingCard className="-right-4 top-28 hidden lg:flex" icon={<CartRefreshIcon className="h-4 w-4" />} label="Oportunidade recuperada" />
      <FloatingCard className="-bottom-5 left-8 hidden lg:flex" icon={<RepeatIcon className="h-4 w-4" />} label="Cliente recorrente" />

      <div aria-hidden className="absolute -inset-4 -z-0 rounded-[2rem] bg-gray-50" />
    </div>
  );
}

function FloatingCard({ className, icon, label }: { className?: string; icon: React.ReactNode; label: string }) {
  return (
    <div className={`absolute z-20 items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg ${className}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      <span className="text-xs font-semibold text-gray-800">{label}</span>
    </div>
  );
}
