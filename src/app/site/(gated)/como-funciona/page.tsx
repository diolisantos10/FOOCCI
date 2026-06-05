/**
 * /site/como-funciona — explains the Foocci journey. Inherits /site/layout.tsx.
 * Premium Pre-launch System: editorial step cards, backstage composition with the
 * mascot, and a refined flow diagram.
 */

import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/PageHero";
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
import { OrderMockup } from "@/components/marketing/mockups";
import { DotGrid, Halo, Eyebrow, PremiumCard, MascotAvatar } from "@/components/marketing/premium";
import { PROPOSTA_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";

const TITLE = "Como funciona a Foocci | Sistema inteligente para restaurantes";
const DESCRIPTION =
  "Entenda como a Foocci conecta pedido, atendimento, WhatsApp, IA e CRM para ajudar restaurantes a vender mais e fazer clientes voltarem.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { icon: QrIcon, title: "Cliente chega", desc: "Pelo WhatsApp, QR Code ou link do cardápio." },
  { icon: SparklesIcon, title: "Foocci conduz o pedido", desc: "O cliente recebe uma experiência mais simples, visual e orientada à compra." },
  { icon: MenuBookIcon, title: "O pedido fica mais completo", desc: "Sugestões de bebida, sobremesa e complementos podem aumentar o valor do pedido." },
  { icon: UsersIcon, title: "O cliente entra no CRM", desc: "Histórico, dados e comportamento começam a formar uma base comercial." },
  { icon: MegaphoneIcon, title: "O relacionamento continua", desc: "O restaurante pode criar campanhas, reativações e ações de retorno." },
  { icon: ChartIcon, title: "O dono enxerga oportunidades", desc: "Dados simples ajudam a entender clientes, pedidos e campanhas." },
];

const FLOW = [
  { icon: UsersIcon, label: "Cliente" },
  { icon: MenuBookIcon, label: "Pedido" },
  { icon: ChartIcon, label: "CRM" },
  { icon: MegaphoneIcon, label: "Campanha" },
  { icon: RepeatIcon, label: "Retorno" },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHero
        badge="Como funciona"
        title="Da primeira mensagem ao próximo pedido."
        subtitle="A Foocci conecta atendimento, cardápio, WhatsApp, CRM e inteligência comercial para ajudar seu restaurante a vender melhor antes, durante e depois do pedido."
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
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <PremiumCard key={title} hover className="relative p-6">
                <span className="absolute right-5 top-5 text-sm font-semibold tabular-nums text-gray-200">
                  0{i + 1}
                </span>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#0B0B0B]">{title}</h3>
                <p className="mt-1.5 text-base leading-relaxed text-gray-600">{desc}</p>
              </PremiumCard>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Backstage — text + mockup composition with the mascot */}
      <section aria-labelledby="bastidor-title" className="relative overflow-hidden bg-white py-20 lg:py-24">
        <Halo className="-right-20 top-10 hidden h-[26rem] w-[26rem] lg:block" color="rgba(249,115,22,0.08)" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
          <div>
            <Eyebrow>Bastidor</Eyebrow>
            <h2 id="bastidor-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              A tecnologia trabalha no bastidor. A experiência aparece para o cliente.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-gray-600">
              A Foocci não rouba o protagonismo do restaurante. Ela apoia a experiência:
              o cliente vê a sua marca e o seu atendimento, enquanto a inteligência
              comercial trabalha por trás para conduzir a venda e manter o relacionamento.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-sm lg:max-w-md lg:pl-6">
            <div aria-hidden className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-tr from-gray-50 to-brand-50/40 ring-1 ring-gray-900/[0.03]" />
            <OrderMockup />
            <MascotAvatar className="absolute -bottom-6 -left-6 z-20 hidden shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] lg:inline-flex" />
          </div>
        </div>
      </section>

      {/* 3. Visual flow — premium nodes + gradient connectors */}
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
                <PremiumCard className="flex items-center gap-3 px-5 py-4 sm:min-w-[150px]">
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
        title="A Foocci está sendo preparada para restaurantes como o seu."
        label="Conhecer a proposta"
        href={PROPOSTA_URL}
      />
    </>
  );
}
