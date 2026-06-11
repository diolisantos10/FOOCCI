/**
 * MascotHostScene — the Foocci mascot as institutional host on a warm "stage",
 * with the F brand tile and the system's context cards beside him. Server
 * component, presentation only (no metrics, no actions).
 *
 * Uses the TRANSPARENT mascot cutout so there is no plate/box on warm surfaces —
 * the mascot reads as an anfitrião, not as an image thrown inside a white card.
 */

import Image from "next/image";
import { IconTile } from "./mockups";
import { SparklesIcon, ChartIcon, CartRefreshIcon, HeartIcon, CheckIcon } from "./icons";

const CONTEXT = [
  { icon: SparklesIcon, label: "Contexto salvo" },
  { icon: ChartIcon, label: "Histórico organizado" },
  { icon: CartRefreshIcon, label: "Oportunidade identificada" },
  { icon: HeartIcon, label: "Relacionamento mantido" },
];

export function MascotHostScene({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-xl ${className}`}>
      {/* warm glow behind the stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2.75rem] bg-gradient-to-tr from-brand-100/50 via-amber-50/70 to-transparent blur-2xl"
      />
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#fbf1e6] via-white to-[#fdf3e9] ring-1 ring-black/[0.05] shadow-[0_34px_72px_-34px_rgba(120,72,20,0.5)]">
        <div className="grid gap-0 sm:grid-cols-[1.05fr_1fr]">
          {/* Mascot host + F brand tile */}
          <div className="relative flex items-end justify-center pt-8 sm:pt-10">
            <Image
              src="/brand/foocci/foocci-mascot-cutout.png"
              alt="Mascote do Foocci, anfitrião do restaurante"
              width={196}
              height={321}
              className="relative z-10 h-56 w-auto drop-shadow-[0_18px_24px_rgba(120,72,20,0.28)] sm:h-64"
            />
            <Image
              src="/brand/foocci/foocci-anagram.png"
              alt=""
              aria-hidden
              width={256}
              height={256}
              className="absolute bottom-6 right-3 z-20 h-11 w-11 drop-shadow-[0_12px_16px_rgba(80,48,12,0.35)] sm:right-5 sm:h-12 sm:w-12"
            />
          </div>

          {/* Context cards beside the host */}
          <div className="flex flex-col justify-center gap-2.5 p-5 sm:py-9 sm:pr-7">
            {CONTEXT.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white/90 px-3.5 py-2.5 shadow-[0_8px_22px_-14px_rgba(15,23,42,0.4)] backdrop-blur"
              >
                <IconTile tone="brand" className="h-8 w-8">
                  <Icon className="h-4 w-4" />
                </IconTile>
                <span className="text-sm font-semibold text-[#0B0B0B]">{label}</span>
                <CheckIcon className="ml-auto h-4 w-4 text-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
