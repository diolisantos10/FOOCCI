/**
 * /site/sobre — institutional vision page. Inherits /site/layout.tsx. Pre-launch.
 *
 * Carries the vision with more visual presence: mascot host callout, a manifesto
 * band, what Foocci represents / is not, and the relationship→revenue thesis.
 * Masculine voice ("o Foocci").
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
import { heroShot } from "@/components/marketing/HeroShot";
import { SITE_ASSETS } from "@/components/marketing/siteAssets";
import { CtaBand } from "@/components/marketing/CtaBand";
import { VisualStoryBlock } from "@/components/marketing/VisualStoryBlock";
import { MascotHostScene } from "@/components/marketing/MascotHostScene";
import { RelationshipRevenuePanel } from "@/components/marketing/RelationshipRevenuePanel";
import { Eyebrow } from "@/components/marketing/premium";
import {
  COMO_FUNCIONA_URL,
  CONTATO_NOTE,
  DEMO_CTA_LABEL,
  DEMO_URL,
} from "@/components/marketing/config";
import {
  TrendingUpIcon,
  HeartIcon,
  UsersIcon,
  SparklesIcon,
  RepeatIcon,
  ChartIcon,
  MinusIcon,
} from "@/components/marketing/icons";

const TITLE = "Sobre o Foocci | Hospitalidade digital inteligente para restaurantes";
const DESCRIPTION =
  "Conheça o Foocci, o sistema inteligente de vendas, relacionamento e fidelização para restaurantes.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const MANIFESTO = [
  "Restaurante não é só pedido. Cliente não é só transação.",
  "Tecnologia no bastidor. Relacionamento no palco.",
  "O sistema Foocci existe para ajudar restaurantes a crescerem sem perderem sua essência.",
];

const REPRESENTS = [
  { icon: TrendingUpIcon, label: "Inteligência comercial" },
  { icon: HeartIcon, label: "Hospitalidade digital" },
  { icon: UsersIcon, label: "Relacionamento" },
  { icon: SparklesIcon, label: "Experiência" },
  { icon: RepeatIcon, label: "Recorrência" },
  { icon: ChartIcon, label: "Crescimento sustentável" },
];

const IS_NOT = ["Chatbot genérico", "Software frio", "ERP complexo", "Automação robótica", "Dashboard enterprise"];

export default function SobrePage() {
  return (
    <>
      <PageHero
        badge="Hospitalidade digital inteligente"
        title="Tecnologia, relacionamento e hospitalidade para restaurantes criarem experiências que fidelizam."
        subtitle="O Foocci nasceu para ajudar restaurantes a transformar atendimento digital em venda, experiência e recorrência."
        primaryLabel="Ver como o Foocci funciona"
        primaryHref={COMO_FUNCIONA_URL}
        note={CONTATO_NOTE}
        /* A única página institucional do site: a abertura é gente, não tela.
           A tese é "hospitalidade digital" — cliente no salão, com o celular na
           mão. Não há candidato de produto aqui de propósito. */
        visual={heroShot([
          {
            kind: "photo",
            src: SITE_ASSETS.journey[0]!,
            focus: "50% 32%",
            alt: "Cliente sentada à mesa de um restaurante aconchegante, sorrindo enquanto usa o celular.",
          },
        ])}
      />

      {/* 1. What we believe — premium visual story block (mascot host) */}
      <VisualStoryBlock
        tone="warm"
        eyebrow="No que acreditamos"
        titleId="crenca-title"
        title="Restaurante bom não precisa perder cliente por falta de relacionamento."
        visual={<MascotHostScene />}
      >
        <p>
          A experiência do restaurante deveria continuar depois do pedido. É por isso
          que o Foocci conecta venda, atendimento e relacionamento — para o cliente
          voltar, não desaparecer.
        </p>
        <p className="text-base text-muted">
          Tecnologia no bastidor, relacionamento no palco. O restaurante é o
          protagonista — o Foocci é o anfitrião invisível que faz a experiência
          acontecer.
        </p>
      </VisualStoryBlock>

      {/* 2. Manifesto — dark editorial band */}
      <section aria-labelledby="manifesto-title" className="relative overflow-hidden bg-ink py-20 lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.18),transparent)]"
        />
        <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
          <h2 id="manifesto-title" className="text-sm font-semibold uppercase tracking-widest text-brand-400">
            Manifesto
          </h2>
          <div className="mt-8 space-y-6">
            {MANIFESTO.map((line) => (
              <p key={line} className="text-2xl font-semibold leading-snug tracking-tight text-white sm:text-3xl">
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* 3. What Foocci represents */}
      <section aria-labelledby="representa-title" className="bg-paper py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <h2 id="representa-title" className="text-center text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            O que o Foocci representa
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {REPRESENTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-5 ring-1 ring-ink/[0.02]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-base font-semibold text-ink">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Relationship → revenue thesis */}
      <section aria-labelledby="tese-title" className="bg-canvas py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>A tese</Eyebrow>
            <h2 id="tese-title" className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Relacionamento que vira resultado.
            </h2>
          </div>
          <div className="mt-10">
            <RelationshipRevenuePanel />
          </div>
        </div>
      </section>

      {/* 5. What Foocci is not */}
      <section aria-labelledby="naoe-title" className="bg-paper py-20">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <h2 id="naoe-title" className="text-center text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            O que o Foocci não é
          </h2>
          <ul className="mx-auto mt-10 max-w-xl space-y-3">
            {IS_NOT.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-xl border border-line bg-paper px-5 py-4">
                <MinusIcon className="h-5 w-5 shrink-0 text-muted" />
                <span className="text-base font-normal text-ink2">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        6. CTA — o fecho.

        Até 05/08 esta página terminava mandando o visitante para MAIS uma página
        institucional (`/site/como-funciona`). Era o único fim de página do site,
        junto com a home, sem o convite comercial: todas as outras fecham com o
        `DEMO_CTA_LABEL`. Institucional que aponta para institucional é passo que
        sobra — quem leu a proposta inteira já passou da fase de ser convencido.

        O rótulo NUNCA é escrito à mão aqui: `DEMO_CTA_LABEL` é o texto único de
        todo CTA comercial do site (ver `config.ts`). Foi assim que nasceram os nove
        textos diferentes para a mesma porta que a gente acabou de unificar.
      */}
      <CtaBand
        title="Quer construir uma operação mais inteligente para seu restaurante?"
        label={DEMO_CTA_LABEL}
        href={DEMO_URL}
      />
    </>
  );
}
