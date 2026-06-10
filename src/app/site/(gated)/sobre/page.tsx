/**
 * /site/sobre — short institutional page. Inherits /site/layout.tsx.
 */

import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/components/marketing/PageHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { COMO_FUNCIONA_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";
import {
  TrendingUpIcon,
  HeartIcon,
  UsersIcon,
  SparklesIcon,
  RepeatIcon,
  ChartIcon,
  MinusIcon,
} from "@/components/marketing/icons";

const TITLE = "Sobre a Foocci | Hospitalidade digital inteligente para restaurantes";
const DESCRIPTION =
  "Conheça a Foocci, sistema inteligente de vendas, relacionamento e fidelização para restaurantes.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const REPRESENTS = [
  { icon: TrendingUpIcon, label: "Inteligência comercial" },
  { icon: HeartIcon, label: "Hospitalidade digital" },
  { icon: UsersIcon, label: "Relacionamento" },
  { icon: SparklesIcon, label: "Experiência" },
  { icon: RepeatIcon, label: "Recorrência" },
  { icon: ChartIcon, label: "Crescimento sustentável" },
];

const IS_NOT = [
  "Chatbot genérico",
  "Software frio",
  "ERP complexo",
  "Automação robótica",
  "Dashboard enterprise",
];

export default function SobrePage() {
  return (
    <>
      <PageHero
        badge="Hospitalidade digital inteligente"
        title="Tecnologia, relacionamento e hospitalidade para restaurantes criarem experiências que fidelizam."
        subtitle="A Foocci nasceu para ajudar restaurantes a transformar atendimento digital em venda, experiência e recorrência."
        primaryLabel="Ver como a Foocci funciona"
        primaryHref={COMO_FUNCIONA_URL}
        note={PRELAUNCH_NOTE}
      />

      {/* 1. What we believe — institutional, warmed with the official mascot */}
      <section aria-labelledby="crenca-title" className="bg-gray-50 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 lg:grid-cols-2 lg:gap-12 lg:px-8">
          <div className="order-1 flex justify-center lg:order-none lg:justify-start">
            <Image
              src="/brand/foocci/foocci-mascot.png"
              alt="Mascote da Foocci"
              width={196}
              height={321}
              className="h-52 w-auto sm:h-60"
            />
          </div>
          <div className="text-center lg:text-left">
            <h2 id="crenca-title" className="text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Restaurante bom não precisa perder cliente por falta de relacionamento.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-gray-600">
              A experiência do restaurante deveria continuar depois do pedido. É por isso
              que a Foocci conecta venda, atendimento e relacionamento — para o cliente
              voltar, não desaparecer.
            </p>
            <p className="mt-4 text-base text-gray-500">
              Tecnologia no bastidor, relacionamento no palco. O restaurante é o
              protagonista — a Foocci é a anfitriã invisível que faz a experiência
              acontecer.
            </p>
          </div>
        </div>
      </section>

      {/* 2. What Foocci represents */}
      <section aria-labelledby="representa-title" className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <h2 id="representa-title" className="text-center text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            O que a Foocci representa
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {REPRESENTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 ring-1 ring-gray-900/[0.02]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-base font-semibold text-[#0B0B0B]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. What Foocci is not */}
      <section aria-labelledby="naoe-title" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <h2 id="naoe-title" className="text-center text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            O que a Foocci não é
          </h2>
          <ul className="mx-auto mt-10 max-w-xl space-y-3">
            {IS_NOT.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
                <MinusIcon className="h-5 w-5 shrink-0 text-gray-400" />
                <span className="text-base font-medium text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. CTA */}
      <CtaBand
        title="Quer construir uma operação mais inteligente para seu restaurante?"
        label="Ver como a Foocci funciona"
        href={COMO_FUNCIONA_URL}
      />
    </>
  );
}
