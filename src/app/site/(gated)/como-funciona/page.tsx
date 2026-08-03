/**
 * /site/como-funciona — explains the Foocci journey as a visual experience.
 * Inherits /site/layout.tsx. Pre-launch.
 *
 * Visual hero with a product showcase, an editorial step journey, a "bastidor"
 * mascot callout and a refined cycle diagram. Masculine voice ("o Foocci").
 */

import type { Metadata } from "next";
import { InternalVisualHero } from "@/components/marketing/InternalVisualHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import {
  ArrowRightIcon,
  QrIcon,
  SparklesIcon,
  MenuBookIcon,
  UsersIcon,
  MegaphoneIcon,
  ChartIcon,
  RepeatIcon,
} from "@/components/marketing/icons";
import { FoocciProductShowcase } from "@/components/marketing/FoocciProductShowcase";
import { VisualStepCard } from "@/components/marketing/VisualStepCard";
import { VisualStoryBlock } from "@/components/marketing/VisualStoryBlock";
import { MascotHostScene } from "@/components/marketing/MascotHostScene";
import { CrmRealShowcase } from "@/components/marketing/CrmRealShowcase";
import { DotGrid, Eyebrow, PremiumCard } from "@/components/marketing/premium";
import { PROPOSTA_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";

const TITLE = "Como funciona o Foocci | Sistema inteligente para restaurantes";
const DESCRIPTION =
  "Entenda como o Foocci conecta pedido, atendimento, WhatsApp, IA e CRM para ajudar restaurantes a vender mais e fazer clientes voltarem.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { icon: QrIcon, title: "Cliente chega", desc: "Recepção acolhedora e experiência personalizada desde o primeiro contato — pelo WhatsApp, QR Code ou link." },
  { icon: SparklesIcon, title: "Pedido guiado", desc: "Cardápio inteligente e sugestões que aumentam satisfação e valor do pedido." },
  { icon: UsersIcon, title: "CRM ativo", desc: "Dados que geram contexto e constroem relacionamentos relevantes." },
  { icon: MegaphoneIcon, title: "Campanha", desc: "Comunicação no momento certo, com ofertas que fazem sentido." },
  { icon: RepeatIcon, title: "Cliente volta", desc: "Experiências memoráveis criam preferência e geram recorrência natural." },
];

const FLOW = [
  { icon: UsersIcon, label: "Cliente" },
  { icon: MenuBookIcon, label: "Pedido" },
  { icon: ChartIcon, label: "Histórico" },
  { icon: MegaphoneIcon, label: "Campanha" },
  { icon: RepeatIcon, label: "Retorno" },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <InternalVisualHero
        badge="Como funciona"
        title="Da primeira mensagem ao próximo pedido."
        subtitle="O Foocci conecta atendimento, cardápio, WhatsApp, CRM e inteligência comercial para ajudar seu restaurante a vender melhor antes, durante e depois do pedido."
        visual={<FoocciProductShowcase />}
        primaryLabel="Conhecer a proposta"
        primaryHref={PROPOSTA_URL}
        note={PRELAUNCH_NOTE}
      />

      {/* 1. The journey — editorial step cards */}
      <section aria-labelledby="jornada-title" className="relative overflow-hidden bg-gray-50 py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>A jornada Foocci</Eyebrow>
            <h2 id="jornada-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Da primeira mensagem ao próximo pedido, passo a passo.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <VisualStepCard key={s.title} index={i + 1} icon={s.icon} title={s.title} copy={s.desc} />
            ))}
          </div>
        </div>
      </section>

      {/* 2. O CRM na prática — telas reais reconstruídas dos prints do painel */}
      <CrmRealShowcase />

      {/* 3. Backstage — premium visual story block (mascot host + context cards) */}
      <VisualStoryBlock
        tone="warm"
        reverse
        eyebrow="Bastidor"
        titleId="bastidor-title"
        title="O Foocci trabalha no bastidor."
        visual={<MascotHostScene />}
      >
        <p>
          Enquanto o cliente vive uma experiência simples, o Foocci organiza
          contexto, histórico e oportunidades no bastidor.
        </p>
        <p className="text-base text-gray-500">
          O Foocci não rouba o protagonismo do restaurante. Ele apoia a experiência:
          o cliente vê a sua marca e o seu atendimento, enquanto a inteligência
          comercial trabalha por trás para conduzir a venda e manter o relacionamento.
        </p>
      </VisualStoryBlock>

      {/* 3. Visual cycle — premium nodes + connectors */}
      <section aria-labelledby="fluxo-title" className="relative overflow-hidden bg-gray-50 py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        <div className="relative mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Do atendimento ao retorno</Eyebrow>
            <h2 id="fluxo-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Um ciclo que transforma pedido em recorrência.
            </h2>
          </div>
          <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            {FLOW.map(({ icon: Icon, label }, i) => (
              <div key={label} className="flex flex-col items-center gap-3 sm:flex-row">
                <PremiumCard className="flex items-center gap-3 px-5 py-4 sm:min-w-[140px]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-base font-semibold text-[#0B0B0B]">{label}</span>
                </PremiumCard>
                {i < FLOW.length - 1 && (
                  <ArrowRightIcon className="h-5 w-5 rotate-90 text-brand-400 sm:rotate-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. CTA */}
      <CtaBand
        title="O Foocci está sendo preparado para restaurantes como o seu."
        label="Conhecer a proposta"
        href={PROPOSTA_URL}
      />
    </>
  );
}
