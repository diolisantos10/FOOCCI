/**
 * /site/demonstracao — the commercial conversion page. Inherits /site/layout.tsx.
 *
 * This is where a restaurant owner asks for a demo. `DemoForm` posts to
 * `/api/site/leads`, which PERSISTS the lead before attempting any notification —
 * a lost e-mail must never mean a lost lead.
 *
 * Before launch this page had no form at all (pre-launch mode); the copy still
 * used "em breve" everywhere. Kept the product preview sections — they are what
 * makes the form worth filling.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { youtubeEmbedUrl } from "@/lib/site/youtube";
import { InternalVisualHero } from "@/components/marketing/InternalVisualHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { CheckIcon, UsersIcon, SparklesIcon, RepeatIcon } from "@/components/marketing/icons";
import { OrderMockup, CrmProfileMockup, InsightMockup } from "@/components/marketing/mockups";
import { FoocciProductShowcase } from "@/components/marketing/FoocciProductShowcase";
import { VisualStepCard } from "@/components/marketing/VisualStepCard";
import { RelationshipRevenuePanel } from "@/components/marketing/RelationshipRevenuePanel";
import { DotGrid, Halo, Eyebrow } from "@/components/marketing/premium";
import { AGENDAR_LABEL, AGENDAR_URL, PRELAUNCH_NOTE } from "@/components/marketing/config";
import { DemoForm } from "@/components/marketing/DemoForm";

export const dynamic = "force-dynamic";

const TITLE = "Demonstração | Foocci para restaurantes";
const DESCRIPTION =
  "Veja o Foocci funcionando com o cardápio do seu restaurante. Peça uma demonstração — sem compromisso.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Foocci", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { icon: UsersIcon, title: "Cliente escolhe", copy: "O pedido começa simples, guiado pelo cardápio do restaurante." },
  { icon: SparklesIcon, title: "O sistema entende", copy: "O Foocci reconhece o cliente, salva o histórico e enxerga oportunidades." },
  { icon: RepeatIcon, title: "O relacionamento continua", copy: "Campanhas e reativação no momento certo trazem o cliente de volta." },
];

const WILL_SHOW = [
  "Como o Foocci conduz o pedido a partir do seu cardápio.",
  "Como o WhatsApp se torna um canal de relacionamento.",
  "Como o CRM organiza seus clientes e oportunidades.",
  "Como campanhas e reativação ajudam o cliente a voltar.",
  "Qual configuração faz sentido para o seu tipo de restaurante.",
];

export default async function DemonstracaoPage() {
  // Vídeos publicados no admin (/admin/demo-videos). Sem vídeo → a seção não
  // existe: melhor página sem seção do que seção com quadro vazio.
  const videos = (
    await prisma.demoVideo.findMany({
      where:   { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select:  { id: true, title: true, description: true, youtubeUrl: true },
    })
  )
    .map((v) => ({ ...v, embedUrl: youtubeEmbedUrl(v.youtubeUrl) }))
    .filter((v): v is typeof v & { embedUrl: string } => v.embedUrl !== null);

  const hasVideos = videos.length > 0;

  return (
    <>
      <InternalVisualHero
        badge="Demonstração sem compromisso"
        title={
          <>
Veja o <span className="text-brand-500">Foocci</span> no seu restaurante.
          </>
        }
        subtitle={
          hasVideos
            ? "Assista ao Foocci funcionando de verdade nos vídeos abaixo — e, se quiser conversar, agende uma chamada curta com quem faz o produto."
            : "A gente mostra, com o seu cardápio, como o Foocci transforma atendimento, pedido e relacionamento na prática. Preencha abaixo que entramos em contato."
        }
        visual={<FoocciProductShowcase />}
        primaryLabel={hasVideos ? "Assistir à demonstração" : "Preencher e pedir demonstração"}
        primaryHref={hasVideos ? "#videos" : "#formulario"}
        secondaryLabel={AGENDAR_LABEL}
        secondaryHref={AGENDAR_URL}
        note={PRELAUNCH_NOTE}
      />

      {/* Demonstração em vídeo — só existe quando há vídeo publicado */}
      {hasVideos && (
        <section id="videos" aria-labelledby="videos-title" className="scroll-mt-20 bg-white py-20 lg:py-24">
          <div className="mx-auto max-w-5xl px-5 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>Demonstração em vídeo</Eyebrow>
              <h2 id="videos-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
                Veja o Foocci funcionando.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-600">
                Sem agendar nada: aperte o play e veja o sistema por dentro, do
                painel do restaurante ao pedido no celular do cliente.
              </p>
            </div>

            <div className="mt-12 space-y-10">
              {/* O primeiro vídeo é o principal — tela cheia da coluna */}
              <figure>
                <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                  <iframe
                    src={videos[0]!.embedUrl}
                    title={videos[0]!.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="aspect-video w-full"
                  />
                </div>
                <figcaption className="mt-3 text-center">
                  <span className="text-base font-semibold text-[#0B0B0B]">{videos[0]!.title}</span>
                  {videos[0]!.description && (
                    <span className="block text-sm text-gray-500">{videos[0]!.description}</span>
                  )}
                </figcaption>
              </figure>

              {videos.length > 1 && (
                <div className="grid gap-8 sm:grid-cols-2">
                  {videos.slice(1).map((v) => (
                    <figure key={v.id}>
                      <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                        <iframe
                          src={v.embedUrl}
                          title={v.title}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                          className="aspect-video w-full"
                        />
                      </div>
                      <figcaption className="mt-3">
                        <span className="text-sm font-semibold text-[#0B0B0B]">{v.title}</span>
                        {v.description && <span className="block text-sm text-gray-500">{v.description}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-12 text-center">
              <a
                href={AGENDAR_URL}
                className="inline-flex items-center justify-center rounded-full bg-brand-500 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
              >
                Gostou? {AGENDAR_LABEL.toLowerCase()}
              </a>
              <p className="mt-2 text-sm text-gray-500">
                Chamada curta, ao vivo, com o fundador — você escolhe o horário.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Three-step experience flow */}
      <section aria-labelledby="fluxo-title" className="relative overflow-hidden bg-white py-20 lg:py-24">
        <div className="relative mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Como a experiência acontece</Eyebrow>
            <h2 id="fluxo-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Do pedido ao relacionamento, em três passos.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <VisualStepCard key={s.title} index={i + 1} icon={s.icon} title={s.title} copy={s.copy} />
            ))}
          </div>
          <div className="mt-10">
            <RelationshipRevenuePanel />
          </div>
        </div>
      </section>

      {/* Illustrative product screens */}
      <section aria-labelledby="previa-title" className="relative overflow-hidden bg-gray-50 py-20 lg:py-24">
        <DotGrid className="[mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        <Halo className="left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2" color="rgba(249,115,22,0.07)" />
        <div className="relative mx-auto max-w-5xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Prévia</Eyebrow>
            <h2 id="previa-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
              Uma prévia de como o Foocci se parece.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              Pedido guiado, CRM e dados comerciais em uma só operação — pensados para
              o dia a dia do restaurante.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:items-center">
            <div className="lg:mt-10">
              <OrderMockup />
            </div>
            <CrmProfileMockup />
            <div className="sm:col-span-2 sm:mx-auto sm:max-w-sm lg:col-span-1 lg:mx-0 lg:mt-10 lg:max-w-none">
              <InsightMockup />
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            Telas ilustrativas do produto.
          </p>
        </div>
      </section>

      {/* What a future demo will show */}
      <section id="formulario" aria-labelledby="demo-mostra-title" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-2xl px-5 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm ring-1 ring-gray-900/[0.03] sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              O que a demonstração vai mostrar
            </span>
            <h2 id="demo-mostra-title" className="sr-only">
              O que a demonstração vai mostrar
            </h2>
            <ul className="mt-6 space-y-3">
              {WILL_SHOW.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span className="text-base text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 border-t border-gray-100 pt-7">
              <DemoForm includeChallenge />
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Ainda com dúvida se o Foocci faz sentido para o seu restaurante?"
        label="Pedir uma demonstração"
        href="#formulario"
      />
    </>
  );
}
