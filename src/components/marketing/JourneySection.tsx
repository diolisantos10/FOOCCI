/**
 * Journey — implements the APPROVED MOCKUP strip below the hero.
 * Server component.
 *
 * One white elevated panel with the five steps side by side: circular photo
 * medallion (official asset slot; faithful icon fallback until the file lands)
 * + small orange icon badge, "N. Title" with orange number, short copy, and
 * dotted connectors between steps. Stacks cleanly on mobile. No fake data.
 */

import Image from "next/image";
import {
  QrIcon,
  SparklesIcon,
  UsersIcon,
  MegaphoneIcon,
  HeartIcon,
  MenuBookIcon,
  ChartIcon,
} from "./icons";
import { hasAsset, SITE_ASSETS } from "./siteAssets";

const STEPS = [
  {
    icon: QrIcon,
    badge: MenuBookIcon,
    title: "Cliente chega",
    copy: "Recepção acolhedora e experiência personalizada desde o primeiro contato.",
  },
  {
    icon: SparklesIcon,
    badge: SparklesIcon,
    title: "Pedido guiado",
    copy: "Cardápio inteligente e sugestões que aumentam satisfação e valor do pedido.",
  },
  {
    icon: UsersIcon,
    badge: ChartIcon,
    title: "CRM ativo",
    copy: "Dados que geram contexto e constroem relacionamentos relevantes.",
  },
  {
    icon: MegaphoneIcon,
    badge: MegaphoneIcon,
    title: "Campanha",
    copy: "Comunicação no momento certo, com ofertas que fazem sentido.",
  },
  {
    icon: HeartIcon,
    badge: HeartIcon,
    title: "Cliente volta",
    copy: "Experiências memoráveis criam preferências e geram recorrência natural.",
  },
];

export function JourneySection() {
  return (
    <section id="jornada" aria-labelledby="jornada-title" className="relative scroll-mt-20 bg-white pb-16 lg:pb-20">
      <h2 id="jornada-title" className="sr-only">
        A jornada Foocci — do primeiro contato ao retorno do cliente
      </h2>

      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {/* Elevated strip overlapping the hero rhythm (per mockup) */}
        <div className="relative -mt-2 rounded-[2rem] bg-white p-6 shadow-[0_2px_6px_rgba(15,23,42,0.05),0_30px_60px_-30px_rgba(120,72,20,0.35)] ring-1 ring-black/[0.04] sm:p-8 lg:-mt-6 lg:p-9">
          <ol className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(({ icon: Icon, badge: Badge, title, copy }, i) => {
              const photo = SITE_ASSETS.journey[i];
              const hasPhoto = photo ? hasAsset(photo) : false;
              return (
                <li key={title} className="relative flex items-start gap-3 lg:pr-4">
                  {/* dotted connector to the next step (per mockup) */}
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute -right-3 top-9 hidden w-7 border-t-2 border-dotted border-brand-300 lg:block"
                    />
                  )}

                  {/* circular medallion: official photo slot, faithful fallback */}
                  <span className="relative shrink-0">
                    <span className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-50 to-amber-50 ring-1 ring-black/[0.05]">
                      {hasPhoto ? (
                        <Image
                          src={`/${photo}`}
                          alt=""
                          aria-hidden
                          fill
                          sizes="72px"
                          className="object-cover"
                        />
                      ) : (
                        <Icon className="h-7 w-7 text-brand-500" />
                      )}
                    </span>
                    {/* small orange icon badge (per mockup) */}
                    <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-500 shadow-[0_4px_10px_-3px_rgba(120,72,20,0.35)] ring-1 ring-brand-100">
                      <Badge className="h-3.5 w-3.5" />
                    </span>
                  </span>

                  <span className="min-w-0 pt-0.5">
                    <span className="block text-sm font-bold text-[#0B0B0B]">
                      <span className="text-brand-500">{i + 1}.</span> {title}
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-gray-600">{copy}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
